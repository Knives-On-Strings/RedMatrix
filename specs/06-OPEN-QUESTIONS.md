# 06 — Open Questions

## Blockers (must answer before writing code)

### 1. Can we claim the USB control interface on Windows?
**Status:** Unvalidated — Phase 0 task

Can WinUSB/libusb access the Scarlett's control endpoint while Focusrite's audio driver owns the streaming interfaces? Everything depends on this. If the control interface is a separate USB interface (likely), this should work. If Focusrite's driver claims all interfaces, we need an alternative approach.

**Fallback strategies if WinUSB on the sub-interface fails:**
1. Filter driver that selectively exposes the control interface
2. Investigate whether Focusrite Control exposes a local IPC/WebSocket/RPC server for its own UI — wrapping their local API may be a last-resort escape hatch on Windows
3. Require user to close Focusrite Control (acceptable tradeoff)

### 2. Can RedMatrix and Focusrite Control coexist?
**Status:** Unknown

If a user has Focusrite Control installed, can both apps access the control interface simultaneously? Or does one lock the other out? Affects UX — do we tell users to close FC before launching RedMatrix?

### 3. Full binary packet format
**Status:** Partially known

We have command IDs and high-level structure from the kernel source, but the `scarlett2_usb()` function that builds/sends actual packets was truncated. Need the full header layout: byte order, header size, sequence number position, payload offset, response format. Resolution: clone the kernel driver repo locally and read it with Claude Code, or extract from Phase 0 Wireshark captures.

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

### 16. Word clock configuration
The 18i20 has a BNC word clock output. Is word clock source selection the same as the clock source setting in the protocol (Internal/S/PDIF/ADAT), or is it a separate control? The manual implies they're the same. Verify in the kernel source or during Phase 0.

### 17. Focusrite Control installer side effects
Does installing Focusrite Control's Windows driver change the USB interface configuration in a way that affects our ability to claim the control interface? Should we test both with and without FC installed?
