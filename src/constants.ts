/**
 * Shared constants for the RedMatrix frontend.
 *
 * dB ranges, meter thresholds, and other values that appear
 * across multiple components. Change here, updates everywhere.
 */

// ── Mixer gain range ───────────────────────────────────────────

/** Minimum mixer gain in dB (silence). */
export const DB_MIN = -80;
/** Maximum mixer gain in dB. */
export const DB_MAX = 6;
/** Total dB range (DB_MAX - DB_MIN). */
export const DB_RANGE = DB_MAX - DB_MIN; // 86

/** Normalize a dB value to 0..1 range. */
export function dbToNormalized(db: number): number {
  return (db - DB_MIN) / DB_RANGE;
}

/** Convert a 0..1 normalized value to dB. */
export function normalizedToDb(norm: number): number {
  return norm * DB_RANGE + DB_MIN;
}

/** Format a dB value for display. */
export function formatDb(db: number): string {
  if (db <= DB_MIN) return "-∞";
  if (db >= 0) return `+${db.toFixed(0)}`;
  return db.toFixed(0);
}

// ── Meter thresholds ───────────────────────────────────────────

/** Meter level above which the bar turns red (clip/peak). */
export const METER_PEAK_THRESHOLD = 0.9;
/** Meter level above which the bar turns amber (warning). */
export const METER_WARNING_THRESHOLD = 0.7;

/** Get meter color class based on level. */
export function meterColor(level: number): string {
  if (level > METER_PEAK_THRESHOLD) return "bg-red-500";
  if (level > METER_WARNING_THRESHOLD) return "bg-amber-400";
  return "bg-green-500";
}

// ── Mix bus helpers ────────────────────────────────────────────

/** Convert bus index to letter label (0 → "A", 1 → "B", etc.) */
export function busLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

// ── Port type colors ───────────────────────────────────────────

import type { PortType } from "./types";

export const PORT_COLORS: Record<PortType | "pcm_in", string> = {
  off: "bg-neutral-800",
  analogue: "bg-blue-600",
  spdif: "bg-purple-600",
  adat: "bg-teal-600",
  mix: "bg-amber-600",
  pcm: "bg-green-600",
  pcm_in: "bg-emerald-600",
};

// ── Mock meter helpers ────────────────────────────────────────

/** Base level for mock meter data (will be replaced by real transport data). */
export const MOCK_METER_BASE = 0.15;
/** Random range added to base for mock meter data. */
export const MOCK_METER_RANGE = 0.3;
/** Generate a mock meter level (base + random range). */
export function mockMeterLevel(): number {
  return MOCK_METER_BASE + Math.random() * MOCK_METER_RANGE;
}
