/**
 * Meter data store — decoupled from React context to avoid 20Hz re-renders.
 *
 * Uses useSyncExternalStore so only components that actually read meter data
 * re-render when meters update. Header, Settings, etc. are unaffected.
 */

import { useSyncExternalStore } from "react";

let currentMeters: number[] = [];
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): number[] {
  return currentMeters;
}

/** Update meter data (called from transport event listener). */
export function pushMeterData(data: Float32Array): void {
  currentMeters = Array.from(data);
  listeners.forEach((fn) => fn());
}

/** Hook to read current meter data. Only components using this re-render at meter rate. */
export function useMeters(): number[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
