//! Clarett USB and Clarett+ device configurations.
//!
//! Each model (2Pre, 4Pre, 8Pre) exists in both USB and + variants.
//! They share identical configs except for PID, name, and series.
//! A `const fn` builder per model avoids duplicating data.

use super::*;

// ============================================================
// Clarett 2Pre shared data
// ============================================================

const LINE_OUT_DESCRS_2PRE: &[Option<&str>] = &[
    Some("Monitor L"),
    Some("Monitor R"),
    Some("Headphones L"),
    Some("Headphones R"),
];

const MUX_2PRE_44: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 12 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 4 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

const MUX_2PRE_88: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 8 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 4 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

const MUX_2PRE_176: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 4 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 26 },
];

const PORT_COUNTS_2PRE: AllPortCounts = AllPortCounts {
    analogue: PortCounts::new(2, 4),
    spdif: PortCounts::new(2, 0),
    adat: PortCounts::new(8, 0),
    mix: PortCounts::new(10, 18),
    pcm: PortCounts::new(4, 12),
};

const fn make_clarett_2pre(pid: u16, name: &'static str, series: &'static str) -> DeviceConfig {
    DeviceConfig {
        usb_pid: pid,
        name,
        series,

        has_speaker_switching: false,
        has_talkback: false,
        direct_monitor: 0,

        level_input_count: 2,
        level_input_first: 0,
        pad_input_count: 0,
        air_input_count: 2,
        air_input_first: 0,
        phantom_count: 1,
        inputs_per_phantom: 2,

        port_counts: PORT_COUNTS_2PRE,

        line_out_descrs: LINE_OUT_DESCRS_2PRE,
        line_out_remap: None,

        mux_44: MUX_2PRE_44,
        mux_88: MUX_2PRE_88,
        mux_176: MUX_2PRE_176,

        spdif_modes: &[],
    }
}

pub const CLARETT_2PRE_USB: DeviceConfig =
    make_clarett_2pre(0x8206, "Clarett 2Pre USB", "Clarett USB");
pub const CLARETT_2PRE_PLUS: DeviceConfig =
    make_clarett_2pre(0x820a, "Clarett+ 2Pre", "Clarett+");

// ============================================================
// Clarett 4Pre shared data
// ============================================================

const LINE_OUT_DESCRS_4PRE: &[Option<&str>] = &[
    Some("Monitor L"),
    Some("Monitor R"),
    Some("Headphones 1 L"),
    Some("Headphones 1 R"),
    Some("Headphones 2 L"),
    Some("Headphones 2 R"),
];

const SPDIF_MODES_4PRE_8PRE: &[SpdifMode] = &[
    SpdifMode { name: "None", value: 0 },
    SpdifMode { name: "Optical", value: 1 },
    SpdifMode { name: "RCA", value: 2 },
];

const MUX_4PRE_44: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 6 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

const MUX_4PRE_88: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 14 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 6 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

const MUX_4PRE_176: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 12 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 6 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 24 },
];

const PORT_COUNTS_4PRE: AllPortCounts = AllPortCounts {
    analogue: PortCounts::new(8, 6),
    spdif: PortCounts::new(2, 2),
    adat: PortCounts::new(8, 0),
    mix: PortCounts::new(10, 18),
    pcm: PortCounts::new(8, 18),
};

const fn make_clarett_4pre(pid: u16, name: &'static str, series: &'static str) -> DeviceConfig {
    DeviceConfig {
        usb_pid: pid,
        name,
        series,

        has_speaker_switching: false,
        has_talkback: false,
        direct_monitor: 0,

        level_input_count: 2,
        level_input_first: 0,
        pad_input_count: 0,
        air_input_count: 4,
        air_input_first: 0,
        phantom_count: 1,
        inputs_per_phantom: 4,

        port_counts: PORT_COUNTS_4PRE,

        line_out_descrs: LINE_OUT_DESCRS_4PRE,
        line_out_remap: None,

        mux_44: MUX_4PRE_44,
        mux_88: MUX_4PRE_88,
        mux_176: MUX_4PRE_176,

        spdif_modes: SPDIF_MODES_4PRE_8PRE,
    }
}

pub const CLARETT_4PRE_USB: DeviceConfig =
    make_clarett_4pre(0x8207, "Clarett 4Pre USB", "Clarett USB");
pub const CLARETT_4PRE_PLUS: DeviceConfig =
    make_clarett_4pre(0x820b, "Clarett+ 4Pre", "Clarett+");

// ============================================================
// Clarett 8Pre shared data
// ============================================================

const LINE_OUT_DESCRS_8PRE: &[Option<&str>] = &[
    Some("Monitor L"),
    Some("Monitor R"),
    None,
    None,
    None,
    None,
    Some("Headphones 1 L"),
    Some("Headphones 1 R"),
    Some("Headphones 2 L"),
    Some("Headphones 2 R"),
];

const MUX_8PRE_44: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ADAT, start: 0, count: 8 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

const MUX_8PRE_88: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 14 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ADAT, start: 0, count: 4 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

const MUX_8PRE_176: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 12 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 22 },
];

const PORT_COUNTS_8PRE: AllPortCounts = AllPortCounts {
    analogue: PortCounts::new(8, 10),
    spdif: PortCounts::new(2, 2),
    adat: PortCounts::new(8, 8),
    mix: PortCounts::new(10, 18),
    pcm: PortCounts::new(20, 18),
};

const fn make_clarett_8pre(pid: u16, name: &'static str, series: &'static str) -> DeviceConfig {
    DeviceConfig {
        usb_pid: pid,
        name,
        series,

        has_speaker_switching: false,
        has_talkback: false,
        direct_monitor: 0,

        level_input_count: 2,
        level_input_first: 0,
        pad_input_count: 0,
        air_input_count: 8,
        air_input_first: 0,
        phantom_count: 2,
        inputs_per_phantom: 4,

        port_counts: PORT_COUNTS_8PRE,

        line_out_descrs: LINE_OUT_DESCRS_8PRE,
        line_out_remap: None,

        mux_44: MUX_8PRE_44,
        mux_88: MUX_8PRE_88,
        mux_176: MUX_8PRE_176,

        spdif_modes: SPDIF_MODES_4PRE_8PRE,
    }
}

pub const CLARETT_8PRE_USB: DeviceConfig =
    make_clarett_8pre(0x8208, "Clarett 8Pre USB", "Clarett USB");
pub const CLARETT_8PRE_PLUS: DeviceConfig =
    make_clarett_8pre(0x820c, "Clarett+ 8Pre", "Clarett+");

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clarett_2pre_usb_pid() {
        assert_eq!(CLARETT_2PRE_USB.usb_pid, 0x8206);
    }

    #[test]
    fn test_clarett_2pre_plus_pid() {
        assert_eq!(CLARETT_2PRE_PLUS.usb_pid, 0x820a);
    }

    #[test]
    fn test_clarett_4pre_usb_pid() {
        assert_eq!(CLARETT_4PRE_USB.usb_pid, 0x8207);
    }

    #[test]
    fn test_clarett_4pre_plus_pid() {
        assert_eq!(CLARETT_4PRE_PLUS.usb_pid, 0x820b);
    }

    #[test]
    fn test_clarett_8pre_usb_pid() {
        assert_eq!(CLARETT_8PRE_USB.usb_pid, 0x8208);
    }

    #[test]
    fn test_clarett_8pre_plus_pid() {
        assert_eq!(CLARETT_8PRE_PLUS.usb_pid, 0x820c);
    }

    #[test]
    fn test_all_have_mixer() {
        assert!(CLARETT_2PRE_USB.has_mixer());
        assert!(CLARETT_2PRE_PLUS.has_mixer());
        assert!(CLARETT_4PRE_USB.has_mixer());
        assert!(CLARETT_4PRE_PLUS.has_mixer());
        assert!(CLARETT_8PRE_USB.has_mixer());
        assert!(CLARETT_8PRE_PLUS.has_mixer());
    }

    #[test]
    fn test_usb_and_plus_same_port_counts() {
        assert_eq!(CLARETT_2PRE_USB.port_counts, CLARETT_2PRE_PLUS.port_counts);
        assert_eq!(CLARETT_4PRE_USB.port_counts, CLARETT_4PRE_PLUS.port_counts);
        assert_eq!(CLARETT_8PRE_USB.port_counts, CLARETT_8PRE_PLUS.port_counts);
    }

    #[test]
    fn test_usb_and_plus_different_series() {
        assert_ne!(CLARETT_2PRE_USB.series, CLARETT_2PRE_PLUS.series);
        assert_ne!(CLARETT_4PRE_USB.series, CLARETT_4PRE_PLUS.series);
        assert_ne!(CLARETT_8PRE_USB.series, CLARETT_8PRE_PLUS.series);

        assert_eq!(CLARETT_2PRE_USB.series, "Clarett USB");
        assert_eq!(CLARETT_2PRE_PLUS.series, "Clarett+");
    }
}
