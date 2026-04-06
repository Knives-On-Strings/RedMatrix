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
    fn transfer(&mut self, data: &[u8]) -> Result<Vec<u8>, TransportError>;
}

/// Mock transport for testing. Returns pre-configured responses in order.
#[cfg(test)]
pub(crate) mod mock {
    use super::*;
    use std::collections::VecDeque;

    pub struct MockTransport {
        responses: VecDeque<Result<Vec<u8>, TransportError>>,
        pub sent: Vec<Vec<u8>>,
    }

    impl MockTransport {
        pub fn new() -> Self {
            Self {
                responses: VecDeque::new(),
                sent: Vec::new(),
            }
        }

        pub fn push_response(&mut self, response: Vec<u8>) {
            self.responses.push_back(Ok(response));
        }

        pub fn push_error(&mut self, error: TransportError) {
            self.responses.push_back(Err(error));
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::mock::MockTransport;

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

    #[test]
    fn mock_transport_push_error() {
        let mut transport = MockTransport::new();
        transport.push_error(TransportError::Timeout);
        let result = transport.transfer(&[0x00]);
        assert!(matches!(result, Err(TransportError::Timeout)));
    }
}
