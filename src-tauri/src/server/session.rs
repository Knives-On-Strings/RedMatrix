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

use super::broadcast::BroadcastHandle;
use super::crypto::{CryptoError, PairedDeviceStore, ServerKeypair};
use super::messages::{ClientMessage, ServerMessage};
use super::state::DeviceState;

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(30);

// ── Error type ──────────────────────────────────────────────────────

#[derive(Error, Debug)]
pub enum SessionError {
    #[error("handshake timed out")]
    HandshakeTimeout,
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

/// Run a WebSocket session for one client. Returns when the connection closes.
pub async fn run(
    ws_stream: WebSocketStream<TcpStream>,
    keypair: Arc<ServerKeypair>,
    paired_store: Arc<RwLock<PairedDeviceStore>>,
    state: Arc<RwLock<DeviceState>>,
    broadcast: BroadcastHandle,
    command_tx: mpsc::Sender<ClientCommand>,
) {
    if let Err(e) = run_inner(ws_stream, keypair, paired_store, state, broadcast, command_tx).await
    {
        log::warn!("Session ended: {}", e);
    }
}

// ── Session implementation ──────────────────────────────────────────

async fn run_inner(
    ws_stream: WebSocketStream<TcpStream>,
    keypair: Arc<ServerKeypair>,
    _paired_store: Arc<RwLock<PairedDeviceStore>>,
    state: Arc<RwLock<DeviceState>>,
    broadcast: BroadcastHandle,
    command_tx: mpsc::Sender<ClientCommand>,
) -> Result<(), SessionError> {
    let (mut write, mut read) = ws_stream.split();

    // 1. Send ServerHello (plaintext)
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

    // Validate that it's actually a ClientHello
    match &client_msg {
        ClientMessage::ClientHello { .. } => {}
        _ => {
            return Err(SessionError::InvalidMessage(
                "expected client_hello".to_string(),
            ))
        }
    }

    // 3. Auth result — auto-accept for now (pairing UI comes later)
    let auth_ok = ServerMessage::AuthResult {
        status: "ok".to_string(),
        reason: None,
    };
    let auth_json = serde_json::to_string(&auth_ok)?;
    write
        .send(Message::Text(auth_json.into()))
        .await
        .map_err(|e| SessionError::WebSocket(e.to_string()))?;

    // 4. Send full device state
    let device_state = state.read().await.clone();
    let state_msg = ServerMessage::DeviceState {
        state: serde_json::to_value(&device_state).unwrap_or_default(),
    };
    let state_json = serde_json::to_string(&state_msg)?;
    write
        .send(Message::Text(state_json.into()))
        .await
        .map_err(|e| SessionError::WebSocket(e.to_string()))?;

    // 5. Message loop
    let mut update_rx = broadcast.subscribe_updates();
    let mut meter_rx = broadcast.subscribe_meters();

    loop {
        tokio::select! {
            // Client message
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(ref text))) => {
                        match serde_json::from_str::<ClientMessage>(text) {
                            Ok(ClientMessage::Ping) => {
                                // Respond to ping directly, don't forward
                                let now = SystemTime::now()
                                    .duration_since(UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis() as u64;
                                let pong = ServerMessage::Pong { timestamp: now };
                                let pong_json = serde_json::to_string(&pong)
                                    .unwrap_or_default();
                                let _ = write.send(Message::Text(pong_json.into())).await;
                            }
                            Ok(cmd) => {
                                let _ = command_tx.send(ClientCommand { message: cmd }).await;
                            }
                            Err(e) => {
                                log::warn!("Invalid client message: {}", e);
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(e)) => {
                        log::warn!("WebSocket read error: {}", e);
                        break;
                    }
                    _ => {} // Binary, Ping/Pong frames handled by tungstenite
                }
            }
            // Broadcast state update
            update = update_rx.recv() => {
                match update {
                    Ok(json) => {
                        let _ = write.send(Message::Text(json.into())).await;
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
            run(ws, kp, ps, st, bc, ctx).await;
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
            run(ws, kp, ps, st, bc, ctx).await;
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
            run(ws, kp, ps, st, bc, ctx).await;
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
            run(ws, kp, ps, st, bc, ctx).await;
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
