/// Notification bitmask decoding.
///
/// The device sends notification packets with a u32 bitmask indicating
/// which state categories have changed. The host must then re-read
/// the relevant state via GET commands.

use super::constants::*;

#[derive(Debug, Clone, PartialEq)]
pub struct Notification {
    pub sync: bool,
    pub dim_mute: bool,
    pub monitor: bool,
    pub input_other: bool,
    pub monitor_other: bool,
}

impl Notification {
    /// Decode a notification bitmask into individual flags.
    pub fn from_mask(mask: u32) -> Self {
        Self {
            sync: mask & NOTIFY_SYNC != 0,
            dim_mute: mask & NOTIFY_DIM_MUTE != 0,
            monitor: mask & NOTIFY_MONITOR != 0,
            input_other: mask & NOTIFY_INPUT_OTHER != 0,
            monitor_other: mask & NOTIFY_MONITOR_OTHER != 0,
        }
    }

    /// Returns true if no notification flags are set.
    pub fn is_empty(&self) -> bool {
        !self.sync && !self.dim_mute && !self.monitor && !self.input_other && !self.monitor_other
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_notification_flag() {
        let n = Notification::from_mask(NOTIFY_SYNC);
        assert!(n.sync);
        assert!(!n.dim_mute);
        assert!(!n.monitor);
        assert!(!n.input_other);
        assert!(!n.monitor_other);
    }

    #[test]
    fn combined_notification_flags() {
        let mask = NOTIFY_DIM_MUTE | NOTIFY_MONITOR | NOTIFY_INPUT_OTHER;
        let n = Notification::from_mask(mask);
        assert!(!n.sync);
        assert!(n.dim_mute);
        assert!(n.monitor);
        assert!(n.input_other);
        assert!(!n.monitor_other);
    }

    #[test]
    fn empty_mask_produces_empty_notification() {
        let n = Notification::from_mask(0);
        assert!(n.is_empty());
    }
}
