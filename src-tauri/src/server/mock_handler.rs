//! Mock command handler for simulation mode.
//!
//! Handles incoming `ClientMessage` commands by mutating the shared `DeviceState`
//! and returning a map of state changes suitable for broadcasting as `state_update`.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use serde_json::Value;

use super::messages::ClientMessage;
use super::state::DeviceState;

/// Process a client command against the shared mock device state.
///
/// Returns a map of dotted-path keys to new values representing the changes
/// made, which can be broadcast to all connected clients as a `state_update`.
pub async fn handle_command(
    state: &Arc<RwLock<DeviceState>>,
    msg: ClientMessage,
) -> Result<HashMap<String, Value>, String> {
    let mut state = state.write().await;
    let mut changes = HashMap::new();

    match msg {
        ClientMessage::SetDim { payload } => {
            state.monitor.dim = payload.enabled;
            changes.insert("monitor.dim".to_string(), Value::Bool(payload.enabled));
        }
        ClientMessage::SetMute { payload } => {
            state.monitor.mute = payload.enabled;
            changes.insert("monitor.mute".to_string(), Value::Bool(payload.enabled));
        }
        ClientMessage::SetTalkback { payload } => {
            state.monitor.talkback = payload.enabled;
            changes.insert(
                "monitor.talkback".to_string(),
                Value::Bool(payload.enabled),
            );
        }
        ClientMessage::SetSpeakerSwitching { payload } => {
            state.monitor.speaker_switching = payload.mode.clone();
            changes.insert(
                "monitor.speaker_switching".to_string(),
                Value::String(payload.mode),
            );
        }
        ClientMessage::SetMasterVolume { payload } => {
            state.monitor.master_volume_db = payload.db;
            changes.insert(
                "monitor.master_volume_db".to_string(),
                serde_json::json!(payload.db),
            );
        }
        ClientMessage::SetOutputVolume { payload } => {
            if let Some(output) = state.outputs.get_mut(payload.index as usize) {
                output.volume_db = payload.db;
                changes.insert(
                    format!("outputs.{}.volume_db", payload.index),
                    serde_json::json!(payload.db),
                );
            }
        }
        ClientMessage::SetOutputMute { payload } => {
            if let Some(output) = state.outputs.get_mut(payload.index as usize) {
                output.muted = payload.muted;
                changes.insert(
                    format!("outputs.{}.muted", payload.index),
                    Value::Bool(payload.muted),
                );
            }
        }
        ClientMessage::SetInputPad { payload } => {
            if let Some(input) = state.inputs.get_mut(payload.index as usize) {
                input.pad = payload.enabled;
                changes.insert(
                    format!("inputs.{}.pad", payload.index),
                    Value::Bool(payload.enabled),
                );
            }
        }
        ClientMessage::SetInputAir { payload } => {
            if let Some(input) = state.inputs.get_mut(payload.index as usize) {
                input.air = payload.enabled;
                changes.insert(
                    format!("inputs.{}.air", payload.index),
                    Value::Bool(payload.enabled),
                );
            }
        }
        ClientMessage::SetInputPhantom { payload } => {
            // Phantom is by group — group size comes from the device config.
            // Use a default group size of 4 (works for 18i20, 8Pre).
            // For smaller devices (Solo=1, 2i2/4i4=2), the group covers all inputs anyway.
            let group_size = 4usize;
            let start = payload.group as usize * group_size;
            let end = (start + group_size).min(state.inputs.len());
            for i in start..end {
                if let Some(input) = state.inputs.get_mut(i) {
                    input.phantom = payload.enabled;
                    changes.insert(
                        format!("inputs.{}.phantom", i),
                        Value::Bool(payload.enabled),
                    );
                }
            }
        }
        ClientMessage::SetInputInst { payload } => {
            if let Some(input) = state.inputs.get_mut(payload.index as usize) {
                input.inst = payload.enabled;
                changes.insert(
                    format!("inputs.{}.inst", payload.index),
                    Value::Bool(payload.enabled),
                );
            }
        }
        ClientMessage::SetMixGain { payload } => {
            if let Some(bus) = state.mixer.gains.get_mut(payload.mix as usize) {
                if let Some(gain) = bus.get_mut(payload.channel as usize) {
                    *gain = payload.gain_db;
                    changes.insert(
                        format!("mixer.gains.{}.{}", payload.mix, payload.channel),
                        serde_json::json!(payload.gain_db),
                    );
                }
            }
        }
        ClientMessage::SetMixMute { payload } => {
            // Mute = set gain to -80, unmute = restore to 0
            if let Some(bus) = state.mixer.gains.get_mut(payload.mix as usize) {
                if let Some(gain) = bus.get_mut(payload.channel as usize) {
                    *gain = if payload.muted { -80.0 } else { 0.0 };
                    changes.insert(
                        format!("mixer.gains.{}.{}", payload.mix, payload.channel),
                        serde_json::json!(*gain),
                    );
                }
            }
        }
        ClientMessage::SetMixSolo { payload } => {
            if let Some(bus) = state.mixer.soloed.get_mut(payload.mix as usize) {
                if let Some(solo) = bus.get_mut(payload.channel as usize) {
                    *solo = payload.soloed;
                    changes.insert(
                        format!("mixer.soloed.{}.{}", payload.mix, payload.channel),
                        Value::Bool(payload.soloed),
                    );
                }
            }
        }
        ClientMessage::ClearSolo { .. } => {
            for (bus_idx, bus) in state.mixer.soloed.iter_mut().enumerate() {
                for (ch_idx, solo) in bus.iter_mut().enumerate() {
                    if *solo {
                        *solo = false;
                        changes.insert(
                            format!("mixer.soloed.{}.{}", bus_idx, ch_idx),
                            Value::Bool(false),
                        );
                    }
                }
            }
        }
        ClientMessage::SetRoute { payload } => {
            if let Some(route) = state.routing.get_mut(payload.destination as usize) {
                route.route_type = payload.source_type.clone();
                route.index = payload.source_index;
                changes.insert(
                    format!("routing.{}.type", payload.destination),
                    Value::String(payload.source_type),
                );
                changes.insert(
                    format!("routing.{}.index", payload.destination),
                    serde_json::json!(payload.source_index),
                );
            }
        }
        ClientMessage::SetSampleRate { payload } => {
            state.sample_rate = payload.rate;
            changes.insert("sample_rate".to_string(), serde_json::json!(payload.rate));
        }
        ClientMessage::SetClockSource { payload } => {
            state.clock_source = match payload.source.as_str() {
                "spdif" => super::state::ClockSource::Spdif,
                "adat" => super::state::ClockSource::Adat,
                _ => super::state::ClockSource::Internal,
            };
            changes.insert("clock_source".to_string(), Value::String(payload.source));
        }
        ClientMessage::SetSpdifMode { payload } => {
            state.spdif_mode = payload.mode.clone();
            changes.insert("spdif_mode".to_string(), Value::String(payload.mode));
        }
        ClientMessage::SaveConfig { .. } => {
            if state.save_config_remaining > 0 {
                state.save_config_remaining -= 1;
                changes.insert(
                    "save_config_remaining".to_string(),
                    serde_json::json!(state.save_config_remaining),
                );
            }
        }
        // Ping and ClientHello are handled by the session layer, not here
        ClientMessage::ClearMixer { .. } => {
            for (bus_idx, bus) in state.mixer.gains.iter_mut().enumerate() {
                for (ch_idx, gain) in bus.iter_mut().enumerate() {
                    *gain = -80.0;
                    changes.insert(
                        format!("mixer.gains.{}.{}", bus_idx, ch_idx),
                        serde_json::json!(-80.0),
                    );
                }
            }
        }
        ClientMessage::SetBusGains { payload } => {
            if let Some(bus) = state.mixer.gains.get_mut(payload.mix as usize) {
                for (ch_idx, gain) in bus.iter_mut().enumerate() {
                    *gain = payload.gain_db;
                    changes.insert(
                        format!("mixer.gains.{}.{}", payload.mix, ch_idx),
                        serde_json::json!(payload.gain_db),
                    );
                }
            }
        }
        ClientMessage::SetRoutesBatch { payload } => {
            for route in &payload.routes {
                if let Some(entry) = state.routing.get_mut(route.destination as usize) {
                    entry.route_type = route.source_type.clone();
                    entry.index = route.source_index;
                    changes.insert(
                        format!("routing.{}.type", route.destination),
                        Value::String(route.source_type.clone()),
                    );
                    changes.insert(
                        format!("routing.{}.index", route.destination),
                        serde_json::json!(route.source_index),
                    );
                }
            }
        }
        ClientMessage::Ping | ClientMessage::ClientHello { .. } => {}
    }

    Ok(changes)
}

// ── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::server::messages::*;
    use crate::server::state::DeviceState;

    fn make_test_state() -> Arc<RwLock<DeviceState>> {
        Arc::new(RwLock::new(DeviceState::mock_18i20_gen3()))
    }

    #[tokio::test]
    async fn set_dim_mutates_state() {
        let state = make_test_state();
        let msg = ClientMessage::SetDim {
            payload: EnabledPayload { enabled: true },
        };

        let changes = handle_command(&state, msg).await.unwrap();

        assert_eq!(changes.get("monitor.dim"), Some(&Value::Bool(true)));
        assert!(state.read().await.monitor.dim);
    }

    #[tokio::test]
    async fn set_mute_mutates_state() {
        let state = make_test_state();
        let msg = ClientMessage::SetMute {
            payload: EnabledPayload { enabled: true },
        };

        let changes = handle_command(&state, msg).await.unwrap();

        assert_eq!(changes.get("monitor.mute"), Some(&Value::Bool(true)));
        assert!(state.read().await.monitor.mute);
    }

    #[tokio::test]
    async fn set_mix_gain_mutates_state() {
        let state = make_test_state();
        let msg = ClientMessage::SetMixGain {
            payload: MixGainPayload {
                mix: 0,
                channel: 3,
                gain_db: -6.0,
            },
        };

        let changes = handle_command(&state, msg).await.unwrap();

        assert_eq!(
            changes.get("mixer.gains.0.3"),
            Some(&serde_json::json!(-6.0))
        );
        assert_eq!(state.read().await.mixer.gains[0][3], -6.0);
    }

    #[tokio::test]
    async fn set_route_mutates_state() {
        let state = make_test_state();
        let msg = ClientMessage::SetRoute {
            payload: RoutePayload {
                destination: 5,
                source_type: "mixer".to_string(),
                source_index: 2,
            },
        };

        let changes = handle_command(&state, msg).await.unwrap();

        assert_eq!(
            changes.get("routing.5.type"),
            Some(&Value::String("mixer".to_string()))
        );
        assert_eq!(
            changes.get("routing.5.index"),
            Some(&serde_json::json!(2))
        );
        let s = state.read().await;
        assert_eq!(s.routing[5].route_type, "mixer");
        assert_eq!(s.routing[5].index, 2);
    }

    #[tokio::test]
    async fn set_output_volume_mutates_state() {
        let state = make_test_state();
        let msg = ClientMessage::SetOutputVolume {
            payload: OutputVolumePayload {
                index: 2,
                db: -12.5,
            },
        };

        let changes = handle_command(&state, msg).await.unwrap();

        assert_eq!(
            changes.get("outputs.2.volume_db"),
            Some(&serde_json::json!(-12.5))
        );
        assert_eq!(state.read().await.outputs[2].volume_db, -12.5);
    }

    #[tokio::test]
    async fn set_input_phantom_by_group() {
        let state = make_test_state();
        let msg = ClientMessage::SetInputPhantom {
            payload: PhantomPayload {
                group: 1,
                enabled: true,
            },
        };

        let changes = handle_command(&state, msg).await.unwrap();

        // Group 1 = inputs 4..8 (but 18i20 has 9 inputs, so 4,5,6,7)
        let s = state.read().await;
        for i in 4..8 {
            assert!(s.inputs[i].phantom, "input {} should have phantom on", i);
            assert_eq!(
                changes.get(&format!("inputs.{}.phantom", i)),
                Some(&Value::Bool(true))
            );
        }
        // Inputs outside the group should be unaffected
        assert!(!s.inputs[0].phantom);
    }

    #[tokio::test]
    async fn clear_solo_clears_all() {
        let state = make_test_state();

        // First set a solo
        let msg = ClientMessage::SetMixSolo {
            payload: MixSoloPayload {
                mix: 0,
                channel: 2,
                soloed: true,
            },
        };
        handle_command(&state, msg).await.unwrap();
        assert!(state.read().await.mixer.soloed[0][2]);

        // Now clear all solos
        let msg = ClientMessage::ClearSolo {
            payload: serde_json::json!({}),
        };
        let changes = handle_command(&state, msg).await.unwrap();

        assert_eq!(
            changes.get("mixer.soloed.0.2"),
            Some(&Value::Bool(false))
        );
        assert!(!state.read().await.mixer.soloed[0][2]);
    }

    #[tokio::test]
    async fn save_config_decrements_remaining() {
        let state = make_test_state();
        let initial = state.read().await.save_config_remaining;

        let msg = ClientMessage::SaveConfig {
            payload: serde_json::json!({}),
        };
        let changes = handle_command(&state, msg).await.unwrap();

        assert_eq!(
            state.read().await.save_config_remaining,
            initial - 1
        );
        assert_eq!(
            changes.get("save_config_remaining"),
            Some(&serde_json::json!(initial - 1))
        );
    }

    #[tokio::test]
    async fn ping_returns_no_changes() {
        let state = make_test_state();
        let changes = handle_command(&state, ClientMessage::Ping).await.unwrap();
        assert!(changes.is_empty());
    }
}
