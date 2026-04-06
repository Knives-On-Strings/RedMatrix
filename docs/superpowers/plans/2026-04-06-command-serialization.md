# Command Packet Serialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement typed command packet serialization and deserialization for the Scarlett2 USB protocol, enabling all device communication from Rust.

**Architecture:** A single module (`protocol/commands.rs`) containing: `PacketHeader` (16-byte LE wire format), `Request` enum (typed command variants), `Response` enum (typed response variants), `CommandError` (thiserror), `SequenceCounter`, `CommandRunner<T: UsbTransport>`, and validation/parsing functions. All serialization uses manual `to_le_bytes()` / `from_le_bytes()`.

**Tech Stack:** Rust, thiserror, existing `UsbTransport` trait and `MockTransport` from `protocol/transport.rs`, constants from `protocol/constants.rs`.

**Spec:** `specs/2026-04-06-command-serialization-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/src/protocol/commands.rs` | Rewrite | All types, serialization, parsing, validation, CommandRunner |
| `src-tauri/src/protocol/transport.rs` | Modify | Make `MockTransport` `pub(crate)` + add `Timeout` variant to `TransportError` |
| `src-tauri/src/protocol/constants.rs` | Modify | Add `MAX_PAYLOAD_SIZE` and `HEADER_SIZE` constants |

---

### Task 1: Expose MockTransport and add Timeout to TransportError

**Files:**
- Modify: `src-tauri/src/protocol/transport.rs`
- Modify: `src-tauri/src/protocol/constants.rs`

- [ ] **Step 1: Add Timeout variant to TransportError**

In `src-tauri/src/protocol/transport.rs`, add the `Timeout` variant. The existing `Timeout` variant is a message-less error. Replace it to be consistent and also add clarity:

```rust
#[derive(Error, Debug)]
pub enum TransportError {
    #[error("USB device not found")]
    DeviceNotFound,
    #[error("USB transfer failed: {0}")]
    TransferFailed(String),
    #[error("USB transfer timed out")]
    Timeout,
    #[error("device returned unexpected response")]
    UnexpectedResponse,
}
```

`Timeout` already exists — no change needed here. Good.

- [ ] **Step 2: Make MockTransport pub(crate)**

Move `MockTransport` out of the `#[cfg(test)] mod tests` block and into the module itself, gated with `#[cfg(test)]`. This makes it available to other test modules within the crate.

Replace the entire file `src-tauri/src/protocol/transport.rs` with:

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum TransportError {
    #[error("USB device not found")]
    DeviceNotFound,
    #[error("USB transfer failed: {0}")]
    TransferFailed(String),
    #[error("USB transfer timed out")]
    Timeout,
    #[error("device returned unexpected response")]
    UnexpectedResponse,
}

/// Trait for USB control transfers to a Scarlett2 device.
pub trait UsbTransport: Send + Sync {
    fn transfer(&mut self, data: &[u8]) -> Result<Vec<u8>, TransportError>;
}

/// Mock transport for testing. Returns pre-configured responses in order.
#[cfg(test)]
pub(crate) mod mock {
    use super::*;
    use std::collections::VecDeque;

    pub struct MockTransport {
        responses: VecDeque<Result<Vec<u8>, TransportError>>,
        pub sent: Vec<Vec<u8>>,
    }

    impl MockTransport {
        pub fn new() -> Self {
            Self {
                responses: VecDeque::new(),
                sent: Vec::new(),
            }
        }

        pub fn push_response(&mut self, response: Vec<u8>) {
            self.responses.push_back(Ok(response));
        }

        pub fn push_error(&mut self, error: TransportError) {
            self.responses.push_back(Err(error));
        }
    }

    impl UsbTransport for MockTransport {
        fn transfer(&mut self, data: &[u8]) -> Result<Vec<u8>, TransportError> {
            self.sent.push(data.to_vec());
            self.responses
                .pop_front()
                .unwrap_or(Err(TransportError::UnexpectedResponse))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::mock::MockTransport;

    #[test]
    fn mock_transport_records_sent_data() {
        let mut transport = MockTransport::new();
        transport.push_response(vec![0x01, 0x02]);

        let result = transport.transfer(&[0xAA, 0xBB]);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), vec![0x01, 0x02]);
        assert_eq!(transport.sent, vec![vec![0xAA, 0xBB]]);
    }

    #[test]
    fn mock_transport_returns_error_when_no_responses() {
        let mut transport = MockTransport::new();
        let result = transport.transfer(&[0x00]);
        assert!(result.is_err());
    }

    #[test]
    fn mock_transport_push_error() {
        let mut transport = MockTransport::new();
        transport.push_error(TransportError::Timeout);
        let result = transport.transfer(&[0x00]);
        assert!(matches!(result, Err(TransportError::Timeout)));
    }
}
```

- [ ] **Step 3: Add HEADER_SIZE and MAX_PAYLOAD_SIZE to constants.rs**

Add to the end of `src-tauri/src/protocol/constants.rs` (before the `#[cfg(test)]` block):

```rust
// -- Packet Constants --

/// Size of the packet header in bytes.
pub const HEADER_SIZE: usize = 16;

/// Maximum payload size for a single command/response.
pub const MAX_PAYLOAD_SIZE: usize = 1024;
```

Add a test inside the existing `mod tests`:

```rust
    #[test]
    fn packet_constants() {
        assert_eq!(HEADER_SIZE, 16);
        assert_eq!(MAX_PAYLOAD_SIZE, 1024);
    }
```

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `cd src-tauri && cargo test`

Expected: All 17 tests pass (14 existing + 1 new constant test + 1 new mock_transport_push_error + the existing 2 mock tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/protocol/transport.rs src-tauri/src/protocol/constants.rs
git commit -m "refactor: expose MockTransport as pub(crate), add packet constants"
```

---

### Task 2: CommandError and PacketHeader

**Files:**
- Modify: `src-tauri/src/protocol/commands.rs`

- [ ] **Step 1: Write failing test for PacketHeader round-trip**

Replace the entire contents of `src-tauri/src/protocol/commands.rs` with:

```rust
use super::constants::*;
use super::transport::TransportError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CommandError {
    #[error("buffer too short: expected {expected} bytes, got {got}")]
    BufferTooShort { expected: usize, got: usize },
    #[error("sequence mismatch: expected {expected}, got {got}")]
    SequenceMismatch { expected: u16, got: u16 },
    #[error("command mismatch: expected 0x{expected:08x}, got 0x{got:08x}")]
    CommandMismatch { expected: u32, got: u32 },
    #[error("device error: code {code}")]
    DeviceError { code: u32 },
    #[error("invalid padding: 0x{value:08x}")]
    InvalidPadding { value: u32 },
    #[error("unknown command: 0x{cmd_id:08x}")]
    UnknownCommand { cmd_id: u32 },
    #[error("payload too large: {size} bytes (max {max})")]
    PayloadTooLarge { size: usize, max: usize },
    #[error("command timed out waiting for device ACK")]
    Timeout,
    #[error("USB transport error")]
    Transport {
        #[from]
        source: TransportError,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packet_header_round_trip() {
        let header = PacketHeader {
            cmd: CMD_GET_SYNC,
            size: 0,
            seq: 42,
            error: 0,
            pad: 0,
        };
        let bytes = header.to_bytes();
        let parsed = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(parsed.cmd, CMD_GET_SYNC);
        assert_eq!(parsed.size, 0);
        assert_eq!(parsed.seq, 42);
        assert_eq!(parsed.error, 0);
        assert_eq!(parsed.pad, 0);
    }

    #[test]
    fn packet_header_from_short_buffer() {
        let buf = [0u8; 10];
        let result = PacketHeader::from_bytes(&buf);
        assert!(matches!(
            result,
            Err(CommandError::BufferTooShort { expected: 16, got: 10 })
        ));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: FAIL — `PacketHeader` not found.

- [ ] **Step 3: Implement PacketHeader**

Add above the `#[cfg(test)]` block in `commands.rs`:

```rust
#[derive(Debug, Clone, PartialEq)]
pub struct PacketHeader {
    pub cmd: u32,
    pub size: u16,
    pub seq: u16,
    pub error: u32,
    pub pad: u32,
}

impl PacketHeader {
    pub fn to_bytes(&self) -> [u8; HEADER_SIZE] {
        let mut buf = [0u8; HEADER_SIZE];
        buf[0..4].copy_from_slice(&self.cmd.to_le_bytes());
        buf[4..6].copy_from_slice(&self.size.to_le_bytes());
        buf[6..8].copy_from_slice(&self.seq.to_le_bytes());
        buf[8..12].copy_from_slice(&self.error.to_le_bytes());
        buf[12..16].copy_from_slice(&self.pad.to_le_bytes());
        buf
    }

    pub fn from_bytes(buf: &[u8]) -> Result<Self, CommandError> {
        if buf.len() < HEADER_SIZE {
            return Err(CommandError::BufferTooShort {
                expected: HEADER_SIZE,
                got: buf.len(),
            });
        }
        Ok(Self {
            cmd: u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]),
            size: u16::from_le_bytes([buf[4], buf[5]]),
            seq: u16::from_le_bytes([buf[6], buf[7]]),
            error: u32::from_le_bytes([buf[8], buf[9], buf[10], buf[11]]),
            pad: u32::from_le_bytes([buf[12], buf[13], buf[14], buf[15]]),
        })
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/protocol/commands.rs
git commit -m "feat: add CommandError and PacketHeader with LE serialization"
```

---

### Task 3: SequenceCounter

**Files:**
- Modify: `src-tauri/src/protocol/commands.rs`

- [ ] **Step 1: Write failing tests for SequenceCounter**

Add to the `mod tests` block in `commands.rs`:

```rust
    #[test]
    fn sequence_counter_increments() {
        let mut seq = SequenceCounter::new();
        assert_eq!(seq.next(), 0);
        assert_eq!(seq.next(), 1);
        assert_eq!(seq.next(), 2);
    }

    #[test]
    fn sequence_counter_wraps_at_u16_max() {
        let mut seq = SequenceCounter::new();
        seq.reset(u16::MAX);
        assert_eq!(seq.next(), u16::MAX);
        assert_eq!(seq.next(), 0); // wrapped
    }

    #[test]
    fn sequence_counter_reset() {
        let mut seq = SequenceCounter::new();
        seq.next(); // 0
        seq.next(); // 1
        seq.reset(1);
        assert_eq!(seq.next(), 1);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: FAIL — `SequenceCounter` not found.

- [ ] **Step 3: Implement SequenceCounter**

Add above the `#[cfg(test)]` block in `commands.rs`:

```rust
pub struct SequenceCounter {
    seq: u16,
}

impl SequenceCounter {
    pub fn new() -> Self {
        Self { seq: 0 }
    }

    pub fn next(&mut self) -> u16 {
        let current = self.seq;
        self.seq = self.seq.wrapping_add(1);
        current
    }

    pub fn reset(&mut self, val: u16) {
        self.seq = val;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/protocol/commands.rs
git commit -m "feat: add SequenceCounter with wrapping increment"
```

---

### Task 4: Request enum and serialization

**Files:**
- Modify: `src-tauri/src/protocol/commands.rs`

- [ ] **Step 1: Write failing tests for Request serialization**

Add to the `mod tests` block in `commands.rs`:

```rust
    #[test]
    fn request_init1_serialization() {
        let bytes = serialize_request(&Request::Init1, 1);
        assert_eq!(bytes.len(), HEADER_SIZE); // no payload
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_INIT_1);
        assert_eq!(header.size, 0);
        assert_eq!(header.seq, 1);
        assert_eq!(header.error, 0);
        assert_eq!(header.pad, 0);
    }

    #[test]
    fn request_init2_serialization() {
        let bytes = serialize_request(&Request::Init2, 1);
        assert_eq!(bytes.len(), HEADER_SIZE);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_INIT_2);
        assert_eq!(header.seq, 1);
    }

    #[test]
    fn request_get_sync_serialization() {
        let bytes = serialize_request(&Request::GetSync, 5);
        assert_eq!(bytes.len(), HEADER_SIZE);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_GET_SYNC);
        assert_eq!(header.seq, 5);
    }

    #[test]
    fn request_get_meter_serialization() {
        let bytes = serialize_request(&Request::GetMeter, 3);
        assert_eq!(bytes.len(), HEADER_SIZE + 4); // 4-byte magic payload
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_GET_METER);
        assert_eq!(header.size, 4);
        // magic value = 1, little-endian
        assert_eq!(&bytes[16..20], &1u32.to_le_bytes());
    }

    #[test]
    fn request_get_data_serialization() {
        let bytes = serialize_request(
            &Request::GetData { offset: 0x31, size: 64 },
            10,
        );
        assert_eq!(bytes.len(), HEADER_SIZE + 8);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_GET_DATA);
        assert_eq!(header.size, 8);
        assert_eq!(&bytes[16..20], &0x31u32.to_le_bytes());
        assert_eq!(&bytes[20..24], &64u32.to_le_bytes());
    }

    #[test]
    fn request_set_mix_serialization() {
        let bytes = serialize_request(
            &Request::SetMix { mix_num: 2, channel: 5, gain: 8192 },
            7,
        );
        assert_eq!(bytes.len(), HEADER_SIZE + 6);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_SET_MIX);
        assert_eq!(header.size, 6);
        assert_eq!(&bytes[16..18], &2u16.to_le_bytes());
        assert_eq!(&bytes[18..20], &5u16.to_le_bytes());
        assert_eq!(&bytes[20..22], &8192u16.to_le_bytes());
    }

    #[test]
    fn request_set_mux_serialization() {
        let entries = vec![0x08000001, 0x08000002];
        let bytes = serialize_request(&Request::SetMux { entries }, 4);
        assert_eq!(bytes.len(), HEADER_SIZE + 8); // 2 x u32
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_SET_MUX);
        assert_eq!(header.size, 8);
        assert_eq!(&bytes[16..20], &0x08000001u32.to_le_bytes());
        assert_eq!(&bytes[20..24], &0x08000002u32.to_le_bytes());
    }

    #[test]
    fn request_data_cmd_serialization() {
        let bytes = serialize_request(&Request::DataCmd { activate: 6 }, 9);
        assert_eq!(bytes.len(), HEADER_SIZE + 4);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_DATA_CMD);
        assert_eq!(header.size, 4);
        assert_eq!(&bytes[16..20], &6u32.to_le_bytes());
    }

    #[test]
    fn request_set_data_payload_too_large() {
        let data = vec![0u8; MAX_PAYLOAD_SIZE + 1];
        let result = try_serialize_request(
            &Request::SetData { offset: 0, data },
            1,
        );
        assert!(matches!(result, Err(CommandError::PayloadTooLarge { .. })));
    }

    #[test]
    fn request_get_data_size_too_large() {
        let result = try_serialize_request(
            &Request::GetData { offset: 0, size: (MAX_PAYLOAD_SIZE + 1) as u32 },
            1,
        );
        assert!(matches!(result, Err(CommandError::PayloadTooLarge { .. })));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: FAIL — `Request`, `serialize_request`, `try_serialize_request` not found.

- [ ] **Step 3: Implement Request enum and serialization**

Add above `SequenceCounter` in `commands.rs`:

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum Request {
    Init1,
    Init2,
    GetMeter,
    GetMix,
    SetMix { mix_num: u16, channel: u16, gain: u16 },
    GetMux,
    SetMux { entries: Vec<u32> },
    GetSync,
    GetData { offset: u32, size: u32 },
    SetData { offset: u32, data: Vec<u8> },
    DataCmd { activate: u32 },
}

impl Request {
    pub fn cmd_id(&self) -> u32 {
        match self {
            Request::Init1 => CMD_INIT_1,
            Request::Init2 => CMD_INIT_2,
            Request::GetMeter => CMD_GET_METER,
            Request::GetMix => CMD_GET_MIX,
            Request::SetMix { .. } => CMD_SET_MIX,
            Request::GetMux => CMD_GET_MUX,
            Request::SetMux { .. } => CMD_SET_MUX,
            Request::GetSync => CMD_GET_SYNC,
            Request::GetData { .. } => CMD_GET_DATA,
            Request::SetData { .. } => CMD_SET_DATA,
            Request::DataCmd { .. } => CMD_DATA_CMD,
        }
    }

    pub fn payload(&self) -> Vec<u8> {
        match self {
            Request::Init1 | Request::Init2 | Request::GetMix
            | Request::GetMux | Request::GetSync => vec![],
            Request::GetMeter => 1u32.to_le_bytes().to_vec(),
            Request::SetMix { mix_num, channel, gain } => {
                let mut buf = Vec::with_capacity(6);
                buf.extend_from_slice(&mix_num.to_le_bytes());
                buf.extend_from_slice(&channel.to_le_bytes());
                buf.extend_from_slice(&gain.to_le_bytes());
                buf
            }
            Request::SetMux { entries } => {
                let mut buf = Vec::with_capacity(entries.len() * 4);
                for entry in entries {
                    buf.extend_from_slice(&entry.to_le_bytes());
                }
                buf
            }
            Request::GetData { offset, size } => {
                let mut buf = Vec::with_capacity(8);
                buf.extend_from_slice(&offset.to_le_bytes());
                buf.extend_from_slice(&size.to_le_bytes());
                buf
            }
            Request::SetData { offset, data } => {
                let mut buf = Vec::with_capacity(4 + data.len());
                buf.extend_from_slice(&offset.to_le_bytes());
                buf.extend_from_slice(data);
                buf
            }
            Request::DataCmd { activate } => activate.to_le_bytes().to_vec(),
        }
    }
}

/// Serialize a request into a full packet (header + payload).
/// Panics if payload exceeds MAX_PAYLOAD_SIZE. Use `try_serialize_request` for fallible version.
pub fn serialize_request(req: &Request, seq: u16) -> Vec<u8> {
    try_serialize_request(req, seq).expect("payload size within bounds")
}

/// Fallible version of serialize_request.
pub fn try_serialize_request(req: &Request, seq: u16) -> Result<Vec<u8>, CommandError> {
    // Validate GetData size parameter
    if let Request::GetData { size, .. } = req {
        if *size as usize > MAX_PAYLOAD_SIZE {
            return Err(CommandError::PayloadTooLarge {
                size: *size as usize,
                max: MAX_PAYLOAD_SIZE,
            });
        }
    }

    let payload = req.payload();
    if payload.len() > MAX_PAYLOAD_SIZE {
        return Err(CommandError::PayloadTooLarge {
            size: payload.len(),
            max: MAX_PAYLOAD_SIZE,
        });
    }

    let header = PacketHeader {
        cmd: req.cmd_id(),
        size: payload.len() as u16,
        seq,
        error: 0,
        pad: 0,
    };

    let mut packet = Vec::with_capacity(HEADER_SIZE + payload.len());
    packet.extend_from_slice(&header.to_bytes());
    packet.extend_from_slice(&payload);
    Ok(packet)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: 15 tests pass (2 header + 3 seq + 10 request).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/protocol/commands.rs
git commit -m "feat: add Request enum with typed serialization"
```

---

### Task 5: Response validation

**Files:**
- Modify: `src-tauri/src/protocol/commands.rs`

- [ ] **Step 1: Write failing tests for validate_response**

Add to the `mod tests` block:

```rust
    fn make_header(cmd: u32, seq: u16) -> PacketHeader {
        PacketHeader { cmd, size: 0, seq, error: 0, pad: 0 }
    }

    #[test]
    fn validate_response_matching_cmd_seq() {
        let req = make_header(CMD_GET_SYNC, 5);
        let resp = make_header(CMD_GET_SYNC, 5);
        assert!(validate_response(&req, &resp).is_ok());
    }

    #[test]
    fn validate_response_mismatched_cmd() {
        let req = make_header(CMD_GET_SYNC, 5);
        let resp = make_header(CMD_GET_MIX, 5);
        assert!(matches!(
            validate_response(&req, &resp),
            Err(CommandError::CommandMismatch { expected, got })
            if expected == CMD_GET_SYNC && got == CMD_GET_MIX
        ));
    }

    #[test]
    fn validate_response_mismatched_seq() {
        let req = make_header(CMD_GET_SYNC, 5);
        let resp = make_header(CMD_GET_SYNC, 6);
        assert!(matches!(
            validate_response(&req, &resp),
            Err(CommandError::SequenceMismatch { expected: 5, got: 6 })
        ));
    }

    #[test]
    fn validate_response_init_special_case() {
        // During init: req seq=1, resp seq=0 is valid
        let req = make_header(CMD_INIT_1, 1);
        let resp = make_header(CMD_INIT_1, 0);
        assert!(validate_response(&req, &resp).is_ok());
    }

    #[test]
    fn validate_response_device_error() {
        let req = make_header(CMD_GET_SYNC, 5);
        let mut resp = make_header(CMD_GET_SYNC, 5);
        resp.error = 42;
        assert!(matches!(
            validate_response(&req, &resp),
            Err(CommandError::DeviceError { code: 42 })
        ));
    }

    #[test]
    fn validate_response_non_zero_pad() {
        let req = make_header(CMD_GET_SYNC, 5);
        let mut resp = make_header(CMD_GET_SYNC, 5);
        resp.pad = 0xDEAD;
        assert!(matches!(
            validate_response(&req, &resp),
            Err(CommandError::InvalidPadding { value: 0xDEAD })
        ));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: FAIL — `validate_response` not found.

- [ ] **Step 3: Implement validate_response**

Add above the `#[cfg(test)]` block:

```rust
pub fn validate_response(
    req_header: &PacketHeader,
    resp_header: &PacketHeader,
) -> Result<(), CommandError> {
    if resp_header.cmd != req_header.cmd {
        return Err(CommandError::CommandMismatch {
            expected: req_header.cmd,
            got: resp_header.cmd,
        });
    }

    // Special case: during init, req seq=1 and resp seq=0 is valid
    let seq_ok = resp_header.seq == req_header.seq
        || (req_header.seq == 1 && resp_header.seq == 0);
    if !seq_ok {
        return Err(CommandError::SequenceMismatch {
            expected: req_header.seq,
            got: resp_header.seq,
        });
    }

    if resp_header.error != 0 {
        return Err(CommandError::DeviceError {
            code: resp_header.error,
        });
    }

    if resp_header.pad != 0 {
        return Err(CommandError::InvalidPadding {
            value: resp_header.pad,
        });
    }

    Ok(())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: 21 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/protocol/commands.rs
git commit -m "feat: add response header validation with init special case"
```

---

### Task 6: Response parsing

**Files:**
- Modify: `src-tauri/src/protocol/commands.rs`

- [ ] **Step 1: Write failing tests for parse_response**

Add to the `mod tests` block:

```rust
    #[test]
    fn parse_response_init2_firmware_version() {
        // 84 bytes, firmware version at offset 8..12
        let mut data = vec![0u8; 84];
        // firmware_version = 1083 (0x0000043B) at bytes 8..12
        data[8..12].copy_from_slice(&1083u32.to_le_bytes());
        let resp = parse_response(CMD_INIT_2, &data).unwrap();
        assert!(matches!(resp, Response::Init2 { firmware_version: 1083 }));
    }

    #[test]
    fn parse_response_sync_status() {
        let data = 1u32.to_le_bytes();
        let resp = parse_response(CMD_GET_SYNC, &data).unwrap();
        assert!(matches!(resp, Response::Sync { status: 1 }));
    }

    #[test]
    fn parse_response_meter_levels() {
        // 4 meter values: 100, 200, 300, 400
        let mut data = Vec::new();
        for val in [100u16, 200, 300, 400] {
            data.extend_from_slice(&val.to_le_bytes());
        }
        let resp = parse_response(CMD_GET_METER, &data).unwrap();
        match resp {
            Response::Meter { levels } => assert_eq!(levels, vec![100, 200, 300, 400]),
            _ => panic!("expected Meter response"),
        }
    }

    #[test]
    fn parse_response_data_passthrough() {
        let data = vec![0xAA, 0xBB, 0xCC];
        let resp = parse_response(CMD_GET_DATA, &data).unwrap();
        match resp {
            Response::Data { data: d } => assert_eq!(d, vec![0xAA, 0xBB, 0xCC]),
            _ => panic!("expected Data response"),
        }
    }

    #[test]
    fn parse_response_ack_for_set_commands() {
        let resp = parse_response(CMD_SET_MIX, &[]).unwrap();
        assert!(matches!(resp, Response::Ack));
    }

    #[test]
    fn parse_response_mix_gains() {
        let mut data = Vec::new();
        for val in [8192u16, 0, 4105] {
            data.extend_from_slice(&val.to_le_bytes());
        }
        let resp = parse_response(CMD_GET_MIX, &data).unwrap();
        match resp {
            Response::Mix { gains } => assert_eq!(gains, vec![8192, 0, 4105]),
            _ => panic!("expected Mix response"),
        }
    }

    #[test]
    fn parse_response_mux_entries() {
        let mut data = Vec::new();
        for val in [0x08000001u32, 0x06000003] {
            data.extend_from_slice(&val.to_le_bytes());
        }
        let resp = parse_response(CMD_GET_MUX, &data).unwrap();
        match resp {
            Response::Mux { entries } => assert_eq!(entries, vec![0x08000001, 0x06000003]),
            _ => panic!("expected Mux response"),
        }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: FAIL — `Response`, `parse_response` not found.

- [ ] **Step 3: Implement Response enum and parse_response**

Add above `validate_response` in `commands.rs`:

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum Response {
    Ack,
    Init2 { firmware_version: u32 },
    Meter { levels: Vec<u16> },
    Mix { gains: Vec<u16> },
    Mux { entries: Vec<u32> },
    Sync { status: u32 },
    Data { data: Vec<u8> },
}

pub fn parse_response(cmd_id: u32, data: &[u8]) -> Result<Response, CommandError> {
    match cmd_id {
        CMD_INIT_1 | CMD_SET_MIX | CMD_SET_MUX | CMD_SET_DATA | CMD_DATA_CMD => {
            Ok(Response::Ack)
        }
        CMD_INIT_2 => {
            if data.len() < 12 {
                return Err(CommandError::BufferTooShort {
                    expected: 12,
                    got: data.len(),
                });
            }
            let firmware_version =
                u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
            Ok(Response::Init2 { firmware_version })
        }
        CMD_GET_METER => {
            let levels = data
                .chunks_exact(2)
                .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                .collect();
            Ok(Response::Meter { levels })
        }
        CMD_GET_MIX => {
            let gains = data
                .chunks_exact(2)
                .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                .collect();
            Ok(Response::Mix { gains })
        }
        CMD_GET_MUX => {
            let entries = data
                .chunks_exact(4)
                .map(|chunk| u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();
            Ok(Response::Mux { entries })
        }
        CMD_GET_SYNC => {
            if data.len() < 4 {
                return Err(CommandError::BufferTooShort {
                    expected: 4,
                    got: data.len(),
                });
            }
            let status = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            Ok(Response::Sync { status })
        }
        CMD_GET_DATA => {
            Ok(Response::Data { data: data.to_vec() })
        }
        _ => Err(CommandError::UnknownCommand { cmd_id }),
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: 28 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/protocol/commands.rs
git commit -m "feat: add Response enum with parse_response dispatcher"
```

---

### Task 7: CommandRunner

**Files:**
- Modify: `src-tauri/src/protocol/commands.rs`

- [ ] **Step 1: Write failing tests for CommandRunner**

Add to the `mod tests` block:

```rust
    use super::super::transport::mock::MockTransport;

    /// Helper: build a mock response packet (header + payload).
    fn mock_response_packet(cmd: u32, seq: u16, payload: &[u8]) -> Vec<u8> {
        let header = PacketHeader {
            cmd,
            size: payload.len() as u16,
            seq,
            error: 0,
            pad: 0,
        };
        let mut packet = Vec::with_capacity(HEADER_SIZE + payload.len());
        packet.extend_from_slice(&header.to_bytes());
        packet.extend_from_slice(payload);
        packet
    }

    #[test]
    fn command_runner_execute_round_trip() {
        let mut transport = MockTransport::new();
        // GetSync: no request payload, response has 4-byte u32 status
        let resp_packet = mock_response_packet(CMD_GET_SYNC, 0, &1u32.to_le_bytes());
        transport.push_response(resp_packet);

        let mut runner = CommandRunner::new(transport);
        let response = runner.execute(Request::GetSync).unwrap();
        assert!(matches!(response, Response::Sync { status: 1 }));
    }

    #[test]
    fn command_runner_execute_timeout() {
        let mut transport = MockTransport::new();
        transport.push_error(TransportError::Timeout);

        let mut runner = CommandRunner::new(transport);
        let result = runner.execute(Request::GetSync);
        assert!(matches!(result, Err(CommandError::Timeout)));
    }

    #[test]
    fn command_runner_initialize_sequence() {
        let mut transport = MockTransport::new();

        // INIT_1 response: Ack (header only, no payload)
        let init1_resp = mock_response_packet(CMD_INIT_1, 0, &[]); // seq 0 for init special case
        transport.push_response(init1_resp);

        // INIT_2 response: 84 bytes, firmware version at offset 8..12
        let mut init2_payload = vec![0u8; 84];
        init2_payload[8..12].copy_from_slice(&1083u32.to_le_bytes());
        let init2_resp = mock_response_packet(CMD_INIT_2, 0, &init2_payload);
        transport.push_response(init2_resp);

        let mut runner = CommandRunner::new(transport);
        let firmware_version = runner.initialize().unwrap();
        assert_eq!(firmware_version, 1083);

        // Verify the sent packets
        let transport = runner.transport();
        // First packet: INIT_1 with seq=1
        let init1_header = PacketHeader::from_bytes(&transport.sent[0]).unwrap();
        assert_eq!(init1_header.cmd, CMD_INIT_1);
        assert_eq!(init1_header.seq, 1);
        // Second packet: INIT_2 with seq=1 (reset)
        let init2_header = PacketHeader::from_bytes(&transport.sent[1]).unwrap();
        assert_eq!(init2_header.cmd, CMD_INIT_2);
        assert_eq!(init2_header.seq, 1);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: FAIL — `CommandRunner` not found.

- [ ] **Step 3: Implement CommandRunner**

Add above the `#[cfg(test)]` block:

```rust
use super::transport::{TransportError, UsbTransport};

pub struct CommandRunner<T: UsbTransport> {
    transport: T,
    seq: SequenceCounter,
}

impl<T: UsbTransport> CommandRunner<T> {
    pub fn new(transport: T) -> Self {
        Self {
            transport,
            seq: SequenceCounter::new(),
        }
    }

    pub fn execute(&mut self, request: Request) -> Result<Response, CommandError> {
        let seq = self.seq.next();
        let packet = try_serialize_request(&request, seq)?;

        let resp_bytes = self.transport.transfer(&packet).map_err(|e| match e {
            TransportError::Timeout => CommandError::Timeout,
            other => CommandError::Transport { source: other },
        })?;

        let resp_header = PacketHeader::from_bytes(&resp_bytes)?;
        let req_header = PacketHeader {
            cmd: request.cmd_id(),
            size: 0, // not used in validation
            seq,
            error: 0,
            pad: 0,
        };

        validate_response(&req_header, &resp_header)?;

        let payload = if resp_bytes.len() > HEADER_SIZE {
            &resp_bytes[HEADER_SIZE..]
        } else {
            &[]
        };

        parse_response(request.cmd_id(), payload)
    }

    pub fn initialize(&mut self) -> Result<u32, CommandError> {
        // INIT_1: reset seq to 1
        self.seq.reset(1);
        self.execute(Request::Init1)?;

        // INIT_2: reset seq to 1 again
        self.seq.reset(1);
        let response = self.execute(Request::Init2)?;

        match response {
            Response::Init2 { firmware_version } => Ok(firmware_version),
            _ => Err(CommandError::UnknownCommand { cmd_id: CMD_INIT_2 }),
        }
    }

    /// Access the underlying transport (for test assertions).
    pub fn transport(&self) -> &T {
        &self.transport
    }
}
```

Also, remove the duplicate `use super::transport::TransportError;` at the top of the file. The import block at the top of `commands.rs` should be:

```rust
use super::constants::*;
use super::transport::{TransportError, UsbTransport};
use thiserror::Error;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol::commands`

Expected: 31 tests pass.

- [ ] **Step 5: Run full test suite**

Run: `cd src-tauri && cargo test`

Expected: All tests pass across all modules.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/protocol/commands.rs
git commit -m "feat: add CommandRunner with execute and initialize"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `cd src-tauri && cargo test 2>&1`

Expected: All tests pass. Count should be ~34 total (17 existing + ~17 new across the commands module, adjusted for any that were in the original placeholder).

- [ ] **Step 2: Run frontend tests too**

Run: `cd S:/Dev/audio/redmatrix && npm test`

Expected: 1 test passes (App smoke test).

- [ ] **Step 3: Run clippy for lint warnings**

Run: `cd src-tauri && cargo clippy -- -D warnings 2>&1`

Fix any warnings that appear.

- [ ] **Step 4: Commit any clippy fixes**

```bash
git add -A
git commit -m "fix: address clippy warnings"
```
