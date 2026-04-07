//! Device state model for WebSocket API.
//!
//! Represents the full state of a Focusrite Scarlett audio interface,
//! serializable to JSON for transmission to WebSocket clients.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::time::Instant;

// ── Top-level state ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeviceState {
    pub device: DeviceInfo,
    pub sample_rate: u32,
    pub sync_status: SyncStatus,
    pub clock_source: ClockSource,
    pub spdif_mode: String,
    pub features: Features,
    pub meter_count: u32,
    pub save_config_remaining: u32,
    pub port_counts: PortCountsState,
    pub monitor: MonitorState,
    pub outputs: Vec<OutputState>,
    pub inputs: Vec<InputState>,
    pub mixer: MixerState,
    pub routing: Vec<RouteEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeviceInfo {
    pub name: String,
    pub pid: String,
    pub series: String,
    pub firmware_version: u32,
    pub serial: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Features {
    pub has_mixer: bool,
    pub has_speaker_switching: bool,
    pub has_talkback: bool,
    pub direct_monitor: u8,
}

// ── Port counts ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PortCountsState {
    pub analogue: PortCountPair,
    pub spdif: PortCountPair,
    pub adat: PortCountPair,
    #[serde(rename = "mix")]
    pub mix_ports: PortCountPair,
    pub pcm: PortCountPair,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PortCountPair {
    pub inputs: u8,
    pub outputs: u8,
}

// ── Monitor / outputs / inputs ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MonitorState {
    pub dim: bool,
    pub mute: bool,
    pub talkback: bool,
    pub speaker_switching: String,
    pub master_volume_db: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OutputState {
    pub index: u32,
    pub name: String,
    pub volume_db: f64,
    pub muted: bool,
    pub hw_controlled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InputState {
    pub index: u32,
    pub name: String,
    #[serde(rename = "type")]
    pub input_type: String,
    pub pad: bool,
    pub air: bool,
    pub phantom: bool,
    pub inst: bool,
}

// ── Mixer ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MixerState {
    pub gains: Vec<Vec<f64>>,
    pub soloed: Vec<Vec<bool>>,
}

// ── Routing ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RouteEntry {
    #[serde(rename = "type")]
    pub route_type: String,
    pub index: u32,
}

// ── Enums ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    Locked,
    Unlocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ClockSource {
    Internal,
    Spdif,
    Adat,
}

// ── Mock constructor ────────────────────────────────────────────

impl DeviceState {
    /// Returns a realistic mock state for the Scarlett 18i20 Gen 3 at 48 kHz.
    pub fn mock_18i20_gen3() -> Self {
        let output_names = [
            "Monitor 1 L",
            "Monitor 1 R",
            "Monitor 2 L",
            "Monitor 2 R",
            "Line 5",
            "Line 6",
            "Headphones 1 L",
            "Headphones 1 R",
            "Headphones 2 L",
            "Headphones 2 R",
        ];

        let outputs: Vec<OutputState> = output_names
            .iter()
            .enumerate()
            .map(|(i, name)| OutputState {
                index: i as u32,
                name: name.to_string(),
                volume_db: 0.0,
                muted: false,
                hw_controlled: true,
            })
            .collect();

        let mut inputs: Vec<InputState> = (0..8)
            .map(|i| InputState {
                index: i,
                name: format!("Analogue {}", i + 1),
                input_type: "analogue".to_string(),
                pad: false,
                air: false,
                phantom: false,
                inst: false,
            })
            .collect();
        // 9th input is the talkback mic
        inputs.push(InputState {
            index: 8,
            name: "Analogue 9".to_string(),
            input_type: "analogue".to_string(),
            pad: false,
            air: false,
            phantom: false,
            inst: false,
        });

        // Mixer: 25 buses × 12 input channels
        let num_buses: usize = 25;
        let num_channels: usize = 12;
        let mut gains = vec![vec![-80.0_f64; num_channels]; num_buses];
        // Bus A (index 0) at unity (0 dB)
        gains[0] = vec![0.0; num_channels];

        let soloed = vec![vec![false; num_channels]; num_buses];

        // Routing: first 20 slots = PCM 0–19, rest = off
        // 18i20 Gen 3 has 20 PCM outputs + additional mixer/other slots.
        // Total physical + digital outputs = analogue(10) + spdif(2) + adat(8) = 20
        // Plus mixer outputs etc. We'll use 33 total slots to cover all mux entries.
        let total_routing_slots: usize = 33;
        let mut routing: Vec<RouteEntry> = (0..20)
            .map(|i| RouteEntry {
                route_type: "pcm".to_string(),
                index: i,
            })
            .collect();
        for _ in 20..total_routing_slots {
            routing.push(RouteEntry {
                route_type: "off".to_string(),
                index: 0,
            });
        }

        DeviceState {
            device: DeviceInfo {
                name: "Scarlett 18i20 USB".to_string(),
                pid: "0x8215".to_string(),
                series: "gen3".to_string(),
                firmware_version: 1644,
                serial: "MOCK000000".to_string(),
            },
            sample_rate: 48000,
            sync_status: SyncStatus::Locked,
            clock_source: ClockSource::Internal,
            spdif_mode: "spdif_rca".to_string(),
            features: Features {
                has_mixer: true,
                has_speaker_switching: true,
                has_talkback: true,
                direct_monitor: 0,
            },
            meter_count: 65,
            save_config_remaining: 12,
            port_counts: PortCountsState {
                analogue: PortCountPair {
                    inputs: 9,
                    outputs: 10,
                },
                spdif: PortCountPair {
                    inputs: 2,
                    outputs: 2,
                },
                adat: PortCountPair {
                    inputs: 8,
                    outputs: 8,
                },
                mix_ports: PortCountPair {
                    inputs: 12,
                    outputs: 25,
                },
                pcm: PortCountPair {
                    inputs: 20,
                    outputs: 20,
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
}

// ── Save rate limiter ───────────────────────────────────────────

/// Rate-limits CONFIG_SAVE operations to protect flash write cycles.
///
/// Tracks timestamps of recent saves within a sliding one-hour window
/// and rejects saves that exceed the configured maximum.
#[derive(Debug)]
pub struct SaveRateLimiter {
    timestamps: VecDeque<Instant>,
    max_per_hour: u32,
}

impl SaveRateLimiter {
    pub fn new(max_per_hour: u32) -> Self {
        Self {
            timestamps: VecDeque::new(),
            max_per_hour,
        }
    }

    /// Attempt a save. Returns `Ok(remaining)` on success or
    /// `Err(retry_after_ms)` if the hourly limit has been reached.
    pub fn try_save(&mut self) -> Result<u32, u64> {
        let now = Instant::now();
        let one_hour = std::time::Duration::from_secs(3600);

        // Evict entries older than 1 hour
        while let Some(&oldest) = self.timestamps.front() {
            if now.duration_since(oldest) >= one_hour {
                self.timestamps.pop_front();
            } else {
                break;
            }
        }

        if self.timestamps.len() as u32 >= self.max_per_hour {
            // Oldest entry hasn't expired yet — compute wait time
            let oldest = *self.timestamps.front().unwrap();
            let expires_at = oldest + one_hour;
            let wait = expires_at.duration_since(now);
            Err(wait.as_millis() as u64)
        } else {
            self.timestamps.push_back(now);
            Ok(self.max_per_hour - self.timestamps.len() as u32)
        }
    }

    /// Returns the number of saves remaining in the current hour window.
    pub fn remaining(&self) -> u32 {
        let now = Instant::now();
        let one_hour = std::time::Duration::from_secs(3600);
        let active = self
            .timestamps
            .iter()
            .filter(|&&ts| now.duration_since(ts) < one_hour)
            .count() as u32;
        self.max_per_hour.saturating_sub(active)
    }
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_state_serializes_to_json() {
        let state = DeviceState::mock_18i20_gen3();
        let json = serde_json::to_string(&state).expect("serialization must not panic");

        // Enums serialize with rename_all = "snake_case"
        assert!(json.contains("\"sync_status\":\"locked\""));
        assert!(json.contains("\"clock_source\":\"internal\""));

        // Serde rename on InputState.input_type → "type"
        assert!(json.contains("\"type\":\"analogue\""));

        // Serde rename on RouteEntry.route_type → "type"
        assert!(json.contains("\"type\":\"pcm\""));
        assert!(json.contains("\"type\":\"off\""));

        // Serde rename on PortCountsState.mix_ports → "mix"
        assert!(json.contains("\"mix\":{"));
    }

    #[test]
    fn mock_state_has_correct_port_counts() {
        let state = DeviceState::mock_18i20_gen3();
        let pc = &state.port_counts;

        assert_eq!(pc.analogue.inputs, 9);
        assert_eq!(pc.analogue.outputs, 10);
        assert_eq!(pc.spdif.inputs, 2);
        assert_eq!(pc.spdif.outputs, 2);
        assert_eq!(pc.adat.inputs, 8);
        assert_eq!(pc.adat.outputs, 8);
        assert_eq!(pc.mix_ports.inputs, 12);
        assert_eq!(pc.mix_ports.outputs, 25);
        assert_eq!(pc.pcm.inputs, 20);
        assert_eq!(pc.pcm.outputs, 20);
    }

    #[test]
    fn mock_state_has_correct_output_count() {
        let state = DeviceState::mock_18i20_gen3();
        assert_eq!(state.outputs.len(), 10);
    }

    #[test]
    fn mock_state_has_correct_input_count() {
        let state = DeviceState::mock_18i20_gen3();
        assert_eq!(state.inputs.len(), 9);
    }

    #[test]
    fn mock_state_mixer_dimensions() {
        let state = DeviceState::mock_18i20_gen3();
        assert_eq!(state.mixer.gains.len(), 25);
        for bus in &state.mixer.gains {
            assert_eq!(bus.len(), 12);
        }
        assert_eq!(state.mixer.soloed.len(), 25);
        for bus in &state.mixer.soloed {
            assert_eq!(bus.len(), 12);
        }
    }

    #[test]
    fn rate_limiter_allows_12_saves() {
        let mut limiter = SaveRateLimiter::new(12);
        for i in 0..12 {
            assert!(
                limiter.try_save().is_ok(),
                "save {} should succeed",
                i + 1
            );
        }
    }

    #[test]
    fn rate_limiter_rejects_13th() {
        let mut limiter = SaveRateLimiter::new(12);
        for _ in 0..12 {
            limiter.try_save().unwrap();
        }
        let result = limiter.try_save();
        assert!(result.is_err(), "13th save should be rejected");
        let retry_ms = result.unwrap_err();
        assert!(retry_ms > 0, "retry_after_ms should be positive");
    }

    #[test]
    fn rate_limiter_remaining_decreases() {
        let mut limiter = SaveRateLimiter::new(12);
        assert_eq!(limiter.remaining(), 12);
        for expected_remaining in (0..12).rev() {
            limiter.try_save().unwrap();
            assert_eq!(limiter.remaining(), expected_remaining);
        }
    }
}
