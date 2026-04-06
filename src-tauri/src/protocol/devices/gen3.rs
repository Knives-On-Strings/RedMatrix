//! Scarlett 3rd Generation device configurations.

use super::*;

// --- Scarlett 4i4 Gen 3 mux table (same for all rates) ---

static MUX_4I4: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 6 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 4 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 8 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 16 },
];

// --- Scarlett 8i6 Gen 3 mux table (same for all rates) ---

static MUX_8I6: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 8 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 4 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_PCM, start: 8, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 8 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 18 },
];

// --- Scarlett 18i8 Gen 3 mux tables ---

static MUX_18I8_44: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_PCM, start: 12, count: 8 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 6, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 2, count: 4 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_PCM, start: 10, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 20 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 10 },
];

static MUX_18I8_88: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_PCM, start: 12, count: 4 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 6, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 2, count: 4 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_PCM, start: 10, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 20 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 10 },
];

static MUX_18I8_176: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 6, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 2, count: 4 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 20 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 10 },
];

// --- Scarlett 18i20 Gen 3 mux tables ---

static MUX_18I20_44: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 8 },
    MuxEntry { port_type: PORT_TYPE_PCM, start: 10, count: 10 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ADAT, start: 0, count: 8 },
    MuxEntry { port_type: PORT_TYPE_PCM, start: 8, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 25 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 12 },
];

static MUX_18I20_88: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 8 },
    MuxEntry { port_type: PORT_TYPE_PCM, start: 10, count: 8 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ADAT, start: 0, count: 8 },
    MuxEntry { port_type: PORT_TYPE_PCM, start: 8, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 25 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 10 },
];

static MUX_18I20_176: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 24 },
];

// --- Device configs ---

pub const SCARLETT_SOLO_GEN3: DeviceConfig = DeviceConfig {
    name: "Scarlett Solo Gen 3",
    usb_pid: 0x8211,
    series: "Scarlett Gen 3",

    has_speaker_switching: false,
    has_talkback: false,
    direct_monitor: 1,

    level_input_count: 1,
    level_input_first: 1,
    pad_input_count: 0,
    air_input_count: 1,
    air_input_first: 0,
    phantom_count: 1,
    inputs_per_phantom: 1,

    port_counts: AllPortCounts {
        analogue: PortCounts::new(0, 0),
        spdif: PortCounts::new(0, 0),
        adat: PortCounts::new(0, 0),
        mix: PortCounts::new(0, 0),
        pcm: PortCounts::new(0, 0),
    },

    line_out_descrs: &[],
    line_out_remap: None,

    mux_44: &[],
    mux_88: &[],
    mux_176: &[],

    spdif_modes: &[],
};

pub const SCARLETT_2I2_GEN3: DeviceConfig = DeviceConfig {
    name: "Scarlett 2i2 Gen 3",
    usb_pid: 0x8210,
    series: "Scarlett Gen 3",

    has_speaker_switching: false,
    has_talkback: false,
    direct_monitor: 2,

    level_input_count: 2,
    level_input_first: 0,
    pad_input_count: 0,
    air_input_count: 2,
    air_input_first: 0,
    phantom_count: 1,
    inputs_per_phantom: 2,

    port_counts: AllPortCounts {
        analogue: PortCounts::new(0, 0),
        spdif: PortCounts::new(0, 0),
        adat: PortCounts::new(0, 0),
        mix: PortCounts::new(0, 0),
        pcm: PortCounts::new(0, 0),
    },

    line_out_descrs: &[],
    line_out_remap: None,

    mux_44: &[],
    mux_88: &[],
    mux_176: &[],

    spdif_modes: &[],
};

pub const SCARLETT_4I4_GEN3: DeviceConfig = DeviceConfig {
    name: "Scarlett 4i4 Gen 3",
    usb_pid: 0x8212,
    series: "Scarlett Gen 3",

    has_speaker_switching: false,
    has_talkback: false,
    direct_monitor: 0,

    level_input_count: 2,
    level_input_first: 0,
    pad_input_count: 2,
    air_input_count: 2,
    air_input_first: 0,
    phantom_count: 1,
    inputs_per_phantom: 2,

    port_counts: AllPortCounts {
        analogue: PortCounts::new(4, 4),
        spdif: PortCounts::new(0, 0),
        adat: PortCounts::new(0, 0),
        mix: PortCounts::new(6, 8),
        pcm: PortCounts::new(4, 6),
    },

    line_out_descrs: &[
        Some("Monitor L"),
        Some("Monitor R"),
        Some("Headphones L"),
        Some("Headphones R"),
    ],
    line_out_remap: None,

    mux_44: MUX_4I4,
    mux_88: MUX_4I4,
    mux_176: MUX_4I4,

    spdif_modes: &[],
};

pub const SCARLETT_8I6_GEN3: DeviceConfig = DeviceConfig {
    name: "Scarlett 8i6 Gen 3",
    usb_pid: 0x8213,
    series: "Scarlett Gen 3",

    has_speaker_switching: false,
    has_talkback: false,
    direct_monitor: 0,

    level_input_count: 2,
    level_input_first: 0,
    pad_input_count: 2,
    air_input_count: 2,
    air_input_first: 0,
    phantom_count: 1,
    inputs_per_phantom: 2,

    port_counts: AllPortCounts {
        analogue: PortCounts::new(6, 4),
        spdif: PortCounts::new(2, 2),
        adat: PortCounts::new(0, 0),
        mix: PortCounts::new(8, 8),
        pcm: PortCounts::new(6, 10),
    },

    line_out_descrs: &[
        Some("Headphones 1 L"),
        Some("Headphones 1 R"),
        Some("Headphones 2 L"),
        Some("Headphones 2 R"),
    ],
    line_out_remap: None,

    mux_44: MUX_8I6,
    mux_88: MUX_8I6,
    mux_176: MUX_8I6,

    spdif_modes: &[],
};

pub const SCARLETT_18I8_GEN3: DeviceConfig = DeviceConfig {
    name: "Scarlett 18i8 Gen 3",
    usb_pid: 0x8214,
    series: "Scarlett Gen 3",

    has_speaker_switching: true,
    has_talkback: false,
    direct_monitor: 0,

    level_input_count: 2,
    level_input_first: 0,
    pad_input_count: 4,
    air_input_count: 4,
    air_input_first: 0,
    phantom_count: 2,
    inputs_per_phantom: 2,

    port_counts: AllPortCounts {
        analogue: PortCounts::new(8, 8),
        spdif: PortCounts::new(2, 2),
        adat: PortCounts::new(8, 0),
        mix: PortCounts::new(10, 20),
        pcm: PortCounts::new(8, 20),
    },

    line_out_descrs: &[
        Some("Monitor L"),
        Some("Monitor R"),
        Some("Alt Monitor L"),
        Some("Alt Monitor R"),
        Some("Headphones 1 L"),
        Some("Headphones 1 R"),
        Some("Headphones 2 L"),
        Some("Headphones 2 R"),
    ],
    line_out_remap: Some(&[0, 1, 6, 7, 2, 3, 4, 5]),

    mux_44: MUX_18I8_44,
    mux_88: MUX_18I8_88,
    mux_176: MUX_18I8_176,

    spdif_modes: &[
        SpdifMode { name: "RCA", value: 0 },
        SpdifMode { name: "Optical", value: 2 },
    ],
};

pub const SCARLETT_18I20_GEN3: DeviceConfig = DeviceConfig {
    name: "Scarlett 18i20 Gen 3",
    usb_pid: 0x8215,
    series: "Scarlett Gen 3",

    has_speaker_switching: true,
    has_talkback: true,
    direct_monitor: 0,

    level_input_count: 2,
    level_input_first: 0,
    pad_input_count: 8,
    air_input_count: 8,
    air_input_first: 0,
    phantom_count: 2,
    inputs_per_phantom: 4,

    port_counts: AllPortCounts {
        analogue: PortCounts::new(9, 10),
        spdif: PortCounts::new(2, 2),
        adat: PortCounts::new(8, 8),
        mix: PortCounts::new(12, 25),
        pcm: PortCounts::new(20, 20),
    },

    line_out_descrs: &[
        Some("Monitor 1 L"),
        Some("Monitor 1 R"),
        Some("Monitor 2 L"),
        Some("Monitor 2 R"),
        None,
        None,
        Some("Headphones 1 L"),
        Some("Headphones 1 R"),
        Some("Headphones 2 L"),
        Some("Headphones 2 R"),
    ],
    line_out_remap: None,

    mux_44: MUX_18I20_44,
    mux_88: MUX_18I20_88,
    mux_176: MUX_18I20_176,

    spdif_modes: &[
        SpdifMode { name: "S/PDIF RCA", value: 0 },
        SpdifMode { name: "S/PDIF Optical", value: 6 },
        SpdifMode { name: "Dual ADAT", value: 1 },
    ],
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_solo_gen3_pid() {
        assert_eq!(SCARLETT_SOLO_GEN3.usb_pid, 0x8211);
    }

    #[test]
    fn test_2i2_gen3_pid() {
        assert_eq!(SCARLETT_2I2_GEN3.usb_pid, 0x8210);
    }

    #[test]
    fn test_4i4_gen3_pid() {
        assert_eq!(SCARLETT_4I4_GEN3.usb_pid, 0x8212);
    }

    #[test]
    fn test_8i6_gen3_pid() {
        assert_eq!(SCARLETT_8I6_GEN3.usb_pid, 0x8213);
    }

    #[test]
    fn test_18i8_gen3_pid() {
        assert_eq!(SCARLETT_18I8_GEN3.usb_pid, 0x8214);
    }

    #[test]
    fn test_18i20_gen3_pid() {
        assert_eq!(SCARLETT_18I20_GEN3.usb_pid, 0x8215);
    }

    #[test]
    fn test_solo_and_2i2_no_mixer() {
        assert!(!SCARLETT_SOLO_GEN3.has_mixer());
        assert!(!SCARLETT_2I2_GEN3.has_mixer());
    }

    #[test]
    fn test_4i4_8i6_18i8_18i20_have_mixer() {
        assert!(SCARLETT_4I4_GEN3.has_mixer());
        assert!(SCARLETT_8I6_GEN3.has_mixer());
        assert!(SCARLETT_18I8_GEN3.has_mixer());
        assert!(SCARLETT_18I20_GEN3.has_mixer());
    }

    #[test]
    fn test_solo_and_2i2_empty_mux() {
        assert!(SCARLETT_SOLO_GEN3.mux_44.is_empty());
        assert!(SCARLETT_SOLO_GEN3.mux_88.is_empty());
        assert!(SCARLETT_SOLO_GEN3.mux_176.is_empty());
        assert!(SCARLETT_2I2_GEN3.mux_44.is_empty());
        assert!(SCARLETT_2I2_GEN3.mux_88.is_empty());
        assert!(SCARLETT_2I2_GEN3.mux_176.is_empty());
    }

    #[test]
    fn test_18i20_has_talkback() {
        assert!(SCARLETT_18I20_GEN3.has_talkback);
    }

    #[test]
    fn test_18i8_has_speaker_switching() {
        assert!(SCARLETT_18I8_GEN3.has_speaker_switching);
    }
}
