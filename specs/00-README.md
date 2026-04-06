# RedMatrix

> **RedMatrix is a working name.** Subject to change before release.

A [Knives on Strings](https://github.com/Knives-On-Strings) product.

An open-source Windows alternative to Focusrite Control for the Scarlett 18i20 Gen 3 audio interface, with a companion commercial iPad app for remote control.

## Products

### RedMatrix (Desktop)
- **Platform:** Windows + macOS
- **License:** GPL-3.0
- **Source:** Open source
- Directly controls Scarlett Gen 2/3 and Clarett USB/+ interfaces over USB
- Runs a WebSocket server for remote clients
- Built with Tauri (Rust backend + React frontend)

### RedMatrix Remote (iPad)
- **Platform:** iPadOS
- **License:** Proprietary / Commercial ($5–10)
- **Source:** Closed (separate private repository)
- Native Swift app with WKWebView
- Connects to the desktop server over LAN (encrypted, keypair-authenticated)
- Touch-optimised mixer and monitoring interface
- Sold via App Store

## Target Devices

Primary: Focusrite Scarlett 18i20 3rd Generation

Planned: all Scarlett Gen 2/3 and Clarett USB/Clarett+ models using the Scarlett2 protocol (17 devices total).

## Spec Documents

| Doc | Contents |
|-----|----------|
| [`specs/01-ARCHITECTURE.md`](specs/01-ARCHITECTURE.md) | System architecture, server/client split, layers, tech stack |
| [`specs/02-PROTOCOL.md`](specs/02-PROTOCOL.md) | USB protocol reference — commands, notifications, data structures |
| [`specs/03-DEVICE.md`](specs/03-DEVICE.md) | 18i20 Gen 3 hardware: ports, I/O modes, controls, LED map |
| [`specs/04-UX.md`](specs/04-UX.md) | UI specification — tabs, components, layout, behaviour |
| [`specs/05-BACKLOG.md`](specs/05-BACKLOG.md) | Phased project plan with checkboxes |
| [`specs/06-OPEN-QUESTIONS.md`](specs/06-OPEN-QUESTIONS.md) | Unresolved decisions and blockers |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code project configuration |

## Attribution

This project builds on the reverse-engineering work of Geoffrey D. Bennett, whose Linux kernel driver (`mixer_scarlett_gen2.c`) is the authoritative source for the Scarlett2 USB protocol.

- Kernel driver: https://github.com/geoffreybennett/linux-fcp
- GUI reference: https://github.com/geoffreybennett/alsa-scarlett-gui
- Donate: https://liberapay.com/gdb or https://paypal.me/gdbau
