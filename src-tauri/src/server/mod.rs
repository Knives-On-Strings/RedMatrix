//! WebSocket server for remote control (iPad companion app).
//!
//! Listens on port 18120 (a nod to the 18i20 model).
//! Local connections (Tauri webview) bypass encryption.
//! Remote connections use ECDH + AES-256-GCM.

pub mod broadcast;
pub mod crypto;
pub mod listener;
pub mod mdns;
pub mod messages;
pub mod mock_devices;
pub mod mock_handler;
pub mod session;
pub mod state;

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, RwLock};
use thiserror::Error;

pub const DEFAULT_PORT: u16 = 18120;

// ── Configuration ──────────────────────────────────────────────────

pub struct ServerConfig {
    pub port: u16,
    pub server_name: String,
    pub keypair_path: PathBuf,
    pub paired_devices_path: PathBuf,
    pub max_saves_per_hour: u32,
    /// When true, clients must present a public key that is in the paired device store.
    /// When false (dev mode), all clients are auto-accepted and encryption is skipped.
    pub require_pairing: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: DEFAULT_PORT,
            server_name: "RedMatrix Server".to_string(),
            keypair_path: PathBuf::from("server_keys.json"),
            paired_devices_path: PathBuf::from("paired_devices.json"),
            max_saves_per_hour: 12,
            require_pairing: false,
        }
    }
}

// ── Handle ─────────────────────────────────────────────────────────

/// Returned by [`start_server`]. Holds the shutdown trigger and shared state
/// needed by the Tauri frontend / command processor.
pub struct ServerHandle {
    pub shutdown_tx: Option<oneshot::Sender<()>>,
    pub state: Arc<RwLock<state::DeviceState>>,
    pub command_rx: mpsc::Receiver<session::ClientCommand>,
    /// Keep the mDNS daemon alive for the lifetime of the server.
    _mdns_daemon: Option<mdns_sd::ServiceDaemon>,
    /// Send `true` to stop the meter task. Kept alive so callers can signal shutdown.
    #[allow(dead_code)]
    meter_stop_tx: Option<tokio::sync::watch::Sender<bool>>,
}

// ── Errors ─────────────────────────────────────────────────────────

#[derive(Error, Debug)]
pub enum ServerError {
    #[error("failed to bind to port {port}: {source}")]
    BindFailed { port: u16, source: std::io::Error },
    #[error("crypto error: {0}")]
    Crypto(#[from] crypto::CryptoError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

// ── Entry point ────────────────────────────────────────────────────

/// Start the WebSocket server: bind, spawn listener, advertise via mDNS,
/// and kick off a mock meter task. Returns a [`ServerHandle`] for the caller
/// to hold (dropping the handle's `shutdown_tx` stops the listener).
pub async fn start_server(config: ServerConfig) -> Result<ServerHandle, ServerError> {
    // 1. Load or generate server keypair
    let keypair = if config.keypair_path.exists() {
        crypto::ServerKeypair::load(&config.keypair_path)?
    } else {
        let kp = crypto::ServerKeypair::generate()?;
        // Try to save, but don't fail if directory doesn't exist yet
        if let Some(parent) = config.keypair_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = kp.save(&config.keypair_path);
        kp
    };
    let keypair = Arc::new(keypair);

    // 2. Load paired device store
    let paired_store = crypto::PairedDeviceStore::load(config.paired_devices_path.clone())
        .unwrap_or_else(|_| crypto::PairedDeviceStore::new(config.paired_devices_path));
    let paired_store = Arc::new(RwLock::new(paired_store));

    // 3. Create device state (mock for now — real USB bridge comes later)
    let device_state = state::DeviceState::mock_18i20_gen3();
    let state = Arc::new(RwLock::new(device_state));

    // 4. Create broadcast channels
    let broadcast_handle = broadcast::BroadcastHandle::new();

    // 5. Create command channel
    let (command_tx, command_rx) = mpsc::channel::<session::ClientCommand>(64);

    // 6. Bind TCP listener
    // Use 127.0.0.1 (localhost only) during development.
    // Change to "0.0.0.0" when pairing is implemented to allow remote connections.
    let bind_addr = "127.0.0.1";
    let tcp_listener = tokio::net::TcpListener::bind(format!("{}:{}", bind_addr, config.port))
        .await
        .map_err(|e| ServerError::BindFailed {
            port: config.port,
            source: e,
        })?;

    log::info!("WebSocket server listening on {}:{}", bind_addr, config.port);

    // 7. Spawn listener task
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let require_pairing = config.require_pairing;

    tokio::spawn(listener::listen(
        tcp_listener,
        keypair.clone(),
        paired_store.clone(),
        state.clone(),
        broadcast_handle.clone(),
        command_tx,
        shutdown_rx,
        require_pairing,
    ));

    // 8. Spawn mDNS (best-effort, don't fail if it can't start)
    let fingerprint = keypair.fingerprint().to_string();
    let mdns_daemon = match mdns::advertise(config.port, &config.server_name, &fingerprint) {
        Ok(daemon) => {
            log::info!(
                "mDNS: advertising _redmatrix._tcp on port {}",
                config.port
            );
            Some(daemon)
        }
        Err(e) => {
            log::warn!("mDNS: failed to advertise: {}", e);
            None
        }
    };

    // 9. Spawn mock meter task (generates fake meter data at 20 Hz)
    // Capped at 20Hz to reduce USB/CPU overhead when running with real hardware.
    // Client-side CSS easing smooths the visual to 60fps.
    let meter_broadcast = broadcast_handle.clone();
    let (meter_stop_tx, mut meter_stop_rx) = tokio::sync::watch::channel(false);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(50));
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    // Generate fake meter data: 65 channels of a quiet signal
                    let meter_data: Vec<u8> = (0..65)
                        .flat_map(|_| {
                            let val: f32 = 0.1;
                            val.to_le_bytes().to_vec()
                        })
                        .collect();
                    // Stop if no receivers remain
                    if meter_broadcast.send_meters(meter_data).is_err() {
                        break;
                    }
                }
                _ = meter_stop_rx.changed() => {
                    if *meter_stop_rx.borrow() {
                        break;
                    }
                }
            }
        }
    });

    Ok(ServerHandle {
        shutdown_tx: Some(shutdown_tx),
        state,
        command_rx,
        _mdns_daemon: mdns_daemon,
        meter_stop_tx: Some(meter_stop_tx),
    })
}

// ── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_port_is_18120() {
        assert_eq!(DEFAULT_PORT, 18120);
    }

    #[test]
    fn server_config_default() {
        let config = ServerConfig::default();
        assert_eq!(config.port, 18120);
        assert_eq!(config.max_saves_per_hour, 12);
    }

    #[tokio::test]
    async fn start_server_returns_handle() {
        let config = ServerConfig {
            port: 19876,
            keypair_path: std::env::temp_dir().join("test_server_keys.json"),
            paired_devices_path: std::env::temp_dir().join("test_server_paired.json"),
            ..Default::default()
        };

        let handle = start_server(config).await;
        assert!(handle.is_ok());

        let mut handle = handle.unwrap();
        // Shut it down
        if let Some(tx) = handle.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }

    #[tokio::test]
    async fn end_to_end_connect_and_receive_state() {
        let config = ServerConfig {
            port: 19877,
            keypair_path: std::env::temp_dir().join("test_e2e_keys.json"),
            paired_devices_path: std::env::temp_dir().join("test_e2e_paired.json"),
            ..Default::default()
        };

        let mut handle = start_server(config).await.unwrap();

        // Give the server a moment to start
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        // Connect
        let (mut ws, _) = tokio_tungstenite::connect_async("ws://127.0.0.1:19877")
            .await
            .unwrap();

        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::Message;

        // Receive server_hello
        let msg = ws.next().await.unwrap().unwrap();
        assert!(msg.into_text().unwrap().contains("server_hello"));

        // Send client_hello
        let hello = serde_json::json!({
            "type": "client_hello",
            "version": 1,
            "client_pubkey": "dGVzdA==",
            "client_name": "Test"
        });
        ws.send(Message::Text(hello.to_string().into()))
            .await
            .unwrap();

        // Receive auth_result
        let msg = ws.next().await.unwrap().unwrap();
        assert!(msg.into_text().unwrap().contains("ok"));

        // Receive device_state
        let msg = ws.next().await.unwrap().unwrap();
        let text = msg.into_text().unwrap();
        assert!(
            text.contains("Scarlett") || text.contains("18i20"),
            "expected device state containing Scarlett or 18i20, got: {}",
            &text[..200.min(text.len())]
        );

        // Shutdown
        if let Some(tx) = handle.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}
