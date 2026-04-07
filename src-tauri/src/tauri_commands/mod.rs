//! Tauri IPC command handlers.
//!
//! These are invoked from the React frontend via `@tauri-apps/api`.
//! Each command is registered in lib.rs via `tauri::generate_handler![]`.

use std::sync::Arc;
use tokio::sync::RwLock;

use tauri::{Emitter, State};

use crate::config;
use crate::server::messages::ClientMessage;
use crate::server::mock_devices;
use crate::server::mock_handler;
use crate::server::state::DeviceState;

/// Shared application state managed by Tauri.
pub struct AppState {
    pub device_state: Arc<RwLock<DeviceState>>,
}

/// Get the current device state as JSON.
#[tauri::command]
pub async fn get_device_state(app_state: State<'_, AppState>) -> Result<DeviceState, String> {
    let state = app_state.device_state.read().await;
    Ok(state.clone())
}

/// Receive a command from the frontend, apply it to mock state, emit state_update event.
#[tauri::command]
pub async fn send_command(
    command: String,
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    log::info!("Received command from frontend: {}", command);

    let msg: ClientMessage =
        serde_json::from_str(&command).map_err(|e| format!("Invalid command JSON: {}", e))?;

    let changes = mock_handler::handle_command(&app_state.device_state, msg).await?;

    // Emit the updated full state to the frontend via Tauri event
    let new_state = app_state.device_state.read().await.clone();
    let _ = app_handle.emit("state_update", &new_state);

    Ok(serde_json::to_value(changes).unwrap_or_default())
}

/// Switch the mock device to a different model by PID.
/// Returns the new full device state.
#[tauri::command]
pub async fn switch_mock_device(
    pid: u16,
    app_state: State<'_, AppState>,
) -> Result<DeviceState, String> {
    let new_state = mock_devices::mock_state_for_pid(pid)
        .ok_or_else(|| format!("Unknown device PID: {:#06x}", pid))?;

    let mut state = app_state.device_state.write().await;
    *state = new_state.clone();

    Ok(new_state)
}

/// List all available mock devices (PID + name).
#[tauri::command]
pub fn list_mock_devices() -> Vec<(u16, String)> {
    mock_devices::all_mock_pids()
        .into_iter()
        .map(|(pid, name)| (pid, name.to_string()))
        .collect()
}

/// Load user config for a device by serial number.
/// Returns default config if no saved config exists.
#[tauri::command]
pub fn load_user_config(serial: String) -> config::UserConfig {
    let path = config::device_config_path(&serial);
    config::load_config(&path)
}

/// Save user config for a device by serial number.
#[tauri::command]
pub fn save_user_config(serial: String, config_data: config::UserConfig) -> Result<(), String> {
    let path = config::device_config_path(&serial);
    config::save_config(&path, &config_data)
}

/// Approve or deny a pairing request from a remote client.
///
/// Called from the frontend PairingModal when the user clicks Approve or Deny.
/// TODO: Forward approval to the session handler via a channel.
/// The channel wiring requires passing the pairing_tx from the server into Tauri app state.
#[tauri::command]
pub fn approve_pairing(fingerprint: String, approved: bool) -> Result<(), String> {
    log::info!(
        "Pairing {} for fingerprint {}",
        if approved { "approved" } else { "denied" },
        fingerprint
    );
    Ok(())
}

/// Get server connection info for remote pairing (fingerprint, port, IPs).
#[tauri::command]
pub fn get_server_info() -> serde_json::Value {
    // Generate a mock fingerprint for now — real one comes from ServerKeypair
    // when the WebSocket server is running.
    let fingerprint = "A3F2-9B17-D4C8"; // placeholder

    // Get local IP addresses
    let mut ips: Vec<String> = Vec::new();
    if let Ok(addrs) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if addrs.connect("8.8.8.8:80").is_ok() {
            if let Ok(local) = addrs.local_addr() {
                ips.push(local.ip().to_string());
            }
        }
    }
    if ips.is_empty() {
        ips.push("127.0.0.1".to_string());
    }

    serde_json::json!({
        "fingerprint": fingerprint,
        "port": 18120,
        "ips": ips,
        "paired_count": 0,
        "connected_count": 0,
    })
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
    fn list_mock_devices_returns_15() {
        let devices = list_mock_devices();
        assert_eq!(devices.len(), 15);
        // Check that the primary dev device is in the list
        assert!(
            devices.iter().any(|(pid, _)| *pid == 0x8215),
            "18i20 Gen 3 should be in the list"
        );
    }
}
