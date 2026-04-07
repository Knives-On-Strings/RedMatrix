//! TCP listener that accepts WebSocket connections and spawns session tasks.
//!
//! Limits concurrent connections via a semaphore and supports graceful
//! shutdown through a oneshot channel.

use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot, RwLock, Semaphore};
use tokio_tungstenite::accept_async;

use super::broadcast::BroadcastHandle;
use super::crypto::{PairedDeviceStore, ServerKeypair};
use super::session::{self, ClientCommand};
use super::state::DeviceState;

const MAX_CONNECTIONS: usize = 16;

/// Accept TCP connections, upgrade to WebSocket, and spawn a session task
/// for each client. Returns when `shutdown_rx` fires or the listener errors.
pub async fn listen(
    listener: TcpListener,
    keypair: Arc<ServerKeypair>,
    paired_store: Arc<RwLock<PairedDeviceStore>>,
    state: Arc<RwLock<DeviceState>>,
    broadcast: BroadcastHandle,
    command_tx: mpsc::Sender<ClientCommand>,
    mut shutdown_rx: oneshot::Receiver<()>,
    require_pairing: bool,
) {
    let semaphore = Arc::new(Semaphore::new(MAX_CONNECTIONS));

    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                match accept_result {
                    Ok((stream, addr)) => {
                        let permit = match semaphore.clone().try_acquire_owned() {
                            Ok(permit) => permit,
                            Err(_) => {
                                log::warn!("Max connections reached, rejecting {}", addr);
                                continue;
                            }
                        };

                        let kp = keypair.clone();
                        let ps = paired_store.clone();
                        let st = state.clone();
                        let bc = broadcast.clone();
                        let ctx = command_tx.clone();

                        tokio::spawn(async move {
                            match accept_async(stream).await {
                                Ok(ws_stream) => {
                                    log::info!("Client connected: {}", addr);
                                    session::run(ws_stream, kp, ps, st, bc, ctx, require_pairing).await;
                                    log::info!("Client disconnected: {}", addr);
                                }
                                Err(e) => {
                                    log::warn!("WebSocket upgrade failed for {}: {}", addr, e);
                                }
                            }
                            drop(permit); // Release connection slot
                        });
                    }
                    Err(e) => {
                        log::error!("TCP accept error: {}", e);
                    }
                }
            }
            _ = &mut shutdown_rx => {
                log::info!("Listener shutting down");
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;
    use tokio::net::TcpListener as TokioListener;
    use tokio_tungstenite::connect_async;

    #[tokio::test]
    async fn listener_accepts_connection() {
        let tcp = TokioListener::bind("127.0.0.1:0").await.unwrap();
        let addr = tcp.local_addr().unwrap();

        let keypair = Arc::new(super::super::crypto::ServerKeypair::generate().unwrap());
        let paired_store = Arc::new(RwLock::new(super::super::crypto::PairedDeviceStore::new(
            std::env::temp_dir().join("test_listener_paired.json"),
        )));
        let state = Arc::new(RwLock::new(
            super::super::state::DeviceState::mock_18i20_gen3(),
        ));
        let broadcast = BroadcastHandle::new();
        let (command_tx, _rx) = mpsc::channel(32);
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        tokio::spawn(listen(
            tcp,
            keypair,
            paired_store,
            state,
            broadcast,
            command_tx,
            shutdown_rx,
            false,
        ));

        // Connect as client
        let url = format!("ws://{}", addr);
        let (mut ws, _) = connect_async(&url).await.unwrap();

        // Should receive server_hello
        let msg = ws.next().await.unwrap().unwrap();
        assert!(msg.into_text().unwrap().contains("server_hello"));

        // Shutdown
        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn listener_shutdown() {
        let tcp = TokioListener::bind("127.0.0.1:0").await.unwrap();

        let keypair = Arc::new(super::super::crypto::ServerKeypair::generate().unwrap());
        let paired_store = Arc::new(RwLock::new(super::super::crypto::PairedDeviceStore::new(
            std::env::temp_dir().join("test_listener_shutdown.json"),
        )));
        let state = Arc::new(RwLock::new(
            super::super::state::DeviceState::mock_18i20_gen3(),
        ));
        let broadcast = BroadcastHandle::new();
        let (command_tx, _rx) = mpsc::channel(32);
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        let handle = tokio::spawn(listen(
            tcp,
            keypair,
            paired_store,
            state,
            broadcast,
            command_tx,
            shutdown_rx,
            false,
        ));

        // Send shutdown
        shutdown_tx.send(()).unwrap();

        // Listener task should complete
        tokio::time::timeout(std::time::Duration::from_secs(2), handle)
            .await
            .unwrap()
            .unwrap();
    }
}
