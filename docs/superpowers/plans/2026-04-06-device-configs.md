# Device Configuration Structs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all 15 Scarlett2-protocol device configurations from the Linux kernel driver, enabling RedMatrix to work with every supported device.

**Architecture:** Shared types in `devices/mod.rs`, device configs grouped by series in `gen2.rs`, `gen3.rs`, `clarett.rs`. Each device is a `const DeviceConfig`. Registry function maps USB PID to config. Clarett USB/+ pairs use `const fn` to DRY shared data.

**Tech Stack:** Rust, no additional crates. Uses `PORT_TYPE_*` constants from `protocol/constants.rs`.

**Spec:** `specs/2026-04-06-device-configs-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/src/protocol/devices/mod.rs` | Rewrite | Types, convenience methods, registry, re-exports |
| `src-tauri/src/protocol/devices/gen2.rs` | Create | Scarlett Gen 2 configs (6i6, 18i8, 18i20) |
| `src-tauri/src/protocol/devices/gen3.rs` | Create | Scarlett Gen 3 configs (Solo, 2i2, 4i4, 8i6, 18i8, 18i20) |
| `src-tauri/src/protocol/devices/clarett.rs` | Create | Clarett USB + Clarett+ configs (3 models × 2 variants) |
| `src-tauri/src/protocol/devices/scarlett_18i20_gen3.rs` | Delete | Replaced by gen3.rs |

---

### Task 1: Types and mod.rs

**Files:**
- Rewrite: `src-tauri/src/protocol/devices/mod.rs`
- Delete: `src-tauri/src/protocol/devices/scarlett_18i20_gen3.rs`

- [ ] **Step 1: Replace mod.rs with type definitions**

Replace the entire contents of `src-tauri/src/protocol/devices/mod.rs` with:

```rust
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
pub static ALL_DEVICES: &[DeviceConfig] = &[
    // Populated after gen2, gen3, clarett modules are implemented
];
```

- [ ] **Step 2: Delete the old file**

```bash
rm src-tauri/src/protocol/devices/scarlett_18i20_gen3.rs
```

- [ ] **Step 3: Create empty gen2.rs, gen3.rs, clarett.rs stubs**

Create `src-tauri/src/protocol/devices/gen2.rs`:
```rust
//! Scarlett 2nd Generation device configurations.

use super::*;
```

Create `src-tauri/src/protocol/devices/gen3.rs`:
```rust
//! Scarlett 3rd Generation device configurations.

use super::*;
```

Create `src-tauri/src/protocol/devices/clarett.rs`:
```rust
//! Clarett USB and Clarett+ device configurations.

use super::*;
```

- [ ] **Step 4: Run tests to verify compilation**

Run: `cd src-tauri && cargo test`

Expected: Compiles. The old `scarlett_18i20_gen3` test is gone (net -1 test). Total should be ~62 tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A src-tauri/src/protocol/devices/
git commit -m "refactor: add DeviceConfig types, replace single-device module with series grouping

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Scarlett Gen 2 configs (6i6, 18i8, 18i20)

**Files:**
- Modify: `src-tauri/src/protocol/devices/gen2.rs`

The subagent implementing this task needs the following kernel driver data. All port counts are `[inputs, outputs]`.

**6i6 Gen 2 (PID 0x8203):**
- level_input_count=2, pad_input_count=2
- Analogue: 4/4, S/PDIF: 2/2, ADAT: 0/0, Mix: 10/18, PCM: 6/6
- line_out_descrs: ["Headphones 1 L", "Headphones 1 R", "Headphones 2 L", "Headphones 2 R"]
- Mux (same for all 3 rate bands): PCM 0,6 → Analogue 0,4 → S/PDIF 0,2 → Mix 0,18 → None 0,8

**18i8 Gen 2 (PID 0x8204):**
- level_input_count=2, pad_input_count=4
- Analogue: 8/6, S/PDIF: 2/2, ADAT: 8/0, Mix: 10/18, PCM: 8/18
- line_out_descrs: ["Monitor L", "Monitor R", "Headphones 1 L", "Headphones 1 R", "Headphones 2 L", "Headphones 2 R"]
- Mux 44: PCM 0,18 → Analogue 0,6 → S/PDIF 0,2 → Mix 0,18 → None 0,8
- Mux 88: PCM 0,14 → Analogue 0,6 → S/PDIF 0,2 → Mix 0,18 → None 0,8
- Mux 176: PCM 0,10 → Analogue 0,6 → S/PDIF 0,2 → Mix 0,18 → None 0,4

**18i20 Gen 2 (PID 0x8201):**
- No special input features (all zeros)
- Analogue: 8/10, S/PDIF: 2/2, ADAT: 8/8, Mix: 10/18, PCM: 20/18
- line_out_descrs: ["Monitor L", "Monitor R", None, None, None, None, "Headphones 1 L", "Headphones 1 R", "Headphones 2 L", "Headphones 2 R"]
- Mux 44: PCM 0,18 → Analogue 0,10 → S/PDIF 0,2 → ADAT 0,8 → Mix 0,18 → None 0,8
- Mux 88: PCM 0,14 → Analogue 0,10 → S/PDIF 0,2 → ADAT 0,4 → Mix 0,18 → None 0,8
- Mux 176: PCM 0,10 → Analogue 0,10 → S/PDIF 0,2 → Mix 0,18 → None 0,6

- [ ] **Step 1: Implement all 3 Gen 2 configs with tests**

Write the full `gen2.rs` with the 3 const configs and tests verifying PID, has_mixer, and line_out_descrs length. Use the data above. Each config is a `pub const` like `pub const SCARLETT_6I6_GEN2: DeviceConfig`.

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test protocol::devices::gen2`

Expected: 3+ tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/protocol/devices/gen2.rs
git commit -m "feat: add Scarlett Gen 2 device configs (6i6, 18i8, 18i20)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Scarlett Gen 3 configs (Solo, 2i2, 4i4, 8i6, 18i8, 18i20)

**Files:**
- Modify: `src-tauri/src/protocol/devices/gen3.rs`

Kernel driver data:

**Solo Gen 3 (PID 0x8211):**
- level_input_count=1, level_input_first=1, air_input_count=1, phantom_count=1, inputs_per_phantom=1, direct_monitor=1
- All port counts zero, all mux slices empty

**2i2 Gen 3 (PID 0x8210):**
- level_input_count=2, air_input_count=2, phantom_count=1, inputs_per_phantom=2, direct_monitor=2
- All port counts zero, all mux slices empty

**4i4 Gen 3 (PID 0x8212):**
- level_input_count=2, pad_input_count=2, air_input_count=2, phantom_count=1, inputs_per_phantom=2
- Analogue: 4/4, Mix: 6/8, PCM: 4/6
- line_out_descrs: ["Monitor L", "Monitor R", "Headphones L", "Headphones R"]
- Mux (same all 3 bands): PCM 0,6 → Analogue 0,4 → Mix 0,8 → None 0,16

**8i6 Gen 3 (PID 0x8213):**
- level_input_count=2, pad_input_count=2, air_input_count=2, phantom_count=1, inputs_per_phantom=2
- Analogue: 6/4, S/PDIF: 2/2, Mix: 8/8, PCM: 6/10
- line_out_descrs: ["Headphones 1 L", "Headphones 1 R", "Headphones 2 L", "Headphones 2 R"]
- Mux (same all 3 bands): PCM 0,8 → Analogue 0,4 → S/PDIF 0,2 → PCM 8,2 → Mix 0,8 → None 0,18

**18i8 Gen 3 (PID 0x8214):**
- has_speaker_switching=true, level_input_count=2, pad_input_count=4, air_input_count=4, phantom_count=2, inputs_per_phantom=2
- Analogue: 8/8, S/PDIF: 2/2, ADAT: 8/0, Mix: 10/20, PCM: 8/20
- line_out_descrs: ["Monitor L", "Monitor R", "Alt Monitor L", "Alt Monitor R", "Headphones 1 L", "Headphones 1 R", "Headphones 2 L", "Headphones 2 R"]
- line_out_remap: [0, 1, 6, 7, 2, 3, 4, 5]
- spdif_modes: [("RCA", 0), ("Optical", 2)]
- Mux 44: PCM 0,10 → PCM 12,8 → Analogue 0,2 → Analogue 6,2 → Analogue 2,4 → S/PDIF 0,2 → PCM 10,2 → Mix 0,20 → None 0,10
- Mux 88: PCM 0,10 → PCM 12,4 → Analogue 0,2 → Analogue 6,2 → Analogue 2,4 → S/PDIF 0,2 → PCM 10,2 → Mix 0,20 → None 0,10
- Mux 176: PCM 0,10 → Analogue 0,2 → Analogue 6,2 → Analogue 2,4 → S/PDIF 0,2 → Mix 0,20 → None 0,10

**18i20 Gen 3 (PID 0x8215):**
- has_speaker_switching=true, has_talkback=true, level_input_count=2, pad_input_count=8, air_input_count=8, phantom_count=2, inputs_per_phantom=4
- Analogue: 9/10, S/PDIF: 2/2, ADAT: 8/8, Mix: 12/25, PCM: 20/20
- line_out_descrs: ["Monitor 1 L", "Monitor 1 R", "Monitor 2 L", "Monitor 2 R", None, None, "Headphones 1 L", "Headphones 1 R", "Headphones 2 L", "Headphones 2 R"]
- spdif_modes: [("S/PDIF RCA", 0), ("S/PDIF Optical", 6), ("Dual ADAT", 1)]
- Mux 44: PCM 0,8 → PCM 10,10 → Analogue 0,10 → S/PDIF 0,2 → ADAT 0,8 → PCM 8,2 → Mix 0,25 → None 0,12
- Mux 88: PCM 0,8 → PCM 10,8 → Analogue 0,10 → S/PDIF 0,2 → ADAT 0,8 → PCM 8,2 → Mix 0,25 → None 0,10
- Mux 176: PCM 0,10 → Analogue 0,10 → S/PDIF 0,2 → None 0,24

- [ ] **Step 1: Implement all 6 Gen 3 configs with tests**

Write the full `gen3.rs`. Tests: PID check for each, has_mixer false for Solo/2i2, has_mixer true for rest, Solo/2i2 mux tables are empty, 18i20 has_talkback, 18i8 has_speaker_switching.

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test protocol::devices::gen3`

Expected: 6+ tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/protocol/devices/gen3.rs
git commit -m "feat: add Scarlett Gen 3 device configs (Solo, 2i2, 4i4, 8i6, 18i8, 18i20)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Clarett configs (2Pre, 4Pre, 8Pre × USB and +)

**Files:**
- Modify: `src-tauri/src/protocol/devices/clarett.rs`

Kernel driver data. Use `const fn` builders for each model.

**Clarett 2Pre (USB PID 0x8206, + PID 0x820a):**
- level_input_count=2, air_input_count=2
- Analogue: 2/4, S/PDIF: 2/0, ADAT: 8/0, Mix: 10/18, PCM: 4/12
- line_out_descrs: ["Monitor L", "Monitor R", "Headphones L", "Headphones R"]
- Mux 44: PCM 0,12 → Analogue 0,4 → Mix 0,18 → None 0,8
- Mux 88: PCM 0,8 → Analogue 0,4 → Mix 0,18 → None 0,8
- Mux 176: PCM 0,2 → Analogue 0,4 → None 0,26

**Clarett 4Pre (USB PID 0x8207, + PID 0x820b):**
- level_input_count=2, air_input_count=4
- Analogue: 8/6, S/PDIF: 2/2, ADAT: 8/0, Mix: 10/18, PCM: 8/18
- line_out_descrs: ["Monitor L", "Monitor R", "Headphones 1 L", "Headphones 1 R", "Headphones 2 L", "Headphones 2 R"]
- spdif_modes: [("None", 0), ("Optical", 1), ("RCA", 2)]
- Mux 44: PCM 0,18 → Analogue 0,6 → S/PDIF 0,2 → Mix 0,18 → None 0,8
- Mux 88: PCM 0,14 → Analogue 0,6 → S/PDIF 0,2 → Mix 0,18 → None 0,8
- Mux 176: PCM 0,12 → Analogue 0,6 → S/PDIF 0,2 → None 0,24

**Clarett 8Pre (USB PID 0x8208, + PID 0x820c):**
- level_input_count=2, air_input_count=8
- Analogue: 8/10, S/PDIF: 2/2, ADAT: 8/8, Mix: 10/18, PCM: 20/18
- line_out_descrs: ["Monitor L", "Monitor R", None, None, None, None, "Headphones 1 L", "Headphones 1 R", "Headphones 2 L", "Headphones 2 R"]
- spdif_modes: [("None", 0), ("Optical", 1), ("RCA", 2)]
- Mux 44: PCM 0,18 → Analogue 0,10 → S/PDIF 0,2 → ADAT 0,8 → Mix 0,18 → None 0,8
- Mux 88: PCM 0,14 → Analogue 0,10 → S/PDIF 0,2 → ADAT 0,4 → Mix 0,18 → None 0,8
- Mux 176: PCM 0,12 → Analogue 0,10 → S/PDIF 0,2 → None 0,22

- [ ] **Step 1: Implement all 6 Clarett configs with const fn builders and tests**

Write `clarett.rs` using the `const fn` pattern:
```rust
const fn make_clarett_2pre(pid: u16, name: &'static str, series: &'static str) -> DeviceConfig { ... }
pub const CLARETT_2PRE_USB: DeviceConfig = make_clarett_2pre(0x8206, "Clarett 2Pre USB", "Clarett USB");
pub const CLARETT_2PRE_PLUS: DeviceConfig = make_clarett_2pre(0x820a, "Clarett+ 2Pre", "Clarett+");
```

Tests: PID checks, has_mixer true for all, Clarett USB and + pairs have same port counts but different series.

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test protocol::devices::clarett`

Expected: 6+ tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/protocol/devices/clarett.rs
git commit -m "feat: add Clarett USB and Clarett+ device configs (2Pre, 4Pre, 8Pre)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Registry and cross-device tests

**Files:**
- Modify: `src-tauri/src/protocol/devices/mod.rs`

- [ ] **Step 1: Populate ALL_DEVICES and add registry + cross-device tests**

Update the `ALL_DEVICES` static in `mod.rs` to include all 15 configs from the three series modules. Add tests:

```rust
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
        for (pid, name) in ALL_PIDS {
            let config = device_by_pid(*pid);
            assert!(config.is_some(), "PID 0x{:04x} ({}) not found", pid, name);
            assert_eq!(config.unwrap().name, *name);
        }
    }

    #[test]
    fn unknown_pid_returns_none() {
        assert!(device_by_pid(0x0000).is_none());
        assert!(device_by_pid(0xFFFF).is_none());
    }

    #[test]
    fn clarett_usb_and_plus_share_port_counts() {
        let pairs = [(0x8206, 0x820a), (0x8207, 0x820b), (0x8208, 0x820c)];
        for (usb_pid, plus_pid) in pairs {
            let usb = device_by_pid(usb_pid).unwrap();
            let plus = device_by_pid(plus_pid).unwrap();
            assert_eq!(usb.port_counts, plus.port_counts);
            assert_ne!(usb.series, plus.series);
        }
    }

    #[test]
    fn mux_for_rate_selects_correct_table() {
        let config = device_by_pid(0x8215).unwrap(); // 18i20 Gen 3
        assert_eq!(config.mux_for_rate(44100).len(), config.mux_44.len());
        assert_eq!(config.mux_for_rate(48000).len(), config.mux_44.len());
        assert_eq!(config.mux_for_rate(88200).len(), config.mux_88.len());
        assert_eq!(config.mux_for_rate(96000).len(), config.mux_88.len());
        assert_eq!(config.mux_for_rate(176400).len(), config.mux_176.len());
        assert_eq!(config.mux_for_rate(192000).len(), config.mux_176.len());
    }

    #[test]
    fn active_port_counts_48khz_unchanged() {
        let config = device_by_pid(0x8215).unwrap();
        assert_eq!(config.active_port_counts(48000), config.port_counts);
    }

    #[test]
    fn active_port_counts_96khz_adat_halved() {
        let config = device_by_pid(0x8215).unwrap();
        let active = config.active_port_counts(96000);
        assert_eq!(active.adat.inputs, 4); // 8 / 2
    }

    #[test]
    fn active_port_counts_192khz_adat_and_mixer_zeroed() {
        let config = device_by_pid(0x8215).unwrap();
        let active = config.active_port_counts(192000);
        assert_eq!(active.adat.inputs, 0);
        assert_eq!(active.adat.outputs, 0);
        assert_eq!(active.mix.inputs, 0);
        assert_eq!(active.mix.outputs, 0);
    }

    #[test]
    fn solo_active_port_counts_all_zeros() {
        let config = device_by_pid(0x8211).unwrap();
        let active = config.active_port_counts(48000);
        assert_eq!(active, AllPortCounts::default());
    }

    #[test]
    fn mux_total_matches_output_ports_at_44khz() {
        for config in ALL_DEVICES {
            if !config.has_mixer() {
                continue;
            }
            let total_mux: u16 = config.mux_44.iter().map(|e| e.count as u16).sum();
            let total_outputs = config.port_counts.analogue.outputs as u16
                + config.port_counts.spdif.outputs as u16
                + config.port_counts.adat.outputs as u16
                + config.port_counts.mix.outputs as u16
                + config.port_counts.pcm.outputs as u16;
            // Mux total includes None entries (padding), so mux >= outputs
            assert!(
                total_mux >= total_outputs,
                "{}: mux total {} < output total {}",
                config.name, total_mux, total_outputs
            );
        }
    }
}
```

- [ ] **Step 2: Run full test suite**

Run: `cd src-tauri && cargo test`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/protocol/devices/mod.rs
git commit -m "feat: add device registry and cross-device tests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full Rust test suite**

Run: `cd src-tauri && cargo test`

Expected: All tests pass (~75+ total).

- [ ] **Step 2: Run clippy**

Run: `cd src-tauri && cargo clippy -- -D warnings`

Fix any warnings.

- [ ] **Step 3: Run frontend tests**

Run: `cd S:/Dev/audio/redmatrix && npm test`

Expected: 1 test passes.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address clippy warnings

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
