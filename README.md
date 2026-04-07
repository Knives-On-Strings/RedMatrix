# RedMatrix

> ⚠️ **Pre-alpha — fully interactive in mock mode, USB hardware integration in progress.** Star/watch the repo to follow progress.

> *RedMatrix is a working name.*

An open-source alternative to Focusrite Control for Scarlett Gen 2/3 and Clarett USB/+ audio interfaces, built with a better UI and iPad remote control.

A [Knives on Strings](https://github.com/Knives-On-Strings) project.

## Why?

Focusrite Control works, but a lot of users find the interface frustrating — dropdown menus instead of a routing matrix, no way to see everything at once, too many clicks for simple tasks. And when Focusrite discontinued their iOS remote app for Gen 2/3 devices, there was no longer any way to control your interface from across the studio.

RedMatrix aims to fix both problems:

- **A patchbay-style UI** — routing is a clickable grid, not dropdown menus. Everything visible at a glance.
- **iPad remote control** — adjust your monitor mix from anywhere in the room over encrypted LAN.
- **Support for devices Focusrite has moved on from** — Gen 2, Gen 3, and Clarett interfaces that lost iOS remote support.

## Supported Devices

RedMatrix uses the same Scarlett2 USB protocol as the Linux kernel driver. Any device supported by that driver should work.

| Series | Models | Status |
|--------|--------|--------|
| Scarlett 3rd Gen | Solo, 2i2, 4i4, 8i6, 18i8, **18i20** | 18i20 = primary dev device. Others config-complete. |
| Scarlett 2nd Gen | 6i6, 18i8, 18i20 | Config-complete (same protocol) |
| Clarett USB | 2Pre, 4Pre, 8Pre | Config-complete (same protocol) |
| Clarett+ | 2Pre, 4Pre, 8Pre | Config-complete (same protocol) |

Devices not yet validated will start in **read-only mode** (metering and status only, no control changes) until confirmed working. You can override this in settings.

Scarlett 4th Gen large models (16i16, 18i16, 18i20) use a different protocol and are not currently supported.

## Features

- **Overview** — status dashboard with input meters (peak hold), output levels, front panel LED mirror, status widgets
- **Mixer** — channel strip faders with VU meters, solo/mute, 4 assignable sub faders + master, renamable bus labels, Clear Solo button
- **Input** — DSP mixer gain matrix (input→bus) with batch commands + per-input config (PAD/AIR/INST/48V, custom labels, stereo pairing for all input types)
- **Output** — patchbay routing matrix with collapsible groups + per-output config (stereo pairing, custom labels, mute)
- **Settings** — sample rate, clock source, digital I/O mode, theme selector, device info, QR code for iPad pairing
- **Remote control** — encrypted WebSocket server (ECDH P-256 + AES-256-GCM) with interactive pairing flow, QR code discovery
- **Custom labels** — name any input, output, DAW channel, or mixer bus. Labels persist to disk and appear across all tabs.
- **Stereo pairing** — configurable linked pairs for inputs (analogue, S/PDIF, ADAT) and outputs, with shared faders
- **Multi-device** — 15 device configs ported from the Linux kernel driver, auto-adapts UI to device capabilities
- **Themes** — dark (default), light, high visibility, extensible via CSS custom properties
- **Mock mode** — fully interactive simulation of any supported device, no hardware required
- **Error handling** — toast notifications for failed commands, device disconnect/reconnect detection

### Planned

- **MIDI controller mapping** — map MIDI CC from any controller to mixer faders (MIDI Learn mode)
- **Undo/redo** — Ctrl+Z to revert fader changes
- **Global keyboard shortcuts** — TALK/DIM/MUTE as OS-level hotkeys
- **Meter ballistics** — client-side CSS easing for smooth 60fps meter rendering

## Architecture

RedMatrix is built with [Tauri](https://tauri.app/) — a Rust backend handling USB communication and a React frontend for the UI. The Rust process also runs a WebSocket server so the iPad app can connect over LAN.

```
┌─────────────────────────────┐
│  RedMatrix (Tauri)          │
│  ┌────────┐  ┌───────────┐  │
│  │ React  │  │ Rust Core │  │
│  │  UI    ◄──► USB       │  │
│  │        │  │ Protocol  │  │
│  │        │  │ WS Server │  │
│  └────────┘  └─────┬─────┘  │
│                    │ USB    │
│              ┌─────┴──────┐ │
│              │ Scarlett   │ │
│              └────────────┘ │
└─────────────────────────────┘
       ▲ WebSocket (LAN)
┌──────┴──────┐
│ iPad App    │
│ (encrypted) │
└─────────────┘
```

See [`specs/01-ARCHITECTURE.md`](specs/01-ARCHITECTURE.md) for full details.

## Current Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | USB access validation | **Complete** ✅ — protocol confirmed against real 18i20 hardware |
| 1 | Protocol library in Rust (TDD) | **Complete** ✅ — command serialization, mixer encoding, all 15 device configs (159 Rust tests) |
| 2 | Desktop MVP | **In progress** — WebSocket server, full UI with mock mode, Tauri IPC, config persistence |
| 3 | Multi-device support + polish | Not started |
| 4 | iPad remote app | Not started |

**Next milestone:** Real USB transport (dedicated thread for blocking libusb I/O, notification polling, 20Hz metering). Design spec complete, implementation pending Windows driver coexistence solution.

The detailed plan is in [`specs/05-BACKLOG.md`](specs/05-BACKLOG.md).

## Documentation

The `specs/` folder contains the complete project specification:

| Doc | Contents |
|-----|----------|
| [00-README](specs/00-README.md) | Project overview and doc index |
| [01-ARCHITECTURE](specs/01-ARCHITECTURE.md) | System architecture, tech stack, directory layout |
| [02-PROTOCOL](specs/02-PROTOCOL.md) | Scarlett2 USB protocol reference |
| [03-DEVICE](specs/03-DEVICE.md) | 18i20 Gen 3 hardware details, ports, I/O modes |
| [04-UX](specs/04-UX.md) | UI specification — tabs, components, behaviour |
| [05-BACKLOG](specs/05-BACKLOG.md) | Phased project plan |
| [06-OPEN-QUESTIONS](specs/06-OPEN-QUESTIONS.md) | Unresolved decisions and blockers |
| [07-WEBSOCKET-API](specs/07-WEBSOCKET-API.md) | WebSocket API reference for remote control |
| [08-CLIENT-DEVELOPER-GUIDE](specs/08-CLIENT-DEVELOPER-GUIDE.md) | How to write your own RedMatrix client |

## Development

RedMatrix is developed using **agentic pair programming** with [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview). The Rust backend, React frontend, and project specifications are written collaboratively between a human developer and Claude, with all code reviewed, tested, and validated by the human before merge.

The project uses test-driven development — see `CLAUDE.md` for the full methodology.

## Building

Prerequisites:
- Rust 1.77+ (`rustup` — https://rustup.rs)
- Node.js 20+ and npm
- Tauri CLI (`cargo install tauri-cli --version "^2"`)

```bash
# Install frontend dependencies
npm install

# Run tests
npm test                    # 4 frontend tests
cd src-tauri && cargo test  # 159 Rust tests

# Run the app (fully interactive in mock mode)
cargo tauri dev
```

## Mock Mode (No Hardware Required)

RedMatrix runs in **mock mode** when no Scarlett device is connected. This lets you explore the full UI, test all controls, and develop against the WebSocket API without any audio hardware.

### What works in mock mode

- **All 15 supported devices** — switch between them with the dropdown in the header (amber "Mock" indicator)
- **All mixer controls** — faders, mute, solo, bus masters, sub faders, master fader — all update state in real time via Tauri IPC
- **All routing** — patchbay matrix clicks with batch Direct/Clear commands
- **All input controls** — PAD, AIR, 48V, INST toggles
- **All settings** — sample rate, clock source, S/PDIF mode, theme switching
- **Custom labels** — name any channel, persist to disk via config files
- **Stereo pairing** — link/unlink inputs and outputs
- **Meter data** — mock meters from Rust at 20Hz via Tauri events, with peak hold
- **Device adaptation** — switching to a Solo shows no mixer, switching to an 18i20 shows all 25 buses with talkback separated
- **WebSocket server** — iPad clients can connect and receive mock device state
- **Pairing flow** — PairingModal appears for new device connections

### What doesn't work in mock mode

- **No real audio metering** — meter bars show randomized placeholder values
- **No hardware notifications** — knob turns and button presses on the physical device aren't reflected
- **Commands don't reach hardware** — changes only affect the in-memory mock state

### Using mock mode for iPad development

The WebSocket server runs in mock mode too. Start the desktop app, then connect your iPad client to `ws://<your-ip>:18120/api`. The iPad will receive the full mock device state and can send commands that update it. This enables iPad UI development without a Scarlett device.

Note: the server binds to `127.0.0.1` by default during development. To test with an iPad on your LAN, change the bind address in `src-tauri/src/server/mod.rs` to `"0.0.0.0"` temporarily. Be aware this opens the server to your network without authentication (pairing is not yet enforced in dev mode).

## Contributing

This project is in early development. Contributions are welcome, but please read the specs first — especially `CLAUDE.md` and `specs/06-OPEN-QUESTIONS.md`.

**Note:** The React code is dual-licensed (GPL-3.0 public, proprietary for the iPad app). A Contributor License Agreement (CLA) will be required before accepting PRs.

The most valuable contributions right now:
- **Phase 0 validation** — if you have a Scarlett/Clarett and can run Wireshark with USBPcap, captured USB traffic would be hugely helpful
- **Device testing** — if you have a Gen 2/3 device other than the 18i20, running the app in read-only mode and sharing a device report helps us validate multi-device support
- **Protocol review** — if you've worked with the Linux kernel driver or `alsa-scarlett-gui`, your insight into protocol edge cases is valuable

## Acknowledgements

This project would not be possible without the work of **Geoffrey D. Bennett**, who reverse-engineered the Scarlett2 USB protocol and wrote the Linux kernel driver and [ALSA Scarlett Control Panel](https://github.com/geoffreybennett/alsa-scarlett-gui). Hundreds of hours of his work form the foundation of everything here.

If you use Focusrite interfaces on Linux, please consider supporting Geoffrey's work:
- https://liberapay.com/gdb
- https://paypal.me/gdbau

## Companion App

**RedMatrix Remote** is a paid iPad app ($5–10) for controlling your interface from anywhere in the studio. It connects to the desktop app over your local network with end-to-end encryption. Available separately on the App Store (once it exists).

The iPad app is closed-source and maintained in a separate private repository.

## License

GPL-3.0 — see [LICENSE](LICENSE).

Focusrite, Scarlett, Clarett, and Vocaster are trademarks of Focusrite Audio Engineering Limited. This project is not affiliated with or endorsed by Focusrite.
