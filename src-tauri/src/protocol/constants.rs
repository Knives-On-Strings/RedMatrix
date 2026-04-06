/// Focusrite USB Vendor ID (shared across all Scarlett/Clarett devices).
pub const USB_VID: u16 = 0x1235;

// -- Command IDs --

pub const CMD_INIT_1: u32 = 0x0000_0000;
pub const CMD_INIT_2: u32 = 0x0000_0002;
pub const CMD_GET_METER: u32 = 0x0000_1001;
pub const CMD_GET_MIX: u32 = 0x0000_2001;
pub const CMD_SET_MIX: u32 = 0x0000_2002;
pub const CMD_GET_MUX: u32 = 0x0000_3001;
pub const CMD_SET_MUX: u32 = 0x0000_3002;
pub const CMD_GET_SYNC: u32 = 0x0000_6004;
pub const CMD_GET_DATA: u32 = 0x0080_0000;
pub const CMD_SET_DATA: u32 = 0x0080_0001;
pub const CMD_DATA_CMD: u32 = 0x0080_0002;

// -- Port Type IDs --

pub const PORT_TYPE_NONE: u32 = 0x000;
pub const PORT_TYPE_ANALOGUE: u32 = 0x080;
pub const PORT_TYPE_SPDIF: u32 = 0x180;
pub const PORT_TYPE_ADAT: u32 = 0x200;
pub const PORT_TYPE_MIXER: u32 = 0x300;
pub const PORT_TYPE_PCM: u32 = 0x600;

// -- Notification Masks --

pub const NOTIFY_SYNC: u32 = 0x0000_0008;
pub const NOTIFY_DIM_MUTE: u32 = 0x0020_0000;
pub const NOTIFY_MONITOR: u32 = 0x0040_0000;
pub const NOTIFY_INPUT_OTHER: u32 = 0x0080_0000;
pub const NOTIFY_MONITOR_OTHER: u32 = 0x0100_0000;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usb_vid_matches_focusrite() {
        assert_eq!(USB_VID, 0x1235);
    }

    #[test]
    fn command_ids_match_spec() {
        assert_eq!(CMD_INIT_1, 0x0000_0000);
        assert_eq!(CMD_INIT_2, 0x0000_0002);
        assert_eq!(CMD_GET_METER, 0x0000_1001);
        assert_eq!(CMD_GET_MIX, 0x0000_2001);
        assert_eq!(CMD_SET_MIX, 0x0000_2002);
        assert_eq!(CMD_GET_MUX, 0x0000_3001);
        assert_eq!(CMD_SET_MUX, 0x0000_3002);
        assert_eq!(CMD_GET_SYNC, 0x0000_6004);
        assert_eq!(CMD_GET_DATA, 0x0080_0000);
        assert_eq!(CMD_SET_DATA, 0x0080_0001);
        assert_eq!(CMD_DATA_CMD, 0x0080_0002);
    }

    #[test]
    fn port_type_ids_match_spec() {
        assert_eq!(PORT_TYPE_NONE, 0x000);
        assert_eq!(PORT_TYPE_ANALOGUE, 0x080);
        assert_eq!(PORT_TYPE_SPDIF, 0x180);
        assert_eq!(PORT_TYPE_ADAT, 0x200);
        assert_eq!(PORT_TYPE_MIXER, 0x300);
        assert_eq!(PORT_TYPE_PCM, 0x600);
    }

    #[test]
    fn notification_masks_match_spec() {
        assert_eq!(NOTIFY_SYNC, 0x0000_0008);
        assert_eq!(NOTIFY_DIM_MUTE, 0x0020_0000);
        assert_eq!(NOTIFY_MONITOR, 0x0040_0000);
        assert_eq!(NOTIFY_INPUT_OTHER, 0x0080_0000);
        assert_eq!(NOTIFY_MONITOR_OTHER, 0x0100_0000);
    }
}
