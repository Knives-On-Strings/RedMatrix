# 08 — Client Developer Guide

How to write your own RedMatrix client. This guide covers everything you need to connect to the RedMatrix WebSocket server and control a Focusrite Scarlett audio interface.

## Quick Start

Connect, handshake, receive device state, send a command:

```python
import asyncio, json, base64, websockets
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

async def main():
    # 1. Generate a P-256 keypair
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_bytes = private_key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint
    )

    # 2. Connect
    async with websockets.connect("ws://192.168.1.100:18120/api") as ws:

        # 3. Receive server_hello
        server_hello = json.loads(await ws.recv())
        print(f"Connected to: {server_hello['device_name']}")

        # 4. Send client_hello
        await ws.send(json.dumps({
            "type": "client_hello",
            "version": 1,
            "client_pubkey": base64.b64encode(public_bytes).decode(),
            "client_name": "My Custom Client"
        }))

        # 5. Receive auth_result
        auth = json.loads(await ws.recv())
        if auth["status"] != "ok":
            print(f"Auth failed: {auth.get('reason')}")
            return

        # 6. After auth, all frames are AES-256-GCM encrypted.
        #    See "Encryption" section below for implementation.
        #    For now, if the server is in dev mode (require_pairing=false),
        #    frames continue as plaintext.

        # 7. Receive device_state
        state = json.loads(await ws.recv())
        print(f"Device: {state['device']['name']}")
        print(f"Sample rate: {state['sample_rate']} Hz")
        print(f"Inputs: {len(state['inputs'])}")
        print(f"Outputs: {len(state['outputs'])}")

        # 8. Send a command (toggle DIM)
        await ws.send(json.dumps({
            "type": "set_dim",
            "payload": {"enabled": True}
        }))

        # 9. Receive state_update confirming the change
        update = json.loads(await ws.recv())
        print(f"Update: {update}")

asyncio.run(main())
```

## Discovery

The server advertises itself via mDNS (Bonjour):

- **Service type:** `_redmatrix._tcp.local.`
- **Port:** 18120
- **TXT record:** `id=<server_fingerprint>` (e.g., `id=A3F2-9B17-D4C8`)

On iOS, use `NetServiceBrowser`. On Android, use `NsdManager`. On Python, use `zeroconf`.

## Connection Lifecycle

```
Client                                  Server
  |                                       |
  |  1. WebSocket connect                 |
  |-------------------------------------->|
  |                                       |
  |  2. server_hello                      |
  |<--------------------------------------|
  |                                       |
  |  3. client_hello                      |
  |-------------------------------------->|
  |                                       |
  |  4. auth_result                       |
  |<--------------------------------------|
  |                                       |
  |  === All frames encrypted from here ==|
  |                                       |
  |  5. device_state (full dump)          |
  |<--------------------------------------|
  |                                       |
  |  6. state_update / meters (ongoing)   |
  |<--------------------------------------|
  |                                       |
  |  7. Commands from client              |
  |-------------------------------------->|
```

Steps 1-4 are **plaintext JSON**. After step 4, all frames are **AES-256-GCM encrypted binary**.

## Message Reference

### All Server → Client Messages

| Type | When sent | Payload |
|------|-----------|---------|
| `server_hello` | Immediately on connect | `version`, `server_pubkey`, `server_fingerprint`, `device_name`, `server_name` |
| `auth_result` | After client_hello | `status` ("ok"/"rejected"/"pairing_requested"), `reason` (optional) |
| `device_state` | After auth, and on structural changes | Full device state (see below) |
| `state_update` | On any state change | `changes` object with dot-notation paths |
| `error` | On invalid command or rate limit | `code`, `message`, `retry_after_ms` (optional) |
| `device_disconnected` | USB device unplugged | (no payload) |
| `device_connected` | USB device reconnected | (no payload, followed by device_state) |
| `pong` | Response to ping | `timestamp` (Unix ms) |

### All Client → Server Messages

| Type | Payload | Description |
|------|---------|-------------|
| `client_hello` | `version`, `client_pubkey`, `client_name` | Handshake step |
| `ping` | (none) | Keepalive, send every 10s |
| `set_dim` | `{ enabled: bool }` | Toggle -18dB dim |
| `set_mute` | `{ enabled: bool }` | Toggle master mute |
| `set_talkback` | `{ enabled: bool }` | Toggle talkback mic |
| `set_speaker_switching` | `{ mode: "main"\|"alt" }` | Switch monitor outputs |
| `set_master_volume` | `{ db: number }` | Set master volume (-127 to 0) |
| `set_output_volume` | `{ index: number, db: number }` | Set output volume |
| `set_output_mute` | `{ index: number, muted: bool }` | Mute an output |
| `set_input_pad` | `{ index: number, enabled: bool }` | Toggle -10dB pad |
| `set_input_air` | `{ index: number, enabled: bool }` | Toggle AIR mode |
| `set_input_phantom` | `{ group: number, enabled: bool }` | Toggle 48V phantom (by group, not individual input) |
| `set_input_inst` | `{ index: number, enabled: bool }` | Toggle instrument mode |
| `set_mix_gain` | `{ mix: number, channel: number, gain_db: number }` | Set mixer crosspoint gain (-80 to +6) |
| `set_mix_mute` | `{ mix: number, channel: number, muted: bool }` | Mute a mixer channel |
| `set_mix_solo` | `{ mix: number, channel: number, soloed: bool }` | Solo a mixer channel (server-side) |
| `clear_solo` | `{}` | Clear all solos |
| `set_route` | `{ destination: number, source_type: string, source_index: number }` | Set routing (one source per destination) |
| `set_sample_rate` | `{ rate: number }` | 44100/48000/88200/96000/176400/192000 |
| `set_clock_source` | `{ source: "internal"\|"spdif"\|"adat" }` | Set clock source |
| `set_spdif_mode` | `{ mode: string }` | Device-dependent mode string |
| `save_config` | `{}` | Write to flash (rate limited: 12/hour) |

## Complete `device_state` Example

This is a real example for a Scarlett 18i20 Gen 3 at 48kHz:

```json
{
  "type": "device_state",
  "device": {
    "name": "Scarlett 18i20 USB",
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
  "save_config_remaining": 12,
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
    { "index": 0, "name": "Monitor 1 L", "volume_db": -10.0, "muted": false, "hw_controlled": true },
    { "index": 1, "name": "Monitor 1 R", "volume_db": -10.0, "muted": false, "hw_controlled": true },
    { "index": 2, "name": "Monitor 2 L", "volume_db": -10.0, "muted": false, "hw_controlled": true },
    { "index": 3, "name": "Monitor 2 R", "volume_db": -10.0, "muted": false, "hw_controlled": true },
    { "index": 4, "name": "Line 5", "volume_db": 0.0, "muted": false, "hw_controlled": false },
    { "index": 5, "name": "Line 6", "volume_db": 0.0, "muted": false, "hw_controlled": false },
    { "index": 6, "name": "Headphones 1 L", "volume_db": -6.0, "muted": false, "hw_controlled": true },
    { "index": 7, "name": "Headphones 1 R", "volume_db": -6.0, "muted": false, "hw_controlled": true },
    { "index": 8, "name": "Headphones 2 L", "volume_db": -6.0, "muted": false, "hw_controlled": true },
    { "index": 9, "name": "Headphones 2 R", "volume_db": -6.0, "muted": false, "hw_controlled": true }
  ],
  "inputs": [
    { "index": 0, "name": "Analogue 1", "type": "analogue", "pad": false, "air": false, "phantom": false, "inst": false },
    { "index": 1, "name": "Analogue 2", "type": "analogue", "pad": false, "air": false, "phantom": false, "inst": false },
    { "index": 2, "name": "Analogue 3", "type": "analogue", "pad": false, "air": false, "phantom": false, "inst": false },
    { "index": 3, "name": "Analogue 4", "type": "analogue", "pad": false, "air": false, "phantom": false, "inst": false },
    { "index": 4, "name": "Analogue 5", "type": "analogue", "pad": false, "air": false, "phantom": false, "inst": false },
    { "index": 5, "name": "Analogue 6", "type": "analogue", "pad": false, "air": false, "phantom": false, "inst": false },
    { "index": 6, "name": "Analogue 7", "type": "analogue", "pad": false, "air": false, "phantom": false, "inst": false },
    { "index": 7, "name": "Analogue 8", "type": "analogue", "pad": false, "air": false, "phantom": false, "inst": false },
    { "index": 8, "name": "Talkback", "type": "analogue", "pad": false, "air": false, "phantom": false, "inst": false }
  ],
  "mixer": {
    "gains": [
      [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -80.0, -80.0, -80.0],
      [-80.0, -80.0, -80.0, -80.0, -80.0, -80.0, -80.0, -80.0, -80.0, -80.0, -80.0, -80.0]
    ],
    "soloed": [
      [false, false, false, false, false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false, false, false, false, false]
    ]
  },
  "routing": [
    { "type": "pcm", "index": 0 },
    { "type": "pcm", "index": 1 },
    { "type": "pcm", "index": 2 },
    { "type": "pcm", "index": 3 },
    { "type": "pcm", "index": 4 },
    { "type": "pcm", "index": 5 },
    { "type": "pcm", "index": 6 },
    { "type": "pcm", "index": 7 },
    { "type": "pcm", "index": 8 },
    { "type": "pcm", "index": 9 }
  ]
}
```

Notes:
- `mixer.gains` is `[bus][channel]` — 25 buses, 12 channels each (only 2 buses shown above for brevity)
- `mixer.soloed` mirrors the same dimensions
- `routing` array index = destination mux slot. `type` is one of: `off`, `analogue`, `spdif`, `adat`, `mix`, `pcm`
- `features.direct_monitor`: 0 = none, 1 = mono, 2 = stereo (Solo/2i2 only)

## State Updates

After the initial `device_state`, changes arrive as `state_update` with dot-notation paths:

```json
{
  "type": "state_update",
  "changes": {
    "monitor.dim": true,
    "outputs.0.volume_db": -18.0,
    "mixer.gains.0.3": -6.0,
    "inputs.2.air": true
  }
}
```

Apply these as patches to your local copy of the device state. Array indices are numeric.

**Exception:** When `sample_rate`, `spdif_mode`, or `clock_source` changes, the server sends a full `device_state` instead of a patch (because port counts, routing tables, and mixer dimensions all change).

## Meter Data

Binary WebSocket frames at 30-60Hz. Format: array of `Float32` (little-endian), one per metered channel. Values normalized 0.0 (silence) to 1.0 (full scale).

```
[f32 meter_0] [f32 meter_1] ... [f32 meter_N]
```

Size: `meter_count * 4` bytes. The `meter_count` field in `device_state` tells you how many values to expect.

## Encryption

After `auth_result: ok`, all frames are encrypted. Implementation:

### Step 1: ECDH Key Agreement

Both sides have P-256 keypairs. Compute the shared secret:

```
shared_secret = ECDH(my_private_key, peer_public_key)
```

### Step 2: HKDF Key Derivation

```
salt = server_public_key_bytes || client_public_key_bytes
info = "redmatrix-ws-v1"
okm = HKDF-SHA256(shared_secret, salt, info, length=88)

server_write_key = okm[0:32]    (AES-256 key for server→client)
client_write_key = okm[32:64]   (AES-256 key for client→server)
server_write_iv  = okm[64:76]   (12-byte base IV for server→client)
client_write_iv  = okm[76:88]   (12-byte base IV for client→server)
```

### Step 3: Per-Frame Encryption

Each frame uses AES-256-GCM with a unique nonce:

```
nonce = base_iv XOR (frame_counter as 12-byte LE, zero-padded in high bytes)
```

The XOR applies the 8-byte LE frame counter against the **last 8 bytes** of the 12-byte IV. Counters start at 0, increment per frame, independently per direction.

**Wire format:**
```
[frame_counter: 8 bytes LE] [ciphertext] [GCM auth tag: 16 bytes]
```

The frame counter is explicit (not implicit) to allow recovery from dropped frames.

**Direction matters:** Use `server_write_key`/`server_write_iv` for decrypting server frames. Use `client_write_key`/`client_write_iv` for encrypting your own frames.

## Error Handling

| Error code | Meaning | Action |
|-----------|---------|--------|
| `invalid_command` | Unknown message type | Check your `type` field |
| `invalid_payload` | Missing or wrong payload fields | Check payload shape |
| `device_error` | USB command failed | Retry or report |
| `device_disconnected` | USB device unplugged | Show disconnected state, wait for `device_connected` |
| `read_only_mode` | Device is untested, SET commands disabled | Only GET/meter operations work |
| `rate_limited` | Too many save_config commands | Wait `retry_after_ms` milliseconds |

## Rate Limits

| Command | Limit | Reason |
|---------|-------|--------|
| `save_config` | 12 per hour (rolling) | Flash wear protection |
| `set_sample_rate` | 10-second cooldown | Audio interruption |
| `set_spdif_mode` | 10-second cooldown | Routing restructure |

## Keepalive

Send `{ "type": "ping" }` every 10 seconds. Server disconnects clients silent for 30 seconds.

## Supported Devices

The server adapts its state model to the connected device. Different devices have different port counts, features, and mixer dimensions. Check `features` and `port_counts` in `device_state` to know what controls are available.

| Feature | Devices that have it |
|---------|---------------------|
| `has_mixer` | All except Solo and 2i2 Gen 3 |
| `has_speaker_switching` | 18i8 Gen 3, 18i20 Gen 3 |
| `has_talkback` | 18i20 Gen 3 only |
| `direct_monitor` | Solo (mono=1), 2i2 (stereo=2) Gen 3 only |
