#!/usr/bin/env python3
"""
Phase 0, Script 2: Claim the control interface and send INIT commands.

Attempts to:
1. Open the Scarlett 18i20
2. Claim Interface 3 (vendor-specific control interface)
3. Send INIT step 0: read 24 bytes via control transfer (bRequest=0)
4. Send INIT_1: cmd=0x00000000 via control transfer (bRequest=2), read response (bRequest=3)
5. Send INIT_2: cmd=0x00000002, read 84-byte response with firmware version

Requires WinUSB driver installed on the device (via Zadig).
"""

import sys
import os
import struct

os.environ["PATH"] = os.path.dirname(os.path.abspath(__file__)) + os.pathsep + os.environ.get("PATH", "")

try:
    import usb.core
    import usb.util
except ImportError:
    print("ERROR: pyusb not installed. Run: pip install pyusb")
    sys.exit(1)

VID = 0x1235
PID = 0x8215
CONTROL_INTERFACE = 3

# USB control transfer constants (from kernel driver)
USB_TYPE_CLASS = 0x20
USB_RECIP_INTERFACE = 0x01
USB_DIR_OUT = 0x00
USB_DIR_IN = 0x80

CMD_INIT = 0   # bRequest for init step 0
CMD_REQ = 2    # bRequest for sending commands
CMD_RESP = 3   # bRequest for receiving responses

# Packet header: cmd(4) + size(2) + seq(2) + error(4) + pad(4) = 16 bytes
HEADER_SIZE = 16

def build_packet(cmd_id, seq, payload=b""):
    """Build a Scarlett2 command packet."""
    header = struct.pack("<IHHII", cmd_id, len(payload), seq, 0, 0)
    return header + payload

def parse_header(data):
    """Parse a Scarlett2 response packet header."""
    if len(data) < HEADER_SIZE:
        return None
    cmd, size, seq, error, pad = struct.unpack("<IHHII", data[:HEADER_SIZE])
    return {"cmd": cmd, "size": size, "seq": seq, "error": error, "pad": pad}

def hex_dump(data, prefix="  "):
    """Print a hex dump of data."""
    for i in range(0, len(data), 16):
        chunk = data[i:i+16]
        hex_part = " ".join(f"{b:02x}" for b in chunk)
        ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        print(f"{prefix}{i:04x}: {hex_part:<48s} {ascii_part}")

def main():
    print("Phase 0: USB Claim and INIT Test")
    print("=" * 60)
    print()

    # Find device
    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        print("ERROR: Device not found.")
        sys.exit(1)

    print(f"Found Scarlett 18i20 at bus {dev.bus}, address {dev.address}")
    print()

    # Claim interface 3
    print(f"[1] Claiming Interface {CONTROL_INTERFACE}...")
    try:
        if dev.is_kernel_driver_active(CONTROL_INTERFACE):
            dev.detach_kernel_driver(CONTROL_INTERFACE)
            print("    Detached kernel driver")
    except (usb.core.USBError, NotImplementedError):
        pass  # WinUSB doesn't need this

    try:
        usb.util.claim_interface(dev, CONTROL_INTERFACE)
        print("    SUCCESS: Interface claimed!")
    except usb.core.USBError as e:
        print(f"    FAILED: {e}")
        sys.exit(1)
    print()

    # INIT step 0: read 24 bytes via bRequest=0
    print("[2] INIT step 0: Reading 24 bytes (bRequest=0)...")
    try:
        bmRequestType = USB_DIR_IN | USB_TYPE_CLASS | USB_RECIP_INTERFACE
        data = dev.ctrl_transfer(bmRequestType, CMD_INIT, 0, CONTROL_INTERFACE, 24, timeout=5000)
        print(f"    SUCCESS: Got {len(data)} bytes")
        hex_dump(bytes(data))
    except usb.core.USBError as e:
        print(f"    FAILED: {e}")
        print("    (This might be OK — some devices skip init step 0)")
    print()

    # INIT_1: send cmd=0x00000000, seq=1
    print("[3] INIT_1: Sending cmd=0x00000000 (seq=1)...")
    packet = build_packet(0x00000000, seq=1)
    print(f"    TX ({len(packet)} bytes):")
    hex_dump(packet)

    try:
        bmRequestType_out = USB_DIR_OUT | USB_TYPE_CLASS | USB_RECIP_INTERFACE
        written = dev.ctrl_transfer(bmRequestType_out, CMD_REQ, 0, CONTROL_INTERFACE, packet, timeout=5000)
        print(f"    Sent {written} bytes")
    except usb.core.USBError as e:
        print(f"    TX FAILED: {e}")
        sys.exit(1)

    # Read INIT_1 response
    print("    Reading response (bRequest=3)...")
    try:
        bmRequestType_in = USB_DIR_IN | USB_TYPE_CLASS | USB_RECIP_INTERFACE
        resp = dev.ctrl_transfer(bmRequestType_in, CMD_RESP, 0, CONTROL_INTERFACE, 64, timeout=5000)
        resp = bytes(resp)
        print(f"    RX ({len(resp)} bytes):")
        hex_dump(resp)
        hdr = parse_header(resp)
        if hdr:
            print(f"    Parsed: cmd={hdr['cmd']:#010x} size={hdr['size']} seq={hdr['seq']} error={hdr['error']} pad={hdr['pad']}")
    except usb.core.USBError as e:
        print(f"    RX FAILED: {e}")
    print()

    # INIT_2: send cmd=0x00000002, seq=1, expect 84-byte response
    print("[4] INIT_2: Sending cmd=0x00000002 (seq=1)...")
    packet = build_packet(0x00000002, seq=1)
    print(f"    TX ({len(packet)} bytes):")
    hex_dump(packet)

    try:
        written = dev.ctrl_transfer(bmRequestType_out, CMD_REQ, 0, CONTROL_INTERFACE, packet, timeout=5000)
        print(f"    Sent {written} bytes")
    except usb.core.USBError as e:
        print(f"    TX FAILED: {e}")
        sys.exit(1)

    # Read INIT_2 response (expect 16 header + 84 payload = 100 bytes)
    print("    Reading response...")
    try:
        resp = dev.ctrl_transfer(bmRequestType_in, CMD_RESP, 0, CONTROL_INTERFACE, 256, timeout=5000)
        resp = bytes(resp)
        print(f"    RX ({len(resp)} bytes):")
        hex_dump(resp)
        hdr = parse_header(resp)
        if hdr:
            print(f"    Parsed: cmd={hdr['cmd']:#010x} size={hdr['size']} seq={hdr['seq']} error={hdr['error']} pad={hdr['pad']}")
            if len(resp) >= HEADER_SIZE + 12:
                fw_version = struct.unpack_from("<I", resp, HEADER_SIZE + 8)[0]
                print(f"    Firmware version: {fw_version}")
    except usb.core.USBError as e:
        print(f"    RX FAILED: {e}")
    print()

    # Save raw responses as test fixtures
    fixtures_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)

    print("[5] Test complete!")
    print()
    print("RESULTS:")
    print("  - Interface claim: PASSED")
    print("  - Check above for INIT command results")
    print()

    usb.util.release_interface(dev, CONTROL_INTERFACE)

if __name__ == "__main__":
    main()
