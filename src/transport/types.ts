/**
 * Transport abstraction for device communication.
 *
 * Desktop uses Tauri IPC (invoke commands).
 * iPad uses WebSocket (encrypted, authenticated).
 * React components program against this interface, not the transport directly.
 */

import type { DeviceState, ClientMessage, ServerMessage } from "../types";

export interface Transport {
  /** Get the full device state. */
  getState(): Promise<DeviceState>;

  /** Send a command to the device. */
  sendCommand(message: ClientMessage): Promise<void>;

  /** Subscribe to state updates. Returns an unsubscribe function. */
  onStateUpdate(callback: (state: DeviceState) => void): () => void;

  /** Subscribe to meter data. Returns an unsubscribe function. */
  onMeters(callback: (meters: Float32Array) => void): () => void;

  /** Subscribe to server messages (errors, disconnect, etc.). */
  onMessage(callback: (message: ServerMessage) => void): () => void;

  /** Connect to the device/server. */
  connect(): Promise<void>;

  /** Disconnect. */
  disconnect(): Promise<void>;

  /** Whether currently connected. */
  isConnected(): boolean;
}
