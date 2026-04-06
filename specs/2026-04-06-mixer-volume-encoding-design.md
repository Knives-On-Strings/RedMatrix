# Mixer Gain & Volume Encoding Design

## Context

The Scarlett2 protocol uses two separate volume encoding systems. Both must be implemented to support the Mixer, Matrix, and Settings tabs. The encoding schemes are defined in the Linux kernel driver (`mixer_scarlett2.c`) and are exact — no guessing required.

## System 1: Mixer Gain Table

Used for the DSP mixer matrix (SET_MIX / GET_MIX commands). Maps dB values to 16-bit hardware values via a 173-entry lookup table.

### Constants

```rust
pub const MIXER_MIN_DB: f64 = -80.0;
pub const MIXER_MAX_DB: f64 = 6.0;
pub const MIXER_STEP_DB: f64 = 0.5;
pub const MIXER_BIAS: usize = 160;  // index offset: (dB + 80) * 2
pub const MIXER_TABLE_LEN: usize = 173;
```

### Lookup Table

Ported exactly from `scarlett2_mixer_values[173]` in the kernel driver:

```
Index 0 = -80.0 dB → 0 (silence)
Index 160 = 0.0 dB → 8192 (unity gain)
Index 172 = +6.0 dB → 16345 (max)
```

Formula (for reference, not used at runtime — we use the precomputed table):
`value = int(8192 * pow(10, ((index - 160) / 2 / 20)))`

Index 0 is special-cased to 0 (true silence).

### Functions

**`db_to_mixer_value(db: f64) -> u16`**
1. Clamp `db` to `[MIXER_MIN_DB, MIXER_MAX_DB]`
2. Compute index: `((db - MIXER_MIN_DB) / MIXER_STEP_DB).round() as usize`
3. Clamp index to `[0, 172]`
4. Return `MIXER_VALUES[index]`

**`mixer_value_to_db(value: u16) -> f64`**
1. If `value == 0`, return `MIXER_MIN_DB` (-80.0)
2. Binary search the table using `[u16]::binary_search()`. On `Ok(index)` use it directly. On `Err(insert_pos)`, compare `abs(MIXER_VALUES[insert_pos] - value)` vs `abs(MIXER_VALUES[insert_pos - 1] - value)` to find the nearest entry (handle bounds).
3. Convert found index to dB: `(index as f64 - MIXER_BIAS as f64) / 2.0`

**`db_to_mixer_index(db: f64) -> usize`**
Helper that returns the table index directly (useful for callers that need the index rather than the hardware value).

## System 2: Line Output Volume

Used for hardware output volume controls (monitor volume, headphone volume) sent via SET_DATA / GET_DATA. Simple linear encoding with a bias offset.

### Constants

```rust
pub const VOLUME_BIAS: i16 = 127;
pub const VOLUME_MIN_DB: f64 = -127.0;
pub const VOLUME_MAX_DB: f64 = 0.0;
```

### Encoding

- Wire format: `i16` in range `0..=127`
- dB meaning: `raw - VOLUME_BIAS` → range `-127..=0`
- Resolution: 1 dB per step

### Functions

**`db_to_volume_raw(db: f64) -> i16`**
1. Clamp `db` to `[VOLUME_MIN_DB, VOLUME_MAX_DB]`
2. Round to nearest integer
3. Return `(db.round() as i16) + VOLUME_BIAS`

**`volume_raw_to_db(raw: i16) -> f64`**
1. Return `(raw - VOLUME_BIAS) as f64`

## File Location

All types, constants, and functions live in `src-tauri/src/protocol/mixer.rs`. Replaces the current placeholder.

## Test Strategy

### Mixer gain table tests:
1. **Known reference points** — verify table values at -80, -60, -40, -20, -6, 0, +6 dB match the spec
2. **db_to_mixer_value at boundaries** — -80 dB → 0, +6 dB → 16345
3. **db_to_mixer_value clamping** — values below -80 clamp to 0, above +6 clamp to 16345
4. **db_to_mixer_value at unity** — 0.0 dB → 8192
5. **db_to_mixer_value at half-step** — -0.5 dB → 7733 (index 159)
6. **mixer_value_to_db at known values** — 0 → -80.0, 8192 → 0.0, 16345 → 6.0
7. **mixer_value_to_db for intermediate value** — finds closest table entry
8. **Round-trip: dB → value → dB** — for all 173 entries, round-trip is exact

### Volume encoding tests:
9. **db_to_volume_raw at 0 dB** → 127
10. **db_to_volume_raw at -127 dB** → 0
11. **db_to_volume_raw clamping** — below -127 → 0, above 0 → 127
12. **volume_raw_to_db at 127** → 0.0
13. **volume_raw_to_db at 0** → -127.0
14. **Round-trip: dB → raw → dB** — exact for integer dB values

### Table integrity test:
15. **Table is monotonically non-decreasing** — verify each entry >= previous
16. **Table length is exactly 173**
17. **Verify table against formula** — for indices 1..172, compare table value to `int(8192 * pow(10, ((i - 160) / 2 / 20)))` and ensure they match. Note: integer truncation from floating-point may cause ±1 differences on edge entries. If the test fails on a few low values, the kernel's hardcoded table is the source of truth — adjust the test tolerance, not the table.
