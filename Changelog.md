# Changelog — RedMatrix

All notable changes to the RedMatrix Focusrite Control alternative will be documented in this file.

## [Unreleased]

### Added
- Created `RusbTransport` utilizing class-interface control transfers to communicate directly with Focusrite Scarlett/Clarett hardware over USB.
- Implemented automatic control interface detection for USB devices by scanning descriptor class codes for `0xFF` (Vendor-specific).
- Created a background Hardware Monitor task to auto-detect device insertion, claim control interfaces, and run the interrupt listener loop.
- Added a background loop polling USB endpoint `0x83` for real-time hardware notifications (sync, dim/mute, volume, input, monitor settings).
- Created a centralized Command Runner task to process incoming JSON commands from WebSocket clients, mutate the shared device state, and broadcast changes.
- Added Bonjour/mDNS service advertising of the RedMatrix WebSocket service (`_redmatrix._tcp`) for LAN discovery.
- Added real-time hardware level metering (`CMD_GET_METER`) polling at 20Hz with normalized `f32` conversion.
- Implemented binary WebSocket broadcasting of meter data (`Vec<u8>` containing little-endian floats) to remote clients.
- Created an interactive, tabbed `DriverSetup` component embedded in the Settings tab with step-by-step instructions for Zadig (WinUSB), UsbDk, and Linux udev rules.

### Fixed
- Fixed the disconnected pairing flow by passing the Tauri `AppHandle` and `pending_pairings` list to client sessions, allowing the frontend to approve/deny remote clients dynamically.
- Resolved state synchronization gap by sharing a single `DeviceState` instance between the Tauri main thread and the WebSocket server.
- Optimized the meter polling loop by reducing USB transfer timeouts to 200ms, preventing lock contention with UI write events.
- Rate-limited USB meter query error logging to prevent log flooding during communication dropouts.

## [0.1.0] - 2026-04-07

### Added
- Tauri 2.x application scaffolding with Rust backend and React/TypeScript/Tailwind CSS frontend.
- Mock simulation mode for all 15 supported Scarlett Gen 2/3 and Clarett USB/+ models.
- Core design system in CSS with premium, touch-optimized visual tabs (Overview, Mixer, Routing, Matrix, Settings).
- DB-to-hardware lookup tables matching the Linux kernel source exactly.
- ECDH key exchange and AES-256-GCM encrypted WebSocket communication channel.
- User configuration persistence (custom channel labels, stereo pairing, and global settings).
