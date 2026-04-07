//! Broadcast channels for distributing state updates and meter data to all
//! connected WebSocket clients.
//!
//! Uses tokio broadcast channels with different buffer sizes:
//! - State updates: buffer of 64 (JSON messages, must not be dropped)
//! - Meter data: buffer of 4 (binary frames, old frames can be dropped)

use tokio::sync::broadcast;

/// Broadcast channel for JSON state updates to all connected clients.
pub struct UpdateBroadcast {
    sender: broadcast::Sender<String>,
}

/// Broadcast channel for binary meter data to all connected clients.
pub struct MeterBroadcast {
    sender: broadcast::Sender<Vec<u8>>,
}

/// Combined handle holding both broadcast senders. Cloneable for session tasks.
#[derive(Clone)]
pub struct BroadcastHandle {
    update_tx: broadcast::Sender<String>,
    meter_tx: broadcast::Sender<Vec<u8>>,
}

impl UpdateBroadcast {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(64);
        Self { sender }
    }

    pub fn sender(&self) -> &broadcast::Sender<String> {
        &self.sender
    }
}

impl MeterBroadcast {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(4); // Small buffer, drop old frames
        Self { sender }
    }

    pub fn sender(&self) -> &broadcast::Sender<Vec<u8>> {
        &self.sender
    }
}

impl BroadcastHandle {
    pub fn new() -> Self {
        let (update_tx, _) = broadcast::channel(64);
        let (meter_tx, _) = broadcast::channel(4);
        Self {
            update_tx,
            meter_tx,
        }
    }

    pub fn send_update(
        &self,
        msg: String,
    ) -> Result<usize, broadcast::error::SendError<String>> {
        self.update_tx.send(msg)
    }

    pub fn send_meters(
        &self,
        data: Vec<u8>,
    ) -> Result<usize, broadcast::error::SendError<Vec<u8>>> {
        self.meter_tx.send(data)
    }

    pub fn subscribe_updates(&self) -> broadcast::Receiver<String> {
        self.update_tx.subscribe()
    }

    pub fn subscribe_meters(&self) -> broadcast::Receiver<Vec<u8>> {
        self.meter_tx.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn update_broadcast_delivers_to_multiple_receivers() {
        let handle = BroadcastHandle::new();
        let mut rx1 = handle.subscribe_updates();
        let mut rx2 = handle.subscribe_updates();

        handle.send_update("test message".to_string()).unwrap();

        assert_eq!(rx1.recv().await.unwrap(), "test message");
        assert_eq!(rx2.recv().await.unwrap(), "test message");
    }

    #[tokio::test]
    async fn meter_broadcast_delivers_binary() {
        let handle = BroadcastHandle::new();
        let mut rx = handle.subscribe_meters();

        let data = vec![1u8, 2, 3, 4];
        handle.send_meters(data.clone()).unwrap();

        assert_eq!(rx.recv().await.unwrap(), data);
    }

    #[tokio::test]
    async fn meter_broadcast_lagged_receiver_doesnt_block() {
        let handle = BroadcastHandle::new();
        let mut _rx = handle.subscribe_meters();

        // Send more than buffer capacity (4)
        for i in 0..10u8 {
            let _ = handle.send_meters(vec![i]);
        }

        // Sender didn't block — this test passing means no deadlock
    }

    #[test]
    fn broadcast_handle_is_clone() {
        let handle = BroadcastHandle::new();
        let _cloned = handle.clone();
    }

    #[test]
    fn update_broadcast_sender_accessible() {
        let bc = UpdateBroadcast::new();
        let _sender = bc.sender();
    }

    #[test]
    fn meter_broadcast_sender_accessible() {
        let bc = MeterBroadcast::new();
        let _sender = bc.sender();
    }
}
