use crate::protocol::commands::{CommandRunner, Request, Response};
use crate::usb::RusbTransport;
use crate::protocol::devices::DeviceConfig;
use crate::protocol::constants::*;
use crate::protocol::mixer::{mixer_value_to_db, volume_raw_to_db};
use crate::server::state::{DeviceState, SyncStatus, RouteEntry};

pub fn query_initial_state(
    runner: &mut CommandRunner<RusbTransport>,
    config: &DeviceConfig,
    state: &mut DeviceState,
) -> Result<(), String> {
    // 1. Sync status
    if let Ok(Response::Sync { status }) = runner.execute(Request::GetSync) {
        state.sync_status = if status == 1 {
            SyncStatus::Locked
        } else {
            SyncStatus::Unlocked
        };
    }

    // 2. Output states (Volume Status Block & Mutes)
    // Dim & Mute status (Gen 3 large devices have them at 0x31)
    let has_dim_mute = config.series == "Scarlett Gen 3" && config.port_counts.analogue.outputs >= 6;
    if has_dim_mute {
        if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x31, size: 2 }) {
            if data.len() >= 2 {
                state.monitor.mute = data[0] != 0;
                state.monitor.dim = data[1] != 0;
            }
        }
    }

    let num_outputs = config.port_counts.analogue.outputs as usize;

    // Line output volumes (16-bit array starting at 0x34)
    if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x34, size: (num_outputs * 2) as u32 }) {
        for i in 0..num_outputs {
            if i * 2 + 1 < data.len() {
                let raw_val = i16::from_le_bytes([data[i * 2], data[i * 2 + 1]]);
                if let Some(out_state) = state.outputs.get_mut(i) {
                    out_state.volume_db = volume_raw_to_db(raw_val);
                }
            }
        }
    }

    // Output mute switches (8-bit array starting at 0x5c)
    if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x5c, size: num_outputs as u32 }) {
        for i in 0..num_outputs {
            if i < data.len() {
                if let Some(out_state) = state.outputs.get_mut(i) {
                    out_state.muted = data[i] != 0;
                }
            }
        }
    }

    // Output SW/HW volume switches (8-bit array starting at 0x66)
    if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x66, size: num_outputs as u32 }) {
        for i in 0..num_outputs {
            if i < data.len() {
                if let Some(out_state) = state.outputs.get_mut(i) {
                    out_state.hw_controlled = data[i] != 0;
                }
            }
        }
    }

    // Master volume knob level (16-bit starting at 0x76)
    if has_dim_mute {
        if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x76, size: 2 }) {
            if data.len() >= 2 {
                let raw_val = i16::from_le_bytes([data[0], data[1]]);
                state.monitor.master_volume_db = volume_raw_to_db(raw_val);
            }
        }
    }

    // 3. Input states (Level, Pad, Air, Phantom switches)
    // Level switch (Line/Inst) is at 0x7c (for inputs 1 and 2 if config.level_input_count > 0)
    let num_level = config.level_input_count as usize;
    let level_first = config.level_input_first as usize;
    if num_level > 0 {
        if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x7c, size: num_level as u32 }) {
            for i in 0..num_level {
                if i < data.len() {
                    let input_idx = level_first + i;
                    if let Some(in_state) = state.inputs.get_mut(input_idx) {
                        in_state.inst = data[i] != 0;
                    }
                }
            }
        }
    }

    // Pad switch is at 0x84 (size pad_input_count bytes)
    let num_pad = config.pad_input_count as usize;
    if num_pad > 0 {
        if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x84, size: num_pad as u32 }) {
            for i in 0..num_pad {
                if i < data.len() {
                    if let Some(in_state) = state.inputs.get_mut(i) {
                        in_state.pad = data[i] != 0;
                    }
                }
            }
        }
    }

    // Air switch is at 0x8c (size air_input_count bytes)
    let num_air = config.air_input_count as usize;
    let air_first = config.air_input_first as usize;
    if num_air > 0 {
        if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x8c, size: num_air as u32 }) {
            for i in 0..num_air {
                if i < data.len() {
                    let input_idx = air_first + i;
                    if let Some(in_state) = state.inputs.get_mut(input_idx) {
                        in_state.air = data[i] != 0;
                    }
                }
            }
        }
    }

    // Phantom power switch is at 0x9c (or 0x06 for Solo/2i2)
    let num_phantom = config.phantom_count as usize;
    if num_phantom > 0 {
        let offset = if config.series == "Scarlett Gen 3" && config.port_counts.mix.inputs == 0 {
            0x06 // Solo / 2i2
        } else {
            0x9c // 4i4 / 8i6 / 18i8 / 18i20
        };
        if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset, size: num_phantom as u32 }) {
            for i in 0..num_phantom {
                if i < data.len() {
                    let start_idx = i * config.inputs_per_phantom as usize;
                    for offset_idx in 0..config.inputs_per_phantom as usize {
                        let input_idx = start_idx + offset_idx;
                        if let Some(in_state) = state.inputs.get_mut(input_idx) {
                            in_state.phantom = data[i] != 0;
                        }
                    }
                }
            }
        }
    }

    // 4. Mixer gains
    if config.has_mixer() {
        let num_buses = config.port_counts.mix.outputs as usize;
        let num_channels = config.port_counts.mix.inputs as usize;
        if let Ok(Response::Mix { gains }) = runner.execute(Request::GetMix) {
            for bus in 0..num_buses {
                for chan in 0..num_channels {
                    let idx = bus * num_channels + chan;
                    if idx < gains.len() {
                        let db_val = mixer_value_to_db(gains[idx]);
                        if let Some(bus_gains) = state.mixer.gains.get_mut(bus) {
                            if let Some(gain) = bus_gains.get_mut(chan) {
                                *gain = db_val;
                            }
                        }
                    }
                }
            }
        }
    }

    // 5. Routing matrix (GET_MUX)
    if let Ok(Response::Mux { entries }) = runner.execute(Request::GetMux) {
        state.routing.clear();
        for entry_val in entries {
            state.routing.push(decode_route(entry_val));
        }
    }

    Ok(())
}

pub fn decode_route(val: u32) -> RouteEntry {
    let port_type_id = val & 0xFFFFFF80; // mask off index (lower 7 bits)
    let index = val & 0x7F; // index is lower 7 bits
    let route_type = match port_type_id {
        PORT_TYPE_ANALOGUE => "analogue",
        PORT_TYPE_SPDIF => "spdif",
        PORT_TYPE_ADAT => "adat",
        PORT_TYPE_MIXER => "mixer",
        PORT_TYPE_PCM => "pcm",
        _ => "off",
    }.to_string();

    RouteEntry {
        route_type,
        index,
    }
}

/// Selectively re-read hardware state based on notification flags.
/// Returns a JSON map of the fields that changed (for broadcasting as StateUpdate).
pub fn query_notification_updates(
    runner: &mut CommandRunner<RusbTransport>,
    config: &DeviceConfig,
    state: &mut DeviceState,
    notification: &crate::protocol::notifications::Notification,
) -> serde_json::Map<String, serde_json::Value> {
    let mut changes = serde_json::Map::new();

    // Sync status changed
    if notification.sync {
        if let Ok(Response::Sync { status }) = runner.execute(Request::GetSync) {
            let new_sync = if status == 1 {
                SyncStatus::Locked
            } else {
                SyncStatus::Unlocked
            };
            if state.sync_status != new_sync {
                state.sync_status = new_sync.clone();
                changes.insert(
                    "sync_status".to_string(),
                    serde_json::to_value(&new_sync).unwrap_or_default(),
                );
            }
        }
    }

    let has_dim_mute = config.series == "Scarlett Gen 3" && config.port_counts.analogue.outputs >= 6;

    // Dim/Mute buttons pressed on hardware
    if notification.dim_mute {
        if has_dim_mute {
            if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x31, size: 2 }) {
                if data.len() >= 2 {
                    let new_mute = data[0] != 0;
                    let new_dim = data[1] != 0;
                    if state.monitor.mute != new_mute || state.monitor.dim != new_dim {
                        state.monitor.mute = new_mute;
                        state.monitor.dim = new_dim;
                        changes.insert(
                            "monitor".to_string(),
                            serde_json::to_value(&state.monitor).unwrap_or_default(),
                        );
                    }
                }
            }
        }
    }

    // Monitor volume knob turned or volume-related change
    if notification.monitor {
        let num_outputs = config.port_counts.analogue.outputs as usize;

        // Re-read line output volumes (0x34)
        if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x34, size: (num_outputs * 2) as u32 }) {
            let mut vol_changed = false;
            for i in 0..num_outputs {
                if i * 2 + 1 < data.len() {
                    let raw_val = i16::from_le_bytes([data[i * 2], data[i * 2 + 1]]);
                    if let Some(out_state) = state.outputs.get_mut(i) {
                        let new_vol = volume_raw_to_db(raw_val);
                        if (out_state.volume_db - new_vol).abs() > 0.01 {
                            out_state.volume_db = new_vol;
                            vol_changed = true;
                        }
                    }
                }
            }
            if vol_changed {
                changes.insert(
                    "outputs".to_string(),
                    serde_json::to_value(&state.outputs).unwrap_or_default(),
                );
            }
        }

        // Re-read master volume knob (0x76)
        if has_dim_mute {
            if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x76, size: 2 }) {
                if data.len() >= 2 {
                    let raw_val = i16::from_le_bytes([data[0], data[1]]);
                    let new_master = volume_raw_to_db(raw_val);
                    if (state.monitor.master_volume_db - new_master).abs() > 0.01 {
                        state.monitor.master_volume_db = new_master;
                        changes.insert(
                            "monitor".to_string(),
                            serde_json::to_value(&state.monitor).unwrap_or_default(),
                        );
                    }
                }
            }
        }
    }

    // Input settings changed (level/pad/air/phantom)
    if notification.input_other {
        let mut input_changed = false;

        // Level switches (0x7c)
        let num_level = config.level_input_count as usize;
        let level_first = config.level_input_first as usize;
        if num_level > 0 {
            if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x7c, size: num_level as u32 }) {
                for i in 0..num_level {
                    if i < data.len() {
                        let input_idx = level_first + i;
                        if let Some(in_state) = state.inputs.get_mut(input_idx) {
                            let new_val = data[i] != 0;
                            if in_state.inst != new_val {
                                in_state.inst = new_val;
                                input_changed = true;
                            }
                        }
                    }
                }
            }
        }

        // Pad switches (0x84)
        let num_pad = config.pad_input_count as usize;
        if num_pad > 0 {
            if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x84, size: num_pad as u32 }) {
                for i in 0..num_pad {
                    if i < data.len() {
                        if let Some(in_state) = state.inputs.get_mut(i) {
                            let new_val = data[i] != 0;
                            if in_state.pad != new_val {
                                in_state.pad = new_val;
                                input_changed = true;
                            }
                        }
                    }
                }
            }
        }

        // Air switches (0x8c)
        let num_air = config.air_input_count as usize;
        let air_first = config.air_input_first as usize;
        if num_air > 0 {
            if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x8c, size: num_air as u32 }) {
                for i in 0..num_air {
                    if i < data.len() {
                        let input_idx = air_first + i;
                        if let Some(in_state) = state.inputs.get_mut(input_idx) {
                            let new_val = data[i] != 0;
                            if in_state.air != new_val {
                                in_state.air = new_val;
                                input_changed = true;
                            }
                        }
                    }
                }
            }
        }

        // Phantom power (0x9c or 0x06)
        let num_phantom = config.phantom_count as usize;
        if num_phantom > 0 {
            let offset = if config.series == "Scarlett Gen 3" && config.port_counts.mix.inputs == 0 {
                0x06
            } else {
                0x9c
            };
            if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset, size: num_phantom as u32 }) {
                for i in 0..num_phantom {
                    if i < data.len() {
                        let new_val = data[i] != 0;
                        let start_idx = i * config.inputs_per_phantom as usize;
                        for offset_idx in 0..config.inputs_per_phantom as usize {
                            let input_idx = start_idx + offset_idx;
                            if let Some(in_state) = state.inputs.get_mut(input_idx) {
                                if in_state.phantom != new_val {
                                    in_state.phantom = new_val;
                                    input_changed = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        if input_changed {
            changes.insert(
                "inputs".to_string(),
                serde_json::to_value(&state.inputs).unwrap_or_default(),
            );
        }
    }

    // Monitor other (talkback, speaker switching)
    if notification.monitor_other {
        // Re-read talkback switch at 0x9f
        if config.has_talkback {
            if let Ok(Response::Data { data }) = runner.execute(Request::GetData { offset: 0x9f, size: 1 }) {
                if !data.is_empty() {
                    let new_talkback = (data[0] & (1 << 1)) != 0;
                    if state.monitor.talkback != new_talkback {
                        state.monitor.talkback = new_talkback;
                        changes.insert(
                            "monitor".to_string(),
                            serde_json::to_value(&state.monitor).unwrap_or_default(),
                        );
                    }
                }
            }
        }
    }

    changes
}

pub fn encode_route(route: &RouteEntry) -> u32 {
    let port_type_id = match route.route_type.as_str() {
        "analogue" => PORT_TYPE_ANALOGUE,
        "spdif" => PORT_TYPE_SPDIF,
        "adat" => PORT_TYPE_ADAT,
        "mixer" => PORT_TYPE_MIXER,
        "pcm" => PORT_TYPE_PCM,
        _ => PORT_TYPE_NONE,
    };
    port_type_id | (route.index & 0x7F)
}

pub fn query_meters(
    runner: &mut CommandRunner<RusbTransport>,
) -> Result<Vec<f32>, String> {
    match runner.execute(Request::GetMeter) {
        Ok(Response::Meter { levels }) => {
            let levels_f32: Vec<f32> = levels
                .into_iter()
                .map(|val| (val as f32) / 65535.0)
                .collect();
            Ok(levels_f32)
        }
        Ok(other) => Err(format!("Expected Meter response, got {:?}", other)),
        Err(e) => Err(e.to_string()),
    }
}

