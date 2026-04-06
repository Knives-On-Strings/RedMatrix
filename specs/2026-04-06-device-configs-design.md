# Device Configuration Structs Design

## Context

RedMatrix supports 15 USB device PIDs across 12 unique configurations (Clarett USB and Clarett+ pairs share identical config data). Each device has different port counts, feature flags, mux routing layouts, and input capabilities. These configs are the data layer that makes the protocol work for every supported device — without them, only the 18i20 Gen 3 is usable.

All config data is ported directly from the Linux kernel driver (`mixer_scarlett2.c`).

## Approach

A single `DeviceConfig` struct with all fields, instantiated as `const` per device. Devices without mixers (Solo/2i2) have zero port counts and empty mux slices. A registry function maps USB PID to `&'static DeviceConfig`.

## Types

### PortCounts

```rust
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct PortCounts {
    pub inputs: u8,
    pub outputs: u8,
}
```

### AllPortCounts

```rust
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct AllPortCounts {
    pub analogue: PortCounts,
    pub spdif: PortCounts,
    pub adat: PortCounts,
    pub mix: PortCounts,
    pub pcm: PortCounts,
}
```

### MuxEntry

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MuxEntry {
    pub port_type: u32,
    pub start: u8,
    pub count: u8,
}
```

### SpdifMode

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SpdifMode {
    pub name: &'static str,
    pub value: u8,
}
```

### DeviceConfig

```rust
#[derive(Debug, Clone, PartialEq)]
pub struct DeviceConfig {
    pub name: &'static str,
    pub usb_pid: u16,
    pub series: &'static str,

    // Feature flags
    pub has_speaker_switching: bool,
    pub has_talkback: bool,
    pub direct_monitor: u8,  // 0=none, 1=mono, 2=stereo

    // Input features
    pub level_input_count: u8,
    pub level_input_first: u8,
    pub pad_input_count: u8,
    pub air_input_count: u8,
    pub air_input_first: u8,
    pub phantom_count: u8,
    pub inputs_per_phantom: u8,

    // Port counts
    pub port_counts: AllPortCounts,

    // Output naming
    pub line_out_descrs: &'static [Option<&'static str>],
    pub line_out_remap: Option<&'static [u8]>,

    // Mux tables (one per sample rate band)
    pub mux_44: &'static [MuxEntry],
    pub mux_88: &'static [MuxEntry],
    pub mux_176: &'static [MuxEntry],

    // S/PDIF mode options
    pub spdif_modes: &'static [SpdifMode],
}
```

### Convenience methods

```rust
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

    /// Return port counts adjusted for the current sample rate.
    ///
    /// Active ports change with sample rate:
    /// - 44.1/48 kHz: all ports at full count (use static port_counts)
    /// - 88.2/96 kHz: ADAT halved (8→4), PCM reduced per device mux table
    /// - 176.4/192 kHz: ADAT zeroed, mixer may be disabled, PCM further reduced
    ///
    /// The `port_counts` field represents the maximum at 44.1/48 kHz.
    /// This method derives the active counts from the mux table for the given rate.
    pub fn active_port_counts(&self, rate: u32) -> AllPortCounts {
        if matches!(rate, 44100 | 48000) {
            return self.port_counts;
        }

        let mux = self.mux_for_rate(rate);
        let mut counts = self.port_counts;

        // Derive active output counts from mux table entries
        // (the mux table defines what destinations exist at this rate)
        let mut adat_out = 0u8;
        let mut pcm_out = 0u8;
        let mut mix_out = 0u8;
        for entry in mux {
            match entry.port_type {
                crate::protocol::constants::PORT_TYPE_ADAT => adat_out += entry.count,
                crate::protocol::constants::PORT_TYPE_PCM => pcm_out += entry.count,
                crate::protocol::constants::PORT_TYPE_MIXER => mix_out += entry.count,
                _ => {}
            }
        }

        // ADAT inputs halve at 88/96, zero at 176/192
        counts.adat.inputs = match rate {
            88200 | 96000 => self.port_counts.adat.inputs / 2,
            176400 | 192000 => 0,
            _ => self.port_counts.adat.inputs,
        };
        counts.adat.outputs = adat_out;
        counts.pcm.outputs = pcm_out;
        counts.mix.outputs = mix_out;
        if mix_out == 0 {
            counts.mix.inputs = 0; // mixer disabled at this sample rate
        }

        counts
    }
}
```

Note: `active_port_counts` uses the mux table as the source of truth for output counts at higher sample rates, since the mux table defines exactly which destinations exist. Input counts for ADAT follow the standard halving rule. This mirrors how the kernel driver determines array sizes.

### Registry function

```rust
pub fn device_by_pid(pid: u16) -> Option<&'static DeviceConfig> {
    // Match against all 16 PIDs
}
```

Clarett USB and Clarett+ share identical config data but have different `name`, `usb_pid`, and `series` fields — so they are separate const instances.

## File Layout

Grouped by series to reduce file proliferation:

```
src-tauri/src/protocol/devices/
├── mod.rs          — types (DeviceConfig, PortCounts, etc.), convenience methods, registry, re-exports
├── gen2.rs         — Scarlett Gen 2: 6i6, 18i8, 18i20 (3 configs)
├── gen3.rs         — Scarlett Gen 3: Solo, 2i2, 4i4, 8i6, 18i8, 18i20 (6 configs)
└── clarett.rs      — Clarett USB + Clarett+: 2Pre, 4Pre, 8Pre × 2 (6 configs via const fn)
```

The existing `scarlett_18i20_gen3.rs` is removed — its data moves into `gen3.rs`.

Each file exports named consts: `pub const SCARLETT_6I6_GEN2: DeviceConfig = ...;`

### Clarett DRY pattern

Clarett USB and Clarett+ share identical config data. Use `const fn` to avoid duplication:

```rust
const fn make_clarett_2pre(pid: u16, name: &'static str, series: &'static str) -> DeviceConfig {
    DeviceConfig { usb_pid: pid, name, series, /* ...shared data... */ }
}
pub const CLARETT_2PRE_USB: DeviceConfig = make_clarett_2pre(0x8206, "Clarett 2Pre USB", "Clarett USB");
pub const CLARETT_2PRE_PLUS: DeviceConfig = make_clarett_2pre(0x820a, "Clarett+ 2Pre", "Clarett+");
```

This guarantees data stays synced between USB and + variants.

### Solo / 2i2 mux tables

Solo and 2i2 have `has_mixer() == false` and all mux slices are `&[]` (empty). `mux_for_rate()` returns an empty slice, and `active_port_counts()` returns default zeros. No special-casing needed.

## Device Configs (from kernel driver)

### Scarlett Gen 2

| Device | PID | Analogue (in/out) | S/PDIF (in/out) | ADAT (in/out) | Mix (in/out) | PCM (in/out) |
|--------|-----|-------------------|-----------------|---------------|-------------|-------------|
| 6i6 | 0x8203 | 4/4 | 2/2 | 0/0 | 10/18 | 6/6 |
| 18i8 | 0x8204 | 8/6 | 2/2 | 8/0 | 10/18 | 8/18 |
| 18i20 | 0x8201 | 8/10 | 2/2 | 8/8 | 10/18 | 20/18 |

### Scarlett Gen 3

| Device | PID | Analogue (in/out) | S/PDIF (in/out) | ADAT (in/out) | Mix (in/out) | PCM (in/out) | Special |
|--------|-----|-------------------|-----------------|---------------|-------------|-------------|---------|
| Solo | 0x8211 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | direct_monitor=1 |
| 2i2 | 0x8210 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | direct_monitor=2 |
| 4i4 | 0x8212 | 4/4 | 0/0 | 0/0 | 6/8 | 4/6 | |
| 8i6 | 0x8213 | 6/4 | 2/2 | 0/0 | 8/8 | 6/10 | |
| 18i8 | 0x8214 | 8/8 | 2/2 | 8/0 | 10/20 | 8/20 | speaker_switching, line_out_remap |
| 18i20 | 0x8215 | 9/10 | 2/2 | 8/8 | 12/25 | 20/20 | speaker_switching, talkback |

### Clarett USB / Clarett+

| Device | USB PID | + PID | Analogue (in/out) | S/PDIF (in/out) | ADAT (in/out) | Mix (in/out) | PCM (in/out) |
|--------|---------|-------|-------------------|-----------------|---------------|-------------|-------------|
| 2Pre | 0x8206 | 0x820a | 2/4 | 2/0 | 8/0 | 10/18 | 4/12 |
| 4Pre | 0x8207 | 0x820b | 8/6 | 2/2 | 8/0 | 10/18 | 8/18 |
| 8Pre | 0x8208 | 0x820c | 8/10 | 2/2 | 8/8 | 10/18 | 20/18 |

## Test Strategy

### Per-series tests (in each series file):
1. PID matches expected value for each device in the series
2. `has_mixer()` returns expected boolean (false for Solo/2i2, true for all others)
3. Output description count matches analogue output count
4. Solo/2i2 mux tables are empty

### Registry tests (in mod.rs):
5. All 15 PIDs resolve to Some
6. Unknown PID returns None
7. Each PID resolves to correct device name
8. Clarett USB and Clarett+ for same model have same port counts but different series

### Mux consistency tests (in mod.rs):
9. For each mixer-capable device: total mux output count at 44.1kHz equals total output ports
10. `mux_for_rate()` returns correct table for each sample rate band

### Active port count tests (in mod.rs):
11. 18i20 Gen 3 at 48kHz returns full port counts (same as static)
12. 18i20 Gen 3 at 96kHz: ADAT inputs halved (8→4), PCM outputs reduced
13. 18i20 Gen 3 at 192kHz: ADAT zeroed, mixer zeroed
14. Solo at any rate returns default zeros
