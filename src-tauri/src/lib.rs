pub mod config;
pub mod protocol;
pub mod server;
pub mod state;
pub mod tauri_commands;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

use tauri::Emitter;
use server::state::DeviceState;
use tauri_commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    // Create the shared device state (starts as 18i20 Gen 3 mock)
    let device_state = Arc::new(RwLock::new(DeviceState::mock_18i20_gen3()));

    tauri::Builder::default()
        .manage(AppState {
            device_state,
            pending_pairings: Arc::new(Mutex::new(HashMap::new())),
        })
        .setup(|app| {
            // Spawn mock meter emitter — sends meter_data Tauri events at 20Hz
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_millis(50));
                loop {
                    interval.tick().await;
                    // Generate 65 mock meter values
                    let meters: Vec<f32> = (0..65)
                        .map(|_| 0.15 + rand::random::<f32>() * 0.3)
                        .collect();
                    let _ = handle.emit("meter_data", &meters);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tauri_commands::greet,
            tauri_commands::get_device_state,
            tauri_commands::send_command,
            tauri_commands::switch_mock_device,
            tauri_commands::list_mock_devices,
            tauri_commands::load_user_config,
            tauri_commands::save_user_config,
            tauri_commands::approve_pairing,
            tauri_commands::get_server_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
