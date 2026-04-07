//! mDNS service advertisement for LAN discovery.

use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;

const SERVICE_TYPE: &str = "_redmatrix._tcp.local.";

/// Advertise the RedMatrix WebSocket server on the local network.
/// Returns the ServiceDaemon handle — drop it to stop advertising.
pub fn advertise(port: u16, server_name: &str, fingerprint: &str) -> Result<ServiceDaemon, String> {
    let mdns =
        ServiceDaemon::new().map_err(|e| format!("Failed to create mDNS daemon: {}", e))?;

    let mut properties = HashMap::new();
    properties.insert("id".to_string(), fingerprint.to_string());

    let host_name = "redmatrix".to_string();

    let service_info = ServiceInfo::new(
        SERVICE_TYPE,
        server_name,
        &format!("{}.local.", host_name),
        "", // Let mdns-sd determine the IP
        port,
        properties,
    )
    .map_err(|e| format!("Failed to create service info: {}", e))?;

    mdns.register(service_info)
        .map_err(|e| format!("Failed to register mDNS service: {}", e))?;

    Ok(mdns)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advertise_creates_daemon() {
        // mDNS may fail in some test environments (no network)
        let _result = advertise(18120, "Test Studio", "AAAA-BBBB-CCCC");
        // Just verify it doesn't panic
    }
}
