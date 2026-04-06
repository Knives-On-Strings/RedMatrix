//! Device configuration structs for all supported Scarlett2-protocol devices.
//!
//! Each device is a `const DeviceConfig` ported from the Linux kernel driver.
//! Grouped by series: gen2, gen3, clarett.

pub mod gen2;
pub mod gen3;
pub mod clarett;

use super::constants::*;

/// Port counts per direction for a single port type.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct PortCounts {
    pub inputs: u8,
    pub outputs: u8,
}

impl PortCounts {
    pub const fn new(inputs: u8, outputs: u8) -> Self {
        Self { inputs, outputs }
    }
}

/// Port counts for all port types.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct AllPortCounts {
    pub analogue: PortCounts,
    pub spdif: PortCounts,
    pub adat: PortCounts,
    pub mix: PortCounts,
    pub pcm: PortCounts,
}

/// Single mux assignment entry.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MuxEntry {
    pub port_type: u32,
    pub start: u8,
    pub count: u8,
}

/// S/PDIF / digital I/O mode option.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SpdifMode {
    pub name: &'static str,
    pub value: u8,
}

/// Complete device configuration, ported from `scarlett2_device_info` in
/// the Linux kernel driver (`mixer_scarlett2.c`).
#[derive(Debug, Clone, PartialEq)]
pub struct DeviceConfig {
    pub name: &'static str,
    pub usb_pid: u16,
    pub series: &'static str,

    pub has_speaker_switching: bool,
    pub has_talkback: bool,
    pub direct_monitor: u8,

    pub level_input_count: u8,
    pub level_input_first: u8,
    pub pad_input_count: u8,
    pub air_input_count: u8,
    pub air_input_first: u8,
    pub phantom_count: u8,
    pub inputs_per_phantom: u8,

    pub port_counts: AllPortCounts,

    pub line_out_descrs: &'static [Option<&'static str>],
    pub line_out_remap: Option<&'static [u8]>,

    pub mux_44: &'static [MuxEntry],
    pub mux_88: &'static [MuxEntry],
    pub mux_176: &'static [MuxEntry],

    pub spdif_modes: &'static [SpdifMode],
}

impl DeviceConfig {
    pub fn has_mixer(&self) -> bool {
        self.port_counts.mix.inputs > 0
    }

    pub fn has_spdif_modes(&self) -> bool {
        !self.spdif_modes.is_empty()
    }

    pub fn mux_for_rate(&self, rate: u32) -> &'static [MuxEntry] {
        match rate {
            44100 | 48000 => self.mux_44,
            88200 | 96000 => self.mux_88,
            176400 | 192000 => self.mux_176,
            _ => self.mux_44,
        }
    }

    pub fn active_port_counts(&self, rate: u32) -> AllPortCounts {
        if matches!(rate, 44100 | 48000) {
            return self.port_counts;
        }

        let mux = self.mux_for_rate(rate);
        let mut counts = self.port_counts;

        let mut adat_out = 0u8;
        let mut pcm_out = 0u8;
        let mut mix_out = 0u8;
        for entry in mux {
            match entry.port_type {
                PORT_TYPE_ADAT => adat_out += entry.count,
                PORT_TYPE_PCM => pcm_out += entry.count,
                PORT_TYPE_MIXER => mix_out += entry.count,
                _ => {}
            }
        }

        counts.adat.inputs = match rate {
            88200 | 96000 => self.port_counts.adat.inputs / 2,
            176400 | 192000 => 0,
            _ => self.port_counts.adat.inputs,
        };
        counts.adat.outputs = adat_out;
        counts.pcm.outputs = pcm_out;
        counts.mix.outputs = mix_out;
        if mix_out == 0 {
            counts.mix.inputs = 0;
        }

        counts
    }
}

/// Look up a device configuration by USB Product ID.
pub fn device_by_pid(pid: u16) -> Option<&'static DeviceConfig> {
    match pid {
        // Scarlett Gen 2
        0x8203 => Some(&gen2::SCARLETT_6I6_GEN2),
        0x8204 => Some(&gen2::SCARLETT_18I8_GEN2),
        0x8201 => Some(&gen2::SCARLETT_18I20_GEN2),
        // Scarlett Gen 3
        0x8211 => Some(&gen3::SCARLETT_SOLO_GEN3),
        0x8210 => Some(&gen3::SCARLETT_2I2_GEN3),
        0x8212 => Some(&gen3::SCARLETT_4I4_GEN3),
        0x8213 => Some(&gen3::SCARLETT_8I6_GEN3),
        0x8214 => Some(&gen3::SCARLETT_18I8_GEN3),
        0x8215 => Some(&gen3::SCARLETT_18I20_GEN3),
        // Clarett USB
        0x8206 => Some(&clarett::CLARETT_2PRE_USB),
        0x8207 => Some(&clarett::CLARETT_4PRE_USB),
        0x8208 => Some(&clarett::CLARETT_8PRE_USB),
        // Clarett+
        0x820a => Some(&clarett::CLARETT_2PRE_PLUS),
        0x820b => Some(&clarett::CLARETT_4PRE_PLUS),
        0x820c => Some(&clarett::CLARETT_8PRE_PLUS),
        _ => None,
    }
}

/// All supported device configurations.
pub const ALL_DEVICES: [&DeviceConfig; 15] = [
    // Scarlett Gen 2
    &gen2::SCARLETT_6I6_GEN2,
    &gen2::SCARLETT_18I8_GEN2,
    &gen2::SCARLETT_18I20_GEN2,
    // Scarlett Gen 3
    &gen3::SCARLETT_SOLO_GEN3,
    &gen3::SCARLETT_2I2_GEN3,
    &gen3::SCARLETT_4I4_GEN3,
    &gen3::SCARLETT_8I6_GEN3,
    &gen3::SCARLETT_18I8_GEN3,
    &gen3::SCARLETT_18I20_GEN3,
    // Clarett USB
    &clarett::CLARETT_2PRE_USB,
    &clarett::CLARETT_4PRE_USB,
    &clarett::CLARETT_8PRE_USB,
    // Clarett+
    &clarett::CLARETT_2PRE_PLUS,
    &clarett::CLARETT_4PRE_PLUS,
    &clarett::CLARETT_8PRE_PLUS,
];

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_PIDS: &[(u16, &str)] = &[
        (0x8203, "Scarlett 6i6 Gen 2"),
        (0x8204, "Scarlett 18i8 Gen 2"),
        (0x8201, "Scarlett 18i20 Gen 2"),
        (0x8211, "Scarlett Solo Gen 3"),
        (0x8210, "Scarlett 2i2 Gen 3"),
        (0x8212, "Scarlett 4i4 Gen 3"),
        (0x8213, "Scarlett 8i6 Gen 3"),
        (0x8214, "Scarlett 18i8 Gen 3"),
        (0x8215, "Scarlett 18i20 Gen 3"),
        (0x8206, "Clarett 2Pre USB"),
        (0x8207, "Clarett 4Pre USB"),
        (0x8208, "Clarett 8Pre USB"),
        (0x820a, "Clarett+ 2Pre"),
        (0x820b, "Clarett+ 4Pre"),
        (0x820c, "Clarett+ 8Pre"),
    ];

    #[test]
    fn all_pids_resolve() {
        for &(pid, expected_name) in ALL_PIDS {
            let dev = device_by_pid(pid)
                .unwrap_or_else(|| panic!("PID {:#06x} should resolve", pid));
            assert_eq!(dev.name, expected_name, "PID {:#06x} name mismatch", pid);
        }
    }

    #[test]
    fn unknown_pid_returns_none() {
        assert!(device_by_pid(0x0000).is_none());
        assert!(device_by_pid(0xFFFF).is_none());
    }

    #[test]
    fn clarett_usb_and_plus_share_port_counts() {
        let pairs: &[(u16, u16)] = &[
            (0x8206, 0x820a),
            (0x8207, 0x820b),
            (0x8208, 0x820c),
        ];
        for &(usb_pid, plus_pid) in pairs {
            let usb = device_by_pid(usb_pid).unwrap();
            let plus = device_by_pid(plus_pid).unwrap();
            assert_eq!(
                usb.port_counts, plus.port_counts,
                "USB ({:#06x}) and + ({:#06x}) should share port counts",
                usb_pid, plus_pid
            );
            assert_ne!(
                usb.series, plus.series,
                "USB ({:#06x}) and + ({:#06x}) should have different series",
                usb_pid, plus_pid
            );
        }
    }

    #[test]
    fn mux_for_rate_selects_correct_table() {
        let dev = device_by_pid(0x8215).unwrap(); // 18i20 Gen 3
        let mux_44 = dev.mux_for_rate(44100);
        let mux_48 = dev.mux_for_rate(48000);
        let mux_88 = dev.mux_for_rate(88200);
        let mux_96 = dev.mux_for_rate(96000);
        let mux_176 = dev.mux_for_rate(176400);
        let mux_192 = dev.mux_for_rate(192000);

        // 44.1 and 48 share the same table
        assert!(std::ptr::eq(mux_44, mux_48));
        // 88.2 and 96 share the same table
        assert!(std::ptr::eq(mux_88, mux_96));
        // 176.4 and 192 share the same table
        assert!(std::ptr::eq(mux_176, mux_192));
        // All three tables are distinct
        assert!(!std::ptr::eq(mux_44, mux_88));
        assert!(!std::ptr::eq(mux_44, mux_176));
        assert!(!std::ptr::eq(mux_88, mux_176));
    }

    #[test]
    fn active_port_counts_48khz_unchanged() {
        let dev = device_by_pid(0x8215).unwrap(); // 18i20 Gen 3
        let counts = dev.active_port_counts(48000);
        assert_eq!(counts, dev.port_counts);
    }

    #[test]
    fn active_port_counts_96khz_adat_halved() {
        let dev = device_by_pid(0x8215).unwrap(); // 18i20 Gen 3
        let counts = dev.active_port_counts(96000);
        assert_eq!(counts.adat.inputs, 4, "ADAT inputs should halve at 96kHz");
        assert_eq!(
            counts.adat.inputs,
            dev.port_counts.adat.inputs / 2
        );
    }

    #[test]
    fn active_port_counts_192khz_adat_and_mixer_zeroed() {
        let dev = device_by_pid(0x8215).unwrap(); // 18i20 Gen 3
        let counts = dev.active_port_counts(192000);
        assert_eq!(counts.adat.inputs, 0, "ADAT inputs should be 0 at 192kHz");
        assert_eq!(counts.adat.outputs, 0, "ADAT outputs should be 0 at 192kHz");
        assert_eq!(counts.mix.inputs, 0, "Mixer inputs should be 0 at 192kHz");
        assert_eq!(counts.mix.outputs, 0, "Mixer outputs should be 0 at 192kHz");
    }

    #[test]
    fn solo_active_port_counts_all_zeros() {
        let dev = device_by_pid(0x8211).unwrap(); // Solo Gen 3
        for &rate in &[44100u32, 48000, 88200, 96000, 176400, 192000] {
            let counts = dev.active_port_counts(rate);
            assert_eq!(counts, dev.port_counts,
                "Solo port counts should be unchanged at {}Hz", rate);
        }
    }

    #[test]
    fn mux_total_matches_output_ports_at_44khz() {
        for dev in ALL_DEVICES.iter() {
            if !dev.has_mixer() {
                continue;
            }
            let mux = dev.mux_for_rate(44100);
            let mux_total: u16 = mux.iter().map(|e| e.count as u16).sum();
            let output_total = dev.port_counts.analogue.outputs as u16
                + dev.port_counts.spdif.outputs as u16
                + dev.port_counts.adat.outputs as u16;
            assert!(
                mux_total >= output_total,
                "{}: mux total ({}) should be >= output ports ({})",
                dev.name, mux_total, output_total
            );
        }
    }
}
