# Command Packet Serialization Design

## Context

RedMatrix needs to serialize and deserialize USB command packets for communication with Focusrite Scarlett Gen 2/3 and Clarett USB/+ audio interfaces. The protocol is reverse-engineered from Geoffrey Bennett's Linux kernel driver (`mixer_scarlett2.c`). This is the foundation layer — everything else (state management, UI, remote control) depends on correctly encoding and decoding these packets.

No Wireshark captures exist yet. The kernel driver source is the sole ground truth.

## Approach

Typed command enums with per-variant serialize/deserialize. Each command is a Rust enum variant with typed payload fields. Compile-time type safety prevents malformed commands from reaching the device.

## Wire Format

### Packet Header (16 bytes, all little-endian)

| Offset | Size | Field   | Description                        |
|--------|------|---------|------------------------------------|
| 0      | 4    | `cmd`   | Command ID                         |
| 4      | 2    | `size`  | Payload size in bytes (data only)  |
| 6      | 2    | `seq`   | Sequence number                    |
| 8      | 4    | `error` | Error code, 0 = success            |
| 12     | 4    | `pad`   | Padding, must be 0                 |

Total packet on wire: 16 + `size` bytes.

Source: `struct scarlett2_usb_packet` in `mixer_scarlett2.c`.

### USB Control Transfer Details

- **TX (host → device):** `bRequest = 2` (CMD_REQ), endpoint 0, `USB_RECIP_INTERFACE | USB_TYPE_CLASS | USB_DIR_OUT`
- **RX (device → host):** `bRequest = 3` (CMD_RESP), endpoint 0, `USB_RECIP_INTERFACE | USB_TYPE_CLASS | USB_DIR_IN`
- **Init step 0 RX:** `bRequest = 0` (CMD_INIT), reads 24 bytes (discarded)
- **wIndex** = vendor-specific interface number (bInterfaceClass = 255)

### Communication Flow

```
Host                              Device
  |                                  |
  |-- Control OUT (bReq=2) --------->|  (header + payload)
  |                                  |
  |<-- Interrupt IN (8 bytes) -------|  (notification with ACK bit 0x01)
  |                                  |
  |-- Control IN (bReq=3) ---------->|  (read response)
  |<---------------------------------|  (header + payload, matching cmd & seq)
```

The host must wait for the ACK notification on the interrupt endpoint before reading the response.

## Data Structures

### PacketHeader

```rust
pub struct PacketHeader {
    pub cmd: u32,
    pub size: u16,
    pub seq: u16,
    pub error: u32,
    pub pad: u32,
}
```

Methods:
- `to_bytes(&self) -> [u8; 16]` — serialize to LE wire format
- `from_bytes(buf: &[u8]) -> Result<Self, CommandError>` — deserialize from LE wire format, requires at least 16 bytes

### Request

```rust
pub enum Request {
    Init1,
    Init2,
    GetMeter,  // payload: LE u32 magic value = 1
    GetMix,
    SetMix { mix_num: u16, channel: u16, gain: u16 },
    GetMux,
    SetMux { entries: Vec<u32> },
    GetSync,
    GetData { offset: u32, size: u32 },
    SetData { offset: u32, data: Vec<u8> },
    DataCmd { activate: u32 },
}
```

Methods:
- `cmd_id(&self) -> u32` — returns the command ID constant
- `payload(&self) -> Vec<u8>` — serializes the variant's fields to LE bytes

Top-level function:
- `serialize_request(req: &Request, seq: u16) -> Vec<u8>` — builds full packet (header + payload)

### Response

```rust
pub enum Response {
    Ack,
    Init2 { firmware_version: u32 },
    Meter { levels: Vec<u16> },
    Mix { gains: Vec<u16> },
    Mux { entries: Vec<u32> },
    Sync { status: u32 },
    Data { data: Vec<u8> },
}
```

Top-level function:
- `parse_response(cmd_id: u32, data: &[u8]) -> Result<Response, CommandError>` — dispatches on cmd_id, parses payload bytes into the correct variant

### CommandError

```rust
pub enum CommandError {
    BufferTooShort { expected: usize, got: usize },
    SequenceMismatch { expected: u16, got: u16 },
    CommandMismatch { expected: u32, got: u32 },
    DeviceError { code: u32 },
    InvalidPadding { value: u32 },
    UnknownCommand { cmd_id: u32 },
    PayloadTooLarge { size: usize, max: usize },
    Timeout,
    Transport { source: TransportError },
}
```

Uses `thiserror` for Display impls.

`Timeout` is distinct from `Transport` — it means the device is still present but didn't ACK the command (retry may help), whereas `Transport` means the USB link itself failed (device unplugged, driver error).

### Response Validation

```rust
pub fn validate_response(
    req_header: &PacketHeader,
    resp_header: &PacketHeader,
) -> Result<(), CommandError>
```

Checks:
1. `resp.cmd == req.cmd`
2. `resp.seq == req.seq` (exception: req seq=1, resp seq=0 during init)
3. `resp.error == 0`
4. `resp.pad == 0`

### SequenceCounter

```rust
pub struct SequenceCounter {
    seq: u16,
}
```

Methods:
- `new() -> Self` — starts at 0
- `next(&mut self) -> u16` — returns current value and increments (wraps at u16::MAX)
- `reset(&mut self, val: u16)` — for init sequence (set to 1 before INIT_1 and INIT_2)

### CommandRunner

```rust
pub struct CommandRunner<T: UsbTransport> {
    transport: T,
    seq: SequenceCounter,
}
```

Methods:
- `new(transport: T) -> Self`
- `execute(&mut self, request: Request) -> Result<Response, CommandError>` — serializes request, calls transport, validates response header, parses response payload

The `execute` method maps `TransportError` into `CommandError` at the boundary.

## Initialization Sequence

The init sequence has special handling:

1. **Init step 0:** RX with `bRequest=0`, read 24 bytes, discard. (Handled at transport level, not by CommandRunner.)
2. **INIT_1:** Reset seq to 1. Send `Request::Init1`. Response has no payload → `Response::Ack`.
3. **INIT_2:** Reset seq to 1 again. Send `Request::Init2`. Response has 84 bytes → `Response::Init2 { firmware_version }` (LE u32 at response data bytes 8..12).

`CommandRunner` will have an `initialize(&mut self) -> Result<u32, CommandError>` method that runs this sequence and returns the firmware version.

## Payload Size Limit

The `size` field in the header is `u16`, giving a theoretical max of 65535 bytes. In practice, USB control transfers and device firmware impose lower limits. We define `MAX_PAYLOAD_SIZE: usize = 1024` as a conservative bound — the largest real payload (GET_MUX response for 18i20 at 48kHz) is well under this. `serialize_request` and `parse_response` return `CommandError::PayloadTooLarge` if the payload exceeds this limit.

## Serialization Strategy

Manual `to_le_bytes()` / `from_le_bytes()` with explicit slice indexing. No external crates (zerocopy, bytemuck). For a 16-byte header and small payloads, manual LE conversion is trivial, explicit, and dependency-free.

## Metering Allocation Note

`Response::Meter { levels: Vec<u16> }` allocates on every parse. At 60Hz polling this is ~6KB/sec of small allocations — negligible. If profiling shows this matters, the fix is a caller-provided `&mut [u16]` buffer, not lifetimes on `Response`. Deferred until we have real metering running.

## File Location

All types and functions live in `src-tauri/src/protocol/commands.rs`. This is a single-file module — the protocol has a fixed, small set of commands and there's no benefit to splitting further.

## Test Strategy (TDD)

Tests use the existing `MockTransport` from `transport.rs`. Each test follows: build a request, assert serialized bytes match expected, push a mock response, call execute, assert parsed response matches expected.

Tests to write (in order of implementation):

1. **PacketHeader round-trip** — serialize then deserialize, verify all fields
2. **PacketHeader from short buffer** — returns `BufferTooShort` error
3. **SequenceCounter wraps at u16::MAX** — verify overflow behavior
4. **SequenceCounter reset** — verify reset sets value correctly
5. **Request::Init1 serialization** — 16-byte header, no payload, cmd=0x00000000
6. **Request::Init2 serialization** — 16-byte header, no payload, cmd=0x00000002
7. **Request::GetSync serialization** — header only, cmd=0x00006004
8. **Request::GetData serialization** — header + 8-byte payload (offset + size)
9. **Request::SetMix serialization** — header + 6-byte payload
10. **Request::SetMux serialization** — header + variable payload
11. **Request::DataCmd serialization** — header + 4-byte payload
12. **Response validation — matching cmd/seq** — passes
13. **Response validation — mismatched cmd** — returns CommandMismatch
14. **Response validation — mismatched seq** — returns SequenceMismatch
15. **Response validation — init special case** — req seq=1, resp seq=0, passes
16. **Response validation — device error** — returns DeviceError
17. **Response validation — non-zero pad** — returns InvalidPadding
18. **parse_response for Init2** — 84 bytes, extracts firmware version at offset 8
19. **parse_response for Sync** — extracts u32 status
20. **parse_response for Meter** — variable-length u16 array
21. **parse_response for Data** — raw byte passthrough
22. **Request::SetData payload too large** — returns PayloadTooLarge
23. **Request::GetData size too large** — returns PayloadTooLarge
24. **CommandRunner execute round-trip** — full serialize → mock transport → validate → parse
25. **CommandRunner execute timeout** — mock transport returns Timeout, mapped to CommandError::Timeout
26. **CommandRunner initialize sequence** — INIT_1 + INIT_2, verifies seq resets and firmware version extracted

The `MockTransport` needs to be made `pub(crate)` so `commands.rs` tests can use it.
