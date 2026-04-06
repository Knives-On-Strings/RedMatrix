# Phase 0: USB Validation Design

## Goal

Answer the critical blocker: can we claim the Scarlett 18i20's USB control interface on Windows while the Focusrite audio driver retains the audio interfaces?

## Approach

Three Python scripts, run sequentially. Each depends on the previous succeeding. All scripts go in `scripts/`.

### Script 1: `01_enumerate.py`
Enumerate the Scarlett 18i20 (VID=0x1235, PID=0x8215) and dump all USB interface descriptors. Identifies the vendor-specific control interface (bInterfaceClass=255) and its endpoint addresses.

**Outcome:** Interface number, endpoint addresses, max packet size documented.

### Script 2: `02_claim_test.py`
Attempt to claim the vendor-specific control interface and send INIT step 0 (bRequest=0, read 24 bytes). Then send INIT_1 (cmd=0x00000000) via a control transfer (bRequest=2) and read the response (bRequest=3).

**Outcome:** Confirms whether USB claiming works while audio is running.

### Script 3: `03_read_state.py`
Send GET_SYNC (cmd=0x00006004) and GET_DATA to read basic device state. Save raw responses as hex dumps to `tests/fixtures/`.

**Outcome:** First real test fixtures for the protocol layer.

## Prerequisites
- Python 3.10+ (installed)
- `pip install pyusb` (installed)
- Zadig (installed) — used to install WinUSB on the control interface ONLY
- libusb backend for Windows (Zadig handles this when it installs WinUSB)

## Manual Steps Between Scripts
1. Run Script 1 to identify the control interface number
2. Use Zadig to install WinUSB driver on that specific interface
3. Verify audio still works (play music)
4. Run Script 2 to test claiming and INIT
5. If Script 2 succeeds, run Script 3

## Safety
All scripts use only read commands (GET_SYNC, GET_DATA). No SET commands. Device can be reset by USB unplug/replug if anything goes wrong.
