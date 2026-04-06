/// USB transport trait — abstracted for mocking in tests.
///
/// All USB communication goes through this trait. The real implementation
/// wraps `rusb`, while tests use `MockTransport` with pre-configured responses.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum TransportError {
    #[error("USB device not found")]
    DeviceNotFound,
    #[error("USB transfer failed: {0}")]
    TransferFailed(String),
    #[error("USB transfer timed out")]
    Timeout,
    #[error("device returned unexpected response")]
    UnexpectedResponse,
}

/// Trait for USB control transfers to a Scarlett2 device.
pub trait UsbTransport: Send + Sync {
    /// Send a command and receive a response.
    fn transfer(&mut self, data: &[u8]) -> Result<Vec<u8>, TransportError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    /// Mock transport that returns pre-configured responses in order.
    struct MockTransport {
        responses: VecDeque<Result<Vec<u8>, TransportError>>,
        sent: Vec<Vec<u8>>,
    }

    impl MockTransport {
        fn new() -> Self {
            Self {
                responses: VecDeque::new(),
                sent: Vec::new(),
            }
        }

        fn push_response(&mut self, response: Vec<u8>) {
            self.responses.push_back(Ok(response));
        }
    }

    impl UsbTransport for MockTransport {
        fn transfer(&mut self, data: &[u8]) -> Result<Vec<u8>, TransportError> {
            self.sent.push(data.to_vec());
            self.responses
                .pop_front()
                .unwrap_or(Err(TransportError::UnexpectedResponse))
        }
    }

    #[test]
    fn mock_transport_records_sent_data() {
        let mut transport = MockTransport::new();
        transport.push_response(vec![0x01, 0x02]);

        let result = transport.transfer(&[0xAA, 0xBB]);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), vec![0x01, 0x02]);
        assert_eq!(transport.sent, vec![vec![0xAA, 0xBB]]);
    }

    #[test]
    fn mock_transport_returns_error_when_no_responses() {
        let mut transport = MockTransport::new();
        let result = transport.transfer(&[0x00]);
        assert!(result.is_err());
    }
}
