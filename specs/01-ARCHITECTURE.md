# 01 — Architecture

## System Diagram

```
┌───────────────────────────────────────────────────┐
│                 Windows PC                        │
│                                                   │
│  ┌────────────┐     ┌───────────────────────────┐ │
│  │  Electron  │     │     Server Process        │ │
│  │  (desktop  │◄───►│  ┌─────────────────────┐  │ │
│  │   client)  │ WS  │  │ Protocol Layer      │  │ │
│  └────────────┘     │  │ - command encode/    │  │ │
│                     │  │   decode             │  │ │
│                     │  │ - sequence numbers   │  │ │
│                     │  │ - dB↔HW value tables │  │ │
│                     │  │ - device model config│  │ │
│                     │  └────────┬────────────┘  │ │
│                     │           │               │ │
│                     │  ┌────────┴────────────┐  │ │
│                     │  │ USB Transport       │  │ │
│                     │  │ - libusb / node-usb  │  │ │
│                     │  │ - interface claim    │  │ │
│                     │  │ - bulk/interrupt xfer│  │ │
│                     │  └────────┬────────────┘  │ │
│                     │           │ USB           │ │
│                     │  ┌────────┴────────────┐  │ │
│                     │  │ WebSocket API       │  │ │
│                     │  │ - JSON commands     │  │ │
│                     │  │ - binary meter data │  │ │
│                     │  │ - state sync        │  │ │
│                     │  └────────┬────────────┘  │ │
│                     │           │               │ │
│                     │  ┌────────┴────────────┐  │ │
│                     │  │ HTTP Static Server  │  │ │
│                     │  │ - serves React app  │  │ │
│                     │  │ - mDNS/Bonjour      │  │ │
│                     │  └────────────────────┘  │ │
│                     └───────────────────────────┘ │
│                              │ USB                │
│                     ┌────────┴────────────┐       │
│                     │ Scarlett 18i20 Gen 3 │       │
│                     └─────────────────────┘       │
└───────────────────────────────────────────────────┘
         ▲ WebSocket (LAN :18120)
         │
┌────────┴────────────┐
│  iPad / Browser     │
│  (React app)        │
│  - same codebase    │
│  - touch-optimised  │
│  - auto-discover    │
└─────────────────────┘
```

## Two Products, Native Apps Only

The server does NOT serve a web UI. The React client is bundled inside native app shells. You cannot access the control interface from a browser — this is intentional, to preserve the value of the iPad app.

| Product | Shell | Client Bundling | License |
|---------|-------|----------------|---------|
| **RedMatrix** (Windows + macOS) | Tauri (Rust + native webview) | React client compiled into the app binary | GPL-3.0 |
| **RedMatrix Remote** (iPad) | Native Swift app with WKWebView | React client bundled in the app | Proprietary, paid ($5–10) |

### Why Tauri over Electron

- **~5MB binary** vs ~200MB for Electron (no bundled Chromium — uses the OS webview)
- **Rust backend** can handle USB transport and protocol directly — fast, safe, no Node.js runtime
- Tauri's Rust process IS the server. The React frontend runs in a native webview inside the same app.
- Still uses the same React + TypeScript frontend
- Cross-platform potential (macOS support later is trivial with Tauri)

### How It Works

**Desktop (Tauri):**
The Tauri Rust process handles everything: USB communication, protocol layer, WebSocket server for remote clients, and hosting the React UI in a native window. One process, one binary.

```
┌─────────────────────────────────────┐
│        Tauri App (Windows)          │
│                                     │
│  ┌──────────────┐  ┌────────────┐  │
│  │ Native Window │  │  Rust Core │  │
│  │ (webview)     │  │            │  │
│  │              ◄──►│  USB       │  │
│  │  React UI    │IPC│  Protocol  │  │
│  │              │   │  WS Server │  │
│  └──────────────┘  └─────┬──────┘  │
│                          │ USB     │
│                   ┌──────┴───────┐ │
│                   │ Scarlett     │ │
│                   │ 18i20       │ │
│                   └──────────────┘ │
└─────────────────────────────────────┘
        ▲ WebSocket (LAN :18120)
        │ (encrypted, authenticated)
┌───────┴───────────┐
│  iPad App         │
│  (Swift/RN)       │
│  React UI bundled │
└───────────────────┘
```

**iPad (Remote):**
The iPad app bundles its own copy of the React client. It connects to the desktop server over WebSocket on the LAN. The React code is identical but the transport layer points at the remote server instead of a local IPC bridge.

**Headless mode:**
The Tauri app can run minimised to system tray with no visible window. Remote clients (iPad app) connect as normal. Useful for rack-mounted studio PCs.

## Layer Responsibilities

### USB Transport
- Enumerate USB devices, find VID `0x1235` / PID `0x8215`
- Claim the proprietary control interface (NOT the audio interfaces)
- Send command packets, receive response packets
- Poll for asynchronous notifications
- Handle device connect/disconnect gracefully
- **Lives in:** server process only

### Protocol Layer
- Serialize/deserialize command packets with sequence numbers
- Implement all GET/SET commands (see `02-PROTOCOL.md`)
- Maintain device state model
- Convert between dB values and hardware representations
- Parse notification masks to identify what changed
- Device-specific configuration (port counts, feature flags per model)
- **Lives in:** server process only

### WebSocket API
- Bidirectional JSON messages for commands and state
- Binary frames for high-frequency meter data (not JSON)
- Full state dump on client connect, incremental updates after
- Heartbeat/ping for disconnect detection
- **Encrypted and authenticated** — see Security section below
- Multiple simultaneous clients supported
- **Lives in:** server process (server side), React app (client side)

### Security (Remote Connections)

Remote clients authenticate via a generated keypair system. No passwords or PINs.

**Pairing flow:**
1. Server generates an ECDH keypair on first run. Displays its public key as a QR code and a short fingerprint (e.g. `A3F2-9B17-D4C8`) on the desktop app.
2. iPad client generates its own ECDH keypair on first launch.
3. User scans the QR code or manually enters the server fingerprint on the iPad. The iPad sends its public key to the server.
4. Server displays the iPad's fingerprint on screen. User confirms the pairing on the desktop app.
5. Both sides derive a shared secret via ECDH. Server stores the iPad's public key in a paired devices list.

**Subsequent connections:**
1. Client sends its public key in the WebSocket handshake.
2. Server checks it against the paired devices list. Rejects unknown keys.
3. Both sides derive the shared secret and use it to key an AES-256-GCM encrypted channel.
4. All WebSocket frames (JSON and binary) are encrypted after the handshake.

**Implementation:**
- Use the Web Crypto API (available in both Node.js and browsers) for ECDH + AES-256-GCM
- Keys stored in: server config file (desktop), Keychain/secure storage (iPad)
- Server can revoke paired devices from the Settings tab
- No TLS certificates needed — the ECDH exchange provides equivalent security without a CA
- Localhost connections (Electron desktop) bypass auth entirely

### React GUI
- Five tabs: Overview, Mixer, Routing, Matrix, Settings
- Persistent header with master controls
- Responsive layout (desktop and tablet)
- Touch-optimised fader targets for iPad
- Connects to server via WebSocket transport abstraction
- **Lives in:** Electron (desktop), served via HTTP (iPad)

## Tech Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Desktop app shell | Tauri 2.x | Rust backend + native webview, ~5MB binary, Windows + macOS |
| USB transport | `rusb` (Rust libusb bindings) | Cross-platform (Windows + macOS) |
| Protocol layer | Rust | Command encode/decode, state management |
| WebSocket server | `tokio-tungstenite` (Rust) | For remote iPad clients |
| Frontend | React + TypeScript + Vite | Shared between desktop and iPad |
| Styling | Tailwind CSS | Dark theme, responsive |
| Crypto | Web Crypto API (client) + `ring` (Rust server) | ECDH + AES-256-GCM |
| Service discovery | `mdns-sd` (Rust) | mDNS/Bonjour for iPad auto-discovery |
| iPad app | Swift + WKWebView | Native app, Keychain for keys, camera for QR pairing |
| Prototyping | Python + PyUSB | Quick protocol validation scripts in `scripts/` |

## Server Port

Default: **18120** (a nod to the device model). Configurable in settings.

## Directory Structure

```
redmatrix/
├── CLAUDE.md                  # Claude Code config
├── specs/                     # Spec documents
│   ├── 00-README.md
│   ├── 01-ARCHITECTURE.md
│   ├── 02-PROTOCOL.md
│   ├── 03-DEVICE.md
│   ├── 04-UX.md
│   └── 05-BACKLOG.md
├── src-tauri/                 # Rust backend (Tauri) — GPL-3.0
│   ├── src/
│   │   ├── usb/               # USB transport (rusb)
│   │   ├── protocol/          # Scarlett2 protocol
│   │   │   ├── constants.rs   # All command IDs, port IDs, etc.
│   │   │   ├── commands.rs    # Command encode/decode
│   │   │   ├── devices/       # Per-model config (scarlett_18i20_gen3.rs)
│   │   │   └── mixer_values.rs # dB↔hardware lookup table
│   │   ├── server/            # WebSocket server for remote clients
│   │   ├── crypto/            # ECDH + AES-256-GCM pairing/encryption
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                       # React frontend (shared) — GPL-3.0 (desktop), proprietary (iPad)
│   ├── components/            # UI components
│   ├── hooks/                 # React hooks
│   ├── transport/             # Tauri IPC (desktop) or WebSocket (remote) abstraction
│   ├── App.tsx
│   └── main.tsx
├── ipad/                      # iPad app wrapper — PROPRIETARY, NOT IN PUBLIC REPO
│   ├── RedMatrixRemote.xcodeproj
│   └── ...
├── scripts/                   # Python prototyping scripts — GPL-3.0
│   └── test_usb.py
├── package.json               # Frontend dependencies
└── vite.config.ts
```

Note: the `ipad/` directory is in a **separate private repository**. It is not included in the open-source release. The React source in `src/` is dual-licensed — GPL-3.0 when distributed with the desktop app, proprietary when bundled in the iPad app.
