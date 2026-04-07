# 06 — Open Questions

## Blockers (must answer before writing code)

### 1. Can we claim the USB control interface on Windows? — ANSWERED: Yes, with caveats
**Status:** Validated 2026-04-06

**Finding:** The Scarlett 18i20 Gen 3 exposes 6 USB interfaces. Interface 3 (class 0xFF, "Focusrite Control") is the proprietary control interface with one interrupt endpoint (EP 0x83 IN, 64 bytes). Command/response uses USB control transfers on endpoint 0 (bRequest=2 for TX, bRequest=3 for RX).

**The problem:** The Focusrite Windows driver (`FocusriteUsb.sys`) binds to the **entire composite device** as a single driver — it does not use the Windows USB Composite Device driver to split interfaces. Zadig cannot target Interface 3 individually. Replacing the whole device driver with WinUSB works but breaks audio.

**The solution (for production):**
1. Write a custom WinUSB `.inf` file targeting `USB\VID_1235&PID_8215&MI_03` (Interface 3 only). This requires the Windows USB Composite Device driver (`usbccgp.sys`) to split the device first.
2. Alternatively, a USB filter driver that sits between the Focusrite driver and the USB stack, intercepting control transfers to Interface 3.
3. On macOS, libusb can access individual interfaces without driver replacement — this problem is Windows-specific.

**Validated:** INIT_1, INIT_2, GET_SYNC, GET_DATA all work correctly. Firmware version 1644 extracted. Real test fixtures captured.

### 2. Can RedMatrix and Focusrite Control coexist? — PARTIALLY ANSWERED
**Status:** Needs further investigation

With the current Focusrite driver binding monolithically, RedMatrix cannot access the control interface while the Focusrite driver is loaded. The two apps cannot run simultaneously on Windows without the driver solution described in Blocker #1.

On macOS this may be different — libusb can often access interfaces alongside kernel drivers. Needs testing.

### 3. Full binary packet format — ANSWERED: Confirmed
**Status:** Validated 2026-04-06

Packet format confirmed against real hardware:

```
Offset  Size  Field    Notes
0       4     cmd      Command ID, little-endian
4       2     size     Payload size (data only, not header)
6       2     seq      Sequence number
8       4     error    0 = success
12      4     pad      Must be 0
16+     var   payload  Command-specific data
```

USB control transfer details:
- TX: bRequest=2 (CMD_REQ), bmRequestType=0x21, wIndex=3 (interface number)
- RX: bRequest=3 (CMD_RESP), bmRequestType=0xA1, wIndex=3
- Init step 0: bRequest=0 (CMD_INIT), reads 24 bytes
- Notifications: EP 0x83 IN, interrupt, 64 bytes max

Sequence handling confirmed: INIT_1 sent with seq=1, response has seq=0 (init special case). INIT_2 sent with seq=1, response has seq=1.

## Decided

### 4. Development language — Rust via Claude Code
Rust backend will be written by Claude Code. No prior Rust expertise required. Claude Code handles the protocol layer, USB transport, WebSocket server, and crypto. Human reviews and tests.

### 5. iPad app — Swift + WKWebView
Native Swift app wrapping the shared React client in WKWebView. Gives native Keychain for crypto key storage, camera access for QR pairing, and proper App Store presence.

### 6. macOS support — yes
Tauri is cross-platform. Many Scarlett users are on Mac, and Mac users also lost the iOS remote when Focusrite discontinued it. Target Windows and macOS from v1. The Rust USB layer uses `rusb` which wraps libusb on both platforms. The React frontend is platform-agnostic.

### 7. MIDI — nice to have, not required
The 18i20 has MIDI I/O but it's standard USB MIDI class, not part of the Scarlett2 protocol. If mirroring the MIDI activity LED in the front panel display is easy (it may come through the notification system), include it. Don't build MIDI routing features — that's the OS's job.

### 9. Pricing for RedMatrix Remote
Paid app, low price point. **$5–$10 USD**, either upfront or IAP unlock from a free download. Leaning toward upfront paid — simpler, no free tier to support, clear value proposition. Final pricing decision before App Store submission.

## Open (decide before shipping)

### 8. Gain knob readback — ANSWERED: No
On Gen 2 and Gen 3 Scarletts, the gain knobs are purely analog potentiometers before the ADC. The hardware has no way to report knob position — only post-ADC amplitude is visible. The UI can show metered input level but NOT a gain dB value. This is why Focusrite Control doesn't show it either. (Gen 4 uses digitally controlled preamps, which is a different protocol.)

### 10. Final product name
RedMatrix is a working name. Must be finalised before:
- GitHub repo goes public
- App Store submission
- Any marketing or documentation goes external

No immediate pressure but track it.

### 11. Reaching out to Geoffrey Bennett
Geoffrey has a working relationship with Focusrite for the Linux driver effort. A Windows alternative is more directly competitive with Focusrite Control than a Linux-only tool. Worth considering:
- Reaching out before going public — he may have insights about Windows USB access, protocol quirks, or Focusrite's likely stance
- He might appreciate knowing about the project (or might not — it could complicate his relationship with Focusrite)
- His work is properly credited regardless — this project couldn't exist without it

Decision: reach out once Phase 0 validates the approach, before the public repo launches. A heads-up is courteous.

### 12. Tauri IPC vs local WebSocket for desktop meters
Tauri's standard IPC (`invoke`) serializes heavily and may cause CPU spikes at 60Hz meter updates. Consider using Tauri v2 custom protocol schemes (`tauri://`) or a local WebSocket for the desktop React UI to unify the meter pipeline with the remote client path and keep the Rust backend decoupled. Decide during Phase 2 when metering is implemented — profile before committing to a workaround.

### 13. Panning on the Mixer tab
The UX spec (04-UX.md) describes channel strips with faders but no pan control. Since the DSP is a matrix, "pan" is implemented by adjusting L vs R bus gains. Users building monitor mixes will expect a Pan knob rather than going to the Matrix tab to manually tweak L/R. Add pan control to Mixer channel strips — it's a UI-only concern that maps to two matrix gain values.

### 14. Notification reliability — slow polling fallback
USB interrupt notifications can occasionally be dropped. Consider a slow background poll (every 5 seconds) that does a full state dump (GET_DATA, GET_MUX) and diffs against DeviceState, ensuring the UI stays synced even if a notification is swallowed. Low priority but worth adding after the core works.

### 15. CLA for open-source contributions
The React code is dual-licensed (GPL-3.0 public, proprietary for iOS). If we accept external PRs to the React code, contributors' GPL code cannot legally be used in the proprietary iOS app without a Contributor License Agreement (CLA). Set up a CLA before accepting any PRs.

### 16. Config file paths — DECIDED

All configuration files are JSON, stored in:
- **Windows:** `%USERPROFILE%\knivesonstrings\redmatrix\`
- **macOS:** `~/knivesonstrings/redmatrix/`

Files:
- `server_keys.json` — ECDH server keypair
- `paired_devices.json` — paired iPad client public keys
- `channel_labels_{serial}.json` — user-defined channel names per device
- `config.json` — server settings (port, name, max_saves_per_hour, etc.)

### 17. Word clock configuration
The 18i20 has a BNC word clock output. Is word clock source selection the same as the clock source setting in the protocol (Internal/S/PDIF/ADAT), or is it a separate control? The manual implies they're the same. Verify in the kernel source or during Phase 0.

### 17. Focusrite Control installer side effects
Does installing Focusrite Control's Windows driver change the USB interface configuration in a way that affects our ability to claim the control interface? Should we test both with and without FC installed?
