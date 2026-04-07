//! ECDH key exchange and AES-256-GCM frame encryption for remote WebSocket connections.
//!
//! Uses P-256 (NIST) for key agreement, HKDF-SHA256 for key derivation,
//! and AES-256-GCM for authenticated encryption of WebSocket frames.
//! Local (Tauri webview) connections bypass this entirely.

use std::path::{Path, PathBuf};

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use hkdf::Hkdf;
use p256::ecdh::diffie_hellman;
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::{PublicKey, SecretKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("key generation failed: {0}")]
    KeyGenerationFailed(String),
    #[error("key derivation failed: {0}")]
    DerivationFailed(String),
    #[error("encryption failed")]
    EncryptionFailed,
    #[error("decryption failed")]
    DecryptionFailed,
    #[error("invalid key data: {0}")]
    InvalidKeyData(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

// ---------------------------------------------------------------------------
// ServerKeypair
// ---------------------------------------------------------------------------

/// Long-lived ECDH P-256 keypair for the server.
///
/// Generated once on first run, persisted to disk, and used to derive
/// per-session encryption keys with each connecting client.
pub struct ServerKeypair {
    secret_key: SecretKey,
    public_key: PublicKey,
    fingerprint: String,
}

impl ServerKeypair {
    /// Generate a fresh random keypair.
    pub fn generate() -> Result<Self, CryptoError> {
        let secret_key = SecretKey::random(&mut rand::rngs::OsRng);
        let public_key = secret_key.public_key();
        let fingerprint = Self::compute_fingerprint(&public_key);
        Ok(Self {
            secret_key,
            public_key,
            fingerprint,
        })
    }

    /// Human-readable fingerprint of a public key: "XXXX-XXXX-XXXX".
    ///
    /// SHA-256 of the SEC1 uncompressed encoding, first 6 bytes,
    /// formatted as uppercase hex pairs grouped by 2 bytes.
    fn compute_fingerprint(public_key: &PublicKey) -> String {
        let encoded = public_key.to_encoded_point(false); // uncompressed
        let hash = Sha256::digest(encoded.as_bytes());
        format!(
            "{:02X}{:02X}-{:02X}{:02X}-{:02X}{:02X}",
            hash[0], hash[1], hash[2], hash[3], hash[4], hash[5]
        )
    }

    /// The fingerprint string for display / QR codes.
    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }

    /// Public key as base64 (SEC1 uncompressed encoding).
    pub fn public_key_base64(&self) -> String {
        let encoded = self.public_key.to_encoded_point(false);
        BASE64.encode(encoded.as_bytes())
    }

    /// Reference to the public key.
    pub fn public_key(&self) -> &PublicKey {
        &self.public_key
    }

    /// Reference to the secret key (needed for session derivation).
    pub fn secret_key(&self) -> &SecretKey {
        &self.secret_key
    }

    /// Persist the keypair as JSON: `{"secret_key":"<b64>","public_key":"<b64>"}`.
    pub fn save(&self, path: &Path) -> Result<(), CryptoError> {
        let secret_bytes = self.secret_key.to_bytes();
        let public_encoded = self.public_key.to_encoded_point(false);

        let json = serde_json::json!({
            "secret_key": BASE64.encode(secret_bytes.as_slice()),
            "public_key": BASE64.encode(public_encoded.as_bytes()),
        });

        let contents = serde_json::to_string_pretty(&json).map_err(|e| {
            CryptoError::KeyGenerationFailed(format!("failed to serialize keypair: {e}"))
        })?;
        std::fs::write(path, contents)?;
        Ok(())
    }

    /// Load a keypair from the JSON format written by [`save`].
    pub fn load(path: &Path) -> Result<Self, CryptoError> {
        let contents = std::fs::read_to_string(path)?;
        let json: serde_json::Value = serde_json::from_str(&contents)
            .map_err(|e| CryptoError::InvalidKeyData(format!("invalid JSON: {e}")))?;

        let secret_b64 = json["secret_key"]
            .as_str()
            .ok_or_else(|| CryptoError::InvalidKeyData("missing secret_key".into()))?;
        let secret_bytes = BASE64
            .decode(secret_b64)
            .map_err(|e| CryptoError::InvalidKeyData(format!("bad base64 for secret_key: {e}")))?;

        let secret_key = SecretKey::from_bytes(secret_bytes.as_slice().into())
            .map_err(|e| CryptoError::InvalidKeyData(format!("invalid secret key: {e}")))?;

        let public_key = secret_key.public_key();
        let fingerprint = Self::compute_fingerprint(&public_key);

        Ok(Self {
            secret_key,
            public_key,
            fingerprint,
        })
    }
}

// ---------------------------------------------------------------------------
// SessionCrypto
// ---------------------------------------------------------------------------

/// Per-connection symmetric encryption state derived from ECDH.
///
/// Uses separate keys and IVs for each direction so that identical plaintext
/// in opposite directions produces different ciphertext.  Frame counters are
/// XORed into the base IV to guarantee unique nonces.
pub struct SessionCrypto {
    server_cipher: Aes256Gcm,
    client_cipher: Aes256Gcm,
    server_iv: [u8; 12],
    client_iv: [u8; 12],
    server_frame_counter: u64,
    client_frame_counter: u64,
}

impl SessionCrypto {
    /// Derive session keys from the server's secret key and the client's public key.
    ///
    /// 1. ECDH shared secret
    /// 2. HKDF-SHA256 (salt = server_pub ‖ client_pub, info = "redmatrix-ws-v1")
    /// 3. Expand to 88 bytes: server_key(32) + client_key(32) + server_iv(12) + client_iv(12)
    pub fn derive(
        server_secret: &SecretKey,
        server_public: &PublicKey,
        client_public: &PublicKey,
    ) -> Result<Self, CryptoError> {
        // ECDH
        let shared_secret = diffie_hellman(
            server_secret.to_nonzero_scalar(),
            client_public.as_affine(),
        );
        let shared_bytes = shared_secret.raw_secret_bytes();

        // HKDF salt = server_pub_sec1 || client_pub_sec1
        let server_pub_bytes = server_public.to_encoded_point(false);
        let client_pub_bytes = client_public.to_encoded_point(false);
        let salt = [server_pub_bytes.as_bytes(), client_pub_bytes.as_bytes()].concat();

        let hkdf = Hkdf::<Sha256>::new(Some(&salt), shared_bytes);
        let mut okm = [0u8; 88];
        hkdf.expand(b"redmatrix-ws-v1", &mut okm)
            .map_err(|e| CryptoError::DerivationFailed(format!("HKDF expand failed: {e}")))?;

        let server_key: [u8; 32] = okm[0..32].try_into().unwrap();
        let client_key: [u8; 32] = okm[32..64].try_into().unwrap();
        let server_iv: [u8; 12] = okm[64..76].try_into().unwrap();
        let client_iv: [u8; 12] = okm[76..88].try_into().unwrap();

        let server_cipher = Aes256Gcm::new_from_slice(&server_key)
            .map_err(|_| CryptoError::DerivationFailed("bad server key length".into()))?;
        let client_cipher = Aes256Gcm::new_from_slice(&client_key)
            .map_err(|_| CryptoError::DerivationFailed("bad client key length".into()))?;

        Ok(Self {
            server_cipher,
            client_cipher,
            server_iv,
            client_iv,
            server_frame_counter: 0,
            client_frame_counter: 0,
        })
    }

    /// Encrypt a server-to-client frame.
    ///
    /// Returns `[counter:8 LE][ciphertext+tag]`.
    pub fn encrypt_server_frame(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let counter = self.server_frame_counter;
        let nonce = Self::build_nonce(&self.server_iv, counter);
        let ciphertext = self
            .server_cipher
            .encrypt(Nonce::from_slice(&nonce), plaintext)
            .map_err(|_| CryptoError::EncryptionFailed)?;

        self.server_frame_counter += 1;

        let mut frame = Vec::with_capacity(8 + ciphertext.len());
        frame.extend_from_slice(&counter.to_le_bytes());
        frame.extend_from_slice(&ciphertext);
        Ok(frame)
    }

    /// Decrypt a client-to-server frame.
    ///
    /// Expects `[counter:8 LE][ciphertext+tag]`.
    pub fn decrypt_client_frame(&mut self, frame: &[u8]) -> Result<Vec<u8>, CryptoError> {
        if frame.len() < 8 {
            return Err(CryptoError::DecryptionFailed);
        }

        let counter = u64::from_le_bytes(
            frame[..8]
                .try_into()
                .map_err(|_| CryptoError::DecryptionFailed)?,
        );
        let ciphertext_and_tag = &frame[8..];

        let nonce = Self::build_nonce(&self.client_iv, counter);
        let plaintext = self
            .client_cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext_and_tag)
            .map_err(|_| CryptoError::DecryptionFailed)?;

        self.client_frame_counter = counter + 1;
        Ok(plaintext)
    }

    /// XOR the last 8 bytes of the base IV with the frame counter (LE).
    fn build_nonce(base_iv: &[u8; 12], counter: u64) -> [u8; 12] {
        let mut nonce = *base_iv;
        let counter_bytes = counter.to_le_bytes();
        for i in 0..8 {
            nonce[4 + i] ^= counter_bytes[i];
        }
        nonce
    }
}

// ---------------------------------------------------------------------------
// PairedDeviceStore
// ---------------------------------------------------------------------------

/// A remote client (iPad) that has completed ECDH pairing with this server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedDevice {
    pub fingerprint: String,
    pub public_key_base64: String,
    pub name: String,
    pub paired_at: u64, // Unix timestamp
}

/// Persistent store for paired remote clients.
///
/// Backed by a JSON file on disk. The desktop app loads this at startup and
/// checks incoming client public keys against the list to accept or reject
/// connections.
pub struct PairedDeviceStore {
    devices: Vec<PairedDevice>,
    path: PathBuf,
}

impl PairedDeviceStore {
    /// Create an empty in-memory store that will save to `path`.
    pub fn new(path: PathBuf) -> Self {
        Self {
            devices: Vec::new(),
            path,
        }
    }

    /// Load a store from disk. Returns an empty store if the file doesn't exist.
    pub fn load(path: PathBuf) -> Result<Self, CryptoError> {
        match std::fs::read_to_string(&path) {
            Ok(contents) => {
                let devices: Vec<PairedDevice> = serde_json::from_str(&contents).map_err(|e| {
                    CryptoError::InvalidKeyData(format!("invalid paired devices JSON: {e}"))
                })?;
                Ok(Self { devices, path })
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::new(path)),
            Err(e) => Err(CryptoError::Io(e)),
        }
    }

    /// Persist the current device list to disk as JSON.
    pub fn save(&self) -> Result<(), CryptoError> {
        let json = serde_json::to_string_pretty(&self.devices).map_err(|e| {
            CryptoError::InvalidKeyData(format!("failed to serialize paired devices: {e}"))
        })?;
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.path, json)?;
        Ok(())
    }

    /// Check whether a device with the given fingerprint is paired.
    pub fn is_paired(&self, fingerprint: &str) -> bool {
        self.devices.iter().any(|d| d.fingerprint == fingerprint)
    }

    /// Look up a paired device by fingerprint.
    pub fn find_by_fingerprint(&self, fingerprint: &str) -> Option<&PairedDevice> {
        self.devices.iter().find(|d| d.fingerprint == fingerprint)
    }

    /// Add a device, replacing any existing entry with the same fingerprint (re-pairing).
    pub fn add(&mut self, device: PairedDevice) {
        self.devices
            .retain(|d| d.fingerprint != device.fingerprint);
        self.devices.push(device);
    }

    /// Remove a device by fingerprint. Returns `true` if a device was removed.
    pub fn remove(&mut self, fingerprint: &str) -> bool {
        let before = self.devices.len();
        self.devices.retain(|d| d.fingerprint != fingerprint);
        self.devices.len() < before
    }

    /// The current list of paired devices.
    pub fn devices(&self) -> &[PairedDevice] {
        &self.devices
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keypair_generate_and_fingerprint() {
        let kp = ServerKeypair::generate().unwrap();
        let fp = kp.fingerprint();

        // Format: "XXXX-XXXX-XXXX" — 14 chars total
        assert_eq!(fp.len(), 14, "fingerprint length should be 14");

        let parts: Vec<&str> = fp.split('-').collect();
        assert_eq!(parts.len(), 3, "fingerprint should have 3 groups");
        for part in &parts {
            assert_eq!(part.len(), 4, "each group should be 4 hex chars");
            assert!(
                part.chars().all(|c| c.is_ascii_hexdigit()),
                "each group should be hex"
            );
        }
    }

    #[test]
    fn keypair_save_and_load() {
        let dir = std::env::temp_dir().join("redmatrix_test_keys_save_load");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test_keypair.json");

        let original = ServerKeypair::generate().unwrap();
        original.save(&path).unwrap();

        let loaded = ServerKeypair::load(&path).unwrap();

        assert_eq!(
            original.public_key_base64(),
            loaded.public_key_base64(),
            "public key should survive save/load round-trip"
        );
        assert_eq!(
            original.fingerprint(),
            loaded.fingerprint(),
            "fingerprint should survive save/load round-trip"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Helper: create a server+client keypair and derive session crypto from both sides.
    fn make_session_pair() -> (SessionCrypto, SessionCrypto) {
        let server_kp = ServerKeypair::generate().unwrap();
        let client_secret = SecretKey::random(&mut rand::rngs::OsRng);
        let client_public = client_secret.public_key();

        // Server-side session (encrypts with server key, decrypts with client key)
        let server_session = SessionCrypto::derive(
            server_kp.secret_key(),
            server_kp.public_key(),
            &client_public,
        )
        .unwrap();

        // Client-side session: same shared secret, but keys are swapped.
        // The client uses the *client* cipher to encrypt and the *server* cipher to decrypt.
        // We re-derive from the client side — same HKDF inputs but the client
        // must use `client_cipher` to encrypt and `server_cipher` to decrypt.
        // Since SessionCrypto always puts server_cipher first, the client needs
        // the same derivation but uses the opposite methods.
        // For testing we just derive the same object and use it symmetrically.
        let client_session = SessionCrypto::derive(
            server_kp.secret_key(),
            server_kp.public_key(),
            &client_public,
        )
        .unwrap();

        (server_session, client_session)
    }

    #[test]
    fn session_crypto_derive() {
        let server_kp = ServerKeypair::generate().unwrap();
        let client_secret = SecretKey::random(&mut rand::rngs::OsRng);
        let client_public = client_secret.public_key();

        let _session = SessionCrypto::derive(
            server_kp.secret_key(),
            server_kp.public_key(),
            &client_public,
        )
        .unwrap();
    }

    #[test]
    fn encrypt_decrypt_round_trip() {
        let (mut server_session, client_session) = make_session_pair();

        let plaintext = b"Hello, RedMatrix!";
        let frame = server_session.encrypt_server_frame(plaintext).unwrap();

        // The "client" decrypts a server frame by using the server_cipher,
        // but our SessionCrypto decrypts with client_cipher.
        // Since both sessions are derived identically, we can decrypt the
        // server frame by reading it back through a fresh session's perspective.
        // We need to manually decrypt using the server cipher on the receiving side.
        // Let's just verify with the same session object since the ciphers are symmetric:
        // encrypt with server_cipher, decrypt with server_cipher.

        // Actually, for a proper round-trip, let's use the server session to
        // encrypt and then directly verify decryption using the same key material.
        // We'll test by building a frame that looks like a client frame to decrypt.

        // Simplest correct test: encrypt as server, then read it back using
        // the server cipher directly (which is what the remote client would do).
        assert!(frame.len() > 8, "frame should contain counter + ciphertext");
        let counter = u64::from_le_bytes(frame[..8].try_into().unwrap());
        assert_eq!(counter, 0, "first frame counter should be 0");

        // Decrypt using the server cipher (simulating the client who has the same
        // derived keys and knows to use server_write_key for decrypting server frames).
        let nonce = SessionCrypto::build_nonce(&client_session.server_iv, counter);
        let decrypted = client_session
            .server_cipher
            .decrypt(Nonce::from_slice(&nonce), &frame[8..])
            .expect("decryption should succeed");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn different_directions_different_keys() {
        let (mut server_session, mut client_session) = make_session_pair();

        let plaintext = b"direction test";
        let server_frame = server_session.encrypt_server_frame(plaintext).unwrap();

        // Try to decrypt a server-encrypted frame as if it were a client frame.
        // This should fail because decrypt_client_frame uses client_cipher + client_iv,
        // but the frame was encrypted with server_cipher + server_iv.
        let result = client_session.decrypt_client_frame(&server_frame);
        assert!(
            result.is_err(),
            "decrypting server frame as client frame should fail"
        );
    }

    #[test]
    fn frame_counter_produces_different_ciphertext() {
        let (mut server_session, _) = make_session_pair();

        let plaintext = b"same plaintext";
        let frame1 = server_session.encrypt_server_frame(plaintext).unwrap();
        let frame2 = server_session.encrypt_server_frame(plaintext).unwrap();

        // Counters differ
        assert_ne!(
            &frame1[..8],
            &frame2[..8],
            "frame counters should differ"
        );
        // Ciphertext differs (different nonce → different output)
        assert_ne!(
            &frame1[8..],
            &frame2[8..],
            "ciphertexts should differ for same plaintext"
        );
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let (mut server_session, client_session) = make_session_pair();

        let plaintext = b"tamper test";

        // Encrypt a "client" frame: use client_cipher to encrypt, then
        // decrypt_client_frame should work — but only if not tampered.
        let counter: u64 = 0;
        let nonce = SessionCrypto::build_nonce(&client_session.client_iv, counter);
        let ciphertext = client_session
            .client_cipher
            .encrypt(Nonce::from_slice(&nonce), plaintext.as_ref())
            .unwrap();

        let mut frame = Vec::new();
        frame.extend_from_slice(&counter.to_le_bytes());
        frame.extend_from_slice(&ciphertext);

        // Verify it decrypts cleanly first.
        let ok = server_session.decrypt_client_frame(&frame);
        assert!(ok.is_ok(), "untampered frame should decrypt");
        assert_eq!(ok.unwrap(), plaintext);

        // Now tamper with a byte in the ciphertext portion.
        let mut tampered = frame.clone();
        if tampered.len() > 9 {
            tampered[9] ^= 0xFF;
        }

        // Re-create session to reset counter (previous decrypt advanced it).
        let (mut s, c) = make_session_pair();

        let nonce2 = SessionCrypto::build_nonce(&c.client_iv, 0);
        let ct2 = c
            .client_cipher
            .encrypt(Nonce::from_slice(&nonce2), plaintext.as_ref())
            .unwrap();
        let mut frame2 = Vec::new();
        frame2.extend_from_slice(&0u64.to_le_bytes());
        frame2.extend_from_slice(&ct2);

        // Tamper
        let mut tampered2 = frame2.clone();
        tampered2[9] ^= 0xFF;

        let result = s.decrypt_client_frame(&tampered2);
        assert!(
            result.is_err(),
            "tampered ciphertext should fail to decrypt"
        );
    }

    // -----------------------------------------------------------------------
    // PairedDeviceStore tests
    // -----------------------------------------------------------------------

    fn make_test_device(fingerprint: &str, name: &str) -> PairedDevice {
        PairedDevice {
            fingerprint: fingerprint.to_string(),
            public_key_base64: "dGVzdA==".to_string(),
            name: name.to_string(),
            paired_at: 1700000000,
        }
    }

    #[test]
    fn paired_device_store_add_and_find() {
        let dir = std::env::temp_dir().join("redmatrix_test_paired");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("paired.json");

        let mut store = PairedDeviceStore::new(path.clone());
        assert!(!store.is_paired("AAAA-BBBB-CCCC"));

        store.add(make_test_device("AAAA-BBBB-CCCC", "Test iPad"));

        assert!(store.is_paired("AAAA-BBBB-CCCC"));
        assert!(!store.is_paired("XXXX-YYYY-ZZZZ"));

        let found = store.find_by_fingerprint("AAAA-BBBB-CCCC").unwrap();
        assert_eq!(found.name, "Test iPad");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn paired_device_store_remove() {
        let store_path = std::env::temp_dir()
            .join("redmatrix_test_paired2")
            .join("paired.json");
        let mut store = PairedDeviceStore::new(store_path);

        store.add(make_test_device("AAAA-BBBB-CCCC", "Test iPad"));

        assert!(store.remove("AAAA-BBBB-CCCC"));
        assert!(!store.is_paired("AAAA-BBBB-CCCC"));
        assert!(!store.remove("AAAA-BBBB-CCCC")); // already removed
    }

    #[test]
    fn paired_device_store_save_and_load() {
        let dir = std::env::temp_dir().join("redmatrix_test_paired3");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("paired.json");

        let mut store = PairedDeviceStore::new(path.clone());
        store.add(make_test_device("AAAA-BBBB-CCCC", "Test iPad"));
        store.save().unwrap();

        let loaded = PairedDeviceStore::load(path).unwrap();
        assert!(loaded.is_paired("AAAA-BBBB-CCCC"));
        assert_eq!(loaded.devices().len(), 1);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn paired_device_store_load_nonexistent_returns_empty() {
        let path = std::env::temp_dir()
            .join("redmatrix_nonexistent")
            .join("nope.json");
        let store = PairedDeviceStore::load(path).unwrap();
        assert_eq!(store.devices().len(), 0);
    }
}
