# WebSocket Server Design

## Context

The WebSocket server is the bridge between the USB device and remote clients (iPad app). It manages device state, handles ECDH-authenticated encrypted connections, broadcasts state changes, and processes client commands. The desktop React UI uses Tauri IPC — it does not connect via WebSocket.

The full API contract is defined in `specs/07-WEBSOCKET-API.md`. This document specifies the Rust server implementation.

## File Layout

```
src-tauri/src/server/
├── mod.rs              — public API: start_server(), ServerHandle, re-exports
├── listener.rs         — tokio-tungstenite WebSocket accept loop
├── session.rs          — per-client session: handshake, encrypt/decrypt, message loop
├── crypto.rs           — ECDH P-256 keypair, HKDF derivation, AES-256-GCM frame encrypt/decrypt
├── state.rs            — DeviceState struct, mock data generator, state mutation
├── messages.rs         — all message types as serde enums, JSON serialization
├── broadcast.rs        — tokio broadcast channels for state updates + binary meters
└── mdns.rs             — mDNS service advertisement via mdns-sd
```

## Core Types

### ServerConfig

```rust
pub struct ServerConfig {
    pub port: u16,                          // default: 18120
    pub server_name: String,                // e.g. "Pete's Studio"
    pub keypair_path: PathBuf,              // server ECDH keypair storage
    pub paired_devices_path: PathBuf,       // paired client public keys
    pub max_saves_per_hour: u32,            // default: 12
}
```

### ServerHandle

```rust
pub struct ServerHandle {
    pub shutdown_tx: tokio::sync::oneshot::Sender<()>,
    pub state: Arc<RwLock<DeviceState>>,
    pub command_tx: mpsc::Sender<ClientCommand>,
}
```

Returned by `start_server()`. The Tauri app holds this to push USB state changes and receive commands for USB execution.

### DeviceState

```rust
pub struct DeviceState {
    pub device: DeviceInfo,
    pub sample_rate: u32,
    pub sync_status: SyncStatus,
    pub clock_source: ClockSource,
    pub spdif_mode: String,
    pub meter_count: u32,
    pub save_config_remaining: u32,
    pub port_counts: AllPortCounts,
    pub monitor: MonitorState,
    pub outputs: Vec<OutputState>,
    pub inputs: Vec<InputState>,
    pub mixer: MixerState,
    pub routing: Vec<RouteEntry>,
}
```

Sub-structs match the `device_state` JSON schema from `07-WEBSOCKET-API.md` exactly. All fields are `serde::Serialize`.

### MixerState

```rust
pub struct MixerState {
    pub gains: Vec<Vec<f64>>,       // [bus][channel] in dB
    pub soloed: Vec<Vec<bool>>,     // [bus][channel]
}
```

Solo is server-side. The server holds true gains and sends zeroed values to hardware for non-soloed channels.

### Messages

```rust
#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "server_hello")]
    ServerHello { version: u32, server_pubkey: String, server_fingerprint: String, device_name: String, server_name: String },
    #[serde(rename = "auth_result")]
    AuthResult { status: String, reason: Option<String> },
    #[serde(rename = "device_state")]
    DeviceState(Box<DeviceState>),
    #[serde(rename = "state_update")]
    StateUpdate { changes: serde_json::Value },
    #[serde(rename = "error")]
    Error { code: String, message: String, retry_after_ms: Option<u64> },
    #[serde(rename = "device_disconnected")]
    DeviceDisconnected,
    #[serde(rename = "device_connected")]
    DeviceConnected,
    #[serde(rename = "pong")]
    Pong { timestamp: u64 },
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    #[serde(rename = "client_hello")]
    ClientHello { version: u32, client_pubkey: String, client_name: String },
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "set_dim")]
    SetDim { payload: SetEnabledPayload },
    #[serde(rename = "set_mute")]
    SetMute { payload: SetEnabledPayload },
    // ... all command types from 07-WEBSOCKET-API.md
}
```

Uses `#[serde(tag = "type")]` for the `{ "type": "...", ... }` wire format.

## Architecture

### Connection Flow

```
                     ┌─────────────┐
                     │  listener   │
                     │ (accept     │
                     │  loop)      │
                     └──────┬──────┘
                            │ new connection
                     ┌──────▼──────┐
                     │  session    │
                     │ (per-client │
                     │  task)      │
                     └──┬─────┬───┘
                        │     │
              ┌─────────▼┐  ┌▼──────────┐
              │ command   │  │ broadcast │
              │ mpsc tx   │  │ rx        │
              └─────┬─────┘  └─────┬────┘
                    │              │
              ┌─────▼──────────────▼────┐
              │      state manager      │
              │  (processes commands,    │
              │   updates DeviceState,  │
              │   publishes changes)    │
              └─────────────────────────┘
```

### Task Structure

1. **Listener task** — `tokio::net::TcpListener` on port 18120. Accepts TCP connections, upgrades to WebSocket via `tokio-tungstenite`, spawns a session task per connection.

2. **Session task** (one per client) — Runs the handshake (server_hello → client_hello → auth check → auth_result). On success, derives encryption keys and enters the message loop:
   - **Read half:** Receives encrypted frames from client, decrypts, parses as `ClientMessage`, sends to command channel.
   - **Write half:** Receives from broadcast channel, encrypts, sends to client.

3. **State manager task** — Owns the `Arc<RwLock<DeviceState>>`. Receives commands from the mpsc channel, validates them (rate limits, bounds checking), mutates state, publishes `state_update` to the broadcast channel. For structural changes (sample rate, spdif mode), publishes a full `device_state` instead.

4. **Meter task** — Polls the USB device for meter data at 30-60Hz (or generates mock data), publishes binary meter frames to a separate broadcast channel.

5. **mDNS task** — Registers `_redmatrix._tcp` service via `mdns-sd`. Runs for the lifetime of the server.

### Channels

| Channel | Type | Purpose |
|---------|------|---------|
| `command_tx/rx` | `mpsc::channel<ClientCommand>` | Client commands → state manager |
| `update_tx/rx` | `broadcast::channel<ServerMessage>` | State updates → all sessions |
| `meter_tx/rx` | `broadcast::channel<Vec<u8>>` | Binary meter data → all sessions |
| `shutdown_tx/rx` | `oneshot::channel<()>` | Graceful shutdown signal |

### Crypto Module

```rust
pub struct ServerKeypair {
    // Uses `p256` crate (RustCrypto) — supports persistent keys via
    // SecretKey::to_bytes() / from_bytes(). `ring` was rejected because
    // EphemeralPrivateKey is single-use and cannot be persisted.
    private_key: p256::SecretKey,
    public_key_bytes: Vec<u8>,
    fingerprint: String,
}

pub struct SessionCrypto {
    server_write_key: aes_gcm::Aes256Gcm,
    client_write_key: aes_gcm::Aes256Gcm,
    server_write_iv: [u8; 12],
    client_write_iv: [u8; 12],
    server_frame_counter: u64,
    client_frame_counter: u64,
}

impl SessionCrypto {
    pub fn encrypt_server_frame(&mut self, plaintext: &[u8]) -> Vec<u8>;
    pub fn decrypt_client_frame(&mut self, ciphertext: &[u8]) -> Result<Vec<u8>, CryptoError>;
}
```

HKDF info: `"redmatrix-ws-v1"`. Salt: server_pubkey || client_pubkey. Output: 88 bytes (32+32+12+12).

### Paired Devices

```rust
pub struct PairedDevice {
    pub fingerprint: String,
    pub public_key: Vec<u8>,
    pub name: String,
    pub paired_at: u64,
}

pub struct PairedDeviceStore {
    devices: Vec<PairedDevice>,
    path: PathBuf,
}
```

Loaded from JSON file on startup. New pairings added when user confirms on desktop. The `session.rs` handshake checks the client's public key against this store.

### Rate Limiting

```rust
pub struct SaveRateLimiter {
    timestamps: VecDeque<Instant>,
    max_per_hour: u32,
}

impl SaveRateLimiter {
    pub fn try_save(&mut self) -> Result<u32, RateLimitError>;  // returns remaining
    pub fn remaining(&self) -> u32;
}
```

Global (not per-client). Checked in the state manager before executing `save_config`.

## Mock Data

For testing without USB hardware, `state.rs` provides `DeviceState::mock_18i20_gen3()` which returns a fully populated state matching a real 18i20 at 48kHz:
- 9 analogue inputs with realistic names and default settings
- 10 analogue outputs with stereo pairs named per `03-DEVICE.md`
- Mixer gains at unity for bus A, silence for others
- Routing: PCM 1-20 → Analogue/SPDIF/ADAT outputs (default factory routing)
- Sync: locked to internal, 48kHz

## Testing

### Unit tests (in each module):
- `crypto.rs`: keypair generation, HKDF derivation, encrypt/decrypt round-trip, nonce uniqueness across directions
- `messages.rs`: serde round-trip for every message type, tag format matches API spec
- `state.rs`: mock state generation, state mutation, structural change detection
- `broadcast.rs`: multi-receiver delivery, lagged receiver handling

### Integration tests:
- Full connection test: mock WebSocket client → handshake → receive device_state → send command → receive state_update
- Pairing flow: unknown client → pairing_requested → approve → auth ok
- Rejected client: revoked key → auth rejected
- Rate limit: send 13 save_config → 12 succeed, 13th returns rate_limited error
- Multi-client: two clients connected, one sends command, both receive update
- Encryption: verify frames are not readable without the session keys

## Public API

```rust
/// Start the WebSocket server.
/// Returns a handle for the Tauri app to interact with.
pub async fn start_server(config: ServerConfig) -> Result<ServerHandle, ServerError>;
```

The Tauri app calls `start_server()` during initialization. The `ServerHandle` provides:
- `state` — read/write access to push USB state updates
- `command_tx` — receive client commands for USB execution
- `shutdown_tx` — graceful shutdown on app exit
