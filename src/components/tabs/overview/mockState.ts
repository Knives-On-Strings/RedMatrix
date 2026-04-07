import type { DeviceState, ChannelLabels } from "../../../types";

/**
 * Generate a mock DeviceState matching the Scarlett 18i20 Gen 3 at 48kHz.
 * Used for UI development before the Tauri IPC transport is connected.
 */
export function mockDeviceState(): DeviceState {
  return {
    device: {
      name: "Scarlett 18i20 USB",
      pid: "0x8215",
      series: "Scarlett Gen 3",
      firmware_version: 1644,
      serial: "P9H7KQ79703C80",
    },
    sample_rate: 48000,
    sync_status: "locked",
    clock_source: "internal",
    spdif_mode: "spdif_rca",
    features: {
      has_mixer: true,
      has_speaker_switching: true,
      has_talkback: true,
      direct_monitor: 0,
    },
    meter_count: 65,
    save_config_remaining: 12,
    port_counts: {
      analogue: { inputs: 9, outputs: 10 },
      spdif: { inputs: 2, outputs: 2 },
      adat: { inputs: 8, outputs: 8 },
      mix: { inputs: 12, outputs: 25 },
      pcm: { inputs: 20, outputs: 20 },
    },
    monitor: {
      dim: false,
      mute: false,
      talkback: false,
      speaker_switching: "main",
      master_volume_db: -10.0,
    },
    outputs: [
      { index: 0, name: "Monitor 1 L", volume_db: -10, muted: false, hw_controlled: true },
      { index: 1, name: "Monitor 1 R", volume_db: -10, muted: false, hw_controlled: true },
      { index: 2, name: "Monitor 2 L", volume_db: -10, muted: false, hw_controlled: true },
      { index: 3, name: "Monitor 2 R", volume_db: -10, muted: false, hw_controlled: true },
      { index: 4, name: "Line 5", volume_db: 0, muted: false, hw_controlled: false },
      { index: 5, name: "Line 6", volume_db: 0, muted: false, hw_controlled: false },
      { index: 6, name: "Headphones 1 L", volume_db: -6, muted: false, hw_controlled: true },
      { index: 7, name: "Headphones 1 R", volume_db: -6, muted: false, hw_controlled: true },
      { index: 8, name: "Headphones 2 L", volume_db: -6, muted: false, hw_controlled: true },
      { index: 9, name: "Headphones 2 R", volume_db: -6, muted: false, hw_controlled: true },
    ],
    inputs: [
      { index: 0, name: "Analogue 1", type: "analogue", pad: false, air: false, phantom: false, inst: false },
      { index: 1, name: "Analogue 2", type: "analogue", pad: false, air: false, phantom: false, inst: false },
      { index: 2, name: "Analogue 3", type: "analogue", pad: false, air: false, phantom: false, inst: false },
      { index: 3, name: "Analogue 4", type: "analogue", pad: false, air: false, phantom: false, inst: false },
      { index: 4, name: "Analogue 5", type: "analogue", pad: false, air: false, phantom: false, inst: false },
      { index: 5, name: "Analogue 6", type: "analogue", pad: false, air: false, phantom: false, inst: false },
      { index: 6, name: "Analogue 7", type: "analogue", pad: false, air: false, phantom: false, inst: false },
      { index: 7, name: "Analogue 8", type: "analogue", pad: false, air: false, phantom: false, inst: false },
      { index: 8, name: "Talkback", type: "analogue", pad: false, air: false, phantom: false, inst: false },
    ],
    mixer: {
      gains: Array.from({ length: 25 }, () => Array.from({ length: 12 }, () => -80.0)),
      soloed: Array.from({ length: 25 }, () => Array.from({ length: 12 }, () => false)),
    },
    routing: Array.from({ length: 20 }, (_, i) => ({ type: "pcm" as const, index: i })),
  };
}

/**
 * Default empty channel labels. Used until the user customizes them.
 */
export function emptyChannelLabels(): ChannelLabels {
  return {
    inputs: {},
    outputs: {},
    pcm: {},
    buses: {},
  };
}

/**
 * Resolve a display label for a channel.
 * Returns the custom label if set, otherwise the default name.
 */
export function resolveLabel(
  labels: ChannelLabels,
  category: "inputs" | "outputs" | "pcm" | "buses",
  key: string,
  defaultName: string,
): string {
  return labels[category][key] || defaultName;
}
