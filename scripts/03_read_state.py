#!/usr/bin/env python3
"""
Phase 0, Script 3: Read device state via GET commands.

Sends read-only commands to dump device state:
- GET_SYNC (0x00006004): clock sync status
- GET_DATA (0x00800000): configuration data blocks
- GET_METER (0x00001001): level meters

Saves raw responses as test fixtures in tests/fixtures/.
"""

import sys
import os
import struct
import json
import time

os.environ["PATH"] = os.path.dirname(os.path.abspath(__file__)) + os.pathsep + os.environ.get("PATH", "")

import usb.core
import usb.util

VID = 0x1235
PID = 0x8215
CONTROL_INTERFACE = 3

USB_TYPE_CLASS = 0x20
USB_RECIP_INTERFACE = 0x01
USB_DIR_OUT = 0x00
USB_DIR_IN = 0x80
CMD_INIT = 0
CMD_REQ = 2
CMD_RESP = 3

HEADER_SIZE = 16

class Scarlett2:
    """Minimal Scarlett2 protocol driver for testing."""

    def __init__(self, dev, interface):
        self.dev = dev
        self.interface = interface
        self.seq = 0
        self.bmrt_out = USB_DIR_OUT | USB_TYPE_CLASS | USB_RECIP_INTERFACE
        self.bmrt_in = USB_DIR_IN | USB_TYPE_CLASS | USB_RECIP_INTERFACE

    def init(self):
        """Run the full initialization sequence."""
        # Step 0
        data = self.dev.ctrl_transfer(self.bmrt_in, CMD_INIT, 0, self.interface, 24, timeout=5000)
        print(f"  INIT step 0: {len(data)} bytes")

        # INIT_1
        self.seq = 1
        resp = self._command(0x00000000)
        print(f"  INIT_1: cmd={resp['cmd']:#010x} seq={resp['seq']} error={resp['error']}")

        # INIT_2
        self.seq = 1
        resp = self._command(0x00000002, resp_size=100)
        fw = struct.unpack_from("<I", resp["payload"], 8)[0] if len(resp["payload"]) >= 12 else 0
        print(f"  INIT_2: firmware={fw}")
        return fw

    def _command(self, cmd_id, payload=b"", resp_size=64):
        """Send a command and return the response."""
        seq = self.seq
        self.seq += 1

        header = struct.pack("<IHHII", cmd_id, len(payload), seq, 0, 0)
        packet = header + payload

        self.dev.ctrl_transfer(self.bmrt_out, CMD_REQ, 0, self.interface, packet, timeout=5000)

        # Small delay for device to process
        time.sleep(0.01)

        resp = bytes(self.dev.ctrl_transfer(self.bmrt_in, CMD_RESP, 0, self.interface, resp_size, timeout=5000))

        hdr = struct.unpack("<IHHII", resp[:HEADER_SIZE])
        return {
            "cmd": hdr[0],
            "size": hdr[1],
            "seq": hdr[2],
            "error": hdr[3],
            "pad": hdr[4],
            "payload": resp[HEADER_SIZE:],
            "raw": resp,
        }

    def get_sync(self):
        return self._command(0x00006004, resp_size=64)

    def get_data(self, offset, size):
        payload = struct.pack("<II", offset, size)
        return self._command(0x00800000, payload=payload, resp_size=HEADER_SIZE + size)

    def get_meter(self, num_meters=65):
        payload = struct.pack("<I", 1)  # magic = 1
        return self._command(0x00001001, payload=payload, resp_size=HEADER_SIZE + num_meters * 2)


def hex_dump(data, prefix="  "):
    for i in range(0, len(data), 16):
        chunk = data[i:i+16]
        hex_part = " ".join(f"{b:02x}" for b in chunk)
        ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        print(f"{prefix}{i:04x}: {hex_part:<48s} {ascii_part}")


def save_fixture(name, data, fixtures_dir):
    path = os.path.join(fixtures_dir, name)
    with open(path, "wb") as f:
        f.write(data)
    print(f"  Saved: {path} ({len(data)} bytes)")


def main():
    print("Phase 0: Read Device State")
    print("=" * 60)
    print()

    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        print("ERROR: Device not found.")
        sys.exit(1)

    try:
        if dev.is_kernel_driver_active(CONTROL_INTERFACE):
            dev.detach_kernel_driver(CONTROL_INTERFACE)
    except (usb.core.USBError, NotImplementedError):
        pass

    usb.util.claim_interface(dev, CONTROL_INTERFACE)

    fixtures_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)

    s = Scarlett2(dev, CONTROL_INTERFACE)

    # Initialize
    print("[1] Initializing...")
    fw = s.init()
    print()

    # GET_SYNC
    print("[2] GET_SYNC (clock status)...")
    resp = s.get_sync()
    print(f"  Response: cmd={resp['cmd']:#010x} size={resp['size']} error={resp['error']}")
    hex_dump(resp["raw"])
    save_fixture("get_sync_response.bin", resp["raw"], fixtures_dir)
    if len(resp["payload"]) >= 4:
        sync_status = struct.unpack_from("<I", resp["payload"])[0]
        print(f"  Sync status: {sync_status} ({'Locked' if sync_status else 'Unlocked'})")
    print()

    # GET_DATA: Volume status block (offset 0x31)
    print("[3] GET_DATA offset=0x31 size=64 (volume status)...")
    try:
        resp = s.get_data(0x31, 64)
        print(f"  Response: cmd={resp['cmd']:#010x} size={resp['size']} error={resp['error']}")
        hex_dump(resp["raw"])
        save_fixture("get_data_volume_status.bin", resp["raw"], fixtures_dir)
    except usb.core.USBError as e:
        print(f"  FAILED: {e}")
    print()

    # GET_METER
    print("[4] GET_METER (level meters)...")
    try:
        resp = s.get_meter(65)
        print(f"  Response: cmd={resp['cmd']:#010x} size={resp['size']} error={resp['error']}")
        if resp["payload"]:
            # Parse as u16 array
            num_values = len(resp["payload"]) // 2
            values = struct.unpack(f"<{num_values}H", resp["payload"][:num_values*2])
            nonzero = [(i, v) for i, v in enumerate(values) if v > 0]
            print(f"  {num_values} meter values, {len(nonzero)} non-zero")
            if nonzero:
                for idx, val in nonzero[:10]:
                    print(f"    Meter[{idx}] = {val}")
        save_fixture("get_meter_response.bin", resp["raw"], fixtures_dir)
    except usb.core.USBError as e:
        print(f"  FAILED: {e}")
    print()

    # GET_DATA: MUX routing (offset varies, try a few)
    print("[5] GET_DATA offset=0x32 size=128 (routing/mux)...")
    try:
        resp = s.get_data(0x32, 128)
        print(f"  Response: cmd={resp['cmd']:#010x} size={resp['size']} error={resp['error']}")
        hex_dump(resp["raw"])
        save_fixture("get_data_0x32.bin", resp["raw"], fixtures_dir)
    except usb.core.USBError as e:
        print(f"  FAILED: {e}")
    print()

    print("=" * 60)
    print("Phase 0 validation complete!")
    print(f"Fixtures saved to: {fixtures_dir}")
    print()
    print("REMEMBER: Restore the Focusrite driver in Device Manager when done!")
    print("  Device Manager > Scarlett 18i20 > Update Driver > Let me pick > Focusrite")

    usb.util.release_interface(dev, CONTROL_INTERFACE)

if __name__ == "__main__":
    main()
