# Changelog — RedMatrix

All notable changes to the RedMatrix Focusrite Control alternative will be documented in this file.

## [Unreleased]

## [0.7.0] - 2026-05-24

### Added
- Implemented software-based Mixer VCA sub-group faders and Master fader relative scaling logic (clamped to [-80.0, 6.0] dB, leaving silent channels at -80.0 dB untouched).
- Added input stereo linking in the Mixer view: linked channels are rendered as combined stereo strips with dual levels meters and linked faders/mutes/solos.
- Added output stereo linking in the Output Matrix: linked analogue output columns are grouped together and click events automatically route stereo sources (Mix A/B, DAW, or linked inputs) L-to-L and R-to-R, or clone mono sources.
- Added a dynamic connection status badge in the header displaying a green "USB" status dot when physical hardware is connected, or an amber "Mock" dot for simulations.
- Exposed the VCA configuration (assignments, bus masters, main master) in `DeviceState` and persisted VCA settings in the JSON configuration files (`device_{serial}.json`).

## [0.6.0] - 2026-05-24

### Added
- Added USB hardware control support for settings controls: **Sample Rate**, **Clock Source**, **Digital I/O Mode (S/PDIF Mode)**, and **Speaker Switching (MAIN/ALT)**.
- Implemented class-specific UAC2 control transfers for Sample Rate and Clock Source.
- Implemented proprietary control writes for Digital I/O Mode (S/PDIF Mode) and Speaker Switching.
- Added dynamic descriptor parsing to scan USB Interface 0 configurations and automatically retrieve Clock Source Unit ID and Clock Selector Unit ID.
- Configured MSVC linker flag `/MANIFESTDEPENDENCY` dynamically in `build.rs` to fix `STATUS_ENTRYPOINT_NOT_FOUND` load-time crashes in console-run test binaries under Windows.
- Enabled `vendored` feature on `rusb` dependency to statically link `libusb` and avoid DLL distribution issues.

### Fixed
- Fixed generic type mismatch in the `dispatch_command` function inside `writes.rs` to allow testing setting control commands with `MockTransport`.
- Disabled Master Volume hardware writes by returning a read-only error on physical hardware.

## [0.5.0] - 2026-05-23

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
