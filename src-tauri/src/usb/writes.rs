use crate::protocol::commands::{CommandRunner, Request, Response};
use crate::protocol::devices::DeviceConfig;
use crate::protocol::mixer::{db_to_mixer_value, db_to_volume_raw};
use crate::server::messages::ClientMessage;
use crate::server::state::DeviceState;
use crate::usb::queries::encode_route;
use crate::usb::RusbTransport;

pub fn dispatch_command(
    runner: &mut CommandRunner<RusbTransport>,
    config: &DeviceConfig,
    state: &DeviceState,
    command: &ClientMessage,
) -> Result<(), String> {
    match command {
        ClientMessage::SetDim { payload } => {
            // dim is at 0x32, activate = 2
            let req = Request::SetData {
                offset: 0x32,
                data: vec![payload.enabled as u8],
            };
            runner.execute(req).map_err(|e| e.to_string())?;
            runner.execute(Request::DataCmd { activate: 2 }).map_err(|e| e.to_string())?;
        }
        ClientMessage::SetMute { payload } => {
            // mute is at 0x31, activate = 2
            let req = Request::SetData {
                offset: 0x31,
                data: vec![payload.enabled as u8],
            };
            runner.execute(req).map_err(|e| e.to_string())?;
            runner.execute(Request::DataCmd { activate: 2 }).map_err(|e| e.to_string())?;
        }
        ClientMessage::SetOutputVolume { payload } => {
            // Line out volume starts at 0x34, 16-bit (2 bytes) per entry, activate = 1
            let offset = 0x34 + (payload.index * 2);
            let raw_val = db_to_volume_raw(payload.db);
            let req = Request::SetData {
                offset,
                data: raw_val.to_le_bytes().to_vec(),
            };
            runner.execute(req).map_err(|e| e.to_string())?;
            runner.execute(Request::DataCmd { activate: 1 }).map_err(|e| e.to_string())?;
        }
        ClientMessage::SetOutputMute { payload } => {
            // Mute switch starts at 0x5c, 1 byte per entry, activate = 1
            let offset = 0x5c + payload.index;
            let req = Request::SetData {
                offset,
                data: vec![payload.muted as u8],
            };
            runner.execute(req).map_err(|e| e.to_string())?;
            runner.execute(Request::DataCmd { activate: 1 }).map_err(|e| e.to_string())?;
        }
        ClientMessage::SetInputInst { payload } => {
            // Level switch starts at 0x7c, 1 byte per entry, activate = 7
            let level_first = config.level_input_first as u32;
            if payload.index >= level_first {
                let offset = 0x7c + (payload.index - level_first);
                let req = Request::SetData {
                    offset,
                    data: vec![payload.enabled as u8],
                };
                runner.execute(req).map_err(|e| e.to_string())?;
                runner.execute(Request::DataCmd { activate: 7 }).map_err(|e| e.to_string())?;
            }
        }
        ClientMessage::SetInputPad { payload } => {
            // Pad switch starts at 0x84, 1 byte per entry, activate = 8
            let offset = 0x84 + payload.index;
            let req = Request::SetData {
                offset,
                data: vec![payload.enabled as u8],
            };
            runner.execute(req).map_err(|e| e.to_string())?;
            runner.execute(Request::DataCmd { activate: 8 }).map_err(|e| e.to_string())?;
        }
        ClientMessage::SetInputAir { payload } => {
            // Air switch starts at 0x8c, 1 byte per entry, activate = 8
            let air_first = config.air_input_first as u32;
            if payload.index >= air_first {
                let offset = 0x8c + (payload.index - air_first);
                let req = Request::SetData {
                    offset,
                    data: vec![payload.enabled as u8],
                };
                runner.execute(req).map_err(|e| e.to_string())?;
                runner.execute(Request::DataCmd { activate: 8 }).map_err(|e| e.to_string())?;
            }
        }
        ClientMessage::SetInputPhantom { payload } => {
            // Phantom switch starts at 0x9c or 0x06. Size = 1 (bit modified), activate = 8
            let offset = if config.series == "Scarlett Gen 3" && config.port_counts.mix.inputs == 0 {
                0x06 // Solo / 2i2
            } else {
                0x9c // 4i4 / 8i6 / 18i8 / 18i20
            };
            // 1. Get the current byte
            let current_byte = match runner.execute(Request::GetData { offset, size: 1 }) {
                Ok(Response::Data { data }) if !data.is_empty() => data[0],
                _ => 0,
            };
            // 2. Modify the bit at payload.group
            let updated_byte = if payload.enabled {
                current_byte | (1 << payload.group)
            } else {
                current_byte & !(1 << payload.group)
            };
            // 3. Write back
            let req = Request::SetData {
                offset,
                data: vec![updated_byte],
            };
            runner.execute(req).map_err(|e| e.to_string())?;
            runner.execute(Request::DataCmd { activate: 8 }).map_err(|e| e.to_string())?;
        }
        ClientMessage::SetMixGain { payload } => {
            let gain = db_to_mixer_value(payload.gain_db);
            let req = Request::SetMix {
                mix_num: payload.mix as u16,
                channel: payload.channel as u16,
                gain,
            };
            runner.execute(req).map_err(|e| e.to_string())?;
        }
        ClientMessage::SetMixMute { payload } => {
            let gain = if payload.muted { 0 } else { 8192 };
            let req = Request::SetMix {
                mix_num: payload.mix as u16,
                channel: payload.channel as u16,
                gain,
            };
            runner.execute(req).map_err(|e| e.to_string())?;
        }
        ClientMessage::SetRoute { .. } | ClientMessage::SetRoutesBatch { .. } => {
            let mut entries = Vec::with_capacity(state.routing.len());
            for r in &state.routing {
                entries.push(encode_route(r));
            }
            let req = Request::SetMux { entries };
            runner.execute(req).map_err(|e| e.to_string())?;
        }
        ClientMessage::SetTalkback { payload } => {
            // talkback switch at 0x9f, enable at 0xa0, size = 1 (bit modified), activate = 10
            // Index is 1 (Talkback)
            // 1. MONITOR_OTHER_ENABLE (0xa0)
            let current_enable = match runner.execute(Request::GetData { offset: 0xa0, size: 1 }) {
                Ok(Response::Data { data }) if !data.is_empty() => data[0],
                _ => 0,
            };
            let updated_enable = if payload.enabled {
                current_enable | (1 << 1)
            } else {
                current_enable & !(1 << 1)
            };
            runner.execute(Request::SetData {
                offset: 0xa0,
                data: vec![updated_enable],
            }).map_err(|e| e.to_string())?;

            // 2. MONITOR_OTHER_SWITCH (0x9f)
            let current_switch = match runner.execute(Request::GetData { offset: 0x9f, size: 1 }) {
                Ok(Response::Data { data }) if !data.is_empty() => data[0],
                _ => 0,
            };
            let updated_switch = if payload.enabled {
                current_switch | (1 << 1)
            } else {
                current_switch & !(1 << 1)
            };
            runner.execute(Request::SetData {
                offset: 0x9f,
                data: vec![updated_switch],
            }).map_err(|e| e.to_string())?;

            runner.execute(Request::DataCmd { activate: 10 }).map_err(|e| e.to_string())?;
        }
        ClientMessage::SaveConfig { .. } => {
            // CONFIG_SAVE sub-command is activate = 6
            runner.execute(Request::DataCmd { activate: 6 }).map_err(|e| e.to_string())?;
        }
        ClientMessage::ClearMixer { .. } => {
            if config.has_mixer() {
                let num_buses = config.port_counts.mix.outputs as u16;
                let num_channels = config.port_counts.mix.inputs as u16;
                for bus in 0..num_buses {
                    for chan in 0..num_channels {
                        let req = Request::SetMix {
                            mix_num: bus,
                            channel: chan,
                            gain: 0,
                        };
                        let _ = runner.execute(req);
                    }
                }
            }
        }
        ClientMessage::SetBusGains { payload } => {
            if config.has_mixer() {
                let num_channels = config.port_counts.mix.inputs as u16;
                let gain = db_to_mixer_value(payload.gain_db);
                for chan in 0..num_channels {
                    let req = Request::SetMix {
                        mix_num: payload.mix as u16,
                        channel: chan,
                        gain,
                    };
                    let _ = runner.execute(req);
                }
            }
        }
        _ => {}
    }
    Ok(())
}
