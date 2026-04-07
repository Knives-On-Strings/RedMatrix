pub mod protocol;
pub mod server;
pub mod state;
pub mod tauri_commands;

use std::sync::Arc;
use tokio::sync::RwLock;

use server::state::DeviceState;
use tauri_commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    // Create the shared device state (starts as 18i20 Gen 3 mock)
    let device_state = Arc::new(RwLock::new(DeviceState::mock_18i20_gen3()));

    tauri::Builder::default()
        .manage(AppState { device_state })
        .invoke_handler(tauri::generate_handler![
            tauri_commands::greet,
            tauri_commands::get_device_state,
            tauri_commands::send_command,
            tauri_commands::switch_mock_device,
            tauri_commands::list_mock_devices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
