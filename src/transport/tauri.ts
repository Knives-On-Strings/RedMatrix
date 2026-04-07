/**
 * Tauri IPC transport — used by the desktop app.
 *
 * Calls Rust backend via @tauri-apps/api invoke().
 * State updates arrive via Tauri events (when USB backend is connected).
 * For now, uses polling against get_state() as a fallback.
 */

import { invoke } from "@tauri-apps/api/core";
import type { DeviceState, ClientMessage, ServerMessage } from "../types";
import type { Transport } from "./types";

type StateCallback = (state: DeviceState) => void;
type MeterCallback = (meters: Float32Array) => void;
type MessageCallback = (message: ServerMessage) => void;

export class TauriTransport implements Transport {
  private connected = false;
  private stateCallbacks: StateCallback[] = [];
  private meterCallbacks: MeterCallback[] = [];
  private messageCallbacks: MessageCallback[] = [];

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getState(): Promise<DeviceState> {
    return await invoke<DeviceState>("get_device_state");
  }

  async sendCommand(message: ClientMessage): Promise<void> {
    await invoke("send_command", { command: JSON.stringify(message) });
  }

  onStateUpdate(callback: StateCallback): () => void {
    this.stateCallbacks.push(callback);
    return () => {
      this.stateCallbacks = this.stateCallbacks.filter((cb) => cb !== callback);
    };
  }

  onMeters(callback: MeterCallback): () => void {
    this.meterCallbacks.push(callback);
    return () => {
      this.meterCallbacks = this.meterCallbacks.filter((cb) => cb !== callback);
    };
  }

  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.push(callback);
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter((cb) => cb !== callback);
    };
  }

  /** Notify all state subscribers (called when state changes arrive). */
  _notifyState(state: DeviceState): void {
    for (const cb of this.stateCallbacks) {
      cb(state);
    }
  }

  /** Notify all meter subscribers. */
  _notifyMeters(meters: Float32Array): void {
    for (const cb of this.meterCallbacks) {
      cb(meters);
    }
  }

  /** Notify all message subscribers. */
  _notifyMessage(message: ServerMessage): void {
    for (const cb of this.messageCallbacks) {
      cb(message);
    }
  }
}
