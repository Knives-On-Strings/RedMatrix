# Phase 2 Remaining Items — Design Spec

**Date:** 2026-07-24
**Scope:** Meter ballistics, phantom power confirmation, dynamic port visibility
**Deferred:** Pan controls, system tray / headless mode

---

## 1. Meter Ballistics

### Problem
MeterBar renders raw Float32 values from the 20Hz USB/mock meter stream with only a 75ms CSS transition. Levels look jerky and unprofessional. Peak hold exists (1s hold + linear decay) but is React-state-driven.

### Design
Move all ballistics into `useMeterStore.ts` via a `requestAnimationFrame` loop that interpolates between raw samples (20Hz) and displayed values (60fps).

**Algorithm — hybrid style (fast attack, moderate decay):**
- **Attack:** Instant. If `raw > smoothed`, snap `smoothed = raw`.
- **Decay:** Exponential. `smoothed = smoothed * DECAY_FACTOR` per frame, where `DECAY_FACTOR ≈ 0.964` at 16ms frame intervals (~300ms half-life). Formula: `0.5^(frameDuration/halfLife)`.
- **Peak hold:** Unchanged behavior (1s hold, then linear decay), but driven by the rAF loop, not React state.

**API change:**
- New export: `useSmoothedMeters(): number[]` — returns the interpolated array, triggers re-render via `useSyncExternalStore`.
- Existing `useMeters()` continues to return raw values (for any consumer that needs them).
- `MeterBar` switches from `useMeters()` to `useSmoothedMeters()`.

**CSS change:** Remove `transition-all duration-75` from the level fill div — the rAF loop provides smoothing now.

### Files to modify
- `src/hooks/useMeterStore.ts` — add rAF loop, smoothed values array, `useSmoothedMeters()` export
- `src/components/MeterBar.tsx` — switch to `useSmoothedMeters()`, remove CSS transition on level bar
- `src/components/tabs/overview/InputMeters.tsx` — switch to `useSmoothedMeters()`
- `src/components/tabs/overview/OutputLevels.tsx` — switch to `useSmoothedMeters()` if it uses meters

### Testing
- Unit test in `useMeterStore.test.ts`: push raw values, advance rAF frames, assert smoothed output follows attack/decay curves.
- Visual verification in browser: meters should feel smooth and professional.

---

## 2. Phantom Power Confirmation Dialog

### Problem
Clicking the 48V badge in InputConfig.tsx sends `set_input_phantom` immediately with no confirmation. Phantom power can damage ribbon and some dynamic microphones.

### Design
A modal dialog triggered only when **enabling** 48V (turning off is always safe).

**Component:** `src/components/PhantomConfirmDialog.tsx`

**Props:**
```typescript
interface PhantomConfirmDialogProps {
  group: string;        // e.g. "inputs 1-4" or "inputs 5-8"
  onConfirm: () => void;
  onCancel: () => void;
}
```

**Modal content:**
- Warning icon (amber triangle)
- Heading: "Enable 48V Phantom Power?"
- Body: "Enabling phantom power on {group} can damage ribbon and some dynamic microphones. Make sure only condenser microphones are connected to these inputs."
- Buttons: "Cancel" (default focus, neutral style) and "Enable 48V" (red/destructive style)

**Behavior:**
- Enabling 48V → show dialog → user confirms → send command
- Disabling 48V → send command immediately, no dialog
- No "don't ask again" checkbox — always warn

### Files to modify
- `src/components/PhantomConfirmDialog.tsx` — new file
- `src/components/tabs/input/InputConfig.tsx` — add state for pending phantom toggle, show dialog conditionally

### Testing
- `PhantomConfirmDialog.test.tsx`: renders warning text, Cancel closes without calling onConfirm, Enable calls onConfirm.
- `InputConfig` integration: clicking 48V OFF badge opens dialog, confirming sends command, cancelling does not.

---

## 3. Dynamic Port Visibility

### Problem
All port groups (Analogue, S/PDIF, ADAT) render regardless of sample rate. At higher rates, ADAT channels should disappear and S/PDIF availability changes by I/O mode.

### Port visibility rules (18i20 Gen 3)

| Sample Rate | Analogue | S/PDIF | ADAT | Mixer | PCM |
|-------------|----------|--------|------|-------|-----|
| 44.1/48 kHz | 9 in / 10 out | 2/2 | 8/8 | 12/25 | 20/20 |
| 88.2/96 kHz | 9 in / 10 out | 2/2 (mode-dep) | 4 or 8 (mode-dep) | 12/25 | 16/18 |
| 176.4/192 kHz | 9 in / 10 out | 2 in / 0 out (coax only) | 0/0 | 0/0 | 10/10 |

### Design
**Backend approach (primary):** When sample rate changes, the backend re-sends a full `device_state` with correct `port_counts` and trimmed `inputs`/`outputs` arrays. The WebSocket spec already mandates this. The frontend simply renders what `state.inputs` and `state.port_counts` contain.

**What needs to happen:**
1. **Mock handler:** Verify that `set_sample_rate` in `mock_handler.rs` rebuilds the state with correct port counts and trimmed input/output arrays for the new rate. If it doesn't, implement it.
2. **USB path:** Verify that after a sample rate change + device re-initialization, the queried state reflects the new port counts. The interrupt notification handler already re-reads state on changes.
3. **Frontend audit:** Ensure no component hardcodes port counts or assumes all input types are always present. Each view already groups by type from `state.inputs` — verify they gracefully render zero items (empty group = hidden group).

**Frontend fallback (defensive):** If any component does hardcode, add a filter: `state.inputs.filter(i => i.type !== 'adat' || state.port_counts.adat.inputs > 0)`. But the primary fix is correct backend state emission.

### Files to modify
- `src-tauri/src/server/mock_handler.rs` — handle `set_sample_rate` by rebuilding state with rate-appropriate port counts
- `src-tauri/src/server/mock_devices.rs` — add helper to rebuild state for a given sample rate
- Frontend components (audit only, likely no changes needed if backend is correct):
  - `src/components/tabs/overview/InputMeters.tsx`
  - `src/components/tabs/Mixer.tsx`
  - `src/components/tabs/input/InputConfig.tsx`
  - `src/components/tabs/input/InputMatrix.tsx`
  - `src/components/tabs/output/OutputConfig.tsx`
  - `src/components/tabs/output/OutputMatrix.tsx`

### Testing
- `mock_handler` test: send `set_sample_rate` with rate 96000, verify returned state has ADAT inputs = 4.
- `mock_handler` test: send `set_sample_rate` with rate 192000, verify ADAT inputs = 0, mixer disabled.
- Frontend: switch sample rate in Settings, verify ADAT channels disappear from all tabs.

---

## Implementation Strategy

Three independent work streams, suitable for parallel sonnet agents:

1. **Meter ballistics** — pure frontend, touches `useMeterStore.ts` and `MeterBar.tsx`
2. **Phantom power dialog** — pure frontend, new component + InputConfig.tsx change
3. **Dynamic port visibility** — backend mock handler + frontend audit

Each stream gets its own agent. Opus reviews the output.
