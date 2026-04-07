/**
 * TypeScript types for the RedMatrix WebSocket API.
 *
 * These types mirror the Rust server's state model and message types exactly.
 * Both the desktop app (via Tauri IPC) and the iPad (via WebSocket) consume
 * the same state shape.
 *
 * Source of truth: specs/07-WEBSOCKET-API.md
 * Rust implementation: src-tauri/src/server/state.rs, src-tauri/src/server/messages.rs
 */

// ── Device State (full state dump from server) ─────────────────

export interface DeviceState {
  device: DeviceInfo;
  sample_rate: number;
  sync_status: SyncStatus;
  clock_source: ClockSource;
  spdif_mode: string;
  features: Features;
  meter_count: number;
  save_config_remaining: number;
  port_counts: PortCounts;
  monitor: MonitorState;
  outputs: OutputState[];
  inputs: InputState[];
  mixer: MixerState;
  routing: RouteEntry[];
}

/**
 * User-defined custom labels for channels.
 * Stored client-side, keyed by device serial number.
 * Not part of the WebSocket API — purely local UI state.
 */
export interface ChannelLabels {
  /** Custom names for inputs, keyed by "{type}_{index}" e.g. "analogue_0" */
  inputs: Record<string, string>;
  /** Custom names for outputs, keyed by "{type}_{index}" e.g. "analogue_0" */
  outputs: Record<string, string>;
  /** Custom names for PCM channels, keyed by "pcm_in_{index}" or "pcm_out_{index}" */
  pcm: Record<string, string>;
  /** Custom names for mixer buses, keyed by bus index "0", "1", etc. */
  buses: Record<string, string>;
}

/**
 * Stereo pair configuration.
 * Stored client-side, keyed by device serial number.
 * Defaults come from device config (line_out_descrs).
 */
export interface StereoPair {
  /** Left channel output index */
  left: number;
  /** Right channel output index */
  right: number;
  /** Display name for the pair (e.g. "Main Monitors", "HP 1") */
  name: string;
}

/**
 * Full local config for a device (not sent over WebSocket).
 * Stored in %USERPROFILE%/knivesonstrings/redmatrix/device_{serial}.json
 */
export interface LocalDeviceConfig {
  serial: string;
  labels: ChannelLabels;
  stereo_pairs: StereoPair[];
}

export interface DeviceInfo {
  name: string;
  pid: string;
  series: string;
  firmware_version: number;
  serial: string;
}

export interface Features {
  has_mixer: boolean;
  has_speaker_switching: boolean;
  has_talkback: boolean;
  direct_monitor: number;
}

export interface PortCounts {
  analogue: PortCountPair;
  spdif: PortCountPair;
  adat: PortCountPair;
  mix: PortCountPair;
  pcm: PortCountPair;
}

export interface PortCountPair {
  inputs: number;
  outputs: number;
}

export interface MonitorState {
  dim: boolean;
  mute: boolean;
  talkback: boolean;
  speaker_switching: SpeakerMode;
  master_volume_db: number;
}

export interface OutputState {
  index: number;
  name: string;
  volume_db: number;
  muted: boolean;
  hw_controlled: boolean;
}

export interface InputState {
  index: number;
  name: string;
  type: InputType;
  pad: boolean;
  air: boolean;
  phantom: boolean;
  inst: boolean;
}

export interface MixerState {
  gains: number[][];   // [bus][channel] in dB
  soloed: boolean[][]; // [bus][channel]
}

export interface RouteEntry {
  type: PortType;
  index: number;
}

// ── Enums ──────────────────────────────────────────────────────

export type SyncStatus = "locked" | "unlocked";
export type ClockSource = "internal" | "spdif" | "adat";
export type SpeakerMode = "main" | "alt";
export type InputType = "analogue" | "spdif" | "adat";
export type PortType = "off" | "analogue" | "spdif" | "adat" | "mix" | "pcm";

// ── Server → Client Messages ───────────────────────────────────

export type ServerMessage =
  | ServerHelloMessage
  | AuthResultMessage
  | DeviceStateMessage
  | StateUpdateMessage
  | ErrorMessage
  | DeviceDisconnectedMessage
  | DeviceConnectedMessage
  | PongMessage;

export interface ServerHelloMessage {
  type: "server_hello";
  version: number;
  server_pubkey: string;
  server_fingerprint: string;
  device_name: string;
  server_name: string;
}

export interface AuthResultMessage {
  type: "auth_result";
  status: "ok" | "rejected" | "pairing_requested";
  reason?: string;
}

export interface DeviceStateMessage {
  type: "device_state";
  // All DeviceState fields are flattened into this message
  device: DeviceInfo;
  sample_rate: number;
  sync_status: SyncStatus;
  clock_source: ClockSource;
  spdif_mode: string;
  features: Features;
  meter_count: number;
  save_config_remaining: number;
  port_counts: PortCounts;
  monitor: MonitorState;
  outputs: OutputState[];
  inputs: InputState[];
  mixer: MixerState;
  routing: RouteEntry[];
}

export interface StateUpdateMessage {
  type: "state_update";
  changes: Record<string, unknown>;
}

export interface ErrorMessage {
  type: "error";
  code: ErrorCode;
  message: string;
  retry_after_ms?: number;
}

export interface DeviceDisconnectedMessage {
  type: "device_disconnected";
}

export interface DeviceConnectedMessage {
  type: "device_connected";
}

export interface PongMessage {
  type: "pong";
  timestamp: number;
}

export type ErrorCode =
  | "invalid_command"
  | "invalid_payload"
  | "device_error"
  | "device_disconnected"
  | "read_only_mode"
  | "rate_limited";

// ── Client → Server Messages ───────────────────────────────────

export type ClientMessage =
  | ClientHelloMessage
  | PingMessage
  | SetDimMessage
  | SetMuteMessage
  | SetTalkbackMessage
  | SetSpeakerSwitchingMessage
  | SetMasterVolumeMessage
  | SetOutputVolumeMessage
  | SetOutputMuteMessage
  | SetInputPadMessage
  | SetInputAirMessage
  | SetInputPhantomMessage
  | SetInputInstMessage
  | SetMixGainMessage
  | SetMixMuteMessage
  | SetMixSoloMessage
  | ClearSoloMessage
  | SetRouteMessage
  | SetSampleRateMessage
  | SetClockSourceMessage
  | SetSpdifModeMessage
  | SaveConfigMessage;

export interface ClientHelloMessage {
  type: "client_hello";
  version: number;
  client_pubkey: string;
  client_name: string;
}

export interface PingMessage {
  type: "ping";
}

export interface SetDimMessage {
  type: "set_dim";
  payload: { enabled: boolean };
}

export interface SetMuteMessage {
  type: "set_mute";
  payload: { enabled: boolean };
}

export interface SetTalkbackMessage {
  type: "set_talkback";
  payload: { enabled: boolean };
}

export interface SetSpeakerSwitchingMessage {
  type: "set_speaker_switching";
  payload: { mode: SpeakerMode };
}

export interface SetMasterVolumeMessage {
  type: "set_master_volume";
  payload: { db: number };
}

export interface SetOutputVolumeMessage {
  type: "set_output_volume";
  payload: { index: number; db: number };
}

export interface SetOutputMuteMessage {
  type: "set_output_mute";
  payload: { index: number; muted: boolean };
}

export interface SetInputPadMessage {
  type: "set_input_pad";
  payload: { index: number; enabled: boolean };
}

export interface SetInputAirMessage {
  type: "set_input_air";
  payload: { index: number; enabled: boolean };
}

export interface SetInputPhantomMessage {
  type: "set_input_phantom";
  payload: { group: number; enabled: boolean };
}

export interface SetInputInstMessage {
  type: "set_input_inst";
  payload: { index: number; enabled: boolean };
}

export interface SetMixGainMessage {
  type: "set_mix_gain";
  payload: { mix: number; channel: number; gain_db: number };
}

export interface SetMixMuteMessage {
  type: "set_mix_mute";
  payload: { mix: number; channel: number; muted: boolean };
}

export interface SetMixSoloMessage {
  type: "set_mix_solo";
  payload: { mix: number; channel: number; soloed: boolean };
}

export interface ClearSoloMessage {
  type: "clear_solo";
  payload: Record<string, never>;
}

export interface SetRouteMessage {
  type: "set_route";
  payload: { destination: number; source_type: PortType; source_index: number };
}

export interface SetSampleRateMessage {
  type: "set_sample_rate";
  payload: { rate: number };
}

export interface SetClockSourceMessage {
  type: "set_clock_source";
  payload: { source: ClockSource };
}

export interface SetSpdifModeMessage {
  type: "set_spdif_mode";
  payload: { mode: string };
}

export interface SaveConfigMessage {
  type: "save_config";
  payload: Record<string, never>;
}
