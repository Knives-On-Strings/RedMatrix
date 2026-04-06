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
    ALL_DEVICES.iter().find(|d| d.usb_pid == pid)
}

/// All supported device configurations.
pub static ALL_DEVICES: &[DeviceConfig] = &[];
