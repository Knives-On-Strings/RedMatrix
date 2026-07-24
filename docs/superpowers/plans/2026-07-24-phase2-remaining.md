# Phase 2 Remaining Items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement meter ballistics (hybrid fast-attack/moderate-decay), phantom power confirmation dialog, and dynamic port visibility based on sample rate.

**Architecture:** Three independent work streams. Meter ballistics adds a rAF interpolation loop to the existing meter store. Phantom power adds a confirmation modal gating 48V enable in InputConfig. Dynamic port visibility makes the mock handler rebuild DeviceState when sample rate changes, so the frontend (which already renders from `state.inputs`) gets correct data.

**Tech Stack:** React 19 + TypeScript + Vitest (frontend), Rust + tokio (backend), Tailwind CSS (styling)

## Global Constraints

- TDD: write failing test first, then implement
- Rust tests: `cargo test` in `src-tauri/`
- Frontend tests: `npm test` (runs `vitest run`)
- No `unwrap()` in Rust production paths
- No `any` types in TypeScript
- Tailwind for all styling — no inline CSS objects
- Co-locate test files: Rust tests in `#[cfg(test)] mod tests`, TS tests as `*.test.ts(x)` next to source

---

### Task 1: Meter Ballistics — rAF Smoothing in useMeterStore

**Files:**
- Modify: `src/hooks/useMeterStore.ts`
- Create: `src/hooks/useMeterStore.test.ts`
- Modify: `src/components/MeterBar.tsx`

**Interfaces:**
- Consumes: `pushMeterData(data: Float32Array)` (existing, called by transport layer)
- Produces: `useSmoothedMeters(): number[]` (new hook for smoothed values), `useMeters(): number[]` (unchanged, raw values)

- [ ] **Step 1: Write failing test for smoothed meter decay**

Create `src/hooks/useMeterStore.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { pushMeterData } from "./useMeterStore";

// We need to test the internal smoothing logic, so we'll import the
// smoothing function directly. We'll export it as a named export.
import { computeSmoothedFrame } from "./useMeterStore";

describe("meter ballistics", () => {
  it("snaps up instantly on attack (fast attack)", () => {
    const previous = [0.0, 0.0, 0.0];
    const raw = [0.8, 0.5, 0.3];
    const result = computeSmoothedFrame(previous, raw, 16);
    // Attack is instant: smoothed >= raw
    expect(result[0]).toBeCloseTo(0.8);
    expect(result[1]).toBeCloseTo(0.5);
    expect(result[2]).toBeCloseTo(0.3);
  });

  it("decays gradually when raw drops (moderate decay)", () => {
    const previous = [0.8, 0.8, 0.8];
    const raw = [0.0, 0.0, 0.0];
    const result = computeSmoothedFrame(previous, raw, 16);
    // After one 16ms frame, should be less than previous but not zero
    expect(result[0]).toBeLessThan(0.8);
    expect(result[0]).toBeGreaterThan(0.5);
  });

  it("reaches near-zero after ~1 second of silence", () => {
    let values = [0.8, 0.8, 0.8];
    const raw = [0.0, 0.0, 0.0];
    // ~60 frames at 16ms = ~960ms
    for (let i = 0; i < 60; i++) {
      values = computeSmoothedFrame(values, raw, 16);
    }
    expect(values[0]).toBeLessThan(0.01);
  });

  it("handles raw array longer than previous (new channels)", () => {
    const previous = [0.5];
    const raw = [0.5, 0.8];
    const result = computeSmoothedFrame(previous, raw, 16);
    expect(result.length).toBe(2);
    expect(result[1]).toBeCloseTo(0.8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose useMeterStore`
Expected: FAIL — `computeSmoothedFrame` is not exported

- [ ] **Step 3: Implement smoothing logic in useMeterStore**

Replace `src/hooks/useMeterStore.ts` with:

```typescript
import { useSyncExternalStore } from "react";

// ── Constants ──────────────────────────────────────────────────
// Decay factor per millisecond. At 16ms frames:
//   0.5^(16/300) ≈ 0.964 per frame → 300ms half-life
const DECAY_PER_MS = Math.pow(0.5, 1 / 300);

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter=verbose useMeterStore`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Update MeterBar to use smoothed meters and remove CSS transition**

In `src/components/MeterBar.tsx`, the component receives `level` as a prop — it doesn't call `useMeters()` directly. The callers pass in the level. So the change is in the **callers** — they should switch from `useMeters()` to `useSmoothedMeters()`.

Find all files that call `useMeters()` and pass levels to `MeterBar`:

In `src/components/tabs/overview/InputMeters.tsx`, change:
```typescript
// Before:
import { useMeters } from "../../../hooks/useMeterStore";
// After:
import { useSmoothedMeters } from "../../../hooks/useMeterStore";
```
And change the hook call:
```typescript
// Before:
const meters = useMeters();
// After:
const meters = useSmoothedMeters();
```

In `src/components/tabs/overview/OutputLevels.tsx`, apply the same change if it uses `useMeters()`.

In `src/components/tabs/Mixer.tsx`, apply the same change if it uses `useMeters()`.

Then in `src/components/MeterBar.tsx`, remove the CSS transition from the level bar:
```typescript
// Before:
className={`absolute bottom-0 left-0 right-0 ${meterColor(level)} rounded-sm transition-all duration-75`}
// After:
className={`absolute bottom-0 left-0 right-0 ${meterColor(level)} rounded-sm`}
```

Also remove the CSS transition from the peak hold line:
```typescript
// Before:
className={`absolute left-0 right-0 ${peakColor} transition-all duration-150`}
// After:
className={`absolute left-0 right-0 ${peakColor}`}
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useMeterStore.ts src/hooks/useMeterStore.test.ts src/components/MeterBar.tsx src/components/tabs/overview/InputMeters.tsx src/components/tabs/overview/OutputLevels.tsx src/components/tabs/Mixer.tsx
git commit -m "feat: Add meter ballistics with hybrid fast-attack/moderate-decay smoothing"
```

---

### Task 2: Phantom Power Confirmation Dialog

**Files:**
- Create: `src/components/PhantomConfirmDialog.tsx`
- Create: `src/components/PhantomConfirmDialog.test.tsx`
- Modify: `src/components/tabs/input/InputConfig.tsx`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: `PhantomConfirmDialog` component with props `{ group: string; onConfirm: () => void; onCancel: () => void }`

- [ ] **Step 1: Write failing test for PhantomConfirmDialog**

Create `src/components/PhantomConfirmDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PhantomConfirmDialog from "./PhantomConfirmDialog";

describe("PhantomConfirmDialog", () => {
  it("renders warning text with the input group name", () => {
    render(
      <PhantomConfirmDialog group="inputs 1-4" onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText(/inputs 1-4/)).toBeDefined();
    expect(screen.getByText(/can damage ribbon/i)).toBeDefined();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <PhantomConfirmDialog group="inputs 1-4" onConfirm={vi.fn()} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onConfirm when Enable 48V is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <PhantomConfirmDialog group="inputs 1-4" onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Enable 48V"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not call onConfirm when Cancel is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <PhantomConfirmDialog group="inputs 1-4" onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose PhantomConfirmDialog`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PhantomConfirmDialog**

Create `src/components/PhantomConfirmDialog.tsx`:

```tsx
interface PhantomConfirmDialogProps {
  group: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PhantomConfirmDialog({ group, onConfirm, onCancel }: PhantomConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl max-w-sm w-full mx-4 p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="text-2xl">⚠️</div>
          <div>
            <h3 className="text-sm font-bold text-neutral-200 mb-1">Enable 48V Phantom Power?</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Enabling phantom power on <span className="text-neutral-200 font-medium">{group}</span> can
              damage ribbon and some dynamic microphones. Make sure only condenser microphones are connected
              to these inputs.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            autoFocus
            className="px-4 py-1.5 text-xs font-medium rounded bg-neutral-700 text-neutral-300 hover:bg-neutral-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-xs font-bold rounded bg-red-600 text-white hover:bg-red-500 transition-colors"
          >
            Enable 48V
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter=verbose PhantomConfirmDialog`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Wire PhantomConfirmDialog into InputConfig**

In `src/components/tabs/input/InputConfig.tsx`:

Add import at top:
```typescript
import PhantomConfirmDialog from "../../PhantomConfirmDialog";
```

Add state inside the `InputConfig` component function, near the top:
```typescript
const [phantomPending, setPhantomPending] = useState<{
  input: InputState;
  indices: number[];
} | null>(null);
```

Modify the `handleToggle` function. Find the `case "phantom":` block inside the `targetIndices.forEach` loop. The entire `handleToggle` function needs to be changed so that when `feature === "phantom"` and we're **enabling** (i.e., `!input.phantom === true`), we intercept and show the dialog instead of sending immediately.

Replace the `handleToggle` function with:
```typescript
const handleToggle = (input: InputState, feature: string) => {
  const linkedPair = inputStereoPairs.find(
    (p) => p.linked && p.input_type === input.type && (p.left === input.index || p.right === input.index)
  );
  const targetIndices = linkedPair ? [linkedPair.left, linkedPair.right] : [input.index];

  // Intercept phantom power ENABLE — show confirmation dialog
  if (feature === "phantom" && !input.phantom) {
    setPhantomPending({ input, indices: targetIndices });
    return;
  }

  sendToggleCommands(input, feature, targetIndices);
};

const sendToggleCommands = (input: InputState, feature: string, targetIndices: number[]) => {
  const redoMsgs: ClientMessage[] = [];
  const undoMsgs: ClientMessage[] = [];

  targetIndices.forEach((idx) => {
    switch (feature) {
      case "pad":
        redoMsgs.push({ type: "set_input_pad", payload: { index: idx, enabled: !input.pad } });
        undoMsgs.push({ type: "set_input_pad", payload: { index: idx, enabled: input.pad } });
        break;
      case "air":
        redoMsgs.push({ type: "set_input_air", payload: { index: idx, enabled: !input.air } });
        undoMsgs.push({ type: "set_input_air", payload: { index: idx, enabled: input.air } });
        break;
      case "phantom":
        redoMsgs.push({ type: "set_input_phantom", payload: { group: idx, enabled: !input.phantom } });
        undoMsgs.push({ type: "set_input_phantom", payload: { group: idx, enabled: input.phantom } });
        break;
      case "inst":
        redoMsgs.push({ type: "set_input_inst", payload: { index: idx, enabled: !input.inst } });
        undoMsgs.push({ type: "set_input_inst", payload: { index: idx, enabled: input.inst } });
        break;
    }
  });

  if (redoMsgs.length > 0) {
    const defaultLabel = input.type === "spdif"
      ? `S/${input.index === 0 ? "L" : "R"}`
      : input.type === "adat"
      ? `AD${input.index + 1}`
      : `${input.index + 1}`;
    const label = getLabel("inputs", `${input.type}_${input.index}`, defaultLabel);
    const isFeatureActive = input[feature as keyof InputState];
    const description = `${!isFeatureActive ? "Enable" : "Disable"} ${feature.toUpperCase()} on ${label}`;
    sendCommand(redoMsgs, { undo: undoMsgs, description });
  }
};

const handlePhantomConfirm = () => {
  if (phantomPending) {
    sendToggleCommands(phantomPending.input, "phantom", phantomPending.indices);
    setPhantomPending(null);
  }
};
```

At the end of the component's JSX return, just before the closing `</div>`, add:
```tsx
{phantomPending && (
  <PhantomConfirmDialog
    group={`inputs ${phantomPending.indices.map((i) => i + 1).join("-")}`}
    onConfirm={handlePhantomConfirm}
    onCancel={() => setPhantomPending(null)}
  />
)}
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/components/PhantomConfirmDialog.tsx src/components/PhantomConfirmDialog.test.tsx src/components/tabs/input/InputConfig.tsx
git commit -m "feat: Add phantom power confirmation dialog before enabling 48V"
```

---

### Task 3: Dynamic Port Visibility — Mock Handler State Rebuild

**Files:**
- Modify: `src-tauri/src/server/mock_devices.rs`
- Modify: `src-tauri/src/server/mock_handler.rs`

**Interfaces:**
- Consumes: `DeviceConfig` from `crate::protocol::devices`
- Produces: When `SetSampleRate` is handled, the mock handler returns a full state replacement (not just a `sample_rate` field change), causing the frontend to receive updated `port_counts` and `inputs` arrays

- [ ] **Step 1: Write failing test for rate-dependent port counts**

In `src-tauri/src/server/mock_devices.rs`, add to the existing `#[cfg(test)] mod tests` block (create it if absent — there isn't one currently, so add at the end of the file):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_state_96k_halves_adat() {
        let config = crate::protocol::devices::device_by_pid(0x8215).unwrap();
        let state = build_state_for_rate(config, 96000);
        assert_eq!(state.port_counts.adat.inputs, 4);
        assert_eq!(state.port_counts.adat.outputs, 4);
        // Analogue unchanged
        assert_eq!(state.port_counts.analogue.inputs, 9);
        // ADAT inputs in the inputs array should be 4
        let adat_inputs: Vec<_> = state.inputs.iter().filter(|i| i.input_type == "adat").collect();
        assert_eq!(adat_inputs.len(), 4);
    }

    #[test]
    fn mock_state_192k_removes_adat_and_mixer() {
        let config = crate::protocol::devices::device_by_pid(0x8215).unwrap();
        let state = build_state_for_rate(config, 192000);
        assert_eq!(state.port_counts.adat.inputs, 0);
        assert_eq!(state.port_counts.adat.outputs, 0);
        assert_eq!(state.port_counts.mix_ports.inputs, 0);
        assert_eq!(state.port_counts.mix_ports.outputs, 0);
        // PCM reduced
        assert_eq!(state.port_counts.pcm.inputs, 10);
        assert_eq!(state.port_counts.pcm.outputs, 10);
        // No ADAT inputs in inputs array
        let adat_inputs: Vec<_> = state.inputs.iter().filter(|i| i.input_type == "adat").collect();
        assert_eq!(adat_inputs.len(), 0);
    }

    #[test]
    fn mock_state_48k_has_full_ports() {
        let config = crate::protocol::devices::device_by_pid(0x8215).unwrap();
        let state = build_state_for_rate(config, 48000);
        assert_eq!(state.port_counts.adat.inputs, 8);
        assert_eq!(state.port_counts.adat.outputs, 8);
        assert_eq!(state.port_counts.pcm.inputs, 20);
        assert_eq!(state.port_counts.pcm.outputs, 20);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test mock_state_96k --lib`
Expected: FAIL — `build_state_for_rate` not found

- [ ] **Step 3: Implement build_state_for_rate**

In `src-tauri/src/server/mock_devices.rs`, add a new public function `build_state_for_rate` alongside the existing `build_state`. This function takes a `DeviceConfig` and a sample rate, and adjusts port counts before building inputs/outputs/mixer.

Add this function (can be placed right after the existing `build_state` function):

```rust
/// Build a mock DeviceState for a specific sample rate.
/// Adjusts ADAT, mixer, and PCM port counts per the Scarlett2 spec:
/// - 88.2/96 kHz: ADAT halved (8→4 or as appropriate for device)
/// - 176.4/192 kHz: ADAT zeroed, mixer zeroed, PCM reduced
pub fn build_state_for_rate(config: &DeviceConfig, rate: u32) -> DeviceState {
    let mut state = build_state(config);
    if rate == state.sample_rate {
        return state;
    }
    state.sample_rate = rate;

    let base_pc = &config.port_counts;

    match rate {
        88200 | 96000 => {
            // ADAT inputs/outputs halved
            let adat_in = base_pc.adat.inputs / 2;
            let adat_out = base_pc.adat.outputs / 2;
            state.port_counts.adat.inputs = adat_in;
            state.port_counts.adat.outputs = adat_out;
            // PCM reduced: 18i20 Gen3 goes from 20/20 to 16/18
            // Use mux tables if available, else simple reduction
            state.port_counts.pcm.inputs = base_pc.pcm.inputs.min(16);
            state.port_counts.pcm.outputs = base_pc.pcm.outputs.min(18);
        }
        176400 | 192000 => {
            // All optical I/O disabled
            state.port_counts.adat.inputs = 0;
            state.port_counts.adat.outputs = 0;
            // S/PDIF: coaxial input only, no output
            state.port_counts.spdif.outputs = 0;
            // Mixer disabled
            state.port_counts.mix_ports.inputs = 0;
            state.port_counts.mix_ports.outputs = 0;
            // PCM heavily reduced
            state.port_counts.pcm.inputs = 10;
            state.port_counts.pcm.outputs = 10;
        }
        _ => {
            // 44100/48000 — use base port counts (already set by build_state)
        }
    }

    // Rebuild inputs array to match adjusted port counts
    state.inputs.retain(|i| match i.input_type.as_str() {
        "adat" => (i.index as u8) < state.port_counts.adat.inputs,
        "spdif" => (i.index as u8) < state.port_counts.spdif.inputs,
        _ => true,
    });

    // Rebuild mixer gains/soloed if mixer is disabled
    if state.port_counts.mix_ports.inputs == 0 {
        state.mixer.gains = vec![];
        state.mixer.soloed = vec![];
    }

    // Recalculate meter count
    state.meter_count = state.port_counts.analogue.inputs as u32
        + state.port_counts.spdif.inputs as u32
        + state.port_counts.adat.inputs as u32
        + state.port_counts.analogue.outputs as u32
        + state.port_counts.spdif.outputs as u32
        + state.port_counts.adat.outputs as u32
        + state.port_counts.mix_ports.outputs as u32
        + state.port_counts.pcm.inputs as u32;

    state
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test mock_state_96k --lib && cargo test mock_state_192k --lib && cargo test mock_state_48k --lib`
Expected: PASS — all 3 tests green

- [ ] **Step 5: Write failing test for mock handler SetSampleRate returning full state**

In `src-tauri/src/server/mock_handler.rs`, add to the existing test module:

```rust
#[tokio::test]
async fn set_sample_rate_rebuilds_state() {
    let state = make_test_state();

    // Switch to 96 kHz
    let msg = ClientMessage::SetSampleRate {
        payload: crate::server::messages::SampleRatePayload { rate: 96000 },
    };
    let changes = handle_command(&state, msg).await.unwrap();

    // Should return full_state key indicating a full rebuild
    assert!(changes.contains_key("__full_state"), "should signal full state rebuild");

    let s = state.read().await;
    assert_eq!(s.sample_rate, 96000);
    assert_eq!(s.port_counts.adat.inputs, 4);
    let adat_count = s.inputs.iter().filter(|i| i.input_type == "adat").count();
    assert_eq!(adat_count, 4);
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd src-tauri && cargo test set_sample_rate_rebuilds --lib`
Expected: FAIL — `__full_state` key not present

- [ ] **Step 7: Update mock handler SetSampleRate to rebuild state**

In `src-tauri/src/server/mock_handler.rs`, find the `SetSampleRate` match arm:

```rust
// Before:
ClientMessage::SetSampleRate { payload } => {
    state.sample_rate = payload.rate;
    changes.insert("sample_rate".to_string(), serde_json::json!(payload.rate));
}
```

Replace with:

```rust
ClientMessage::SetSampleRate { payload } => {
    // Look up the device config by PID to rebuild state for new rate
    let pid_str = state.device.pid.trim_start_matches("0x");
    let pid = u16::from_str_radix(pid_str, 16).unwrap_or(0x8215);
    if let Some(config) = crate::protocol::devices::device_by_pid(pid) {
        let preserved_device = state.device.clone();
        let preserved_monitor = state.monitor.clone();
        let preserved_spdif = state.spdif_mode.clone();
        let preserved_clock = state.clock_source.clone();
        let preserved_sub = state.sub_assignments.clone();
        let preserved_bus = state.bus_masters.clone();
        let preserved_master = state.master_db;

        let mut rebuilt = crate::server::mock_devices::build_state_for_rate(config, payload.rate);
        rebuilt.device = preserved_device;
        rebuilt.monitor = preserved_monitor;
        rebuilt.spdif_mode = preserved_spdif;
        rebuilt.clock_source = preserved_clock;
        rebuilt.sub_assignments = preserved_sub;
        rebuilt.bus_masters = preserved_bus;
        rebuilt.master_db = preserved_master;

        *state = rebuilt;
    } else {
        state.sample_rate = payload.rate;
    }
    // Signal full state rebuild — the caller should send device_state not state_update
    changes.insert("__full_state".to_string(), serde_json::json!(true));
}
```

Note: The `__full_state` key signals to the WebSocket broadcast layer that it should send a full `device_state` message instead of an incremental `state_update`. Check `src-tauri/src/lib.rs` to see how state changes are broadcast — if it currently only sends `state_update`, also update it to check for `__full_state` and send the complete state. If the broadcast code already sends full state dumps, this key is just for test assertions and can be filtered out before broadcast.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd src-tauri && cargo test set_sample_rate_rebuilds --lib`
Expected: PASS

- [ ] **Step 9: Run all Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/server/mock_devices.rs src-tauri/src/server/mock_handler.rs
git commit -m "feat: Rebuild mock device state on sample rate change for dynamic port visibility"
```

---

## Task Dependencies

```
Task 1 (Meter Ballistics)     — independent
Task 2 (Phantom Power Dialog) — independent
Task 3 (Dynamic Port Visibility) — independent
```

All three tasks can be executed in parallel by separate agents.

## Post-Implementation Verification

After all three tasks are complete:

1. Run full test suite: `npm test && cd src-tauri && cargo test`
2. Visual verification in the app:
   - Meters should smoothly rise and fall, not jump
   - Clicking 48V OFF badge should show confirmation dialog
   - Clicking 48V ON badge should disable without dialog
   - Switching sample rate to 96kHz should hide half the ADAT channels
   - Switching to 192kHz should hide all ADAT and mixer
