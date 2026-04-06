pub mod protocol;
pub mod server;
pub mod state;
pub mod tauri_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![tauri_commands::greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
