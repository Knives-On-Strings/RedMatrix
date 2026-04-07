# WebSocket Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the WebSocket server that enables iPad remote control of the Scarlett audio interface, with ECDH authentication, AES-256-GCM encryption, and multi-client state broadcasting.

**Architecture:** Tokio async tasks: listener accepts connections, per-client session tasks handle handshake + encrypted message loop, state manager processes commands and broadcasts updates via tokio channels. Mock device state for testing without USB.

**Tech Stack:** Rust, tokio, tokio-tungstenite, p256 + hkdf + sha2 + aes-gcm (RustCrypto family, replacing ring), serde/serde_json, mdns-sd.

**Spec:** `specs/07-WEBSOCKET-API.md` (API contract), `specs/2026-04-07-websocket-server-design.md` (implementation design)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/src/server/mod.rs` | Rewrite | Public API, re-exports, start_server() |
| `src-tauri/src/server/messages.rs` | Create | All message types as serde enums |
| `src-tauri/src/server/state.rs` | Create | DeviceState struct, mock data, state mutations |
| `src-tauri/src/server/crypto.rs` | Create | ECDH keypair, HKDF, AES-256-GCM encrypt/decrypt |
| `src-tauri/src/server/session.rs` | Create | Per-client session: handshake + message loop |
| `src-tauri/src/server/listener.rs` | Create | TCP listener, WebSocket upgrade, session spawn |
| `src-tauri/src/server/broadcast.rs` | Create | Broadcast channels for updates + meters |
| `src-tauri/src/server/mdns.rs` | Create | mDNS service advertisement |

---

### Task 1: Message types (`messages.rs`)

**Goal:** Define all client→server and server→client message types with serde serialization matching the API spec's JSON format exactly.

**Files:** Create `src-tauri/src/server/messages.rs`, modify `src-tauri/src/server/mod.rs`

**Types to implement:**
- `ServerMessage` enum with `#[serde(tag = "type")]`: `ServerHello`, `AuthResult`, `DeviceState`, `StateUpdate`, `Error`, `DeviceDisconnected`, `DeviceConnected`, `Pong`
- `ClientMessage` enum with `#[serde(tag = "type")]`: `ClientHello`, `Ping`, `SetDim`, `SetMute`, `SetTalkback`, `SetSpeakerSwitching`, `SetMasterVolume`, `SetOutputVolume`, `SetOutputMute`, `SetInputPad`, `SetInputAir`, `SetInputPhantom`, `SetInputInst`, `SetMixGain`, `SetMixMute`, `SetMixSolo`, `ClearSolo`, `SetRoute`, `SetSampleRate`, `SetClockSource`, `SetSpdifMode`, `SaveConfig`
- Payload sub-structs for each command
- All field names must match the API spec's JSON keys exactly (use `#[serde(rename = "...")]` where Rust naming conventions differ)

**Tests:**
- Serialize each `ServerMessage` variant and verify the JSON contains `"type": "server_hello"` etc.
- Deserialize each `ClientMessage` variant from JSON matching the API spec examples
- Round-trip every message type

- [ ] Write message types with serde derives
- [ ] Write serialization tests
- [ ] Verify tests pass
- [ ] Commit: `feat: add WebSocket message types with serde serialization`

---

### Task 2: Device state model (`state.rs`)

**Goal:** Define the `DeviceState` struct and all sub-structs, plus a `mock_18i20_gen3()` constructor that returns realistic mock data.

**Files:** Create `src-tauri/src/server/state.rs`

**Types to implement:**
- `DeviceState` — top-level state matching the `device_state` JSON schema
- `DeviceInfo` — name, pid, series, firmware_version, serial
- `MonitorState` — dim, mute, talkback, speaker_switching, master_volume_db
- `OutputState` — index, name, volume_db, muted, hw_controlled
- `InputState` — index, name, type, pad, air, phantom, inst
- `MixerState` — gains (2D Vec<f64>), soloed (2D Vec<bool>)
- `RouteEntry` — type (port type string), index
- `SyncStatus` enum — Locked, Unlocked
- `ClockSource` enum — Internal, Spdif, Adat
- `SaveRateLimiter` — rolling window rate limiter for save_config

**Mock data:** `DeviceState::mock_18i20_gen3()` returns a complete state for the 18i20 Gen 3 at 48kHz with:
- 9 analogue inputs (names from device config line_out_descrs)
- 10 analogue outputs as stereo pairs
- 25-bus × 12-input mixer at unity for bus A
- Default PCM→output routing
- Sync locked, internal clock, 48kHz

**Tests:**
- Mock state serializes to valid JSON
- Mock state has correct port counts
- SaveRateLimiter allows 12 saves, rejects 13th
- SaveRateLimiter window rolls (after time passes, saves become available)

- [ ] Write state types and mock constructor
- [ ] Write SaveRateLimiter
- [ ] Write tests
- [ ] Commit: `feat: add DeviceState model with mock 18i20 data`

---

### Task 3: Crypto module (`crypto.rs`)

**Goal:** ECDH P-256 keypair generation, HKDF key derivation, AES-256-GCM per-frame encrypt/decrypt with separate keys per direction.

**Crates:** Use the RustCrypto family (NOT `ring` — it doesn't support persistent ECDH keys):
- `p256` — ECDH key agreement and keypair generation. Supports serializing/deserializing private keys via `SecretKey::to_bytes()` / `from_bytes()`, which `ring` intentionally prevents.
- `hkdf` + `sha2` — HKDF-SHA256 key derivation
- `aes-gcm` — AES-256-GCM authenticated encryption
- `rand` — secure random for key generation (`OsRng`)

Update `Cargo.toml`: replace `ring = "0.17"` with:
```toml
p256 = { version = "0.13", features = ["ecdh"] }
hkdf = "0.12"
sha2 = "0.10"
aes-gcm = "0.10"
rand = "0.8"
```

**Files:** Create `src-tauri/src/server/crypto.rs`

**Types to implement:**
- `ServerKeypair` — generate or load from file, expose public key bytes and fingerprint
- `SessionCrypto` — derived from ECDH shared secret via HKDF, holds 4 keys/IVs, frame counters
- `CryptoError` enum — KeyGenerationFailed, DerivationFailed, EncryptionFailed, DecryptionFailed, InvalidFrameCounter

**Functions:**
- `ServerKeypair::generate() -> Result<Self>` — new P-256 keypair via `p256::SecretKey::random(&mut OsRng)`
- `ServerKeypair::load(path) -> Result<Self>` — load private key bytes from JSON file, reconstruct via `SecretKey::from_bytes()`
- `ServerKeypair::save(path) -> Result<()>` — persist `SecretKey::to_bytes()` as base64 in JSON
- `ServerKeypair::fingerprint(&self) -> String` — SHA-256 of public key bytes, formatted as "XXXX-XXXX-XXXX"
- `SessionCrypto::derive(server_private: &SecretKey, client_public: &PublicKey) -> Result<Self>` — ECDH via `p256::ecdh::diffie_hellman()`, then HKDF
- `SessionCrypto::encrypt_server_frame(&mut self, plaintext: &[u8]) -> Vec<u8>` — encrypt + prepend counter + append tag
- `SessionCrypto::decrypt_client_frame(&mut self, frame: &[u8]) -> Result<Vec<u8>>` — verify counter + decrypt

**HKDF details:**
- Algorithm: HKDF-SHA256
- Salt: server_pubkey_bytes || client_pubkey_bytes
- Info: b"redmatrix-ws-v1"
- Output: 88 bytes → server_write_key(32) + client_write_key(32) + server_write_iv(12) + client_write_iv(12)

**Nonce construction:**
- 12-byte nonce = base_iv with last 8 bytes XORed with frame_counter (LE u64)

**Tests:**
- Generate keypair, fingerprint is 14 chars (XXXX-XXXX-XXXX format)
- Save and reload keypair, public key matches
- Derive session crypto from two keypairs
- Encrypt then decrypt round-trip
- Server and client directions use different keys (encrypt with server key, cannot decrypt with server key — must use client key)
- Frame counter increments, same plaintext produces different ciphertext
- Tampered ciphertext fails decryption

- [ ] Update Cargo.toml: replace ring with p256, hkdf, sha2, aes-gcm, rand
- [ ] Implement ServerKeypair (generate, load, save, fingerprint)
- [ ] Implement SessionCrypto (derive, encrypt, decrypt)
- [ ] Write tests
- [ ] Commit: `feat: add ECDH + AES-256-GCM crypto module (RustCrypto)`

---

### Task 4: Paired device store

**Goal:** Manage the list of paired client public keys. Load/save from JSON file. Check if a client is paired.

**Files:** Add to `src-tauri/src/server/crypto.rs` (or separate file if it gets large)

**Types:**
- `PairedDevice` — fingerprint, public_key_bytes, name, paired_at timestamp
- `PairedDeviceStore` — Vec of paired devices, file path, load/save/add/remove/is_paired methods

**Tests:**
- Add a device, is_paired returns true
- Remove a device, is_paired returns false
- Save and reload preserves devices
- Unknown key is not paired

- [ ] Implement PairedDeviceStore
- [ ] Write tests
- [ ] Commit: `feat: add paired device store`

---

### Task 5: Session handler (`session.rs`)

**Goal:** Per-client WebSocket session: runs the handshake, then enters encrypted message loop.

**Files:** Create `src-tauri/src/server/session.rs`

**Session lifecycle:**
1. Send `ServerHello` (plaintext)
2. Receive `ClientHello` (plaintext) — **with 30-second timeout**
3. Check if client is paired → send `AuthResult`
4. If pairing_requested: wait for approval (via a oneshot channel from the Tauri UI) — **with 60-second timeout**
5. On auth ok: derive SessionCrypto
6. Send encrypted `DeviceState`
7. Enter message loop:
   - Read: receive encrypted frame → decrypt → parse ClientMessage → send to command channel
   - Write: receive from broadcast channel → serialize → encrypt → send
8. On disconnect: clean up

**Timeout protection against zombie connections:**
- All handshake steps are wrapped in `tokio::time::timeout`
- `ClientHello` must arrive within 30 seconds of `ServerHello` being sent
- Pairing approval must complete within 60 seconds
- If any timeout fires: log the event, close the TCP stream, kill the session task
- This prevents attackers or buggy clients from exhausting file descriptors by opening idle connections
- Additionally, the listener should enforce a max concurrent connections limit (e.g., 16) to bound resource usage

**Dependencies:** `crypto::SessionCrypto`, `messages::*`, `broadcast` channels, `state::DeviceState`

**Tests:**
- Integration test with a real tokio-tungstenite client connecting to a test server
- Handshake completes, client receives device_state
- Client sends a command, receives state_update
- Invalid client key gets rejected
- Slow client that doesn't send ClientHello gets disconnected after timeout
- Max connections limit enforced (17th connection rejected while 16 are active)

- [ ] Implement session handshake with timeouts
- [ ] Implement encrypted message loop
- [ ] Write integration tests including timeout and connection limit tests
- [ ] Commit: `feat: add per-client WebSocket session handler with timeout protection`

---

### Task 6: Broadcast channels (`broadcast.rs`)

**Goal:** Typed broadcast channels for state updates and meter data.

**Files:** Create `src-tauri/src/server/broadcast.rs`

**Types:**
- `UpdateBroadcast` — wraps `tokio::sync::broadcast::Sender<ServerMessage>`, capacity 64
- `MeterBroadcast` — wraps `tokio::sync::broadcast::Sender<Vec<u8>>`, capacity 4 (meter frames are hot, drop old ones)
- `BroadcastHandle` — holds both senders, cloneable for session tasks

**Tests:**
- Send update, two receivers both get it
- Meter broadcast with lagged receiver doesn't block sender

- [ ] Implement broadcast types
- [ ] Write tests
- [ ] Commit: `feat: add broadcast channels for state updates and meters`

---

### Task 7: Listener (`listener.rs`)

**Goal:** TCP listener on port 18120, WebSocket upgrade, spawn session task per connection.

**Files:** Create `src-tauri/src/server/listener.rs`

**Function:**
- `pub async fn listen(config, keypair, paired_store, state, broadcast, command_tx, shutdown_rx)` — the main accept loop

**Behavior:**
- Bind `TcpListener` on `0.0.0.0:{port}`
- Accept connections in a loop
- Upgrade each to WebSocket via `tokio_tungstenite::accept_async`
- Spawn a `session::run()` task for each
- Shutdown cleanly when `shutdown_rx` fires

**Tests:**
- Listener starts and accepts a connection
- Shutdown signal stops the listener

- [ ] Implement listener
- [ ] Write tests
- [ ] Commit: `feat: add WebSocket listener with connection accept loop`

---

### Task 8: mDNS advertisement (`mdns.rs`)

**Goal:** Advertise `_redmatrix._tcp` service on the local network.

**Files:** Create `src-tauri/src/server/mdns.rs`

**Function:**
- `pub async fn advertise(port: u16, server_name: &str, fingerprint: &str) -> Result<ServiceDaemon>`
- Registers service with TXT record `id={fingerprint}`
- Returns the daemon handle (caller keeps it alive)

**Tests:**
- Service registers without error
- Service deregisters on drop

- [ ] Implement mDNS advertisement
- [ ] Write tests
- [ ] Commit: `feat: add mDNS service advertisement`

---

### Task 9: Server entry point (`mod.rs`)

**Goal:** Wire everything together in `start_server()`.

**Files:** Rewrite `src-tauri/src/server/mod.rs`

**Function:**
```rust
pub async fn start_server(config: ServerConfig) -> Result<ServerHandle, ServerError>
```

**Steps:**
1. Load or generate server keypair
2. Load paired device store
3. Create DeviceState (mock for now)
4. Create broadcast channels
5. Create command channel
6. Spawn listener task
7. Spawn mDNS task
8. Spawn meter mock task (generates fake meter data at 30Hz)
9. Return ServerHandle

**Tests:**
- start_server returns a handle
- Full end-to-end: start server, connect mock client, complete handshake, receive state, send command, receive update

- [ ] Implement start_server()
- [ ] Write end-to-end test
- [ ] Run full test suite (`cargo test`)
- [ ] Run clippy
- [ ] Commit: `feat: add start_server() entry point — WebSocket server complete`

---

### Task 10: Final verification

- [ ] Run `cargo test` — all tests pass
- [ ] Run `cargo clippy -- -D warnings` — no warnings
- [ ] Run `npm test` — frontend tests still pass
- [ ] Commit any fixes
- [ ] Push to GitHub
