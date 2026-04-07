# RedMatrix

> ⚠️ **Pre-alpha — not yet functional.** USB protocol validated against real hardware, Rust protocol library in progress. Star/watch the repo to follow progress.

> *RedMatrix is a working name.*

An open-source alternative to Focusrite Control for Scarlett Gen 2/3 and Clarett USB/+ audio interfaces, built with a better UI and iPad remote control.

A [Knives on Strings](https://github.com/Knives-On-Strings) project.

## Why?

Focusrite Control works, but a lot of users find the interface frustrating — dropdown menus instead of a routing matrix, no way to see everything at once, too many clicks for simple tasks. And when Focusrite discontinued their iOS remote app for Gen 2/3 devices, there was no longer any way to control your interface from across the studio.

RedMatrix aims to fix both problems:

- **A patchbay-style UI** — routing is a grid, not dropdown menus. Everything visible at a glance.
- **iPad remote control** — adjust your monitor mix from anywhere in the room over encrypted LAN.
- **Support for devices Focusrite has moved on from** — Gen 2, Gen 3, and Clarett interfaces that lost iOS remote support.

## Supported Devices

RedMatrix uses the same Scarlett2 USB protocol as the Linux kernel driver. Any device supported by that driver should work.

| Series | Models | Status |
|--------|--------|--------|
| Scarlett 3rd Gen | Solo, 2i2, 4i4, 8i6, 18i8, **18i20** | 18i20 = primary dev device. Others planned. |
| Scarlett 2nd Gen | 6i6, 18i8, 18i20 | Planned (same protocol) |
| Clarett USB | 2Pre, 4Pre, 8Pre | Planned (same protocol) |
| Clarett+ | 2Pre, 4Pre, 8Pre | Planned (same protocol) |

Devices not yet validated will start in **read-only mode** (metering and status only, no control changes) until confirmed working. You can override this in settings.

Scarlett 4th Gen large models (16i16, 18i16, 18i20) use a different protocol and are not currently supported.

## Features

- **Overview** — status dashboard with input meters, output levels, front panel LED mirror, status widgets
- **Mixer** — channel strip faders with VU meters, solo/mute, 4 assignable sub faders + master, renamable bus labels
- **Input** — DSP mixer gain matrix (input→bus) + per-input config (PAD/AIR/INST/48V, custom labels)
- **Output** — patchbay routing matrix (source→destination) + per-output config (stereo pairing, custom labels)
- **Settings** — sample rate, clock source, digital I/O mode, theme selector, device info, remote status
- **Remote control** — encrypted WebSocket server (ECDH + AES-256-GCM) for iPad companion app
- **Stereo pairing** — configurable linked output pairs with shared faders
- **Multi-device** — 15 device configs ported, auto-adapts UI to device capabilities
- **Themes** — dark (default), light, high visibility, extensible via CSS custom properties
- **MIDI mapping** — planned: map MIDI CC from any controller to mixer faders (MIDI Learn mode)

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
| 1 | Protocol library in Rust (TDD) | **Complete** ✅ — command serialization, mixer encoding, all 15 device configs (139 Rust tests) |
| 2 | Desktop MVP | **In progress** — WebSocket server, frontend UI (Overview/Mixer/Input/Output), Tauri IPC wired |
| 3 | Multi-device support + polish | Not started |
| 4 | iPad remote app | Not started |

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
cd src-tauri && cargo test  # 139 Rust tests

# Run the app (opens a window with mock device data)
cargo tauri dev
```

## Contributing

This project is in early development. Contributions are welcome, but please read the specs first — especially `CLAUDE.md` and `specs/06-OPEN-QUESTIONS.md`.

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
