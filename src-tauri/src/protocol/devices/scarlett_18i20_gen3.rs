//! Focusrite Scarlett 18i20 3rd Generation — primary development device.
//!
//! USB PID: 0x8215
//! Features: mixer, hardware volume, speaker switching, talkback

pub const USB_PID: u16 = 0x8215;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pid_matches_spec() {
        assert_eq!(USB_PID, 0x8215);
    }
}
