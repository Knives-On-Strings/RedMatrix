#!/usr/bin/env python3
"""
Phase 0, Script 1: Enumerate USB interfaces on the Scarlett 18i20.

Uses libusb directly via ctypes to read config descriptors without
opening the device (which fails when the Focusrite driver owns it).
"""

import sys
import os
import ctypes
from ctypes import byref, c_int, c_uint8, c_uint16, c_uint32, POINTER, Structure, c_void_p, c_char_p

# Point at the local libusb DLL
dll_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "libusb-1.0.dll")
if not os.path.exists(dll_path):
    print(f"ERROR: libusb-1.0.dll not found at {dll_path}")
    sys.exit(1)

lib = ctypes.CDLL(dll_path)

VID = 0x1235
PID = 0x8215

# Minimal libusb structures
class libusb_device_descriptor(Structure):
    _fields_ = [
        ("bLength", c_uint8),
        ("bDescriptorType", c_uint8),
        ("bcdUSB", c_uint16),
        ("bDeviceClass", c_uint8),
        ("bDeviceSubClass", c_uint8),
        ("bDeviceProtocol", c_uint8),
        ("bMaxPacketSize0", c_uint8),
        ("idVendor", c_uint16),
        ("idProduct", c_uint16),
        ("bcdDevice", c_uint16),
        ("iManufacturer", c_uint8),
        ("iProduct", c_uint8),
        ("iSerialNumber", c_uint8),
        ("bNumConfigurations", c_uint8),
    ]

class libusb_endpoint_descriptor(Structure):
    _fields_ = [
        ("bLength", c_uint8),
        ("bDescriptorType", c_uint8),
        ("bEndpointAddress", c_uint8),
        ("bmAttributes", c_uint8),
        ("wMaxPacketSize", c_uint16),
        ("bInterval", c_uint8),
        ("bRefresh", c_uint8),
        ("bSynchAddress", c_uint8),
        ("extra", c_void_p),
        ("extra_length", c_int),
    ]

class libusb_interface_descriptor(Structure):
    _fields_ = [
        ("bLength", c_uint8),
        ("bDescriptorType", c_uint8),
        ("bInterfaceNumber", c_uint8),
        ("bAlternateSetting", c_uint8),
        ("bNumEndpoints", c_uint8),
        ("bInterfaceClass", c_uint8),
        ("bInterfaceSubClass", c_uint8),
        ("bInterfaceProtocol", c_uint8),
        ("iInterface", c_uint8),
        ("endpoint", POINTER(libusb_endpoint_descriptor)),
        ("extra", c_void_p),
        ("extra_length", c_int),
    ]

class libusb_interface(Structure):
    _fields_ = [
        ("altsetting", POINTER(libusb_interface_descriptor)),
        ("num_altsetting", c_int),
    ]

class libusb_config_descriptor(Structure):
    _fields_ = [
        ("bLength", c_uint8),
        ("bDescriptorType", c_uint8),
        ("wTotalLength", c_uint16),
        ("bNumInterfaces", c_uint8),
        ("bConfigurationValue", c_uint8),
        ("iConfiguration", c_uint8),
        ("bmAttributes", c_uint8),
        ("MaxPower", c_uint8),
        ("interface", POINTER(libusb_interface)),
        ("extra", c_void_p),
        ("extra_length", c_int),
    ]

def main():
    print(f"Looking for Focusrite Scarlett 18i20 Gen 3 (VID={VID:#06x}, PID={PID:#06x})...")
    print()

    ctx = c_void_p()
    ret = lib.libusb_init(byref(ctx))
    if ret != 0:
        print(f"ERROR: libusb_init failed ({ret})")
        sys.exit(1)

    dev_list = c_void_p()
    count = lib.libusb_get_device_list(ctx, byref(dev_list))
    if count < 0:
        print(f"ERROR: libusb_get_device_list failed ({count})")
        sys.exit(1)

    # Set up proper function signatures for 64-bit pointers
    lib.libusb_get_device_descriptor.argtypes = [c_void_p, POINTER(libusb_device_descriptor)]
    lib.libusb_get_device_descriptor.restype = c_int
    lib.libusb_get_bus_number.argtypes = [c_void_p]
    lib.libusb_get_bus_number.restype = c_uint8
    lib.libusb_get_device_address.argtypes = [c_void_p]
    lib.libusb_get_device_address.restype = c_uint8
    lib.libusb_get_active_config_descriptor.argtypes = [c_void_p, POINTER(POINTER(libusb_config_descriptor))]
    lib.libusb_get_active_config_descriptor.restype = c_int
    lib.libusb_get_config_descriptor.argtypes = [c_void_p, c_uint8, POINTER(POINTER(libusb_config_descriptor))]
    lib.libusb_get_config_descriptor.restype = c_int
    lib.libusb_free_config_descriptor.argtypes = [POINTER(libusb_config_descriptor)]
    lib.libusb_free_device_list.argtypes = [c_void_p, c_int]

    # Find our device
    target = None
    desc = libusb_device_descriptor()
    device_array = ctypes.cast(dev_list, POINTER(c_void_p))

    for i in range(count):
        dev = device_array[i]
        if dev is None or dev == 0:
            break
        ret = lib.libusb_get_device_descriptor(dev, byref(desc))
        if ret == 0 and desc.idVendor == VID and desc.idProduct == PID:
            target = dev
            break

    if target is None:
        print("ERROR: Device not found.")
        lib.libusb_free_device_list(dev_list, 1)
        lib.libusb_exit(ctx)
        sys.exit(1)

    bus = lib.libusb_get_bus_number(target)
    addr = lib.libusb_get_device_address(target)
    print(f"Found device at bus {bus}, address {addr}")
    print(f"  VID: {desc.idVendor:#06x}, PID: {desc.idProduct:#06x}")
    print(f"  Device Class: {desc.bDeviceClass:#04x}")
    print()

    # Read config descriptor (doesn't require opening the device!)
    config_ptr = POINTER(libusb_config_descriptor)()
    ret = lib.libusb_get_active_config_descriptor(target, byref(config_ptr))
    if ret != 0:
        # Try config index 0 as fallback
        ret = lib.libusb_get_config_descriptor(target, 0, byref(config_ptr))
    if ret != 0:
        print(f"ERROR: Cannot read config descriptor ({ret})")
        lib.libusb_free_device_list(dev_list, 1)
        lib.libusb_exit(ctx)
        sys.exit(1)

    cfg = config_ptr.contents
    print(f"Configuration {cfg.bConfigurationValue}:")
    print(f"  Num Interfaces: {cfg.bNumInterfaces}")
    print()

    control_iface_num = None

    for i in range(cfg.bNumInterfaces):
        iface = cfg.interface[i]
        # Show only alt setting 0 for each interface
        if iface.num_altsetting == 0:
            continue
        alt = iface.altsetting[0]

        class_names = {
            0x00: "Unspecified",
            0x01: "Audio",
            0x02: "CDC",
            0x03: "HID",
            0x08: "Mass Storage",
            0xFF: "Vendor Specific",
        }
        class_name = class_names.get(alt.bInterfaceClass, f"0x{alt.bInterfaceClass:02x}")

        subclass_info = ""
        if alt.bInterfaceClass == 0x01:
            subclass_names = {0x01: "Audio Control", 0x02: "Audio Streaming", 0x03: "MIDI Streaming"}
            subclass_info = f" ({subclass_names.get(alt.bInterfaceSubClass, '?')})"

        is_control = alt.bInterfaceClass == 0xFF
        marker = "  >>> CONTROL INTERFACE <<<" if is_control else ""

        print(f"Interface {alt.bInterfaceNumber}: Class={class_name}{subclass_info}  "
              f"SubClass={alt.bInterfaceSubClass}  Protocol={alt.bInterfaceProtocol}  "
              f"Endpoints={alt.bNumEndpoints}  AltSettings={iface.num_altsetting}"
              f"{marker}")

        if is_control:
            control_iface_num = alt.bInterfaceNumber

        for j in range(alt.bNumEndpoints):
            ep = alt.endpoint[j]
            direction = "IN" if ep.bEndpointAddress & 0x80 else "OUT"
            xfer_type = ["Control", "Isochronous", "Bulk", "Interrupt"][ep.bmAttributes & 0x03]
            print(f"    EP {ep.bEndpointAddress:#04x}: {direction} {xfer_type}  "
                  f"MaxPacket={ep.wMaxPacketSize}  Interval={ep.bInterval}")

    lib.libusb_free_config_descriptor(config_ptr)
    lib.libusb_free_device_list(dev_list, 1)
    lib.libusb_exit(ctx)

    print()
    if control_iface_num is not None:
        print("=" * 60)
        print(f"CONTROL INTERFACE: Interface {control_iface_num}")
        print(f"  Class 0xFF (Vendor Specific) = 'Focusrite Control'")
        print()
        print("NEXT STEP:")
        print(f"  Use Zadig to install WinUSB on Interface {control_iface_num}")
        print(f"  Then run: python scripts/02_claim_test.py")
        print("=" * 60)
    else:
        print("WARNING: No vendor-specific (class 0xFF) interface found.")

if __name__ == "__main__":
    main()
