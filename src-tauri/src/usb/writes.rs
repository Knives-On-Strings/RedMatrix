use crate::protocol::commands::{CommandRunner, Request, Response};
use crate::protocol::devices::DeviceConfig;
use crate::protocol::mixer::{db_to_mixer_value, db_to_volume_raw};
use crate::server::messages::ClientMessage;
use crate::server::state::DeviceState;
use crate::usb::queries::encode_route;
use crate::protocol::transport::UsbTransport;


fn write_crosspoint_gain<T: UsbTransport>(
    runner: &mut CommandRunner<T>,
    state: &DeviceState,
    mix: u32,
    channel: u32,
) -> Result<(), String> {
    let base_gain = match state.mixer.gains.get(mix as usize) {
        Some(bus) => match bus.get(channel as usize) {
            Some(&g) => g,
            None => return Ok(()),
        },
        None => return Ok(()),
    };

    let actual_gain = if base_gain > -80.0 {
        let vca_offset = state.bus_masters.get(mix as usize).cloned().unwrap_or(0.0);
        let master_offset = if state.sub_assignments.contains(&mix) {
            state.master_db
        } else {
            0.0
        };
        (base_gain + vca_offset + master_offset).clamp(-80.0, 6.0)
    } else {
        -80.0
    };

    let gain = db_to_mixer_value(actual_gain);
    let req = Request::SetMix {
        mix_num: mix as u16,
        channel: channel as u16,
        gain,
    };
    runner.execute(req).map_err(|e| e.to_string())?;
    Ok(())
}

fn write_bus_gains<T: UsbTransport>(
    runner: &mut CommandRunner<T>,
    state: &DeviceState,
    mix: u32,
) -> Result<(), String> {
    let num_channels = match state.mixer.gains.get(mix as usize) {
        Some(bus) => bus.len(),
        None => return Ok(()),
    };
    for ch in 0..num_channels {
        write_crosspoint_gain(runner, state, mix, ch as u32)?;
    }
    Ok(())
}

pub fn dispatch_command<T: UsbTransport>(
    runner: &mut CommandRunner<T>,
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
            write_crosspoint_gain(runner, state, payload.mix, payload.channel)?;
        }
        ClientMessage::SetSubAssignment { .. } => {
            for mix in 0..12 {
                write_bus_gains(runner, state, mix as u32)?;
            }
        }
        ClientMessage::SetBusMaster { payload } => {
            write_bus_gains(runner, state, payload.mix)?;
        }
        ClientMessage::SetMasterDb { .. } => {
            for &mix in &state.sub_assignments {
                write_bus_gains(runner, state, mix)?;
            }
        }
        ClientMessage::InitVcaState { .. } => {
            for mix in 0..state.mixer.gains.len() {
                write_bus_gains(runner, state, mix as u32)?;
            }
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
        ClientMessage::SetSampleRate { payload } => {
            let clock_src_id = runner.transport().clock_source_id();
            runner.set_uac2_sample_rate(clock_src_id, payload.rate)
                .map_err(|e| format!("Failed to set sample rate: {}", e))?;
        }
        ClientMessage::SetClockSource { payload } => {
            let clock_sel_id = runner.transport().clock_selector_id();
            let src_byte = match payload.source.as_str() {
                "spdif" => 2,
                "adat" => 3,
                _ => 1, // "internal" or fallback
            };
            runner.set_uac2_clock_source(clock_sel_id, src_byte)
                .map_err(|e| format!("Failed to set clock source: {}", e))?;
        }
        ClientMessage::SetSpdifMode { payload } => {
            if config.has_spdif_modes() {
                let val = match payload.mode.as_str() {
                    "spdif_optical" => 6,
                    "dual_adat" => 1,
                    _ => 0, // "spdif_rca" or fallback
                };
                let offset = if config.series == "Clarett USB" || config.series == "Clarett+" {
                    0x9e
                } else {
                    0x94
                };
                let activate = if config.series == "Clarett USB" || config.series == "Clarett+" {
                    4
                } else {
                    6
                };

                let req = Request::SetData {
                    offset,
                    data: vec![val],
                };
                runner.execute(req).map_err(|e| e.to_string())?;
                runner.execute(Request::DataCmd { activate }).map_err(|e| e.to_string())?;
            }
        }
        ClientMessage::SetSpeakerSwitching { payload } => {
            if config.has_speaker_switching {
                let (enable, alt) = match payload.mode.as_str() {
                    "alt" => (1u8, 1u8),
                    "main" => (1u8, 0u8),
                    _ => (0u8, 0u8), // "disabled" or fallback
                };

                // Write MONITOR_OTHER_ENABLE (0xa0) bit 0
                let current_enable = match runner.execute(Request::GetData { offset: 0xa0, size: 1 }) {
                    Ok(Response::Data { data }) if !data.is_empty() => data[0],
                    _ => 0,
                };
                let updated_enable = if enable != 0 {
                    current_enable | (1 << 0)
                } else {
                    current_enable & !(1 << 0)
                };
                runner.execute(Request::SetData {
                    offset: 0xa0,
                    data: vec![updated_enable],
                }).map_err(|e| e.to_string())?;

                // Write MONITOR_OTHER_SWITCH (0x9f) bit 0
                let current_switch = match runner.execute(Request::GetData { offset: 0x9f, size: 1 }) {
                    Ok(Response::Data { data }) if !data.is_empty() => data[0],
                    _ => 0,
                };
                let updated_switch = if alt != 0 {
                    current_switch | (1 << 0)
                } else {
                    current_switch & !(1 << 0)
                };
                runner.execute(Request::SetData {
                    offset: 0x9f,
                    data: vec![updated_switch],
                }).map_err(|e| e.to_string())?;

                runner.execute(Request::DataCmd { activate: 10 }).map_err(|e| e.to_string())?;
            }
        }
        ClientMessage::SetMasterVolume { .. } => {
            return Err("Master volume control is read-only on physical hardware".to_string());
        }
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::commands::CommandRunner;
    use crate::protocol::transport::mock::MockTransport;
    use crate::protocol::devices::gen3::SCARLETT_18I20_GEN3;
    use crate::server::messages::{ClientMessage, SampleRatePayload, ClockSourcePayload, VolumePayload};
    use crate::server::state::DeviceState;

    fn make_test_runner() -> CommandRunner<MockTransport> {
        let mut transport = MockTransport::new();
        // Since we'll need responses for get/set data or class transfer:
        transport.push_class_response(vec![]); // For set sample rate / clock source
        transport.push_class_response(vec![]);
        CommandRunner::new(transport)
    }

    #[test]
    fn test_dispatch_set_sample_rate() {
        let mut runner = make_test_runner();
        let config = SCARLETT_18I20_GEN3;
        let state = DeviceState::mock_18i20_gen3();
        let cmd = ClientMessage::SetSampleRate {
            payload: SampleRatePayload { rate: 96000 },
        };

        dispatch_command(&mut runner, &config, &state, &cmd).unwrap();

        let transport = runner.transport();
        assert_eq!(transport.class_sent[0], (0x21, 1, 0x0100, 41 << 8, 96000u32.to_le_bytes().to_vec()));
    }

    #[test]
    fn test_dispatch_set_clock_source() {
        let mut runner = make_test_runner();
        let config = SCARLETT_18I20_GEN3;
        let state = DeviceState::mock_18i20_gen3();
        let cmd = ClientMessage::SetClockSource {
            payload: ClockSourcePayload { source: "spdif".to_string() },
        };

        dispatch_command(&mut runner, &config, &state, &cmd).unwrap();

        let transport = runner.transport();
        assert_eq!(transport.class_sent[0], (0x21, 1, 0x0100, 40 << 8, vec![2]));
    }

    #[test]
    fn test_dispatch_set_master_volume_readonly() {
        let mut runner = make_test_runner();
        let config = SCARLETT_18I20_GEN3;
        let state = DeviceState::mock_18i20_gen3();
        let cmd = ClientMessage::SetMasterVolume {
            payload: VolumePayload { db: -6.0 },
        };

        let res = dispatch_command(&mut runner, &config, &state, &cmd);
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), "Master volume control is read-only on physical hardware");
    }
}
