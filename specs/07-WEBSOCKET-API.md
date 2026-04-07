# 07 — WebSocket API Reference

## Overview

The RedMatrix server exposes a WebSocket API on port 18120 for remote control. The desktop React client uses Tauri IPC (not this API). The iPad app and any future remote clients connect via this WebSocket.

All remote connections are encrypted and authenticated via ECDH keypair exchange. Localhost connections (for development/testing) can optionally bypass encryption.

## Connection

### Endpoint

```
ws://<host>:18120/api
```

Discovery via mDNS: service type `_redmatrix._tcp`, port 18120. The TXT record includes `id=<server_fingerprint>`.

### Connection Lifecycle

```
iPad                                    Server
  |                                       |
  |  1. WebSocket connect to :18120/api   |
  |-------------------------------------->|
  |                                       |
  |  2. server_hello (server pubkey, ver) |
  |<--------------------------------------|
  |                                       |
  |  3. client_hello (client pubkey)      |
  |-------------------------------------->|
  |                                       |
  |  4. auth_result (ok / rejected /      |
  |     pairing_requested)                |
  |<--------------------------------------|
  |                                       |
  |  (if pairing_requested, user          |
  |   confirms on desktop, then:)         |
  |                                       |
  |  5. auth_result (ok)                  |
  |<--------------------------------------|
  |                                       |
  |  === Encrypted channel established == |
  |                                       |
  |  6. device_state (full dump)          |
  |<--------------------------------------|
  |                                       |
  |  7. Incremental updates + meters      |
  |<--------------------------------------|
  |                                       |
  |  8. Commands from client              |
  |-------------------------------------->|
  |                                       |
```

## Authentication & Encryption

### Key Management

- **Server keypair:** Generated on first run. Stored in `%APPDATA%/RedMatrix/server_keys.json` (Windows) or `~/Library/Application Support/RedMatrix/server_keys.json` (macOS). The public key fingerprint is displayed in the Settings tab as a QR code and a human-readable string (e.g. `A3F2-9B17-D4C8`).
- **Client keypair:** Generated on first launch of the iPad app. Private key stored in iOS Keychain. Public key sent during handshake.
- **Paired devices list:** Stored server-side. Maps client public key fingerprints to device names and pairing timestamps. Manageable from Settings tab.

### Handshake Messages

All handshake messages are **unencrypted plaintext JSON** — encryption begins after shared secret derivation.

#### `server_hello` (server → client)

Sent immediately on WebSocket connect.

```json
{
  "type": "server_hello",
  "version": 1,
  "server_pubkey": "<base64-encoded ECDH P-256 public key>",
  "server_fingerprint": "A3F2-9B17-D4C8",
  "device_name": "Scarlett 18i20 Gen 3",
  "server_name": "Pete's Studio"
}
```

#### `client_hello` (client → server)

```json
{
  "type": "client_hello",
  "version": 1,
  "client_pubkey": "<base64-encoded ECDH P-256 public key>",
  "client_name": "Pete's iPad"
}
```

#### `auth_result` (server → client)

```json
{
  "type": "auth_result",
  "status": "ok" | "rejected" | "pairing_requested",
  "reason": "unknown client key"
}
```

- `ok` — client is paired, shared secret derived, encrypted channel starts. All subsequent frames are AES-256-GCM encrypted.
- `rejected` — server does not accept this client (revoked, or pairing denied by user).
- `pairing_requested` — client is unknown. Server displays confirmation dialog on desktop. Client waits. Server sends a follow-up `auth_result` with `ok` or `rejected` after user responds.

### Encryption

After `auth_result: ok`:

1. Both sides derive a shared secret using ECDH (P-256 curve) from their private key and the other party's public key.
2. The shared secret is fed into HKDF-SHA256 to derive a 256-bit AES key and a 96-bit base IV.
3. Every subsequent WebSocket frame (text and binary) is encrypted with AES-256-GCM.
4. Each frame uses a unique nonce: `base_iv XOR frame_counter` (u64, incremented per frame, separate counters for each direction).
5. The GCM authentication tag (16 bytes) is appended to the ciphertext.

**Encrypted frame format:**
```
[frame_counter: 8 bytes LE] [ciphertext: variable] [auth_tag: 16 bytes]
```

The frame counter is sent explicitly (not implicit) to allow recovery from dropped frames.

### Localhost Bypass

Connections from `127.0.0.1` or `::1` skip the handshake entirely — no `server_hello`, no encryption. The first message from the server is `device_state`. This is used by the Tauri webview during development and by the desktop React app if it ever switches from IPC to WebSocket.

## Message Types

After the encrypted channel is established, all messages are JSON text frames unless noted.

### Server → Client

#### `device_state` (full state dump)

Sent once on connect. Contains the entire device state. The client builds its UI entirely from this.

```json
{
  "type": "device_state",
  "device": {
    "name": "Scarlett 18i20 Gen 3",
    "pid": "0x8215",
    "series": "Scarlett Gen 3",
    "firmware_version": 1644,
    "serial": "P9H7KQ79703C80"
  },
  "sample_rate": 48000,
  "sync_status": "locked",
  "clock_source": "internal",
  "spdif_mode": "spdif_rca",
  "features": {
    "has_mixer": true,
    "has_speaker_switching": true,
    "has_talkback": true,
    "direct_monitor": 0
  },
  "meter_count": 65,
  "port_counts": {
    "analogue": { "inputs": 9, "outputs": 10 },
    "spdif": { "inputs": 2, "outputs": 2 },
    "adat": { "inputs": 8, "outputs": 8 },
    "mix": { "inputs": 12, "outputs": 25 },
    "pcm": { "inputs": 20, "outputs": 20 }
  },
  "monitor": {
    "dim": false,
    "mute": false,
    "talkback": false,
    "speaker_switching": "main",
    "master_volume_db": -10.0
  },
  "outputs": [
    {
      "index": 0,
      "name": "Monitor 1 L",
      "volume_db": -10.0,
      "muted": false,
      "hw_controlled": true
    }
  ],
  "inputs": [
    {
      "index": 0,
      "name": "Analogue 1",
      "type": "analogue",
      "pad": false,
      "air": false,
      "phantom": false,
      "inst": false
    }
  ],
  "mixer": {
    "gains": [[0.0, -80.0, -80.0], ["..."]]
  },
  "routing": [
    { "destination": "analogue_out_1", "source": "pcm_1" }
  ]
}
```

The `mixer.gains` field is a 2D array: `gains[mix_bus][input_channel]` in dB. The bus count and input count come from `port_counts.mix`.

The `routing` field is an array of destination→source mappings, one per mux output slot.

#### `state_update` (incremental change)

Sent whenever device state changes (from USB notification or from another client's command).

```json
{
  "type": "state_update",
  "changes": {
    "monitor.dim": true,
    "outputs.0.volume_db": -18.0,
    "mixer.gains.0.3": -6.0,
    "inputs.2.air": true,
    "sync_status": "unlocked"
  }
}
```

Uses dot-notation paths into the `device_state` structure. The client applies these as patches to its local state copy.

Array indices are numeric: `outputs.0.volume_db` means `outputs[0].volume_db`.

#### `meters` (binary frame)

Binary WebSocket frame. Sent at 30-60Hz.

Format: array of `Float32` values in little-endian byte order. One value per metered channel, normalized 0.0 (silence) to 1.0 (full scale). Order matches the device's meter map.

```
[f32 meter_0] [f32 meter_1] [f32 meter_2] ... [f32 meter_N]
```

Total size: `num_meters * 4` bytes. For the 18i20 Gen 3, expect ~65 meters = 260 bytes per frame.

The meter count and channel ordering is defined by the device config (meter_map). The client receives the meter count in `device_state` and knows how to map indices to channels.

#### `error`

```json
{
  "type": "error",
  "code": "invalid_command",
  "message": "Unknown command type: set_foo"
}
```

Error codes: `invalid_command`, `invalid_payload`, `device_error`, `device_disconnected`, `read_only_mode`.

#### `device_disconnected`

```json
{
  "type": "device_disconnected"
}
```

Sent when the USB device is unplugged. Client should show a "device disconnected" state. No commands will be processed until the device reconnects.

#### `device_connected`

```json
{
  "type": "device_connected"
}
```

Followed immediately by a new `device_state` message.

### Client → Server (Commands)

All commands are JSON text frames. The server validates, applies the change via USB, and broadcasts a `state_update` to all connected clients (including the sender).

Clients should apply **optimistic updates** — update local state immediately on command send, then reconcile when the `state_update` arrives. If the server rejects the command (sends `error`), the client rolls back.

#### Monitor Controls

```json
{ "type": "set_dim", "payload": { "enabled": true } }
{ "type": "set_mute", "payload": { "enabled": true } }
{ "type": "set_talkback", "payload": { "enabled": true } }
{ "type": "set_speaker_switching", "payload": { "mode": "alt" } }
{ "type": "set_master_volume", "payload": { "db": -10.0 } }
```

`set_speaker_switching` mode: `"main"` or `"alt"`.

#### Output Controls

```json
{ "type": "set_output_volume", "payload": { "index": 0, "db": -6.0 } }
{ "type": "set_output_mute", "payload": { "index": 0, "muted": true } }
```

#### Input Controls

```json
{ "type": "set_input_pad", "payload": { "index": 0, "enabled": true } }
{ "type": "set_input_air", "payload": { "index": 0, "enabled": true } }
{ "type": "set_input_phantom", "payload": { "group": 0, "enabled": true } }
{ "type": "set_input_inst", "payload": { "index": 0, "enabled": true } }
```

Phantom power uses `group` index (not individual input index) because phantom is switched in groups (e.g., inputs 1-4, inputs 5-8 on the 18i20).

#### Mixer Controls

```json
{ "type": "set_mix_gain", "payload": { "mix": 0, "channel": 3, "gain_db": -6.0 } }
{ "type": "set_mix_mute", "payload": { "mix": 0, "channel": 3, "muted": true } }
{ "type": "set_mix_solo", "payload": { "mix": 0, "channel": 3, "soloed": true } }
{ "type": "clear_solo", "payload": {} }
```

`mix` is the bus index (0 = A, 1 = B, etc.). `channel` is the input index within that bus.

Solo is client-side — it mutes all other channels by zeroing their gains temporarily. `clear_solo` restores all gains.

#### Routing Controls

```json
{ "type": "set_route", "payload": { "destination": 5, "source_type": "pcm", "source_index": 0 } }
```

`destination` is the mux slot index. `source_type` is one of: `"off"`, `"analogue"`, `"spdif"`, `"adat"`, `"mix"`, `"pcm"`. `source_index` is the port number within that type (0-based).

#### Settings Controls

```json
{ "type": "set_sample_rate", "payload": { "rate": 96000 } }
{ "type": "set_clock_source", "payload": { "source": "internal" } }
{ "type": "set_spdif_mode", "payload": { "mode": "dual_adat" } }
{ "type": "save_config", "payload": {} }
```

`set_sample_rate` values: 44100, 48000, 88200, 96000, 176400, 192000.
`set_clock_source` values: `"internal"`, `"spdif"`, `"adat"`.
`set_spdif_mode` values: device-dependent, from `device_state.device.spdif_modes`.
`save_config` writes to flash — should be preceded by a confirmation dialog on the client side.

#### Ping / Keepalive

```json
{ "type": "ping" }
```

Server responds with:

```json
{ "type": "pong", "timestamp": 1712438400000 }
```

Clients should send `ping` every 10 seconds. Server disconnects clients that haven't sent any message in 30 seconds.

## Multi-Client Behavior

- Multiple iPad clients can connect simultaneously.
- All clients receive the same `device_state` on connect and the same `state_update` broadcasts.
- Commands from any client are applied and broadcast to all others.
- No locking — last-write-wins. In practice, two people rarely adjust the same fader at the same moment.
- The desktop Tauri client is NOT a WebSocket client — it uses Tauri IPC. But it sees the same state via the shared Rust `DeviceState` struct.

## Protocol Version

The `version` field in `server_hello` and `client_hello` is an integer. The current version is `1`. If the server and client have different versions, the server should reject the connection with `auth_result: rejected, reason: "incompatible version"`.

Future versions may add new message types (which old clients ignore) or change existing ones (which requires a version bump).

## Rate Limiting

- Meter data: 30-60Hz (server-configurable)
- State updates: debounced at 100ms — rapid changes (e.g., dragging a fader) are batched
- Client commands: no rate limit, but the server queues them for sequential USB execution
