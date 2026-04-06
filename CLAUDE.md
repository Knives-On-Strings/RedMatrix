# CLAUDE.md — RedMatrix

> **RedMatrix is a working name.** Subject to change before release.

## What This Is

A [Knives on Strings](https://github.com/Knives-On-Strings) product.

An open-source Windows/macOS app (GPL-3.0) that replaces Focusrite Control for Scarlett Gen 2/3 and Clarett USB/+ interfaces, plus a commercial iPad companion app for remote control over LAN.

**The Rust backend is written by Claude Code.** Human reviews, tests, and directs. The React frontend and Swift iPad wrapper are also Claude Code assisted.

**Read the specs first.** All design decisions, protocol details, and device information are in `specs/`. Start with `specs/00-README.md`.

## Development Methodology: TDD

This project uses **Test-Driven Development**. The workflow is:

1. **Write a failing test** that describes the expected behaviour
2. **Write the minimum code** to make the test pass
3. **Refactor** while keeping all tests green
4. Repeat

### Testing Expectations

- **Every protocol command** must have tests before implementation. Write a test that sends a known command payload and asserts the expected byte sequence, then implement the serialization.
- **Every response parser** must have tests with captured real-world response data (from Wireshark captures in Phase 0) before the parser is written.
- **Device state management** is tested with mock USB transport — no hardware needed.
- **React components** use React Testing Library for interaction tests. No snapshot tests.
- **WebSocket API** is tested with a mock client sending commands and asserting state responses.
- **Crypto pairing** is tested end-to-end with two keypairs in-process.

### Test Infrastructure

| Layer | Test Framework | Notes |
|-------|---------------|-------|
| Rust (protocol, USB) | `cargo test` + built-in test framework | Mock USB transport via trait |
| Rust (WebSocket server) | `tokio::test` | Async test runtime |
| React (components) | Vitest + React Testing Library | `@testing-library/react` |
| React (transport) | Vitest | Mock WebSocket |
| Integration | Playwright or Tauri's test driver | End-to-end with mock server |

### Test File Convention

- Rust: tests live in the same file as the implementation (`#[cfg(test)] mod tests { ... }`)
- TypeScript: test files are co-located as `*.test.ts` / `*.test.tsx` next to the source file
- Test data fixtures (captured USB packets, device state dumps) go in `tests/fixtures/`

### What NOT to test

- Don't test Tauri's IPC plumbing or framework internals
- Don't test Tailwind CSS classes
- Don't test third-party library behaviour (rusb, tokio, etc.)
- Don't write tests after the code — if you find yourself doing this, stop and refactor the approach

## Spec Documents

| Doc | Read when... |
|-----|-------------|
| `specs/00-README.md` | Starting the project or need an overview |
| `specs/01-ARCHITECTURE.md` | Working on server, client, Electron, or build system |
| `specs/02-PROTOCOL.md` | Implementing USB commands, parsing responses, handling notifications |
| `specs/03-DEVICE.md` | Need port counts, output names, I/O modes, control details, LED states |
| `specs/04-UX.md` | Building or modifying the React UI |
| `specs/05-BACKLOG.md` | Looking for what to work on next |
| `specs/06-OPEN-QUESTIONS.md` | Unresolved decisions and blockers |

When implementing protocol commands, **always cross-reference the Linux kernel driver source** — it is the authoritative reference. Do not guess at protocol details.

**Key source:** `mixer_scarlett_gen2.c` in https://github.com/geoffreybennett/linux-fcp

## Licensing

| Component | License |
|-----------|---------|
| `src-tauri/` | GPL-3.0 (open source) |
| `src/` (desktop build) | GPL-3.0 (open source) |
| `src/` (iPad build) | Proprietary (bundled in separate private repo) |
| `ipad/` | Proprietary (separate private repo, NOT published) |
| `specs/` | CC-BY-4.0 |
| `scripts/` | GPL-3.0 |

The React client in `src/` is dual-licensed. The iPad app wrapper lives in a separate private repository and is never included in the public open-source release.

## Target Device

Primary: Focusrite Scarlett 18i20 3rd Generation (USB VID `0x1235`, PID `0x8215`)

Planned: all Scarlett Gen 2/3 and Clarett USB/Clarett+ models using the Scarlett2 protocol.

## Supported Devices (Scarlett2 Protocol)

All devices below use the same USB protocol. Per-device differences are captured in config structs (port counts, feature flags, mux layouts). These configs are already defined in the Linux kernel driver and can be ported directly.

### Scarlett 2nd Gen
| Model | PID | Mixer | HW Vol | Notes |
|-------|-----|-------|--------|-------|
| 6i6 | `0x8203` | Yes | No | |
| 18i8 | `0x8204` | Yes | No | |
| 18i20 | `0x8201` | Yes | Yes | |

### Scarlett 3rd Gen
| Model | PID | Mixer | HW Vol | Speaker SW | Talkback | Notes |
|-------|-----|-------|--------|-----------|----------|-------|
| Solo | `0x8211` | No | No | No | No | Direct monitor only |
| 2i2 | `0x8210` | No | No | No | No | Direct monitor only |
| 4i4 | `0x8212` | Yes | No | No | No | |
| 8i6 | `0x8213` | Yes | No | No | No | |
| 18i8 | `0x8214` | Yes | Yes | Yes | No | Line out remap (3/4→7/8) |
| **18i20** | **`0x8215`** | **Yes** | **Yes** | **Yes** | **Yes** | **Primary dev device** |

### Clarett USB / Clarett+
| Model | PID | Mixer | HW Vol | Notes |
|-------|-----|-------|--------|-------|
| USB 2Pre | `0x8206` | Yes | Yes | |
| USB 4Pre | `0x8207` | Yes | Yes | |
| USB 8Pre | `0x8208` | Yes | Yes | |
| + 2Pre | `0x820a` | Yes | Yes | |
| + 4Pre | `0x820b` | Yes | Yes | |
| + 8Pre | `0x820c` | Yes | Yes | |

### Not Supported (different protocol)
- Scarlett 4th Gen 16i16, 18i16, 18i20 — use the FCP protocol (separate kernel driver)
- Scarlett 4th Gen Solo, 2i2, 4i4 — use a variant of the Scarlett2 protocol but with additional features (DSP, autogain, clip safe). May be added later.
- Vocaster One/Two — Scarlett2 protocol variant, may be added later.

## Testing Without Hardware

For devices you don't own, use these approaches:

1. **Device config structs** — port counts, feature flags, and mux assignments for every model are defined in `mixer_scarlett_gen2.c`. Port these directly. The config IS the device support.

2. **Simulation state files** — `alsa-scarlett-gui` includes `.state` files in its `demo/` directory for every supported model. These capture the full ALSA control state of a real device. Load them as test fixtures to validate UI rendering and state management.

3. **alsa-scarlett-gui simulation mode** — the Linux GUI can run in simulation mode without hardware, loading a `.state` file and displaying the full UI. Use this as a visual reference for how each device should look.

4. **Community testing** — once the protocol layer works on the 18i20, other Gen 2/3 owners can test with minimal risk (GET commands are read-only). Ship a "read-only mode" flag for untested devices that disables all SET commands until someone confirms it works.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop app | Tauri 2.x (Rust backend + native webview), Windows + macOS |
| USB | rusb (Rust libusb bindings), cross-platform |
| Protocol | Rust (in src-tauri/) |
| WebSocket server | tokio-tungstenite (Rust) |
| Crypto | ring (Rust) + Web Crypto API (client) |
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| Discovery | mdns-sd (Rust) |
| iPad app | Swift + WKWebView (separate private repo) |
| Prototyping | Python + PyUSB (in scripts/) |

## Coding Conventions

### Rust (src-tauri/)
- All protocol constants in `src-tauri/src/protocol/constants.rs`
- Device-specific configs in `src-tauri/src/protocol/devices/` (one file per model)
- USB transport abstracted behind a trait (for mocking in tests)
- All USB operations are async (tokio) with timeout handling
- Error types use `thiserror` — user-friendly display messages
- No `unwrap()` in production code paths

### TypeScript (src/)
- Strict mode, no `any` types
- Transport abstraction in `src/transport/` — Tauri IPC for desktop, WebSocket for remote
- Mixer gain values stored as dB (number), converted at the transport boundary only
- Output names must match the map in `specs/03-DEVICE.md`
- Port groups shown conditionally based on sample rate and digital I/O mode

## WebSocket API Convention

- JSON messages: `{ type: "command_name", payload: { ... } }`
- Binary frames for meter data (Float32Array, one value per channel)
- Server sends full state dump on connect, incremental updates after
- Client uses optimistic updates (apply immediately, rollback on error)
- **All remote traffic encrypted:** ECDH keypair exchange → AES-256-GCM per-frame encryption
- Localhost connections (Electron to local server) bypass crypto
- Use Web Crypto API (available in Node.js and browsers) — no external crypto libraries needed

## Remote Auth Model

Pairing uses ECDH key exchange, not passwords. Flow:
1. Server generates ECDH keypair on first run, shows QR code + fingerprint
2. iPad generates its own keypair, scans QR to pair
3. User confirms pairing on desktop
4. Shared secret derived via ECDH → AES-256-GCM encrypted channel
5. Subsequent connections: server checks client public key against paired list, rejects unknown keys

Keys stored in server config (desktop) and Keychain (iPad). Revocable from Settings tab.

## Safety Rules

- **GET commands are safe** — read-only, cannot damage device
- **SET commands are non-destructive** — routing, volume, toggles
- **CONFIG_SAVE writes to flash** — warn user, flash has finite write cycles
- **Never implement firmware erase/write** — can brick the device
- **Never send commands to audio interfaces** — only use the control interface
- **Phantom power changes need confirmation UI** — can damage ribbon mics
- **Untested devices default to read-only mode** — only GET commands and metering allowed until a device model is validated. The 18i20 Gen 3 is the only fully validated device initially. Users can override this per-device in the config file (`allow_write = true`) or via a one-time confirmation dialog in the Settings tab. The override persists across sessions.

## Testing

- Protocol layer testable without hardware using mock USB transport
- Linux driver includes demo `.state` files usable as test fixtures
- `alsa-scarlett-gui` has simulation mode — reference for expected values
- Test with GET commands before attempting SET commands during development
- WebSocket API testable with any WS client (wscat, Postman)

## Quick Reference

### Command IDs
```
INIT_1     = 0x00000000
INIT_2     = 0x00000002
GET_METER  = 0x00001001
GET_MIX    = 0x00002001
SET_MIX    = 0x00002002
GET_MUX    = 0x00003001
SET_MUX    = 0x00003002
GET_SYNC   = 0x00006004
GET_DATA   = 0x00800000
SET_DATA   = 0x00800001
DATA_CMD   = 0x00800002
```

### Port Type IDs
```
None     = 0x000
Analogue = 0x080
S/PDIF   = 0x180
ADAT     = 0x200
Mixer    = 0x300
PCM      = 0x600
```

### Notification Masks
```
SYNC          = 0x00000008
DIM_MUTE      = 0x00200000
MONITOR       = 0x00400000
INPUT_OTHER   = 0x00800000
MONITOR_OTHER = 0x01000000
```
