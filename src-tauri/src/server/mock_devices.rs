//! Mock device state generators for all supported Scarlett2-protocol devices.
//!
//! Provides `mock_state_for_pid()` to generate a realistic `DeviceState` from
//! any supported device's configuration, enabling full UI testing without USB hardware.

use crate::protocol::devices::{self, DeviceConfig, ALL_DEVICES};
use super::state::*;

/// Returns all 15 supported PIDs with their device names.
pub fn all_mock_pids() -> Vec<(u16, &'static str)> {
    ALL_DEVICES.iter().map(|d| (d.usb_pid, d.name)).collect()
}

/// Generate a realistic mock `DeviceState` for the given USB Product ID.
/// Returns `None` if the PID is not recognised.
pub fn mock_state_for_pid(pid: u16) -> Option<DeviceState> {
    let config = devices::device_by_pid(pid)?;
    Some(build_state(config))
}

fn build_state(config: &DeviceConfig) -> DeviceState {
    let pc = &config.port_counts;

    // ── Outputs ────────────────────────────────────────────────
    let num_outputs = pc.analogue.outputs as usize;
    let outputs: Vec<OutputState> = (0..num_outputs)
        .map(|i| {
            let name = output_name(config, i);
            OutputState {
                index: i as u32,
                name,
                volume_db: 0.0,
                muted: false,
                hw_controlled: config.has_speaker_switching
                    || pc.analogue.outputs >= 6, // devices with HW vol control
            }
        })
        .collect();

    // ── Inputs ─────────────────────────────────────────────────
    // Include ALL input types: analogue, S/PDIF, and ADAT
    let mut inputs: Vec<InputState> = Vec::new();

    // Analogue inputs (for 18i20 Gen 3, the 9th is the talkback mic)
    for i in 0..pc.analogue.inputs as usize {
        let name = if config.has_talkback && i == pc.analogue.inputs as usize - 1 {
            "Talkback".to_string()
        } else {
            format!("Analogue {}", i + 1)
        };
        inputs.push(InputState {
            index: i as u32,
            name,
            input_type: "analogue".to_string(),
            pad: false,
            air: false,
            phantom: false,
            inst: false,
        });
    }

    // S/PDIF inputs
    for i in 0..pc.spdif.inputs as usize {
        inputs.push(InputState {
            index: i as u32,
            name: format!("S/PDIF {}", if i == 0 { "L" } else { "R" }),
            input_type: "spdif".to_string(),
            pad: false,
            air: false,
            phantom: false,
            inst: false,
        });
    }

    // ADAT inputs
    for i in 0..pc.adat.inputs as usize {
        inputs.push(InputState {
            index: i as u32,
            name: format!("ADAT {}", i + 1),
            input_type: "adat".to_string(),
            pad: false,
            air: false,
            phantom: false,
            inst: false,
        });
    }

    // ── Mixer ──────────────────────────────────────────────────
    let num_buses = pc.mix.outputs as usize;
    let num_channels = pc.mix.inputs as usize;
    let (gains, soloed) = if config.has_mixer() && num_buses > 0 && num_channels > 0 {
        let mut gains = vec![vec![-80.0_f64; num_channels]; num_buses];
        // Bus A (index 0) at unity
        if !gains.is_empty() {
            gains[0] = vec![0.0; num_channels];
        }
        let soloed = vec![vec![false; num_channels]; num_buses];
        (gains, soloed)
    } else {
        (vec![], vec![])
    };

    // ── Routing ────────────────────────────────────────────────
    // Total physical + digital outputs at 48 kHz
    let total_out = pc.analogue.outputs as usize
        + pc.spdif.outputs as usize
        + pc.adat.outputs as usize;
    // Count total mux slots from the 44.1/48k mux table
    let total_mux_slots: usize = config.mux_44.iter().map(|e| e.count as usize).sum();
    let routing_slots = if total_mux_slots > 0 {
        total_mux_slots
    } else {
        total_out
    };

    let mut routing: Vec<RouteEntry> = (0..total_out.min(pc.pcm.outputs as usize))
        .map(|i| RouteEntry {
            route_type: "pcm".to_string(),
            index: i as u32,
        })
        .collect();
    // Fill remaining slots with "off"
    for _ in routing.len()..routing_slots {
        routing.push(RouteEntry {
            route_type: "off".to_string(),
            index: 0,
        });
    }

    // ── S/PDIF mode ────────────────────────────────────────────
    let spdif_mode = if !config.spdif_modes.is_empty() {
        config.spdif_modes[0].name.to_lowercase().replace(' ', "_").replace('/', "_")
    } else {
        "none".to_string()
    };

    // ── Meter count ────────────────────────────────────────────
    // Meters cover all input and output ports plus mixer outputs
    let meter_count = pc.analogue.inputs as u32
        + pc.spdif.inputs as u32
        + pc.adat.inputs as u32
        + pc.analogue.outputs as u32
        + pc.spdif.outputs as u32
        + pc.adat.outputs as u32
        + pc.mix.outputs as u32
        + pc.pcm.inputs as u32;

    DeviceState {
        device: DeviceInfo {
            name: format!("{} USB", config.name.split(" Gen").next().unwrap_or(config.name)),
            pid: format!("{:#06x}", config.usb_pid),
            series: config.series.to_lowercase().replace(' ', ""),
            firmware_version: 1644,
            serial: "MOCK000000".to_string(),
        },
        sample_rate: 48000,
        sync_status: SyncStatus::Locked,
        clock_source: ClockSource::Internal,
        spdif_mode,
        features: Features {
            has_mixer: config.has_mixer(),
            has_speaker_switching: config.has_speaker_switching,
            has_talkback: config.has_talkback,
            direct_monitor: config.direct_monitor,
        },
        meter_count,
        save_config_remaining: 12,
        port_counts: PortCountsState {
            analogue: PortCountPair {
                inputs: pc.analogue.inputs,
                outputs: pc.analogue.outputs,
            },
            spdif: PortCountPair {
                inputs: pc.spdif.inputs,
                outputs: pc.spdif.outputs,
            },
            adat: PortCountPair {
                inputs: pc.adat.inputs,
                outputs: pc.adat.outputs,
            },
            mix_ports: PortCountPair {
                inputs: pc.mix.inputs,
                outputs: pc.mix.outputs,
            },
            pcm: PortCountPair {
                inputs: pc.pcm.inputs,
                outputs: pc.pcm.outputs,
            },
        },
        monitor: MonitorState {
            dim: false,
            mute: false,
            talkback: false,
            speaker_switching: "main".to_string(),
            master_volume_db: 0.0,
        },
        outputs,
        inputs,
        mixer: MixerState { gains, soloed },
        routing,
    }
}

/// Derive a human-readable output name from the device config.
fn output_name(config: &DeviceConfig, index: usize) -> String {
    // Use the line_out_descrs if available and non-None
    if let Some(Some(name)) = config.line_out_descrs.get(index) {
        return name.to_string();
    }
    // Fallback: "Line N" (1-based)
    format!("Line {}", index + 1)
}

// ── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_mock_pids_returns_15_entries() {
        let pids = all_mock_pids();
        assert_eq!(pids.len(), 15, "should cover all 15 supported devices");
        // Every PID should be unique
        let mut seen = std::collections::HashSet::new();
        for (pid, _) in &pids {
            assert!(seen.insert(pid), "duplicate PID {:#06x}", pid);
        }
    }

    #[test]
    fn mock_state_for_all_15_pids() {
        let pids = all_mock_pids();
        for (pid, name) in &pids {
            let state = mock_state_for_pid(*pid)
                .unwrap_or_else(|| panic!("PID {:#06x} ({}) should produce a valid state", pid, name));

            // Basic sanity checks
            assert!(!state.device.name.is_empty(), "{}: device name empty", name);
            assert_eq!(state.sample_rate, 48000, "{}: sample rate", name);

            // Outputs match config
            let config = devices::device_by_pid(*pid).unwrap();
            assert_eq!(
                state.outputs.len(),
                config.port_counts.analogue.outputs as usize,
                "{}: output count mismatch",
                name
            );

            // Inputs include analogue + S/PDIF + ADAT
            let expected_inputs = config.port_counts.analogue.inputs as usize
                + config.port_counts.spdif.inputs as usize
                + config.port_counts.adat.inputs as usize;
            assert_eq!(
                state.inputs.len(),
                expected_inputs,
                "{}: input count mismatch (expected {} analogue + {} spdif + {} adat)",
                name,
                config.port_counts.analogue.inputs,
                config.port_counts.spdif.inputs,
                config.port_counts.adat.inputs,
            );

            // Mixer dimensions
            if config.has_mixer() {
                assert_eq!(
                    state.mixer.gains.len(),
                    config.port_counts.mix.outputs as usize,
                    "{}: mixer bus count mismatch",
                    name
                );
                for bus in &state.mixer.gains {
                    assert_eq!(
                        bus.len(),
                        config.port_counts.mix.inputs as usize,
                        "{}: mixer channel count mismatch",
                        name
                    );
                }
            } else {
                assert!(state.mixer.gains.is_empty(), "{}: non-mixer device should have empty gains", name);
            }

            // JSON serialization round-trip
            let json = serde_json::to_string(&state)
                .unwrap_or_else(|e| panic!("{}: serialization failed: {}", name, e));
            assert!(!json.is_empty());
        }
    }

    #[test]
    fn unknown_pid_returns_none() {
        assert!(mock_state_for_pid(0x0000).is_none());
        assert!(mock_state_for_pid(0xFFFF).is_none());
    }

    #[test]
    fn output_names_use_line_out_descrs() {
        // 18i20 Gen 3 has named outputs
        let state = mock_state_for_pid(0x8215).unwrap();
        assert_eq!(state.outputs[0].name, "Monitor 1 L");
        assert_eq!(state.outputs[1].name, "Monitor 1 R");
        assert_eq!(state.outputs[6].name, "Headphones 1 L");
        // Index 4 has None in descrs -> fallback to "Line 5"
        assert_eq!(state.outputs[4].name, "Line 5");
    }

    #[test]
    fn solo_2i2_no_mixer_no_outputs() {
        // Solo and 2i2 have no mixer and zero port counts
        for pid in &[0x8211u16, 0x8210] {
            let state = mock_state_for_pid(*pid).unwrap();
            assert!(state.outputs.is_empty(), "should have no outputs");
            assert!(state.inputs.is_empty(), "should have no inputs (all port counts are 0)");
            assert!(state.mixer.gains.is_empty(), "should have no mixer");
            assert!(state.routing.is_empty(), "should have no routing");
        }
    }

    #[test]
    fn mixer_bus_a_at_unity() {
        // For devices with mixers, bus A (index 0) should be at 0 dB
        let state = mock_state_for_pid(0x8215).unwrap();
        for gain in &state.mixer.gains[0] {
            assert_eq!(*gain, 0.0, "Bus A should be at unity (0 dB)");
        }
        // Other buses at -80 dB
        for gain in &state.mixer.gains[1] {
            assert_eq!(*gain, -80.0, "Other buses should be at -80 dB");
        }
    }

    #[test]
    fn routing_starts_with_pcm_1_to_1() {
        let state = mock_state_for_pid(0x8215).unwrap();
        // First entries should be PCM 0, 1, 2, ...
        for (i, route) in state.routing.iter().take(10).enumerate() {
            assert_eq!(route.route_type, "pcm", "route {} type", i);
            assert_eq!(route.index, i as u32, "route {} index", i);
        }
    }
}
