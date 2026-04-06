# Phase 0: USB Validation Design — RESULTS

## Goal

Answer the critical blocker: can we claim the Scarlett 18i20's USB control interface on Windows while the Focusrite audio driver retains the audio interfaces?

## Answer

**Yes, the control interface is accessible and the protocol works. But not simultaneously with audio on Windows — the Focusrite driver binds monolithically.**

## Device Interface Map (from USBTreeView + libusb enumeration)

| Interface | Class | Purpose | Endpoints |
|-----------|-------|---------|-----------|
| 0 | Audio Control (0x01/0x01) | UAC2 audio control | None (control pipe) |
| 1 | Audio Streaming (0x01/0x02) | Playback OUT — 20/18/10 ch | EP 0x01 OUT (Isochronous) |
| 2 | Audio Streaming (0x01/0x02) | Capture IN — 20/18/10 ch | EP 0x81 IN (Isochronous) |
| **3** | **Vendor Specific (0xFF)** | **"Focusrite Control"** | **EP 0x83 IN (Interrupt, 64B)** |
| 4 | Audio Control (0x01/0x01) | Legacy UAC1 control | None |
| 5 | MIDI Streaming (0x01/0x03) | MIDI I/O | EP 0x02 OUT + EP 0x82 IN (Bulk) |

## Protocol Validation Results

All commands tested against real Scarlett 18i20 Gen 3, firmware 1644 (Feb 25 2020):

| Command | Status | Notes |
|---------|--------|-------|
| INIT step 0 (bRequest=0) | ✅ | Read 24 bytes |
| INIT_1 (cmd=0x00000000) | ✅ | Response: cmd match, seq 1→0 (init special case), error=0 |
| INIT_2 (cmd=0x00000002) | ✅ | 100 bytes (16 header + 84 payload), firmware=1644 at offset 24 |
| GET_SYNC (cmd=0x00006004) | ✅ | Sync status = 1 (locked) |
| GET_DATA offset=0x31 | ✅ | 64 bytes volume status, sw_hw_switch values visible |
| GET_DATA offset=0x32 | ✅ | 128 bytes routing/config data |
| GET_METER (cmd=0x00001001) | ❌ | Error code 9 — needs investigation (wrong meter count?) |

## USB Driver Situation on Windows

The Focusrite driver (`FocusriteUsb.sys` v4.143.0) binds to the entire USB composite device. It does NOT use the Windows USB Composite Device driver (`usbccgp.sys`) to split the device into per-interface function drivers. This means:

- Zadig only sees the whole device, not individual interfaces
- Replacing the driver with WinUSB works for control access but breaks audio
- Per-interface WinUSB installation is not possible without changing how Windows enumerates the device

### Production Solutions (to be implemented)

1. **Custom composite driver .inf** — Write an .inf that forces `usbccgp.sys` as the parent driver for VID_1235&PID_8215, then install WinUSB on the `MI_03` child device node (Interface 3). This lets the Focusrite audio driver keep interfaces 0-2 and 4-5.
2. **USB filter driver** — A minifilter that intercepts control transfers to Interface 3, sitting between the Focusrite driver and the USB stack.
3. **macOS** — libusb typically accesses individual interfaces alongside kernel drivers. This problem may be Windows-only.

## Test Fixtures Captured

| File | Size | Contents |
|------|------|----------|
| `tests/fixtures/get_sync_response.bin` | 20B | GET_SYNC response (sync=locked) |
| `tests/fixtures/get_data_volume_status.bin` | 80B | Volume status block at offset 0x31 |
| `tests/fixtures/get_data_0x32.bin` | 144B | Config data at offset 0x32 |
| `tests/fixtures/get_meter_response.bin` | 16B | GET_METER error response (error=9) |

## Scripts

- `scripts/01_enumerate.py` — libusb ctypes enumeration (works without opening device)
- `scripts/02_claim_test.py` — Claim interface + INIT sequence (requires WinUSB driver)
- `scripts/03_read_state.py` — Read device state via GET commands (requires WinUSB driver)

## Key Protocol Details Confirmed

- **Control transfers on EP 0:** bRequest=2 (TX), bRequest=3 (RX), wIndex=3 (interface number)
- **Notifications on EP 0x83:** Interrupt IN, 64 bytes max, 0.125ms interval
- **Packet header:** 16 bytes LE — cmd(4) + size(2) + seq(2) + error(4) + pad(4)
- **INIT_2 response payload:** 84 bytes, firmware version as LE u32 at offset 8, build date string at offset 16
