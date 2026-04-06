/// Command serialization and deserialization.
///
/// Packet format (from Linux kernel driver):
/// - Bytes 0-3: packet type (request=0, response=1, notification=2)
/// - Bytes 4-5: sequence number (u16, incremented per request)
/// - Bytes 6-9: command ID (u32)
/// - Bytes 10+: payload (variable length, command-specific)
///
/// Response packets mirror the request sequence number for matching.

#[cfg(test)]
mod tests {
    #[test]
    fn placeholder() {
        // Real command tests will be added in Phase 1 per TDD methodology.
        // Each command gets a test BEFORE the serialization is implemented.
    }
}
