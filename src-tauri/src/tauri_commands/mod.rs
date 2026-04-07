//! Tauri IPC command handlers.
//!
//! These are invoked from the React frontend via `@tauri-apps/api`.
//! Each command is registered in lib.rs via `tauri::generate_handler![]`.

use crate::server::state::DeviceState;

/// Get the current device state as JSON.
/// Returns mock data until USB transport is connected.
#[tauri::command]
pub fn get_device_state() -> DeviceState {
    // TODO: Read from shared Arc<RwLock<DeviceState>> once the server is wired up.
    // For now, return mock data so the frontend can render.
    DeviceState::mock_18i20_gen3()
}

/// Receive a command from the frontend.
/// Parses the JSON command and forwards it to the command handler.
#[tauri::command]
pub fn send_command(command: String) -> Result<(), String> {
    // TODO: Parse as ClientMessage and forward to the USB command handler.
    // For now, just log it.
    log::info!("Received command from frontend: {}", command);
    Ok(())
}

/// Legacy greeting command (smoke test for IPC).
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! RedMatrix is running.", name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greet_returns_expected_message() {
        assert_eq!(greet("World"), "Hello, World! RedMatrix is running.");
    }

    #[test]
    fn get_device_state_returns_mock() {
        let state = get_device_state();
        assert_eq!(state.device.name, "Scarlett 18i20 USB");
        assert_eq!(state.sample_rate, 48000);
        assert_eq!(state.outputs.len(), 10);
        assert_eq!(state.inputs.len(), 9);
    }

    #[test]
    fn send_command_accepts_json() {
        let result = send_command(r#"{"type":"ping"}"#.to_string());
        assert!(result.is_ok());
    }
}
