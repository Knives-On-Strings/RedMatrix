//! USB transport implementation using `rusb`.
//!
//! Handles device auto-detection, interface claiming, control transfers for protocol
//! commands, and asynchronous notification polling on the interrupt endpoint.

pub mod queries;
pub mod writes;

use std::sync::Arc;
use std::time::Duration;
use rusb::{DeviceHandle, GlobalContext};
use tokio::sync::RwLock;
use tauri::Emitter;

use crate::protocol::transport::{UsbTransport, TransportError};
use crate::protocol::devices::{device_by_pid, DeviceConfig};
use crate::protocol::notifications::Notification;
use crate::server::broadcast::BroadcastHandle;
use crate::server::state::DeviceState;

/// USB transport wrapper for `rusb` control transfers.
pub struct RusbTransport {
    handle: Arc<DeviceHandle<GlobalContext>>,
    interface: u8,
    timeout: Duration,
}

impl RusbTransport {
    pub fn new(handle: Arc<DeviceHandle<GlobalContext>>, interface: u8) -> Self {
        Self {
            handle,
            interface,
            timeout: Duration::from_millis(5000),
        }
    }

    pub fn with_timeout(
        handle: Arc<DeviceHandle<GlobalContext>>,
        interface: u8,
        timeout: Duration,
    ) -> Self {
        Self {
            handle,
            interface,
            timeout,
        }
    }
}

impl UsbTransport for RusbTransport {
    fn transfer(&mut self, data: &[u8]) -> Result<Vec<u8>, TransportError> {
        // Write CMD_REQ (bRequest = 2) via control transfer
        let written = self.handle.write_control(
            0x21, // bmRequestType: Out | Class | Interface
            2,    // bRequest: CMD_REQ
            0,    // wValue
            self.interface as u16, // wIndex
            data,
            self.timeout,
        ).map_err(|e| {
            if e == rusb::Error::Timeout {
                TransportError::Timeout
            } else {
                TransportError::TransferFailed(e.to_string())
            }
        })?;

        if written != data.len() {
            return Err(TransportError::TransferFailed(format!(
                "Short write: wrote {} of {} bytes", written, data.len()
            )));
        }

        // Wait 10ms for device to process command
        std::thread::sleep(Duration::from_millis(10));

        // Read CMD_RESP (bRequest = 3) via control transfer
        let mut buf = vec![0u8; 1040]; // 1024 max payload + 16 header
        let read = self.handle.read_control(
            0xA1, // bmRequestType: In | Class | Interface
            3,    // bRequest: CMD_RESP
            0,    // wValue
            self.interface as u16, // wIndex
            &mut buf,
            self.timeout,
        ).map_err(|e| {
            if e == rusb::Error::Timeout {
                TransportError::Timeout
            } else {
                TransportError::TransferFailed(e.to_string())
            }
        })?;

        buf.truncate(read);
        Ok(buf)
    }
}

/// A handle to a successfully opened and claimed Scarlett/Clarett device.
pub struct ConnectedDevice {
    pub handle: Arc<DeviceHandle<GlobalContext>>,
    pub interface: u8,
    pub config: &'static DeviceConfig,
    pub descriptor: rusb::DeviceDescriptor,
}

/// Run Step 0 initialization (CMD_INIT bRequest = 0) on the control interface.
pub fn initialize_device(handle: &DeviceHandle<GlobalContext>, interface: u8) -> Result<(), rusb::Error> {
    let mut buf = [0u8; 24];
    let _ = handle.read_control(
        0xA1, // In | Class | Interface
        0,    // CMD_INIT
        0,
        interface as u16,
        &mut buf,
        Duration::from_millis(2000),
    ); // Ignore errors as some devices skip step 0
    Ok(())
}

/// Scan for a supported Scarlett Gen 2/3 or Clarett device and claim its control interface.
pub fn find_device() -> Option<ConnectedDevice> {
    let devices = match rusb::devices() {
        Ok(devs) => devs,
        Err(_) => return None,
    };

    for device in devices.iter() {
        let desc = match device.device_descriptor() {
            Ok(d) => d,
            Err(_) => continue,
        };

        // Vendor ID 0x1235 is Focusrite
        if desc.vendor_id() == 0x1235 {
            if let Some(config) = device_by_pid(desc.product_id()) {
                log::info!("Found supported device: {}", config.name);
                if let Ok(handle) = device.open() {
                    let interface = find_control_interface(&device).unwrap_or(3);
                    log::info!("Claiming control interface: {}", interface);

                    // Detach kernel driver (required for macOS/Linux)
                    #[cfg(not(target_os = "windows"))]
                    let _ = handle.detach_kernel_driver(interface);

                    if handle.claim_interface(interface).is_ok() {
                        let _ = initialize_device(&handle, interface);
                        log::info!("Successfully initialized USB device!");
                        return Some(ConnectedDevice {
                            handle: Arc::new(handle),
                            interface,
                            config,
                            descriptor: desc,
                        });
                    } else {
                        log::warn!("Failed to claim interface {}", interface);
                    }
                }
            }
        }
    }
    None
}

/// Helper to scan interface descriptors for the proprietary control interface (Class = 0xFF).
fn find_control_interface(device: &rusb::Device<GlobalContext>) -> Option<u8> {
    let config_desc = device.active_config_descriptor().ok()?;
    for interface in config_desc.interfaces() {
        for interface_desc in interface.descriptors() {
            if interface_desc.class_code() == 0xFF {
                return Some(interface.number());
            }
        }
    }
    None
}

/// Spawn the background blocking task to read interrupt notifications from endpoint 0x83.
///
/// When a notification bitmask arrives, this loop:
/// 1. Builds a second `RusbTransport` + `CommandRunner` to query only the changed state
/// 2. Acquires the `DeviceState` write lock and applies the changes
/// 3. Broadcasts the changes to WebSocket clients and the local Tauri webview
///
/// On device disconnection (`NoDevice` / `Io` error), the loop:
/// - Clears `active_usb_device` to `None` (triggers hotplug poller to rescan)
/// - Broadcasts `DeviceDisconnected` to all clients
pub fn spawn_interrupt_loop(
    handle: Arc<DeviceHandle<GlobalContext>>,
    device_state: Arc<RwLock<DeviceState>>,
    broadcast: BroadcastHandle,
    app_handle: Option<tauri::AppHandle>,
    active_usb_device: Arc<tokio::sync::Mutex<Option<ConnectedDevice>>>,
) {
    tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; 64];
        log::info!("Interrupt notification listener started on endpoint 0x83");
        loop {
            // Read from interrupt endpoint 0x83
            match handle.read_interrupt(0x83, &mut buf, Duration::from_secs(1)) {
                Ok(bytes_read) => {
                    if bytes_read >= 4 {
                        let mask = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]);
                        let notification = Notification::from_mask(mask);
                        if !notification.is_empty() {
                            log::info!("Hardware notification bitmask: {:#010x} -> {:?}", mask, notification);

                            // Read the device config from the active_usb_device handle
                            let rt = tokio::runtime::Handle::current();
                            let config_opt: Option<&'static crate::protocol::devices::DeviceConfig> = rt.block_on(async {
                                let lock = active_usb_device.lock().await;
                                lock.as_ref().map(|dev| dev.config)
                            });

                            if let Some(config) = config_opt {
                                // Build a transport for querying
                                let transport = RusbTransport::new(handle.clone(), 
                                    rt.block_on(async {
                                        let lock = active_usb_device.lock().await;
                                        lock.as_ref().map(|d| d.interface).unwrap_or(3)
                                    })
                                );
                                let mut runner = crate::protocol::commands::CommandRunner::new(transport);

                                // Query the changed state and update DeviceState
                                let changes = rt.block_on(async {
                                    let mut state = device_state.write().await;
                                    queries::query_notification_updates(&mut runner, config, &mut state, &notification)
                                });

                                if !changes.is_empty() {
                                    // Broadcast to WebSocket clients
                                    let update_msg = crate::server::messages::ServerMessage::StateUpdate {
                                        changes: changes.into_iter().collect(),
                                    };
                                    if let Ok(json) = serde_json::to_string(&update_msg) {
                                        let _ = broadcast.send_update(json);
                                    }

                                    // Emit to local Tauri webview
                                    if let Some(ref ah) = app_handle {
                                        let _ = rt.block_on(async {
                                            let state = device_state.read().await;
                                            ah.emit("state_update", &*state)
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                Err(rusb::Error::Timeout) => {
                    // Normal timeout, continue loop
                }
                Err(rusb::Error::NoDevice) | Err(rusb::Error::Io) => {
                    log::warn!("USB device disconnected from interrupt loop");

                    // Clear the active device handle so hotplug poller rescans
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(async {
                        let mut lock = active_usb_device.lock().await;
                        *lock = None;
                    });

                    // Broadcast disconnect to WebSocket clients
                    let disconnect_msg = crate::server::messages::ServerMessage::DeviceDisconnected;
                    if let Ok(json) = serde_json::to_string(&disconnect_msg) {
                        let _ = broadcast.send_update(json);
                    }

                    // Emit to local Tauri webview
                    if let Some(ref ah) = app_handle {
                        let _ = ah.emit("device_disconnected", ());
                    }
                    break;
                }
                Err(e) => {
                    log::error!("Interrupt read error: {:?}", e);
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        }
    });
}
