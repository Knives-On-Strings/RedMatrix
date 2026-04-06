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
}
