/**
 * Meter data store — decoupled from React context to avoid 20Hz re-renders.
 *
 * Uses useSyncExternalStore so only components that actually read meter data
 * re-render when meters update. Header, Settings, etc. are unaffected.
 *
 * Provides two views:
 *  - useMeters(): raw values as received from the backend (~20Hz)
 *  - useSmoothedMeters(): hybrid-ballistics smoothed values, interpolated at
 *    display refresh rate via requestAnimationFrame (instant attack, ~300ms
 *    half-life exponential decay)
 */

import { useSyncExternalStore } from "react";

// ── Constants ──────────────────────────────────────────────────
// Decay factor per millisecond, derived from a target half-life.
// 300ms half-life matches professional VU-style meter decay.
const DECAY_HALF_LIFE_MS = 300;
const DECAY_PER_MS = Math.pow(0.5, 1 / DECAY_HALF_LIFE_MS);

// ── Raw meter store (20Hz from backend) ───────────────────────
let rawMeters: number[] = [];
const rawListeners = new Set<() => void>();

function subscribeRaw(cb: () => void) {
  rawListeners.add(cb);
  return () => rawListeners.delete(cb);
}
function getRawSnapshot(): number[] {
  return rawMeters;
}

/** Called by transport event listener at ~20Hz. */
export function pushMeterData(data: Float32Array): void {
  rawMeters = Array.from(data);
  rawListeners.forEach((fn) => fn());
  ensureAnimationLoop();
}

/** Raw meter values (no smoothing). */
export function useMeters(): number[] {
  return useSyncExternalStore(subscribeRaw, getRawSnapshot);
}

// ── Smoothed meter store (60fps via rAF) ──────────────────────
let smoothedMeters: number[] = [];
let lastFrameTime = 0;
let rafId: number | null = null;
const smoothListeners = new Set<() => void>();

function subscribeSmoothed(cb: () => void) {
  smoothListeners.add(cb);
  return () => smoothListeners.delete(cb);
}
function getSmoothedSnapshot(): number[] {
  return smoothedMeters;
}

/** Pure function: compute one frame of smoothed values. Exported for testing. */
export function computeSmoothedFrame(
  previous: number[],
  raw: number[],
  dtMs: number,
): number[] {
  const decayFactor = Math.pow(DECAY_PER_MS, dtMs);
  const len = raw.length;
  const result = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    const prev = i < previous.length ? previous[i] : 0;
    const r = raw[i];
    // Fast attack: snap up. Moderate decay: exponential falloff.
    result[i] = r >= prev ? r : prev * decayFactor;
  }
  return result;
}

function animationLoop(timestamp: number): void {
  const dt = lastFrameTime > 0 ? timestamp - lastFrameTime : 16;
  lastFrameTime = timestamp;

  const next = computeSmoothedFrame(smoothedMeters, rawMeters, dt);
  if (next !== smoothedMeters) {
    smoothedMeters = next;
    smoothListeners.forEach((fn) => fn());
  }

  // Keep looping as long as there's visible activity
  const hasActivity = smoothedMeters.some((v) => v > 0.001);
  if (hasActivity) {
    rafId = requestAnimationFrame(animationLoop);
  } else {
    rafId = null;
  }
}

function ensureAnimationLoop(): void {
  if (rafId === null) {
    lastFrameTime = 0;
    rafId = requestAnimationFrame(animationLoop);
  }
}

/** Smoothed meter values (60fps interpolation). */
export function useSmoothedMeters(): number[] {
  return useSyncExternalStore(subscribeSmoothed, getSmoothedSnapshot);
}
