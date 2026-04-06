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
/// Index formula: `(dB + 80) * 2` -> range 0..172
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

/// Convert a 16-bit hardware mixer gain value back to dB.
/// Returns the dB value of the closest table entry.
pub fn mixer_value_to_db(value: u16) -> f64 {
    if value == 0 {
        return MIXER_MIN_DB;
    }

    match MIXER_VALUES.binary_search(&value) {
        Ok(index) => (index as f64 - MIXER_BIAS as f64) / 2.0,
        Err(insert_pos) => {
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
        assert_eq!(MIXER_VALUES[0], 0);       // -80 dB (silence)
        assert_eq!(MIXER_VALUES[40], 8);      // -60 dB
        assert_eq!(MIXER_VALUES[80], 81);     // -40 dB
        assert_eq!(MIXER_VALUES[120], 819);   // -20 dB
        assert_eq!(MIXER_VALUES[148], 4105);  // -6 dB
        assert_eq!(MIXER_VALUES[160], 8192);  // 0 dB (unity)
        assert_eq!(MIXER_VALUES[172], 16345); // +6 dB (max)
    }

    #[test]
    fn table_matches_formula_within_tolerance() {
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

    #[test]
    fn db_to_mixer_value_at_boundaries() {
        assert_eq!(db_to_mixer_value(MIXER_MIN_DB), 0);
        assert_eq!(db_to_mixer_value(MIXER_MAX_DB), 16345);
    }

    #[test]
    fn db_to_mixer_value_clamping() {
        assert_eq!(db_to_mixer_value(-100.0), 0);
        assert_eq!(db_to_mixer_value(20.0), 16345);
    }

    #[test]
    fn db_to_mixer_value_at_unity() {
        assert_eq!(db_to_mixer_value(0.0), 8192);
    }

    #[test]
    fn db_to_mixer_value_at_half_step() {
        assert_eq!(db_to_mixer_value(-0.5), 7733);
    }

    #[test]
    fn db_to_mixer_index_at_known_points() {
        assert_eq!(db_to_mixer_index(MIXER_MIN_DB), 0);
        assert_eq!(db_to_mixer_index(0.0), 160);
        assert_eq!(db_to_mixer_index(MIXER_MAX_DB), 172);
    }

    #[test]
    fn mixer_value_to_db_at_known_values() {
        assert_eq!(mixer_value_to_db(0), MIXER_MIN_DB);
        assert_eq!(mixer_value_to_db(8192), 0.0);
        assert_eq!(mixer_value_to_db(16345), MIXER_MAX_DB);
    }

    #[test]
    fn mixer_value_to_db_intermediate_finds_closest() {
        // 8192 is 0.0 dB (index 160), 8677 is +0.5 dB (index 161)
        assert_eq!(mixer_value_to_db(8400), 0.0);   // closer to 8192
        assert_eq!(mixer_value_to_db(8500), 0.5);    // closer to 8677
    }

    #[test]
    fn mixer_value_round_trip_all_entries() {
        for i in 0..MIXER_TABLE_LEN {
            let db = (i as f64 - MIXER_BIAS as f64) / 2.0;
            let value = db_to_mixer_value(db);
            let db_back = mixer_value_to_db(value);
            // Multiple indices can map to the same value (e.g., indices 0-3 all -> 0).
            // The reverse lookup returns the dB for the first matching index.
            // So we verify the round-trip produces the same hardware value,
            // not necessarily the same dB.
            let value_back = db_to_mixer_value(db_back);
            assert_eq!(
                value, value_back,
                "round-trip failed at index {}: db={} -> value={} -> db_back={} -> value_back={}",
                i, db, value, db_back, value_back
            );
        }
    }
}
