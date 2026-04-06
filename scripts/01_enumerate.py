#!/usr/bin/env python3
"""
Phase 0, Script 1: Enumerate USB interfaces on the Scarlett 18i20.

Finds the device by VID/PID and dumps all interface descriptors.
Identifies the vendor-specific control interface (bInterfaceClass=255).

Run: python scripts/01_enumerate.py

No driver changes needed for this script — it just reads descriptors.
"""

import sys

try:
    import usb.core
    import usb.util
except ImportError:
    print("ERROR: pyusb not installed. Run: pip install pyusb")
    sys.exit(1)

VID = 0x1235  # Focusrite
PID = 0x8215  # Scarlett 18i20 Gen 3

def main():
    print(f"Looking for Focusrite Scarlett 18i20 Gen 3 (VID={VID:#06x}, PID={PID:#06x})...")
    print()

    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        print("ERROR: Device not found.")
        print("  - Is the Scarlett 18i20 connected and powered on?")
        print("  - Check Device Manager for the device.")
        print()
        # Also try finding ANY Focusrite device
        print("Searching for any Focusrite device (VID=0x1235)...")
        all_focusrite = list(usb.core.find(find_all=True, idVendor=VID))
        if all_focusrite:
            for d in all_focusrite:
                print(f"  Found: PID={d.idProduct:#06x} at bus {d.bus}, address {d.address}")
        else:
            print("  No Focusrite devices found at all.")
        sys.exit(1)

    print(f"Found: {dev.manufacturer} {dev.product}")
    print(f"  Bus: {dev.bus}, Address: {dev.address}")
    print(f"  USB Version: {dev.bcdUSB >> 8}.{(dev.bcdUSB >> 4) & 0xF}{dev.bcdUSB & 0xF}")
    print(f"  Device Class: {dev.bDeviceClass}")
    print(f"  Num Configurations: {dev.bNumConfigurations}")
    print()

    cfg = dev.get_active_configuration()
    if cfg is None:
        print("ERROR: No active configuration. Device may not be initialized.")
        sys.exit(1)

    print(f"Active Configuration: {cfg.bConfigurationValue}")
    print(f"  Num Interfaces: {cfg.bNumInterfaces}")
    print()

    control_iface = None

    for intf in cfg:
        class_name = {
            0: "Unspecified",
            1: "Audio",
            2: "CDC",
            3: "HID",
            8: "Mass Storage",
            255: "Vendor Specific",
        }.get(intf.bInterfaceClass, f"Unknown ({intf.bInterfaceClass})")

        print(f"Interface {intf.bInterfaceNumber}:")
        print(f"  Class: {intf.bInterfaceClass} ({class_name})")
        print(f"  SubClass: {intf.bInterfaceSubClass}")
        print(f"  Protocol: {intf.bInterfaceProtocol}")
        print(f"  Num Endpoints: {intf.bNumEndpoints}")
        print(f"  Alternate Setting: {intf.bAlternateSetting}")

        if intf.bInterfaceClass == 255:
            control_iface = intf
            print(f"  >>> THIS IS THE CONTROL INTERFACE <<<")

        for ep in intf:
            direction = "IN" if usb.util.endpoint_direction(ep.bEndpointAddress) == usb.util.ENDPOINT_IN else "OUT"
            transfer_type = {
                0: "Control",
                1: "Isochronous",
                2: "Bulk",
                3: "Interrupt",
            }.get(usb.util.endpoint_type(ep.bmAttributes), "Unknown")

            print(f"  Endpoint {ep.bEndpointAddress:#04x}:")
            print(f"    Direction: {direction}")
            print(f"    Transfer Type: {transfer_type}")
            print(f"    Max Packet Size: {ep.wMaxPacketSize}")
            print(f"    Interval: {ep.bInterval}")

        print()

    if control_iface is not None:
        print("=" * 60)
        print(f"CONTROL INTERFACE FOUND: Interface {control_iface.bInterfaceNumber}")
        print(f"  Use this interface number with Zadig to install WinUSB.")
        print()
        print("NEXT STEPS:")
        print(f"  1. Open Zadig")
        print(f"  2. Options > List All Devices")
        print(f"  3. Find the Scarlett 18i20 interface {control_iface.bInterfaceNumber}")
        print(f"     (It may show as 'Interface {control_iface.bInterfaceNumber}' in the dropdown)")
        print(f"  4. Select WinUSB as the target driver")
        print(f"  5. Click 'Replace Driver' or 'Install Driver'")
        print(f"  6. Verify audio still works (play music)")
        print(f"  7. Then run: python scripts/02_claim_test.py")
        print("=" * 60)
    else:
        print("WARNING: No vendor-specific (class 255) interface found.")
        print("  The control interface may be using a different class,")
        print("  or the device descriptor layout may differ from expectations.")

if __name__ == "__main__":
    main()
