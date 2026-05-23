pub mod config;
pub mod protocol;
pub mod server;
pub mod state;
pub mod tauri_commands;
pub mod usb;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

use tauri::{Emitter, Manager};
use server::state::DeviceState;
use tauri_commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    // 1. Resolve configuration paths
    let keypair_path = config::config_dir().join("server_keys.json");
    let paired_devices_path = config::config_dir().join("paired_devices.json");

    // 2. Load or generate server keypair to get the fingerprint
    let keypair = if keypair_path.exists() {
        server::crypto::ServerKeypair::load(&keypair_path).expect("failed to load server keys")
    } else {
        if let Some(parent) = keypair_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let kp = server::crypto::ServerKeypair::generate().expect("failed to generate server keys");
        let _ = kp.save(&keypair_path).expect("failed to save server keys");
        kp
    };
    let fingerprint = keypair.fingerprint().to_string();
    let port = server::DEFAULT_PORT;

    // 3. Create the shared device state and broadcast handle
    let device_state = Arc::new(RwLock::new(DeviceState::mock_18i20_gen3()));
    let broadcast_handle = server::broadcast::BroadcastHandle::new();
    let pending_pairings = Arc::new(Mutex::new(HashMap::new()));
    let active_usb_device = Arc::new(Mutex::new(None));

    let app_state = AppState {
        device_state: device_state.clone(),
        pending_pairings: pending_pairings.clone(),
        server_fingerprint: fingerprint,
        server_port: port,
        paired_devices_path: paired_devices_path.clone(),
        broadcast_handle: broadcast_handle.clone(),
        active_usb_device: active_usb_device.clone(),
    };

    tauri::Builder::default()
        .manage(app_state)
        .setup(move |app| {
            let handle = app.handle().clone();
            let state = app.state::<AppState>().device_state.clone();
            let pending = app.state::<AppState>().pending_pairings.clone();
            let broadcast = app.state::<AppState>().broadcast_handle.clone();
            let active_usb = app.state::<AppState>().active_usb_device.clone();

            // 4. Background hotplug polling loop — scans for device every 2 seconds
            let hotplug_state = state.clone();
            let hotplug_broadcast = broadcast.clone();
            let hotplug_handle = handle.clone();
            let hotplug_active_usb = active_usb.clone();

            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
                loop {
                    interval.tick().await;

                    // Check if a device is already connected
                    {
                        let lock = hotplug_active_usb.lock().await;
                        if lock.is_some() {
                            continue; // device is connected, nothing to do
                        }
                    }

                    // No device connected — try to find one
                    let found = tokio::task::spawn_blocking(|| usb::find_device()).await;
                    let usb_dev = match found {
                        Ok(Some(dev)) => dev,
                        _ => continue,
                    };

                    log::info!("Hotplug: USB hardware detected — {}", usb_dev.config.name);

                    // Initialize state to match the physical device, then query real settings
                    let pid = usb_dev.config.usb_pid;
                    let usb_handle_for_query = usb_dev.handle.clone();
                    let interface_for_query = usb_dev.interface;
                    let config_for_query = usb_dev.config;

                    if let Some(mut new_state) = server::mock_devices::mock_state_for_pid(pid) {
                        let transport = usb::RusbTransport::new(usb_handle_for_query.clone(), interface_for_query);
                        let mut executor = protocol::commands::CommandRunner::new(transport);

                        log::info!("Querying initial state from Focusrite hardware...");
                        match usb::queries::query_initial_state(&mut executor, config_for_query, &mut new_state) {
                            Ok(_) => {
                                log::info!("Successfully retrieved initial hardware state!");
                            }
                            Err(e) => {
                                log::error!("Failed to query hardware state: {}. Falling back to default layout.", e);
                            }
                        }

                        // Update shared state
                        {
                            let mut st = hotplug_state.write().await;
                            *st = new_state.clone();
                        }
                        let _ = hotplug_handle.emit("state_update", &new_state);
                    }

                    // Store claimed device handle in AppState
                    let dev_handle = usb_dev.handle.clone();
                    {
                        let mut active_lock = hotplug_active_usb.lock().await;
                        *active_lock = Some(usb_dev);
                    }

                    // Spawn background notification interrupt loop on EP 0x83
                    usb::spawn_interrupt_loop(
                        dev_handle,
                        hotplug_state.clone(),
                        hotplug_broadcast.clone(),
                        Some(hotplug_handle.clone()),
                        hotplug_active_usb.clone(),
                    );

                    // Notify clients that a device connected
                    let connect_msg = server::messages::ServerMessage::DeviceConnected;
                    if let Ok(json) = serde_json::to_string(&connect_msg) {
                        let _ = hotplug_broadcast.send_update(json);
                    }
                    let _ = hotplug_handle.emit("device_connected", ());

                    log::info!("Hotplug: Device fully initialized and notification loop started.");
                }
            });

            // 5. Start the WebSocket server
            let keypair_path_clone = keypair_path.clone();
            let paired_devices_path_clone = paired_devices_path.clone();
            let state_ws = state.clone();
            let broadcast_ws = broadcast.clone();
            let handle_ws = handle.clone();
            let active_usb_ws = active_usb.clone();

            tauri::async_runtime::spawn(async move {
                let config = server::ServerConfig {
                    port,
                    server_name: "RedMatrix Server".to_string(),
                    keypair_path: keypair_path_clone,
                    paired_devices_path: paired_devices_path_clone,
                    max_saves_per_hour: 12,
                    require_pairing: true,
                };

                let mut server_handle = match server::start_server(
                    config,
                    state_ws.clone(),
                    Some(handle_ws.clone()),
                    Some(pending),
                )
                .await
                {
                    Ok(h) => h,
                    Err(e) => {
                        log::error!("Failed to start WebSocket server: {}", e);
                        return;
                    }
                };

                // 6. Spawn Command Runner loop to process remote client messages
                if let Some(mut rx) = server_handle.command_rx.take() {
                    let runner_state = state_ws.clone();
                    let runner_broadcast = broadcast_ws.clone();
                    let runner_handle = handle_ws.clone();
                    let active_usb_runner = active_usb_ws.clone();
                    tokio::spawn(async move {
                        while let Some(cmd) = rx.recv().await {
                            match server::mock_handler::handle_command(&runner_state, cmd.message.clone()).await {
                                Ok(changes) => {
                                    // If a physical USB device is connected, dispatch to hardware
                                    {
                                        let mut active_lock = active_usb_runner.lock().await;
                                        if let Some(dev) = active_lock.as_mut() {
                                            let transport = crate::usb::RusbTransport::new(dev.handle.clone(), dev.interface);
                                            let mut runner = crate::protocol::commands::CommandRunner::new(transport);
                                            let state_read = runner_state.read().await;
                                            if let Err(e) = crate::usb::writes::dispatch_command(&mut runner, dev.config, &state_read, &cmd.message) {
                                                log::error!("Failed to write remote command to USB hardware: {}", e);
                                            }
                                        }
                                    }

                                    if !changes.is_empty() {
                                        let update_msg = server::messages::ServerMessage::StateUpdate {
                                            changes: changes.clone().into_iter().collect(),
                                        };
                                        if let Ok(json) = serde_json::to_string(&update_msg) {
                                            let _ = runner_broadcast.send_update(json);
                                        }
                                    }

                                    // Emit the updated state to the local Tauri webview
                                    let new_state = runner_state.read().await.clone();
                                    let _ = runner_handle.emit("state_update", &new_state);
                                }
                                Err(e) => {
                                    log::error!("Failed to process remote client command: {}", e);
                                }
                            }
                        }
                    });
                }

                // Keep server handle alive
                let shutdown_rx = tokio::sync::oneshot::channel::<()>().1;
                let _ = shutdown_rx.await;
            });

            // 7. Spawn hardware-aware meter loop — sends to both Tauri & WS clients at 20Hz (every 50ms)
            let meter_handle = handle.clone();
            let meter_state = state.clone();
            let meter_active_usb = active_usb.clone();
            let meter_broadcast = broadcast.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_millis(50));
                let mut last_query_failed = false;
                loop {
                    interval.tick().await;

                    // 1. Try to get meters from physical USB device if connected
                    let mut real_meters = None;
                    {
                        let mut active_lock = meter_active_usb.lock().await;
                        if let Some(dev) = active_lock.as_mut() {
                            let transport = crate::usb::RusbTransport::with_timeout(
                                dev.handle.clone(),
                                dev.interface,
                                std::time::Duration::from_millis(200),
                            );
                            let mut runner = crate::protocol::commands::CommandRunner::new(transport);
                            // Run the blocking transfer in spawn_blocking
                            let query_res = tokio::task::spawn_blocking(move || {
                                crate::usb::queries::query_meters(&mut runner)
                            }).await;
                            match query_res {
                                Ok(Ok(meters)) => {
                                    real_meters = Some(meters);
                                    if last_query_failed {
                                        log::info!("Hardware meter queries recovered.");
                                        last_query_failed = false;
                                    }
                                }
                                Ok(Err(e)) => {
                                    if !last_query_failed {
                                        log::error!("Failed to query hardware meters: {} (silencing subsequent errors)", e);
                                        last_query_failed = true;
                                    }
                                }
                                Err(e) => {
                                    if !last_query_failed {
                                        log::error!("Query meters join error: {} (silencing subsequent errors)", e);
                                        last_query_failed = true;
                                    }
                                }
                            }
                        }
                    }

                    // 2. Fall back to mock meters if not connected or query failed
                    let meters = match real_meters {
                        Some(m) => m,
                        None => {
                            // Get meter_count from device_state
                            let meter_count = {
                                let st = meter_state.read().await;
                                st.meter_count as usize
                            };
                            // Generate mock levels
                            (0..meter_count)
                                .map(|_| 0.05 + rand::random::<f32>() * 0.15)
                                .collect()
                        }
                    };

                    // 3. Emit to local Tauri webview
                    let _ = meter_handle.emit("meter_data", &meters);

                    // 4. Broadcast to remote WebSocket clients
                    let meter_bytes: Vec<u8> = meters
                        .iter()
                        .flat_map(|val| val.to_le_bytes().to_vec())
                        .collect();
                    let _ = meter_broadcast.send_meters(meter_bytes);
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
