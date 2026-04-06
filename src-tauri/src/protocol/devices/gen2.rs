//! Scarlett 2nd Generation device configurations.

use super::*;

// --- Scarlett 6i6 Gen 2 mux tables (same for all rates) ---

static MUX_6I6: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 6 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 4 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

// --- Scarlett 18i8 Gen 2 mux tables ---

static MUX_18I8_44: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 6 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

static MUX_18I8_88: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 14 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 6 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

static MUX_18I8_176: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 6 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 4 },
];

// --- Scarlett 18i20 Gen 2 mux tables ---

static MUX_18I20_44: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ADAT, start: 0, count: 8 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

static MUX_18I20_88: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 14 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_ADAT, start: 0, count: 4 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 8 },
];

static MUX_18I20_176: &[MuxEntry] = &[
    MuxEntry { port_type: PORT_TYPE_PCM, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_ANALOGUE, start: 0, count: 10 },
    MuxEntry { port_type: PORT_TYPE_SPDIF, start: 0, count: 2 },
    MuxEntry { port_type: PORT_TYPE_MIXER, start: 0, count: 18 },
    MuxEntry { port_type: PORT_TYPE_NONE, start: 0, count: 6 },
];

// --- Device configs ---

pub const SCARLETT_6I6_GEN2: DeviceConfig = DeviceConfig {
    name: "Scarlett 6i6 Gen 2",
    usb_pid: 0x8203,
    series: "Scarlett Gen 2",

    has_speaker_switching: false,
    has_talkback: false,
    direct_monitor: 0,

    level_input_count: 2,
    level_input_first: 0,
    pad_input_count: 2,
    air_input_count: 0,
    air_input_first: 0,
    phantom_count: 0,
    inputs_per_phantom: 0,

    port_counts: AllPortCounts {
        analogue: PortCounts::new(4, 4),
        spdif: PortCounts::new(2, 2),
        adat: PortCounts::new(0, 0),
        mix: PortCounts::new(10, 18),
        pcm: PortCounts::new(6, 6),
    },

    line_out_descrs: &[
        Some("Headphones 1 L"),
        Some("Headphones 1 R"),
        Some("Headphones 2 L"),
        Some("Headphones 2 R"),
    ],
    line_out_remap: None,

    mux_44: MUX_6I6,
    mux_88: MUX_6I6,
    mux_176: MUX_6I6,

    spdif_modes: &[],
};

pub const SCARLETT_18I8_GEN2: DeviceConfig = DeviceConfig {
    name: "Scarlett 18i8 Gen 2",
    usb_pid: 0x8204,
    series: "Scarlett Gen 2",

    has_speaker_switching: false,
    has_talkback: false,
    direct_monitor: 0,

    level_input_count: 2,
    level_input_first: 0,
    pad_input_count: 4,
    air_input_count: 0,
    air_input_first: 0,
    phantom_count: 0,
    inputs_per_phantom: 0,

    port_counts: AllPortCounts {
        analogue: PortCounts::new(8, 6),
        spdif: PortCounts::new(2, 2),
        adat: PortCounts::new(8, 0),
        mix: PortCounts::new(10, 18),
        pcm: PortCounts::new(8, 18),
    },

    line_out_descrs: &[
        Some("Monitor L"),
        Some("Monitor R"),
        Some("Headphones 1 L"),
        Some("Headphones 1 R"),
        Some("Headphones 2 L"),
        Some("Headphones 2 R"),
    ],
    line_out_remap: None,

    mux_44: MUX_18I8_44,
    mux_88: MUX_18I8_88,
    mux_176: MUX_18I8_176,

    spdif_modes: &[],
};

pub const SCARLETT_18I20_GEN2: DeviceConfig = DeviceConfig {
    name: "Scarlett 18i20 Gen 2",
    usb_pid: 0x8201,
    series: "Scarlett Gen 2",

    has_speaker_switching: false,
    has_talkback: false,
    direct_monitor: 0,

    level_input_count: 0,
    level_input_first: 0,
    pad_input_count: 0,
    air_input_count: 0,
    air_input_first: 0,
    phantom_count: 0,
    inputs_per_phantom: 0,

    port_counts: AllPortCounts {
        analogue: PortCounts::new(8, 10),
        spdif: PortCounts::new(2, 2),
        adat: PortCounts::new(8, 8),
        mix: PortCounts::new(10, 18),
        pcm: PortCounts::new(20, 18),
    },

    line_out_descrs: &[
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
    ],
    line_out_remap: None,

    mux_44: MUX_18I20_44,
    mux_88: MUX_18I20_88,
    mux_176: MUX_18I20_176,

    spdif_modes: &[],
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_6i6_gen2_pid_and_mixer() {
        assert_eq!(SCARLETT_6I6_GEN2.usb_pid, 0x8203);
        assert!(SCARLETT_6I6_GEN2.has_mixer());
    }

    #[test]
    fn test_18i8_gen2_pid_and_mixer() {
        assert_eq!(SCARLETT_18I8_GEN2.usb_pid, 0x8204);
        assert!(SCARLETT_18I8_GEN2.has_mixer());
    }

    #[test]
    fn test_18i20_gen2_pid_and_mixer() {
        assert_eq!(SCARLETT_18I20_GEN2.usb_pid, 0x8201);
        assert!(SCARLETT_18I20_GEN2.has_mixer());
    }
}
