# 05 — Project Backlog

## Phase 0: Validation (1-2 weekends) — COMPLETE ✓

- [x] USB descriptor dump of 18i20 on Windows (USBTreeView) — 6 interfaces found
- [ ] Install USBPcap on Windows — deferred, not needed for initial validation
- [ ] Wireshark capture of Focusrite Control traffic — deferred
- [x] **Save captured packets as test fixtures** in `tests/fixtures/` — 4 binary fixtures from real device
- [x] Compare captured command IDs against protocol spec — INIT_1, INIT_2, GET_SYNC, GET_DATA all confirmed
- [x] Identify which USB interface number and endpoints Focusrite Control uses for commands — Interface 3 (class 0xFF), EP 0x83 IN (interrupt), control transfers on EP 0 (bRequest 2/3)
- [x] Use Zadig to install WinUSB — installed on whole device (per-interface not possible, Focusrite driver is monolithic)
- [x] Write Python/PyUSB test script: send INIT_1, verify response — SUCCESS, firmware version 1644
- [ ] Verify Windows audio still works after claiming control interface with WinUSB — NOT possible with current approach; WinUSB replaces Focusrite driver entirely. Need custom .inf for MI_03 coexistence.
- [x] Document interface number, endpoint addresses, and max packet size — Interface 3, EP 0x83 (64B interrupt), EP 0 control transfers (512B max)
- [x] **Set up Tauri project scaffold with `cargo test` and Vitest running** — 95 Rust + 1 frontend test passing

### Phase 0 Key Findings
- Protocol implementation is validated: packet format, sequence numbers, command IDs all correct
- Focusrite driver binds monolithically — no per-interface WinUSB without custom .inf or filter driver
- macOS likely easier (libusb can access interfaces alongside kernel drivers)
- GET_METER returned error 9 — needs investigation (wrong meter count or magic value?)
- Firmware version 1644 = bcdDevice 0x066C, build date "Feb 25 2020"

## Phase 1: Protocol Library (2-3 weekends)

TDD: every command and parser gets a test BEFORE implementation.

- [ ] Define mock USB transport trait in Rust
- [ ] **Test:** INIT_1 command produces expected byte sequence → then implement serialization
- [ ] **Test:** INIT_2 command produces expected byte sequence → then implement
- [ ] **Test:** parse INIT response from captured fixture → then implement deserialization
- [ ] **Test:** sequence numbers increment correctly across multiple commands
- [ ] **Test:** GET_SYNC response parsed to sync status enum
- [ ] **Test:** GET_DATA response parsed to volume/pad/air/phantom structs
- [ ] **Test:** GET_MUX response parsed to routing table
- [ ] **Test:** GET_MIX response parsed to mixer gain matrix
- [ ] **Test:** GET_METER response parsed to level values
- [ ] **Test:** SET commands produce correct byte sequences
- [ ] **Test:** notification mask parsing identifies correct change types
- [ ] **Test:** dB-to-hardware-value lookup table matches kernel source exactly (compare all 173 values)
- [ ] **Test:** DATA_CMD CONFIG_SAVE produces correct packet
- [ ] Build CLI tool that dumps full device state to JSON (integration test against real hardware)
- [ ] Python/PyUSB prototype scripts in `scripts/` for quick validation

## Phase 2: Desktop MVP (3-4 weekends)

### Scaffolding
- [ ] Tauri project setup: `src-tauri/` (Rust) + `src/` (React)
- [ ] USB transport via `rusb` in Tauri's Rust process
- [ ] Tauri IPC commands bridging React ↔ Rust
- [ ] WebSocket server (tokio-tungstenite) for remote clients on port 18120
- [ ] mDNS advertisement (mdns-sd)
- [ ] Device detection and connection UI
- [ ] System tray support for headless/minimised mode
- [ ] Build and test on both Windows and macOS

### Overview tab
- [ ] Front panel LED mirror strip (no VU meters — those are in input section)
- [ ] Input section: vertical VU meters in a single row, grouped (Analogue 1-8, S/PDIF L/R, ADAT 1-8), group labels below
- [ ] Each input shows route destination badges
- [ ] Only show port groups that exist at current sample rate / I/O mode
- [ ] Output section: each output with level bar, MAIN/ALT badge, source name
- [ ] Outputs dimmed when inactive (MAIN dimmed during ALT, and vice versa)
- [ ] Status widgets: speakers, phantom power, talkback

### Mixer tab
- [ ] Collapsible groups: Analogue, S/PDIF, ADAT, DAW
- [ ] Per-channel: fader + VU meter with peak hold, solo (server-side), mute
- [ ] Analogue channels: INST (1-2 only), PAD (1-8), AIR (1-8)
- [ ] Phantom power controls (48V 1-4, 48V 5-8)
- [ ] DAW group collapsed by default
- [ ] Only show groups that exist at current sample rate
- [ ] **Input stereo linking:** Link button between adjacent odd/even analogue inputs (1-2, 3-4, 5-6, 7-8). Linked pairs share a single fader, pan hard L/R in the matrix, and share mute/solo state. Essential for stereo synths/sources.
- [ ] **Meter ballistics:** Smoothed meter rendering with gravity/decay easing and peak hold line. Raw meter values → professional-looking VU behavior. Don't paint raw 0.0-1.0 floats directly.

### Routing tab
- [ ] Full patchbay: all source types × all destination types
- [ ] Group headers with colour coding on both axes
- [ ] One source per destination (auto-clear column on click)
- [ ] Preset buttons: Direct, Clear All
- [ ] Correct output names: Mon 1 L/R (MAIN), Mon 2 L/R (ALT), Line 5-6, HP 1 L/R, HP 2 L/R

### Matrix tab
- [ ] 25×12 DSP mixer gain crosspoint grid
- [ ] Click to toggle 0dB, drag/scroll for fine adjustment (future)
- [ ] Presets: Direct, Preamp, Stereo Out, Clear

### Settings tab
- [ ] Sample rate selector (**Warning/read-only if device is locked by ASIO driver** — on Windows with driver coexistence, the ASIO driver may hold a sample rate lock. Detect and warn rather than cause a driver panic.)
- [ ] Clock source selector
- [ ] Sync status indicator
- [ ] Digital I/O mode selector (3 modes with descriptions)
- [ ] Warning when optical I/O disabled at high sample rates
- [ ] MSD mode toggle (with warning)
- [ ] Firmware version display
- [ ] Save/load config to file
- [ ] Save config to hardware (with flash wear warning)

### Header bar
- [ ] Master volume slider + dB readout
- [ ] DIM / MUTE / TALK / MAIN-ALT buttons
- [ ] Connection + sync status
- [ ] Solo indicator with Clear
- [ ] **Global keyboard shortcuts:** TALK, DIM, MUTE, MAIN/ALT as OS-level global shortcuts via Tauri `GlobalShortcut` API. Work even when DAW is focused. Configurable in Settings.

### Notification handling
- [ ] Reflect hardware changes (knob turns, button presses) in real time
- [ ] Dynamically update port visibility when sample rate or I/O mode changes

## Phase 3: Multi-Device Support & Polish

### Multi-device support
- [ ] Port all Gen 2/3 and Clarett device config structs from `mixer_scarlett_gen2.c` to Rust
- [ ] Auto-detect device model from USB PID on connection
- [ ] Dynamically configure UI based on device's feature flags (mixer, HW vol, speaker SW, talkback, etc.)
- [ ] Only show controls the connected device actually has
- [ ] Download `alsa-scarlett-gui` demo `.state` files as test fixtures for every model
- [ ] TDD: for each device config, test that port counts and mux layouts match the kernel source exactly
- [ ] **Read-only mode** for untested devices — disables all SET commands, only allows GET/metering
- [ ] Config file override: `[devices.<pid>] allow_write = true` — persists across sessions
- [ ] Settings tab: one-time confirmation dialog to enable write mode, writes the config override
- [ ] UI badge: "Unvalidated device — read-only. Enable full control in Settings."

### Community testing
- [ ] Document how to run RedMatrix on an untested device safely (read-only mode)
- [ ] Provide a "device report" export: dumps device config, port counts, firmware version, and GET responses to a JSON file users can share
- [ ] GitHub issue template for device validation reports
- [ ] Once a device is confirmed working, promote it from read-only to full support in the next release

### Polish
- [ ] Talkback routing configuration (default: HP 1 + HP 2, configurable)
- [ ] Talkback momentary vs latching mode
- [ ] Monitor knob assignment (configurable target outputs)
- [ ] DIM/MUTE button assignment (configurable target outputs)
- [ ] HW/SW volume switch per output
- [ ] Loopback inputs configuration (virtual DAW inputs 9/10)
- [ ] Stand-alone mode: save mix config to hardware flash
- [ ] Real-time level meters on all ports (inputs, outputs, mixer buses)
- [ ] Dark/light theme
- [ ] Surround sound output mapping helpers (5.1, 7.1)

## Phase 4: Remote Control — Server + iPad App

### Server enhancements (GPL-3.0, open source)
- [ ] mDNS/Bonjour advertisement for LAN auto-discovery
- [ ] ECDH keypair generation on first run
- [ ] Display server public key as QR code + short fingerprint on desktop UI
- [ ] Pairing flow: receive client public key, display client fingerprint, require user confirmation
- [ ] Paired devices list stored in server config file
- [ ] ECDH shared secret derivation → AES-256-GCM encrypted WebSocket channel
- [ ] All frames (JSON + binary meter data) encrypted after handshake
- [ ] Reject connections from unknown (unpaired) public keys
- [ ] Revoke paired devices from Settings tab
- [ ] Localhost connections (Electron desktop) bypass auth
- [ ] Meter data throttling: configurable update rate for remote clients
- [ ] Multiple simultaneous clients (viewers + controllers)
- [ ] Connection status indicator on server and all clients
- [ ] Headless mode (server runs without Electron, remote-only)

### iPad client (proprietary, commercial — separate private repo)
- [ ] Swift + WKWebView Xcode project setup
- [ ] Bundle React client from public repo's `src/` as git submodule
- [ ] ECDH keypair generation on first launch, stored in iOS Keychain
- [ ] QR code scanner for pairing (camera permission)
- [ ] Manual fingerprint entry as fallback
- [ ] Derive shared secret, establish AES-256-GCM encrypted channel
- [ ] Touch-optimised faders (larger hit targets, momentum scrolling)
- [ ] Landscape orientation for mixer view
- [ ] Auto-discover server via mDNS (Bonjour is native on iOS)
- [ ] Manual IP entry as fallback
- [ ] Subset tab visibility (e.g. just Mixer + Overview for performers)
- [ ] Low-latency meter rendering (requestAnimationFrame, not React re-renders)
- [ ] "Performer mode" — limited view, single headphone mix
- [ ] App Store listing, screenshots, pricing
- [ ] In-app purchase or upfront paid model

### WebSocket protocol
- [ ] Define message format: `{ type, payload }` JSON
- [ ] Handshake: client sends public key → server validates against paired list → both derive AES key
- [ ] All subsequent frames AES-256-GCM encrypted (12-byte nonce, per-frame counter)
- [ ] Full state dump on connect, incremental updates after
- [ ] Binary meter data frames encrypted same as JSON frames
- [ ] Heartbeat/ping for disconnect detection
- [ ] Optimistic UI: client updates immediately, server confirms or rolls back

## Someday / Future Scope

- [ ] Reach out to Geoffrey Bennett for advice
- [ ] Investigate Gen 4 FCP protocol support
- [ ] **Undo/redo stack** — Snapshot DeviceState before each command, push to undo history. Ctrl+Z to undo (send inverse command to restore previous state), Ctrl+Shift+Z to redo. Client-side state history with configurable depth (e.g., 50 steps). Essential for mixer workflow — "oops, wrong fader" should be one keystroke to fix.
- [ ] **VCA-style fader groups** — if the 12 hardware mixer buses aren't sufficient for grouping, add a software VCA layer. Deferred: the buses already serve as subgroups and can be custom-labeled. Revisit only if users request it.
- [ ] **MCP server / AI agent interface** — Expose RedMatrix as an MCP (Model Context Protocol) server so AI agents (Claude, etc.) can read device state and control the audio interface programmatically. Use cases: automated studio setup ("set up my podcast routing"), voice-controlled mixing, integration with DAW automation agents. The WebSocket API is already JSON-based — wrapping it as MCP tools would be straightforward.
- [ ] Clarett USB / Clarett+ support
- [ ] Firmware update capability from Windows
- [ ] Android client

---

## Reference Tables

### Output Naming

| Line Output | UI Name | Alias | Notes |
|-------------|---------|-------|-------|
| 1 | Mon 1 L | MAIN | Anti-thump |
| 2 | Mon 1 R | MAIN | Anti-thump |
| 3 | Mon 2 L | ALT | Anti-thump |
| 4 | Mon 2 R | ALT | Anti-thump |
| 5 | Line 5 | — | No anti-thump |
| 6 | Line 6 | — | No anti-thump |
| 7 | HP 1 L | — | Front HP jack 1 |
| 8 | HP 1 R | — | Front HP jack 1 |
| 9 | HP 2 L | — | Front HP jack 2 |
| 10 | HP 2 R | — | Front HP jack 2 |

### Front Panel Hardware Controls

| Control | Type | Channels | Notes |
|---------|------|----------|-------|
| Gain knobs | Analogue | 1-8 | 56dB range, not software-controllable |
| INST switch | Toggle | 1-2 only | Front panel + software |
| PAD switch | Toggle | 1-8 | Front panel + software, -10dB |
| AIR | Software only | 1-8 | No physical switch |
| 48V | Toggle | Groups 1-4, 5-8 | Front panel + software |
| MONITOR knob | Analogue | Configurable | Default: outputs 1/2 |
| DIM | Toggle | Configurable | -18dB exactly |
| MUTE | Toggle | Configurable | Full mute |
| TALKBACK | Momentary | Built-in mic (input 9) | Default routes to HP 1+2 |
| ALT | Toggle | Outputs 1/2 ↔ 3/4 | Must enable in settings first |
| HP 1 volume | Analogue | Outputs 7/8 | Not software-controllable |
| HP 2 volume | Analogue | Outputs 9/10 | Not software-controllable |
