//! WebSocket server for remote control (iPad companion app).
//!
//! Listens on port 18120 (a nod to the 18i20 model).
//! Local connections (Tauri webview) bypass encryption.
//! Remote connections use ECDH + AES-256-GCM.

pub mod broadcast;
pub mod crypto;
pub mod messages;
pub mod state;

pub const DEFAULT_PORT: u16 = 18120;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_port_is_18120() {
        assert_eq!(DEFAULT_PORT, 18120);
    }
}
