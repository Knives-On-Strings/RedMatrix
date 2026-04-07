# 02 — USB Protocol Reference

## Source

All protocol knowledge comes from Geoffrey D. Bennett's Linux kernel driver `mixer_scarlett_gen2.c`. The protocol was reverse-engineered by capturing USB traffic between Focusrite Control 2.3.4 and a Scarlett 18i20 (firmware 1083) using usbmon in July-August 2018, with subsequent additions through 2021.

**Authoritative source file:** `sound/usb/mixer_scarlett_gen2.c` in the Linux kernel tree.
**Browsable snapshot:** https://android.googlesource.com/kernel/common/ (search for `mixer_scarlett_gen2.c`)

## Device Identification

| Field | Value |
|-------|-------|
| USB Vendor ID | `0x1235` (Focusrite-Novation) |
| USB Product ID (18i20 Gen 3) | `0x8215` |
| USB Speed | High Speed (USB 2.0) |
| Connector | USB Type C on device, Type A-to-C cable supplied |

### All Scarlett2-Protocol Devices

| Model | PID | Notes |
|-------|-----|-------|
| 2nd Gen 6i6 | `0x8203` | |
| 2nd Gen 18i8 | `0x8204` | |
| 2nd Gen 18i20 | `0x8201` | |
| 3rd Gen Solo | `0x8211` | No mixer |
| 3rd Gen 2i2 | `0x8210` | No mixer |
| 3rd Gen 4i4 | `0x8212` | |
| 3rd Gen 8i6 | `0x8213` | |
| 3rd Gen 18i8 | `0x8214` | |
| **3rd Gen 18i20** | **`0x8215`** | **Primary target** |
| Clarett USB 2Pre | `0x8206` | |
| Clarett USB 4Pre | `0x8207` | |
| Clarett USB 8Pre | `0x8208` | |
| Clarett+ 2Pre | `0x820a` | |
| Clarett+ 4Pre | `0x820b` | |
| Clarett+ 8Pre | `0x820c` | |

Gen 4 large devices (16i16, 18i16, 18i20) use a **different FCP protocol** — out of scope.

## USB Interface Layout

The Scarlett presents multiple USB interfaces:

- **Audio streaming interfaces** — isochronous endpoints, owned by the Windows audio driver
- **Proprietary control interface** — used for mixer/routing/settings commands (this is what we access)
- **MSD interface** — mass storage "Welcome Disk" (disabled after setup)

The control interface and audio interfaces are separate USB interfaces. This should allow a userspace app to claim the control interface via WinUSB while the Windows audio driver retains the audio interfaces. **This must be validated in Phase 0.**

## Communication Model

Command/response over the control interface's endpoints:

```
Host → Device:  Request packet (type CMD_REQ = 2)
Device → Host:  Response packet (type CMD_RESP = 3)
```

Plus initialization packets (type CMD_INIT = 0) and asynchronous notifications via interrupt endpoint.

## Sequence Numbers

Every request/response pair shares a 16-bit sequence number (`scarlett2_seq`). The host increments this with each command. The device echoes it in the response. A mismatch indicates a protocol error.

## Command IDs

| ID | Name | Direction | Description |
|----|------|-----------|-------------|
| `0x00000000` | INIT_1 | write | First initialization command |
| `0x00000002` | INIT_2 | write | Second initialization command |
| `0x00001001` | GET_METER | read | Read level meters for all ports |
| `0x00002001` | GET_MIX | read | Read mixer matrix gain values |
| `0x00002002` | SET_MIX | write | Set mixer matrix gain values |
| `0x00003001` | GET_MUX | read | Read routing/mux configuration |
| `0x00003002` | SET_MUX | write | Set routing/mux configuration |
| `0x00006004` | GET_SYNC | read | Read clock sync status |
| `0x00800000` | GET_DATA | read | Read configuration data block |
| `0x00800001` | SET_DATA | write | Write configuration data block |
| `0x00800002` | DATA_CMD | write | Execute a data command |

### DATA_CMD Sub-commands

| Value | Meaning |
|-------|---------|
| `6` | CONFIG_SAVE — write current config to flash |

Use CONFIG_SAVE sparingly — flash has finite write cycles.

## Notification System

The device sends asynchronous notifications when hardware state changes (knob turns, button presses, external clock events):

| Mask | Meaning |
|------|---------|
| `0x00000008` | Sync status changed |
| `0x00200000` | Dim/mute buttons changed |
| `0x00400000` | Monitor volume changed |
| `0x00800000` | Input settings changed (pad, air, phantom, level) |
| `0x01000000` | Monitor other settings changed |

The app must poll or listen for these to keep the UI synchronized with the hardware.

## Port Type IDs

Used in the mux/routing protocol to identify signal sources and destinations:

| Port Type | ID | Source Label | Destination Label |
|-----------|------|-------------|------------------|
| None (off) | `0x000` | "Off" | — |
| Analogue | `0x080` | "Analogue N" | "Analogue Output N" |
| S/PDIF | `0x180` | "S/PDIF N" | "S/PDIF Output N" |
| ADAT | `0x200` | "ADAT N" | "ADAT Output N" |
| Mixer | `0x300` | "Mix X" (A-L) | "Mixer Input N" |
| PCM | `0x600` | "PCM N" | "PCM N" |

## Mixer Gain Encoding

The mixer does not use linear dB values. Gains are mapped from a dB index to a 16-bit hardware value using a lookup table.

**Index formula:** `dB_index = (dB + 80) * 2` (range 0–172)

**Hardware value formula:** `value = int(8192 * pow(10, ((dB_index - 160) / 2 / 20)))`

Key reference points:

| dB | Index | Hardware Value |
|----|-------|---------------|
| -80 (silence) | 0 | 0 |
| -60 | 40 | 8 |
| -40 | 80 | 81 |
| -20 | 120 | 819 |
| -6 | 148 | 4105 |
| 0 (unity) | 160 | 8192 |
| +6 (max) | 172 | 16345 |

The full 173-entry lookup table is in the kernel source and must be ported exactly.

## Volume Encoding

Output volumes use a bias of 127: `volume_raw = dB_value + 127`

So 0dB = 127, -127dB = 0, etc. The range is 1 dB per step (128 values, 0..127 raw).

Source: kernel driver `SCARLETT2_VOLUME_BIAS = 127` and `DECLARE_TLV_DB_MINMAX(db_scale_scarlett2_gain, -12700, 0)` which is -127.00 dB to 0.00 dB in ALSA hundredths-of-dB units.

## Volume Status Block

Read from offset `0x31` using GET_DATA:

```
struct volume_status {
    u8  dim_mute[2];           // [0]=mute, [1]=dim
    u8  pad1;
    s16 sw_vol[10];            // software volume per output
    s16 hw_vol[10];            // actual volume inc. dim
    u8  mute_switch[10];       // per-channel mute
    u8  sw_hw_switch[10];      // 0=SW control, 1=HW control
    // master_vol at known offset
};
```

## Meter Levels

GET_METER returns levels for all ports. Request includes a "magic" value of 1. Response is an array of 16-bit level values for each meter point. The number of meters equals the sum of all output port counts for the device.

## MUX Configuration

The mux (routing) table has different layouts depending on sample rate. Three tables exist: one for each sample rate band (44.1/48, 88.2/96, 176.4/192). The `mux_assignment` arrays in the device info structs define the order and count of entries.

## Safety Notes

- **GET commands are read-only** and cannot damage the device
- **SET commands change device state** but are non-destructive (routing, volume, etc.)
- **DATA_CMD with CONFIG_SAVE** writes to flash — use sparingly
- **Firmware commands** (erase, write) can brick the device — not implemented in this app
- If the device stops responding, USB unplug/replug resets it

## Key Source Files

| File | Repo | What to study |
|------|------|--------------|
| `mixer_scarlett2.c` | [linux-fcp](https://github.com/geoffreybennett/linux-fcp) | Everything — commands, data structures, device configs |
| `scarlett2.h` | [scarlett2](https://github.com/geoffreybennett/scarlett2) | ioctl definitions for firmware operations |
| `scarlett2-ioctls.c` | [scarlett2](https://github.com/geoffreybennett/scarlett2) | Userspace ioctl communication example |
| `alsa-scarlett-gui` | [alsa-scarlett-gui](https://github.com/geoffreybennett/alsa-scarlett-gui) | Gtk4 GUI, demo `.state` files for every device, simulation mode |
| `fcp-support` | [fcp-support](https://github.com/geoffreybennett/fcp-support) | FCP protocol tools (Gen 4 large devices) |
| `scarlett2-firmware` | [scarlett2-firmware](https://github.com/geoffreybennett/scarlett2-firmware) | Firmware binaries, version numbers |
| `scarlettmixer.py` | x42/scarlettmixer | Gen 1 USB vendor requests (different protocol, reference only) |

## Geoffrey Bennett's Repository Index

All at https://github.com/geoffreybennett:

- **linux-fcp** — kernel driver fork with latest Scarlett/Clarett/Vocaster support (our primary protocol reference)
- **alsa-scarlett-gui** — Gtk4 control panel with demo state files for every supported device (our test fixture source and UI reference)
- **scarlett2** — firmware management utility for Gen 2/3/4 and Clarett
- **scarlett2-firmware** — firmware binaries for Scarlett2-protocol devices
- **fcp-support** — Linux FCP (Focusrite Control Protocol) tools for Gen 4 large devices
- **fcp-firmware** — firmware for FCP-protocol devices
