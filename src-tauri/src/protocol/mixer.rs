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
}
