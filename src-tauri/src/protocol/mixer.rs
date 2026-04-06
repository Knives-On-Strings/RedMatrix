/// Mixer gain encoding and decoding.
///
/// The Scarlett2 protocol uses a non-linear lookup table for mixer gain values.
/// Range: -80 dB to +6 dB in 0.5 dB steps (173 entries).
/// The hardware value is an index into this table.
///
/// The lookup table is defined in the Linux kernel driver
/// (`scarlett2_mixer_values` array in mixer_scarlett_gen2.c).

#[cfg(test)]
mod tests {
    #[test]
    fn placeholder() {
        // Real mixer encoding tests will be added in Phase 1 per TDD methodology.
        // Test: dB value → hardware value → dB value roundtrip.
    }
}
