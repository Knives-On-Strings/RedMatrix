//! Per-client WebSocket session handler.
//!
//! Manages the lifecycle of a single remote client connection:
//! 1. Plaintext handshake (server_hello -> client_hello -> auth_result)
//! 2. Send device state
//! 3. Message loop: relay client commands upstream, broadcast updates/meters downstream

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
use thiserror::Error;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{timeout, Duration};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use p256::elliptic_curve::sec1::FromEncodedPoint;

use super::broadcast::BroadcastHandle;
use super::crypto::{CryptoError, PairedDeviceStore, SessionCrypto, ServerKeypair};
use super::messages::{ClientMessage, ServerMessage};
use super::state::DeviceState;

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(30);
const PAIRING_TIMEOUT: Duration = Duration::from_secs(60);
const IDLE_TIMEOUT: Duration = Duration::from_secs(30);

// ── Error type ──────────────────────────────────────────────────────

#[derive(Error, Debug)]
pub enum SessionError {
    #[error("handshake timed out")]
    HandshakeTimeout,
    #[error("pairing approval timed out")]
    PairingTimeout,
    #[error("client idle timeout (no messages for 30s)")]
    IdleTimeout,
    #[error("connection closed")]
    ConnectionClosed,
    #[error("WebSocket error: {0}")]
    WebSocket(String),
    #[error("invalid message: {0}")]
    InvalidMessage(String),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("crypto error: {0}")]
    Crypto(#[from] CryptoError),
}

// ── Client command ──────────────────────────────────────────────────

/// A command received from a remote client, forwarded to the main server loop.
#[derive(Debug)]
pub struct ClientCommand {
    pub message: ClientMessage,
}

// ── Public entry point ──────────────────────────────────────────────

/// Shared map for pending pairing approvals.
/// Sessions store their oneshot::Sender here; the Tauri command pops it to respond.
pub type PendingPairings = Arc<tokio::sync::Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<bool>>>>;

/// Run a WebSocket session for one client. Returns when the connection closes.
pub async fn run(
    ws_stream: WebSocketStream<TcpStream>,
    keypair: Arc<ServerKeypair>,
    paired_store: Arc<RwLock<PairedDeviceStore>>,
    state: Arc<RwLock<DeviceState>>,
    broadcast: BroadcastHandle,
    command_tx: mpsc::Sender<ClientCommand>,
    require_pairing: bool,
    pending_pairings: Option<PendingPairings>,
) {
    if let Err(e) = run_inner(ws_stream, keypair, paired_store, state, broadcast, command_tx, require_pairing, pending_pairings).await
    {
        log::warn!("Session ended: {}", e);
    }
}

// ── Session implementation ──────────────────────────────────────────

async fn run_inner(
    ws_stream: WebSocketStream<TcpStream>,
    keypair: Arc<ServerKeypair>,
    paired_store: Arc<RwLock<PairedDeviceStore>>,
    state: Arc<RwLock<DeviceState>>,
    broadcast: BroadcastHandle,
    command_tx: mpsc::Sender<ClientCommand>,
    require_pairing: bool,
    pending_pairings: Option<PendingPairings>,
) -> Result<(), SessionError> {
    let (mut write, mut read) = ws_stream.split();

    // 1. Send ServerHello (plaintext — always unencrypted for key exchange)
    let device_name = state.read().await.device.name.clone();
    let server_hello = ServerMessage::ServerHello {
        version: 1,
        server_pubkey: keypair.public_key_base64(),
        server_fingerprint: keypair.fingerprint().to_string(),
        device_name,
        server_name: "RedMatrix Server".to_string(),
    };
    let hello_json = serde_json::to_string(&server_hello)?;
    write
        .send(Message::Text(hello_json.into()))
        .await
        .map_err(|e| SessionError::WebSocket(e.to_string()))?;

    // 2. Receive ClientHello with timeout
    let client_hello = timeout(HANDSHAKE_TIMEOUT, read.next())
        .await
        .map_err(|_| SessionError::HandshakeTimeout)?
        .ok_or(SessionError::ConnectionClosed)?
        .map_err(|e| SessionError::WebSocket(e.to_string()))?;

    let client_msg: ClientMessage = match client_hello {
        Message::Text(ref text) => serde_json::from_str(text)?,
        _ => {
            return Err(SessionError::InvalidMessage(
                "expected text frame".to_string(),
            ))
        }
    };

    // Validate that it's actually a ClientHello and extract fields
    let (client_pubkey_b64, _client_name) = match &client_msg {
        ClientMessage::ClientHello {
            client_pubkey,
            client_name,
            ..
        } => (client_pubkey.clone(), client_name.clone()),
        _ => {
            return Err(SessionError::InvalidMessage(
                "expected client_hello".to_string(),
            ))
        }
    };

    // 3. Auth check
    if require_pairing {
        let client_pk = parse_client_public_key(&client_pubkey_b64)?;
        let client_fingerprint = compute_client_fingerprint(&client_pk);
        let is_paired = paired_store.read().await.is_paired(&client_fingerprint);

        if !is_paired {
            // Unknown client — attempt interactive pairing
            if let Some(ref pairings) = pending_pairings {
                // Send pairing_requested to client
                let pairing_msg = ServerMessage::AuthResult {
                    status: "pairing_requested".to_string(),
                    reason: Some("waiting for desktop approval".to_string()),
                };
                let pairing_json = serde_json::to_string(&pairing_msg)?;
                write.send(Message::Text(pairing_json.into()))
                    .await
                    .map_err(|e| SessionError::WebSocket(e.to_string()))?;

                // Store the oneshot sender in the shared pending map.
                // The Tauri approve_pairing command will pop it and respond.
                let (response_tx, response_rx) = tokio::sync::oneshot::channel();
                {
                    let mut map = pairings.lock().await;
                    map.insert(client_fingerprint.clone(), response_tx);
                }
                // Note: The Tauri event "pairing_requested" should be emitted
                // by the listener/server code that has access to the AppHandle.
                // For now, the React UI listens for this event separately.

                let approved = timeout(PAIRING_TIMEOUT, response_rx)
                    .await
                    .map_err(|_| SessionError::PairingTimeout)?
                    .unwrap_or(false);

                if approved {
                    // Add to paired store
                    let mut store = paired_store.write().await;
                    store.add(super::crypto::PairedDevice {
                        fingerprint: client_fingerprint,
                        public_key_base64: client_pubkey_b64.clone(),
                        name: _client_name.clone(),
                        paired_at: SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs(),
                    });
                    let _ = store.save();
                    log::info!("Paired new device: {}", _client_name);
                } else {
                    let reject = ServerMessage::AuthResult {
                        status: "rejected".to_string(),
                        reason: Some("pairing denied by user".to_string()),
                    };
                    let reject_json = serde_json::to_string(&reject)?;
                    let _ = write.send(Message::Text(reject_json.into())).await;
                    return Err(SessionError::InvalidMessage("pairing denied".to_string()));
                }
            } else {
                // No pairing channel available — reject outright
                let reject = ServerMessage::AuthResult {
                    status: "rejected".to_string(),
                    reason: Some("unknown device — pair first".to_string()),
                };
                let reject_json = serde_json::to_string(&reject)?;
                let _ = write.send(Message::Text(reject_json.into())).await;
                return Err(SessionError::InvalidMessage("client not paired".to_string()));
            }
        }
    }
    // Dev mode (require_pairing == false): auto-accept all clients

    let auth_ok = ServerMessage::AuthResult {
        status: "ok".to_string(),
        reason: None,
    };
    let auth_json = serde_json::to_string(&auth_ok)?;
    write
        .send(Message::Text(auth_json.into()))
        .await
        .map_err(|e| SessionError::WebSocket(e.to_string()))?;

    // 4. Derive session encryption (only when pairing is required)
    let mut session_crypto: Option<SessionCrypto> = if require_pairing {
        let client_pk = parse_client_public_key(&client_pubkey_b64)?;
        let crypto = SessionCrypto::derive(
            keypair.secret_key(),
            keypair.public_key(),
            &client_pk,
        )
        .map_err(SessionError::Crypto)?;
        Some(crypto)
    } else {
        None
    };

    // 5. Send full device state
    let device_state = state.read().await.clone();
    let state_msg = ServerMessage::DeviceState {
        state: serde_json::to_value(&device_state).unwrap_or_default(),
    };
    let state_json = serde_json::to_string(&state_msg)?;
    send_message(&mut write, &mut session_crypto, &state_json).await?;

    // 6. Message loop
    let mut update_rx = broadcast.subscribe_updates();
    let mut meter_rx = broadcast.subscribe_meters();

    loop {
        tokio::select! {
            // Client message (with idle timeout)
            msg = timeout(IDLE_TIMEOUT, read.next()) => {
                let msg = match msg {
                    Ok(inner) => inner,
                    Err(_) => return Err(SessionError::IdleTimeout),
                };
                let parsed = recv_message(msg, &mut session_crypto)?;
                match parsed {
                    RecvResult::Text(text) => {
                        match serde_json::from_str::<ClientMessage>(&text) {
                            Ok(ClientMessage::Ping) => {
                                let now = SystemTime::now()
                                    .duration_since(UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis() as u64;
                                let pong = ServerMessage::Pong { timestamp: now };
                                let pong_json = serde_json::to_string(&pong)
                                    .unwrap_or_default();
                                send_message(&mut write, &mut session_crypto, &pong_json).await?;
                            }
                            Ok(cmd) => {
                                let _ = command_tx.send(ClientCommand { message: cmd }).await;
                            }
                            Err(e) => {
                                log::warn!("Invalid client message: {}", e);
                            }
                        }
                    }
                    RecvResult::Close => break,
                    RecvResult::Skip => {}
                }
            }
            // Broadcast state update
            update = update_rx.recv() => {
                match update {
                    Ok(json) => {
                        let _ = send_message(&mut write, &mut session_crypto, &json).await;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        log::warn!("Session lagged, missed {} update(s)", n);
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            // Broadcast meter data
            meters = meter_rx.recv() => {
                match meters {
                    Ok(data) => {
                        let _ = write.send(Message::Binary(data.into())).await;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        // Meter data is ephemeral, dropping is fine
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    Ok(())
}

// ── Helpers ────────────────────────────────────────────────────────

/// Parse a base64-encoded SEC1 public key from the client_hello message.
fn parse_client_public_key(b64: &str) -> Result<p256::PublicKey, SessionError> {
    let bytes = BASE64
        .decode(b64)
        .map_err(|e| SessionError::InvalidMessage(format!("bad base64 public key: {e}")))?;
    let encoded_point = p256::EncodedPoint::from_bytes(&bytes)
        .map_err(|e| SessionError::InvalidMessage(format!("bad SEC1 public key: {e}")))?;
    let pk = p256::PublicKey::from_encoded_point(&encoded_point);
    if pk.is_some().into() {
        Ok(pk.unwrap())
    } else {
        Err(SessionError::InvalidMessage(
            "invalid public key point".to_string(),
        ))
    }
}

/// Compute a fingerprint for a client public key (same algorithm as ServerKeypair).
fn compute_client_fingerprint(public_key: &p256::PublicKey) -> String {
    use p256::elliptic_curve::sec1::ToEncodedPoint;
    use sha2::{Digest, Sha256};
    let encoded = public_key.to_encoded_point(false);
    let hash = Sha256::digest(encoded.as_bytes());
    format!(
        "{:02X}{:02X}-{:02X}{:02X}-{:02X}{:02X}",
        hash[0], hash[1], hash[2], hash[3], hash[4], hash[5]
    )
}

/// Result of receiving a WebSocket message, with optional decryption.
enum RecvResult {
    Text(String),
    Close,
    Skip,
}

/// Receive and optionally decrypt a WebSocket message.
fn recv_message(
    msg: Option<Result<Message, tokio_tungstenite::tungstenite::Error>>,
    crypto: &mut Option<SessionCrypto>,
) -> Result<RecvResult, SessionError> {
    match msg {
        Some(Ok(Message::Text(ref text))) => {
            // Plaintext mode (dev / no pairing)
            if crypto.is_none() {
                Ok(RecvResult::Text(text.to_string()))
            } else {
                Err(SessionError::InvalidMessage(
                    "expected binary frame in encrypted mode".to_string(),
                ))
            }
        }
        Some(Ok(Message::Binary(ref data))) => {
            if let Some(ref mut c) = crypto {
                let plaintext = c
                    .decrypt_client_frame(data)
                    .map_err(SessionError::Crypto)?;
                let text = String::from_utf8(plaintext)
                    .map_err(|e| SessionError::InvalidMessage(format!("invalid UTF-8: {e}")))?;
                Ok(RecvResult::Text(text))
            } else {
                // In plaintext mode, binary frames are non-JSON (e.g. ping/pong)
                Ok(RecvResult::Skip)
            }
        }
        Some(Ok(Message::Close(_))) | None => Ok(RecvResult::Close),
        Some(Err(e)) => {
            log::warn!("WebSocket read error: {}", e);
            Ok(RecvResult::Close)
        }
        _ => Ok(RecvResult::Skip), // Ping/Pong frames handled by tungstenite
    }
}

/// Send a JSON message, encrypting it if a SessionCrypto is active.
async fn send_message<S>(
    write: &mut S,
    crypto: &mut Option<SessionCrypto>,
    json: &str,
) -> Result<(), SessionError>
where
    S: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let msg = if let Some(ref mut c) = crypto {
        let encrypted = c
            .encrypt_server_frame(json.as_bytes())
            .map_err(SessionError::Crypto)?;
        Message::Binary(encrypted.into())
    } else {
        Message::Text(json.into())
    };
    write
        .send(msg)
        .await
        .map_err(|e| SessionError::WebSocket(e.to_string()))?;
    Ok(())
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn session_handshake_and_state() {
        // 1. Start a TCP listener on a random port
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        // 2. Set up server-side state
        let keypair = Arc::new(ServerKeypair::generate().unwrap());
        let paired_store = Arc::new(RwLock::new(PairedDeviceStore::new(
            std::env::temp_dir().join("test_session_paired.json"),
        )));
        let state = Arc::new(RwLock::new(DeviceState::mock_18i20_gen3()));
        let broadcast = BroadcastHandle::new();
        let (command_tx, _command_rx) = mpsc::channel(32);

        // 3. Spawn session handler
        let kp = keypair.clone();
        let ps = paired_store.clone();
        let st = state.clone();
        let bc = broadcast.clone();
        let ctx = command_tx.clone();

        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            run(ws, kp, ps, st, bc, ctx, false, None).await;
        });

        // 4. Connect as client
        let url = format!("ws://{}", addr);
        let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();

        // 5. Receive server_hello
        let msg = ws.next().await.unwrap().unwrap();
        let text = msg.into_text().unwrap();
        assert!(text.contains("server_hello"), "expected server_hello, got: {}", text);

        // 6. Send client_hello
        let client_hello = serde_json::json!({
            "type": "client_hello",
            "version": 1,
            "client_pubkey": "dGVzdA==",
            "client_name": "Test Client"
        });
        ws.send(Message::Text(client_hello.to_string().into()))
            .await
            .unwrap();

        // 7. Receive auth_result
        let msg = ws.next().await.unwrap().unwrap();
        let text = msg.into_text().unwrap();
        assert!(text.contains("auth_result"), "expected auth_result, got: {}", text);
        assert!(text.contains("ok"));

        // 8. Receive device_state
        let msg = ws.next().await.unwrap().unwrap();
        let text = msg.into_text().unwrap();
        assert!(
            text.contains("device_state") || text.contains("Scarlett 18i20"),
            "expected device_state, got: {}",
            &text[..200.min(text.len())]
        );
    }

    #[tokio::test]
    async fn session_ping_pong() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let keypair = Arc::new(ServerKeypair::generate().unwrap());
        let paired_store = Arc::new(RwLock::new(PairedDeviceStore::new(
            std::env::temp_dir().join("test_session_ping.json"),
        )));
        let state = Arc::new(RwLock::new(DeviceState::mock_18i20_gen3()));
        let broadcast = BroadcastHandle::new();
        let (command_tx, _command_rx) = mpsc::channel(32);

        let kp = keypair.clone();
        let ps = paired_store.clone();
        let st = state.clone();
        let bc = broadcast.clone();
        let ctx = command_tx.clone();

        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            run(ws, kp, ps, st, bc, ctx, false, None).await;
        });

        let url = format!("ws://{}", addr);
        let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();

        // Complete handshake: receive server_hello
        let _ = ws.next().await.unwrap().unwrap();
        // Send client_hello
        let client_hello = serde_json::json!({
            "type": "client_hello",
            "version": 1,
            "client_pubkey": "dGVzdA==",
            "client_name": "Test Client"
        });
        ws.send(Message::Text(client_hello.to_string().into()))
            .await
            .unwrap();
        // Receive auth_result
        let _ = ws.next().await.unwrap().unwrap();
        // Receive device_state
        let _ = ws.next().await.unwrap().unwrap();

        // Send ping
        let ping = serde_json::json!({ "type": "ping" });
        ws.send(Message::Text(ping.to_string().into()))
            .await
            .unwrap();

        // Receive pong
        let msg = ws.next().await.unwrap().unwrap();
        let text = msg.into_text().unwrap();
        assert!(text.contains("pong"), "expected pong, got: {}", text);
        assert!(text.contains("timestamp"));
    }

    #[tokio::test]
    async fn session_forwards_commands() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let keypair = Arc::new(ServerKeypair::generate().unwrap());
        let paired_store = Arc::new(RwLock::new(PairedDeviceStore::new(
            std::env::temp_dir().join("test_session_cmd.json"),
        )));
        let state = Arc::new(RwLock::new(DeviceState::mock_18i20_gen3()));
        let broadcast = BroadcastHandle::new();
        let (command_tx, mut command_rx) = mpsc::channel(32);

        let kp = keypair.clone();
        let ps = paired_store.clone();
        let st = state.clone();
        let bc = broadcast.clone();
        let ctx = command_tx.clone();

        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            run(ws, kp, ps, st, bc, ctx, false, None).await;
        });

        let url = format!("ws://{}", addr);
        let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();

        // Complete handshake
        let _ = ws.next().await.unwrap().unwrap(); // server_hello
        let client_hello = serde_json::json!({
            "type": "client_hello",
            "version": 1,
            "client_pubkey": "dGVzdA==",
            "client_name": "Test Client"
        });
        ws.send(Message::Text(client_hello.to_string().into()))
            .await
            .unwrap();
        let _ = ws.next().await.unwrap().unwrap(); // auth_result
        let _ = ws.next().await.unwrap().unwrap(); // device_state

        // Send a set_dim command
        let cmd = serde_json::json!({
            "type": "set_dim",
            "payload": { "enabled": true }
        });
        ws.send(Message::Text(cmd.to_string().into()))
            .await
            .unwrap();

        // Verify it arrives on the command channel
        let received = tokio::time::timeout(Duration::from_secs(2), command_rx.recv())
            .await
            .expect("timed out waiting for command")
            .expect("command channel closed");

        match received.message {
            ClientMessage::SetDim { payload } => {
                assert!(payload.enabled);
            }
            other => panic!("expected SetDim, got: {:?}", other),
        }
    }

    #[tokio::test]
    async fn session_relays_broadcast_update() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let keypair = Arc::new(ServerKeypair::generate().unwrap());
        let paired_store = Arc::new(RwLock::new(PairedDeviceStore::new(
            std::env::temp_dir().join("test_session_broadcast.json"),
        )));
        let state = Arc::new(RwLock::new(DeviceState::mock_18i20_gen3()));
        let broadcast = BroadcastHandle::new();
        let (command_tx, _command_rx) = mpsc::channel(32);

        let kp = keypair.clone();
        let ps = paired_store.clone();
        let st = state.clone();
        let bc = broadcast.clone();
        let ctx = command_tx.clone();

        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            run(ws, kp, ps, st, bc, ctx, false, None).await;
        });

        let url = format!("ws://{}", addr);
        let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();

        // Complete handshake
        let _ = ws.next().await.unwrap().unwrap(); // server_hello
        let client_hello = serde_json::json!({
            "type": "client_hello",
            "version": 1,
            "client_pubkey": "dGVzdA==",
            "client_name": "Test Client"
        });
        ws.send(Message::Text(client_hello.to_string().into()))
            .await
            .unwrap();
        let _ = ws.next().await.unwrap().unwrap(); // auth_result
        let _ = ws.next().await.unwrap().unwrap(); // device_state

        // Small delay to let the session enter the message loop
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Send a broadcast update
        let update_json = r#"{"type":"state_update","changes":{"dim":true}}"#.to_string();
        broadcast.send_update(update_json.clone()).unwrap();

        // Client should receive the broadcast
        let msg = tokio::time::timeout(Duration::from_secs(2), ws.next())
            .await
            .expect("timed out waiting for broadcast")
            .unwrap()
            .unwrap();
        let text = msg.into_text().unwrap();
        assert!(text.contains("state_update"), "expected broadcast, got: {}", text);
    }
}
