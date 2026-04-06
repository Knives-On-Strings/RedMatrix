use super::constants::*;
use super::transport::TransportError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CommandError {
    #[error("buffer too short: expected {expected} bytes, got {got}")]
    BufferTooShort { expected: usize, got: usize },
    #[error("sequence mismatch: expected {expected}, got {got}")]
    SequenceMismatch { expected: u16, got: u16 },
    #[error("command mismatch: expected 0x{expected:08x}, got 0x{got:08x}")]
    CommandMismatch { expected: u32, got: u32 },
    #[error("device error: code {code}")]
    DeviceError { code: u32 },
    #[error("invalid padding: 0x{value:08x}")]
    InvalidPadding { value: u32 },
    #[error("unknown command: 0x{cmd_id:08x}")]
    UnknownCommand { cmd_id: u32 },
    #[error("payload too large: {size} bytes (max {max})")]
    PayloadTooLarge { size: usize, max: usize },
    #[error("command timed out waiting for device ACK")]
    Timeout,
    #[error("USB transport error")]
    Transport {
        #[from]
        source: TransportError,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct PacketHeader {
    pub cmd: u32,
    pub size: u16,
    pub seq: u16,
    pub error: u32,
    pub pad: u32,
}

impl PacketHeader {
    pub fn to_bytes(&self) -> [u8; HEADER_SIZE] {
        let mut buf = [0u8; HEADER_SIZE];
        buf[0..4].copy_from_slice(&self.cmd.to_le_bytes());
        buf[4..6].copy_from_slice(&self.size.to_le_bytes());
        buf[6..8].copy_from_slice(&self.seq.to_le_bytes());
        buf[8..12].copy_from_slice(&self.error.to_le_bytes());
        buf[12..16].copy_from_slice(&self.pad.to_le_bytes());
        buf
    }

    pub fn from_bytes(buf: &[u8]) -> Result<Self, CommandError> {
        if buf.len() < HEADER_SIZE {
            return Err(CommandError::BufferTooShort {
                expected: HEADER_SIZE,
                got: buf.len(),
            });
        }
        Ok(Self {
            cmd: u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]),
            size: u16::from_le_bytes([buf[4], buf[5]]),
            seq: u16::from_le_bytes([buf[6], buf[7]]),
            error: u32::from_le_bytes([buf[8], buf[9], buf[10], buf[11]]),
            pad: u32::from_le_bytes([buf[12], buf[13], buf[14], buf[15]]),
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Request {
    Init1,
    Init2,
    GetMeter,
    GetMix,
    SetMix { mix_num: u16, channel: u16, gain: u16 },
    GetMux,
    SetMux { entries: Vec<u32> },
    GetSync,
    GetData { offset: u32, size: u32 },
    SetData { offset: u32, data: Vec<u8> },
    DataCmd { activate: u32 },
}

impl Request {
    pub fn cmd_id(&self) -> u32 {
        match self {
            Request::Init1 => CMD_INIT_1,
            Request::Init2 => CMD_INIT_2,
            Request::GetMeter => CMD_GET_METER,
            Request::GetMix => CMD_GET_MIX,
            Request::SetMix { .. } => CMD_SET_MIX,
            Request::GetMux => CMD_GET_MUX,
            Request::SetMux { .. } => CMD_SET_MUX,
            Request::GetSync => CMD_GET_SYNC,
            Request::GetData { .. } => CMD_GET_DATA,
            Request::SetData { .. } => CMD_SET_DATA,
            Request::DataCmd { .. } => CMD_DATA_CMD,
        }
    }

    pub fn payload(&self) -> Vec<u8> {
        match self {
            Request::Init1 | Request::Init2 | Request::GetMix
            | Request::GetMux | Request::GetSync => vec![],
            Request::GetMeter => 1u32.to_le_bytes().to_vec(),
            Request::SetMix { mix_num, channel, gain } => {
                let mut buf = Vec::with_capacity(6);
                buf.extend_from_slice(&mix_num.to_le_bytes());
                buf.extend_from_slice(&channel.to_le_bytes());
                buf.extend_from_slice(&gain.to_le_bytes());
                buf
            }
            Request::SetMux { entries } => {
                let mut buf = Vec::with_capacity(entries.len() * 4);
                for entry in entries {
                    buf.extend_from_slice(&entry.to_le_bytes());
                }
                buf
            }
            Request::GetData { offset, size } => {
                let mut buf = Vec::with_capacity(8);
                buf.extend_from_slice(&offset.to_le_bytes());
                buf.extend_from_slice(&size.to_le_bytes());
                buf
            }
            Request::SetData { offset, data } => {
                let mut buf = Vec::with_capacity(4 + data.len());
                buf.extend_from_slice(&offset.to_le_bytes());
                buf.extend_from_slice(data);
                buf
            }
            Request::DataCmd { activate } => activate.to_le_bytes().to_vec(),
        }
    }
}

pub fn serialize_request(req: &Request, seq: u16) -> Vec<u8> {
    try_serialize_request(req, seq).expect("payload size within bounds")
}

pub fn try_serialize_request(req: &Request, seq: u16) -> Result<Vec<u8>, CommandError> {
    if let Request::GetData { size, .. } = req {
        if *size as usize > MAX_PAYLOAD_SIZE {
            return Err(CommandError::PayloadTooLarge {
                size: *size as usize,
                max: MAX_PAYLOAD_SIZE,
            });
        }
    }

    let payload = req.payload();
    if payload.len() > MAX_PAYLOAD_SIZE {
        return Err(CommandError::PayloadTooLarge {
            size: payload.len(),
            max: MAX_PAYLOAD_SIZE,
        });
    }

    let header = PacketHeader {
        cmd: req.cmd_id(),
        size: payload.len() as u16,
        seq,
        error: 0,
        pad: 0,
    };

    let mut packet = Vec::with_capacity(HEADER_SIZE + payload.len());
    packet.extend_from_slice(&header.to_bytes());
    packet.extend_from_slice(&payload);
    Ok(packet)
}

pub struct SequenceCounter {
    seq: u16,
}

impl SequenceCounter {
    pub fn new() -> Self {
        Self { seq: 0 }
    }

    pub fn next(&mut self) -> u16 {
        let current = self.seq;
        self.seq = self.seq.wrapping_add(1);
        current
    }

    pub fn reset(&mut self, val: u16) {
        self.seq = val;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packet_header_round_trip() {
        let header = PacketHeader {
            cmd: CMD_GET_SYNC,
            size: 0,
            seq: 42,
            error: 0,
            pad: 0,
        };
        let bytes = header.to_bytes();
        let parsed = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(parsed.cmd, CMD_GET_SYNC);
        assert_eq!(parsed.size, 0);
        assert_eq!(parsed.seq, 42);
        assert_eq!(parsed.error, 0);
        assert_eq!(parsed.pad, 0);
    }

    #[test]
    fn packet_header_from_short_buffer() {
        let buf = [0u8; 10];
        let result = PacketHeader::from_bytes(&buf);
        assert!(matches!(
            result,
            Err(CommandError::BufferTooShort { expected: 16, got: 10 })
        ));
    }

    #[test]
    fn sequence_counter_increments() {
        let mut seq = SequenceCounter::new();
        assert_eq!(seq.next(), 0);
        assert_eq!(seq.next(), 1);
        assert_eq!(seq.next(), 2);
    }

    #[test]
    fn sequence_counter_wraps_at_u16_max() {
        let mut seq = SequenceCounter::new();
        seq.reset(u16::MAX);
        assert_eq!(seq.next(), u16::MAX);
        assert_eq!(seq.next(), 0);
    }

    #[test]
    fn sequence_counter_reset() {
        let mut seq = SequenceCounter::new();
        seq.next();
        seq.next();
        seq.reset(1);
        assert_eq!(seq.next(), 1);
    }

    #[test]
    fn request_init1_serialization() {
        let bytes = serialize_request(&Request::Init1, 1);
        assert_eq!(bytes.len(), HEADER_SIZE);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_INIT_1);
        assert_eq!(header.size, 0);
        assert_eq!(header.seq, 1);
    }

    #[test]
    fn request_init2_serialization() {
        let bytes = serialize_request(&Request::Init2, 1);
        assert_eq!(bytes.len(), HEADER_SIZE);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_INIT_2);
        assert_eq!(header.seq, 1);
    }

    #[test]
    fn request_get_sync_serialization() {
        let bytes = serialize_request(&Request::GetSync, 5);
        assert_eq!(bytes.len(), HEADER_SIZE);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_GET_SYNC);
        assert_eq!(header.seq, 5);
    }

    #[test]
    fn request_get_meter_serialization() {
        let bytes = serialize_request(&Request::GetMeter, 3);
        assert_eq!(bytes.len(), HEADER_SIZE + 4);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_GET_METER);
        assert_eq!(header.size, 4);
        assert_eq!(&bytes[16..20], &1u32.to_le_bytes());
    }

    #[test]
    fn request_get_data_serialization() {
        let bytes = serialize_request(
            &Request::GetData { offset: 0x31, size: 64 },
            10,
        );
        assert_eq!(bytes.len(), HEADER_SIZE + 8);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_GET_DATA);
        assert_eq!(header.size, 8);
        assert_eq!(&bytes[16..20], &0x31u32.to_le_bytes());
        assert_eq!(&bytes[20..24], &64u32.to_le_bytes());
    }

    #[test]
    fn request_set_mix_serialization() {
        let bytes = serialize_request(
            &Request::SetMix { mix_num: 2, channel: 5, gain: 8192 },
            7,
        );
        assert_eq!(bytes.len(), HEADER_SIZE + 6);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_SET_MIX);
        assert_eq!(header.size, 6);
        assert_eq!(&bytes[16..18], &2u16.to_le_bytes());
        assert_eq!(&bytes[18..20], &5u16.to_le_bytes());
        assert_eq!(&bytes[20..22], &8192u16.to_le_bytes());
    }

    #[test]
    fn request_set_mux_serialization() {
        let entries = vec![0x08000001, 0x08000002];
        let bytes = serialize_request(&Request::SetMux { entries }, 4);
        assert_eq!(bytes.len(), HEADER_SIZE + 8);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_SET_MUX);
        assert_eq!(header.size, 8);
        assert_eq!(&bytes[16..20], &0x08000001u32.to_le_bytes());
        assert_eq!(&bytes[20..24], &0x08000002u32.to_le_bytes());
    }

    #[test]
    fn request_data_cmd_serialization() {
        let bytes = serialize_request(&Request::DataCmd { activate: 6 }, 9);
        assert_eq!(bytes.len(), HEADER_SIZE + 4);
        let header = PacketHeader::from_bytes(&bytes).unwrap();
        assert_eq!(header.cmd, CMD_DATA_CMD);
        assert_eq!(header.size, 4);
        assert_eq!(&bytes[16..20], &6u32.to_le_bytes());
    }

    #[test]
    fn request_set_data_payload_too_large() {
        let data = vec![0u8; MAX_PAYLOAD_SIZE + 1];
        let result = try_serialize_request(
            &Request::SetData { offset: 0, data },
            1,
        );
        assert!(matches!(result, Err(CommandError::PayloadTooLarge { .. })));
    }

    #[test]
    fn request_get_data_size_too_large() {
        let result = try_serialize_request(
            &Request::GetData { offset: 0, size: (MAX_PAYLOAD_SIZE + 1) as u32 },
            1,
        );
        assert!(matches!(result, Err(CommandError::PayloadTooLarge { .. })));
    }
}
