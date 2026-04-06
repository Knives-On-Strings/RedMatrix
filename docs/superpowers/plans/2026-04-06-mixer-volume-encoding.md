# Mixer Gain & Volume Encoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two volume encoding systems used by the Scarlett2 protocol: a 173-entry mixer gain lookup table and a bias-127 line output volume encoding.

**Architecture:** Single module (`protocol/mixer.rs`) with const lookup table, conversion functions in both directions, and clamping at boundaries. No external dependencies — pure arithmetic and array indexing.

**Tech Stack:** Rust, no additional crates.

**Spec:** `specs/2026-04-06-mixer-volume-encoding-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/src/protocol/mixer.rs` | Rewrite | Constants, lookup table, all conversion functions |

---

### Task 1: Constants and lookup table

**Files:**
- Modify: `src-tauri/src/protocol/mixer.rs`

- [ ] **Step 1: Write failing tests for table integrity**

Replace the entire contents of `src-tauri/src/protocol/mixer.rs` with:

```rust
// Mixer gain and volume encoding for the Scarlett2 protocol.
//
// Two encoding systems:
// 1. Mixer gains: 173-entry lookup table, -80 to +6 dB in 0.5 dB steps
// 2. Line output volume: bias-127 linear encoding, -127 to 0 dB in 1 dB steps

/// Mixer gain range minimum (dB).
pub const MIXER_MIN_DB: f64 = -80.0;
/// Mixer gain range maximum (dB).
pub const MIXER_MAX_DB: f64 = 6.0;
/// Mixer gain step size (dB).
pub const MIXER_STEP_DB: f64 = 0.5;
/// Index offset: unity gain (0 dB) is at this index.
pub const MIXER_BIAS: usize = 160;
/// Number of entries in the mixer gain table.
pub const MIXER_TABLE_LEN: usize = 173;

/// Volume bias for line output encoding.
pub const VOLUME_BIAS: i16 = 127;
/// Line output volume minimum (dB).
pub const VOLUME_MIN_DB: f64 = -127.0;
/// Line output volume maximum (dB).
pub const VOLUME_MAX_DB: f64 = 0.0;

/// Mixer gain lookup table, ported from `scarlett2_mixer_values[173]` in the
/// Linux kernel driver (`mixer_scarlett2.c`).
///
/// Index formula: `(dB + 80) * 2` → range 0..172
/// Value formula: `int(8192 * pow(10, ((index - 160) / 2 / 20)))`
/// Index 0 is special-cased to 0 (true silence).
pub const MIXER_VALUES: [u16; MIXER_TABLE_LEN] = [
    0,     0,     0,     0,     1,     1,     1,     1,
    1,     1,     1,     1,     1,     1,     1,     1,
    2,     2,     2,     2,     2,     2,     2,     3,
    3,     3,     3,     3,     4,     4,     4,     4,
    5,     5,     5,     6,     6,     6,     7,     7,
    8,     8,     9,     9,    10,    10,    11,    12,
    12,    13,    14,    15,    16,    17,    18,    19,
    20,    21,    23,    24,    25,    27,    29,    30,
    32,    34,    36,    38,    41,    43,    46,    48,
    51,    54,    57,    61,    65,    68,    73,    77,
    81,    86,    91,    97,   103,   109,   115,   122,
   129,   137,   145,   154,   163,   173,   183,   194,
   205,   217,   230,   244,   259,   274,   290,   307,
   326,   345,   365,   387,   410,   434,   460,   487,
   516,   547,   579,   614,   650,   689,   730,   773,
   819,   867,   919,   973,  1031,  1092,  1157,  1225,
  1298,  1375,  1456,  1543,  1634,  1731,  1833,  1942,
  2057,  2179,  2308,  2445,  2590,  2744,  2906,  3078,
  3261,  3454,  3659,  3876,  4105,  4349,  4606,  4879,
  5168,  5475,  5799,  6143,  6507,  6892,  7301,  7733,
  8192,  8677,  9191,  9736, 10313, 10924, 11571, 12257,
 12983, 13752, 14567, 15430, 16345,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_length_is_173() {
        assert_eq!(MIXER_VALUES.len(), MIXER_TABLE_LEN);
    }

    #[test]
    fn table_is_monotonically_non_decreasing() {
        for i in 1..MIXER_VALUES.len() {
            assert!(
                MIXER_VALUES[i] >= MIXER_VALUES[i - 1],
                "table not monotonic at index {}: {} < {}",
                i, MIXER_VALUES[i], MIXER_VALUES[i - 1]
            );
        }
    }

    #[test]
    fn table_known_reference_points() {
        // From spec: dB → index → expected value
        assert_eq!(MIXER_VALUES[0], 0);       // -80 dB (silence)
        assert_eq!(MIXER_VALUES[40], 8);      // -60 dB
        assert_eq!(MIXER_VALUES[80], 82);     // -40 dB
        assert_eq!(MIXER_VALUES[120], 819);   // -20 dB
        assert_eq!(MIXER_VALUES[148], 4105);  // -6 dB
        assert_eq!(MIXER_VALUES[160], 8192);  // 0 dB (unity)
        assert_eq!(MIXER_VALUES[172], 16345); // +6 dB (max)
    }

    #[test]
    fn table_matches_formula_within_tolerance() {
        // Verify computed values match the hardcoded table.
        // Allow ±1 tolerance for floating-point truncation edge cases.
        // The kernel's table is the source of truth, not the formula.
        for i in 1..MIXER_TABLE_LEN {
            let db = (i as f64 - MIXER_BIAS as f64) / 2.0;
            let computed = (8192.0 * f64::powf(10.0, db / 20.0)) as u16;
            let diff = (MIXER_VALUES[i] as i32 - computed as i32).unsigned_abs();
            assert!(
                diff <= 1,
                "index {}: table={}, formula={}, diff={}",
                i, MIXER_VALUES[i], computed, diff
            );
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol::mixer`

Expected: 4 tests pass. These are data-only tests — no logic to fail yet.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/protocol/mixer.rs
git commit -m "feat: add mixer gain lookup table with integrity tests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Mixer gain conversion functions

**Files:**
- Modify: `src-tauri/src/protocol/mixer.rs`

- [ ] **Step 1: Write failing tests for db_to_mixer_value and db_to_mixer_index**

Add to the `mod tests` block:

```rust
    #[test]
    fn db_to_mixer_value_at_boundaries() {
        assert_eq!(db_to_mixer_value(MIXER_MIN_DB), 0);
        assert_eq!(db_to_mixer_value(MIXER_MAX_DB), 16345);
    }

    #[test]
    fn db_to_mixer_value_clamping() {
        assert_eq!(db_to_mixer_value(-100.0), 0);      // below min
        assert_eq!(db_to_mixer_value(20.0), 16345);     // above max
    }

    #[test]
    fn db_to_mixer_value_at_unity() {
        assert_eq!(db_to_mixer_value(0.0), 8192);
    }

    #[test]
    fn db_to_mixer_value_at_half_step() {
        assert_eq!(db_to_mixer_value(-0.5), 7733);  // index 159
    }

    #[test]
    fn db_to_mixer_index_at_known_points() {
        assert_eq!(db_to_mixer_index(MIXER_MIN_DB), 0);
        assert_eq!(db_to_mixer_index(0.0), 160);
        assert_eq!(db_to_mixer_index(MIXER_MAX_DB), 172);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test protocol::mixer`

Expected: FAIL — `db_to_mixer_value` and `db_to_mixer_index` not found.

- [ ] **Step 3: Implement db_to_mixer_index and db_to_mixer_value**

Add above the `#[cfg(test)]` block:

```rust
/// Convert a dB value to a mixer table index.
/// Clamps to [MIXER_MIN_DB, MIXER_MAX_DB] and quantizes to 0.5 dB steps.
pub fn db_to_mixer_index(db: f64) -> usize {
    let clamped = db.clamp(MIXER_MIN_DB, MIXER_MAX_DB);
    let index = ((clamped - MIXER_MIN_DB) / MIXER_STEP_DB).round() as usize;
    index.min(MIXER_TABLE_LEN - 1)
}

/// Convert a dB value to the 16-bit hardware mixer gain value.
/// Clamps to [-80, +6] dB range.
pub fn db_to_mixer_value(db: f64) -> u16 {
    MIXER_VALUES[db_to_mixer_index(db)]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol::mixer`

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/protocol/mixer.rs
git commit -m "feat: add db_to_mixer_value and db_to_mixer_index

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Reverse lookup (mixer_value_to_db)

**Files:**
- Modify: `src-tauri/src/protocol/mixer.rs`

- [ ] **Step 1: Write failing tests for mixer_value_to_db**

Add to the `mod tests` block:

```rust
    #[test]
    fn mixer_value_to_db_at_known_values() {
        assert_eq!(mixer_value_to_db(0), MIXER_MIN_DB);
        assert_eq!(mixer_value_to_db(8192), 0.0);
        assert_eq!(mixer_value_to_db(16345), MIXER_MAX_DB);
    }

    #[test]
    fn mixer_value_to_db_intermediate_finds_closest() {
        // 8192 is 0.0 dB (index 160), 8677 is +0.5 dB (index 161)
        // A value of 8400 is closer to 8192 (diff=208) than 8677 (diff=277)
        assert_eq!(mixer_value_to_db(8400), 0.0);
        // A value of 8500 is closer to 8677 (diff=177) than 8192 (diff=308)
        assert_eq!(mixer_value_to_db(8500), 0.5);
    }

    #[test]
    fn mixer_value_round_trip_all_entries() {
        for i in 0..MIXER_TABLE_LEN {
            let db = (i as f64 - MIXER_BIAS as f64) / 2.0;
            let value = db_to_mixer_value(db);
            let db_back = mixer_value_to_db(value);
            assert_eq!(
                db_back, db,
                "round-trip failed at index {}: {} -> {} -> {}",
                i, db, value, db_back
            );
        }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test protocol::mixer`

Expected: FAIL — `mixer_value_to_db` not found.

- [ ] **Step 3: Implement mixer_value_to_db**

Add below `db_to_mixer_value`:

```rust
/// Convert a 16-bit hardware mixer gain value back to dB.
/// Returns the dB value of the closest table entry.
pub fn mixer_value_to_db(value: u16) -> f64 {
    if value == 0 {
        return MIXER_MIN_DB;
    }

    match MIXER_VALUES.binary_search(&value) {
        Ok(index) => (index as f64 - MIXER_BIAS as f64) / 2.0,
        Err(insert_pos) => {
            // Find the nearest entry between insert_pos-1 and insert_pos
            let idx = if insert_pos >= MIXER_TABLE_LEN {
                MIXER_TABLE_LEN - 1
            } else if insert_pos == 0 {
                0
            } else {
                let diff_above = MIXER_VALUES[insert_pos] - value;
                let diff_below = value - MIXER_VALUES[insert_pos - 1];
                if diff_below <= diff_above {
                    insert_pos - 1
                } else {
                    insert_pos
                }
            };
            (idx as f64 - MIXER_BIAS as f64) / 2.0
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol::mixer`

Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/protocol/mixer.rs
git commit -m "feat: add mixer_value_to_db with binary search nearest-match

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Volume bias-127 encoding

**Files:**
- Modify: `src-tauri/src/protocol/mixer.rs`

- [ ] **Step 1: Write failing tests for volume encoding**

Add to the `mod tests` block:

```rust
    #[test]
    fn db_to_volume_raw_at_zero() {
        assert_eq!(db_to_volume_raw(0.0), 127);
    }

    #[test]
    fn db_to_volume_raw_at_min() {
        assert_eq!(db_to_volume_raw(-127.0), 0);
    }

    #[test]
    fn db_to_volume_raw_clamping() {
        assert_eq!(db_to_volume_raw(-200.0), 0);    // below min
        assert_eq!(db_to_volume_raw(10.0), 127);     // above max
    }

    #[test]
    fn volume_raw_to_db_at_max() {
        assert_eq!(volume_raw_to_db(127), 0.0);
    }

    #[test]
    fn volume_raw_to_db_at_min() {
        assert_eq!(volume_raw_to_db(0), -127.0);
    }

    #[test]
    fn volume_round_trip_all_integer_values() {
        for raw in 0..=127i16 {
            let db = volume_raw_to_db(raw);
            let raw_back = db_to_volume_raw(db);
            assert_eq!(
                raw_back, raw,
                "round-trip failed: raw {} -> db {} -> raw {}",
                raw, db, raw_back
            );
        }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test protocol::mixer`

Expected: FAIL — `db_to_volume_raw` and `volume_raw_to_db` not found.

- [ ] **Step 3: Implement volume encoding functions**

Add below `mixer_value_to_db`:

```rust
/// Convert a dB value to the raw wire format for line output volume.
/// Clamps to [-127, 0] dB range. Resolution: 1 dB per step.
pub fn db_to_volume_raw(db: f64) -> i16 {
    let clamped = db.clamp(VOLUME_MIN_DB, VOLUME_MAX_DB);
    (clamped.round() as i16) + VOLUME_BIAS
}

/// Convert a raw wire value to dB for line output volume.
pub fn volume_raw_to_db(raw: i16) -> f64 {
    (raw - VOLUME_BIAS) as f64
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol::mixer`

Expected: 18 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/protocol/mixer.rs
git commit -m "feat: add line output volume bias-127 encoding

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run the full Rust test suite**

Run: `cd src-tauri && cargo test`

Expected: All tests pass (~64 total: 46 existing + 18 new mixer tests).

- [ ] **Step 2: Run clippy**

Run: `cd src-tauri && cargo clippy -- -D warnings`

Fix any warnings.

- [ ] **Step 3: Run frontend tests**

Run: `cd S:/Dev/audio/redmatrix && npm test`

Expected: 1 test passes.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address clippy warnings

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
