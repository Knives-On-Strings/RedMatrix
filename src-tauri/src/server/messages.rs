//! WebSocket message type definitions for the RedMatrix remote control API.
//!
//! All messages use JSON with a `"type"` tag for discrimination.
//! Server-to-client messages are [`ServerMessage`], client-to-server are [`ClientMessage`].

use serde::{Deserialize, Serialize};

// ── Payload structs ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EnabledPayload {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpeakerSwitchingPayload {
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VolumePayload {
    pub db: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OutputVolumePayload {
    pub index: u32,
    pub db: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OutputMutePayload {
    pub index: u32,
    pub muted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InputTogglePayload {
    pub index: u32,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PhantomPayload {
    pub group: u32,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MixGainPayload {
    pub mix: u32,
    pub channel: u32,
    pub gain_db: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MixMutePayload {
    pub mix: u32,
    pub channel: u32,
    pub muted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MixSoloPayload {
    pub mix: u32,
    pub channel: u32,
    pub soloed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoutePayload {
    pub destination: u32,
    pub source_type: String,
    pub source_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SampleRatePayload {
    pub rate: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClockSourcePayload {
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpdifModePayload {
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SetBusGainsPayload {
    pub mix: u32,
    pub gain_db: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SetRoutesBatchPayload {
    pub routes: Vec<RoutePayload>,
}

// ── Server → Client messages ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    ServerHello {
        version: u32,
        server_pubkey: String,
        server_fingerprint: String,
        device_name: String,
        server_name: String,
    },
    AuthResult {
        status: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
    DeviceState {
        #[serde(flatten)]
        state: serde_json::Value,
    },
    StateUpdate {
        changes: serde_json::Map<String, serde_json::Value>,
    },
    Error {
        code: String,
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        retry_after_ms: Option<u64>,
    },
    DeviceDisconnected,
    DeviceConnected,
    Pong {
        timestamp: u64,
    },
}

// ── Client → Server messages ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    ClientHello {
        version: u32,
        client_pubkey: String,
        client_name: String,
    },
    Ping,
    SetDim {
        payload: EnabledPayload,
    },
    SetMute {
        payload: EnabledPayload,
    },
    SetTalkback {
        payload: EnabledPayload,
    },
    SetSpeakerSwitching {
        payload: SpeakerSwitchingPayload,
    },
    SetMasterVolume {
        payload: VolumePayload,
    },
    SetOutputVolume {
        payload: OutputVolumePayload,
    },
    SetOutputMute {
        payload: OutputMutePayload,
    },
    SetInputPad {
        payload: InputTogglePayload,
    },
    SetInputAir {
        payload: InputTogglePayload,
    },
    SetInputPhantom {
        payload: PhantomPayload,
    },
    SetInputInst {
        payload: InputTogglePayload,
    },
    SetMixGain {
        payload: MixGainPayload,
    },
    SetMixMute {
        payload: MixMutePayload,
    },
    SetMixSolo {
        payload: MixSoloPayload,
    },
    ClearSolo {
        payload: serde_json::Value,
    },
    SetRoute {
        payload: RoutePayload,
    },
    SetSampleRate {
        payload: SampleRatePayload,
    },
    SetClockSource {
        payload: ClockSourcePayload,
    },
    SetSpdifMode {
        payload: SpdifModePayload,
    },
    SaveConfig {
        payload: serde_json::Value,
    },
    /// Clear all mixer crosspoints to -80dB (silence).
    ClearMixer {
        payload: serde_json::Value,
    },
    /// Set all crosspoints in a bus to a specific gain.
    SetBusGains {
        payload: SetBusGainsPayload,
    },
    /// Set multiple routes at once.
    SetRoutesBatch {
        payload: SetRoutesBatchPayload,
    },
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn server_hello_serializes_correctly() {
        let msg = ServerMessage::ServerHello {
            version: 1,
            server_pubkey: "pk_abc".into(),
            server_fingerprint: "AB:CD:EF".into(),
            device_name: "Scarlett 18i20 USB".into(),
            server_name: "Studio PC".into(),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "server_hello");
        assert_eq!(json["version"], 1);
        assert_eq!(json["server_pubkey"], "pk_abc");
        assert_eq!(json["server_fingerprint"], "AB:CD:EF");
        assert_eq!(json["device_name"], "Scarlett 18i20 USB");
        assert_eq!(json["server_name"], "Studio PC");
    }

    #[test]
    fn client_hello_deserializes() {
        let raw = json!({
            "type": "client_hello",
            "version": 1,
            "client_pubkey": "abc",
            "client_name": "iPad"
        });
        let msg: ClientMessage = serde_json::from_value(raw).unwrap();
        assert_eq!(
            msg,
            ClientMessage::ClientHello {
                version: 1,
                client_pubkey: "abc".into(),
                client_name: "iPad".into(),
            }
        );
    }

    #[test]
    fn set_dim_deserializes() {
        let raw = json!({
            "type": "set_dim",
            "payload": { "enabled": true }
        });
        let msg: ClientMessage = serde_json::from_value(raw).unwrap();
        assert_eq!(
            msg,
            ClientMessage::SetDim {
                payload: EnabledPayload { enabled: true },
            }
        );
    }

    #[test]
    fn set_mix_gain_deserializes() {
        let raw = json!({
            "type": "set_mix_gain",
            "payload": { "mix": 0, "channel": 3, "gain_db": -6.0 }
        });
        let msg: ClientMessage = serde_json::from_value(raw).unwrap();
        assert_eq!(
            msg,
            ClientMessage::SetMixGain {
                payload: MixGainPayload {
                    mix: 0,
                    channel: 3,
                    gain_db: -6.0,
                },
            }
        );
    }

    #[test]
    fn set_route_deserializes() {
        let raw = json!({
            "type": "set_route",
            "payload": { "destination": 5, "source_type": "pcm", "source_index": 0 }
        });
        let msg: ClientMessage = serde_json::from_value(raw).unwrap();
        assert_eq!(
            msg,
            ClientMessage::SetRoute {
                payload: RoutePayload {
                    destination: 5,
                    source_type: "pcm".into(),
                    source_index: 0,
                },
            }
        );
    }

    #[test]
    fn error_serializes_with_optional_retry() {
        // With retry_after_ms
        let msg = ServerMessage::Error {
            code: "rate_limited".into(),
            message: "Too many requests".into(),
            retry_after_ms: Some(5000),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "error");
        assert_eq!(json["code"], "rate_limited");
        assert_eq!(json["retry_after_ms"], 5000);

        // Without retry_after_ms — field should be absent
        let msg = ServerMessage::Error {
            code: "unknown_command".into(),
            message: "Unrecognized message type".into(),
            retry_after_ms: None,
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "error");
        assert!(json.get("retry_after_ms").is_none());
    }

    #[test]
    fn ping_pong_round_trip() {
        // Serialize Pong
        let pong = ServerMessage::Pong { timestamp: 1234567890 };
        let json = serde_json::to_value(&pong).unwrap();
        assert_eq!(json["type"], "pong");
        assert_eq!(json["timestamp"], 1234567890u64);

        // Deserialize Ping
        let raw = json!({ "type": "ping" });
        let msg: ClientMessage = serde_json::from_value(raw).unwrap();
        assert_eq!(msg, ClientMessage::Ping);
    }
}
