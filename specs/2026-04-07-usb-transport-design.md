# USB Transport Architecture — Design Spec

**Date:** 2026-04-07
**Status:** Proposed
**Relates to:** Open Questions #17 (USB thread architecture), #18 (Meter polling rate)

## Problem Statement

The RedMatrix server runs on tokio (async runtime) to handle WebSocket sessions, mDNS discovery, meter broadcasting, and the encrypted remote control channel. The USB layer uses `rusb`, which wraps libusb — a synchronous, blocking API. These two execution models conflict in several ways:

1. **Blocking transfer kills the async runtime.** Calling `rusb` `control_transfer()` on a tokio worker thread (even via `spawn_blocking`) ties up a thread from tokio's blocking pool. Under load (multiple rapid commands, meter polling), this can exhaust the pool and stall all async tasks — freezing WebSocket clients, dropping meter frames, and halting mDNS responses.

2. **Notification polling requires a dedicated listener.** The device sends asynchronous hardware notifications (knob turns, button presses, clock changes) via interrupt endpoint EP 0x83. These must be read with a blocking `read_interrupt()` call that parks a thread waiting for data. There is no async API for this in `rusb`.

3. **Meter data needs 20Hz polling.** Per Open Question #18, meter levels are read via GET_METER at 20Hz (50ms intervals). Each poll is a blocking USB control transfer round-trip. This is a steady-state load that must not interfere with user-initiated commands or notification delivery.

4. **All USB I/O must be serialized on the device.** The Scarlett2 protocol uses sequence numbers on a single control endpoint. Commands, meter reads, and follow-up reads triggered by notifications all go through the same USB pipe. Concurrent access from multiple threads would corrupt the sequence counter and produce protocol errors.

## Architecture: Dedicated USB Thread

The solution is a single dedicated OS thread (`std::thread`) that owns all USB I/O. The tokio async world communicates with it via channels.

```
+-------------------------------------+
| Tokio Runtime (async)               |
|                                     |
|  StateManager                       |
|    |  sends UsbRequest via channel  |
|    |  awaits oneshot response        |
|    |  receives UsbEvent stream       |
|    v                                |
|  WebSocket Sessions                 |
|  Meter Broadcaster                  |
|  mDNS                               |
+----------+--------------------------+
           | std::sync::mpsc (commands down)
           | tokio::sync::mpsc (events up)
+----------v--------------------------+
| USB I/O Thread (std::thread)        |
|                                     |
|  Owns: DeviceHandle, CommandRunner  |
|  Owns: SequenceCounter              |
|                                     |
|  Main loop:                         |
|    1. Check command_rx (non-block)  |
|       -> execute command            |
|       -> send response via oneshot  |
|    2. read_interrupt(EP 0x83, 5ms)  |
|       -> parse notification mask    |
|       -> send UsbEvent::Notification|
|    3. If meter_tick elapsed (50ms)  |
|       -> execute GET_METER          |
|       -> send UsbEvent::MeterData   |
+-----------+--------------------------+
            |
| USB Notification Thread (std::thread)|
|                                     |
|  Blocks on read_interrupt(EP 0x83)  |
|  Sends notifications via channel    |
+-------------------------------------+
```

### Why one thread, not `spawn_blocking`

- `spawn_blocking` creates a new thread per call (or reuses from a pool). There is no guarantee of serialization — two `spawn_blocking` calls could race on the same `DeviceHandle`.
- A dedicated thread guarantees serial access to the USB device, owns the sequence counter, and has deterministic lifetime (spawned on device connect, joined on disconnect).
- The thread's loop can interleave command execution with notification reads and meter polls without context-switch overhead.

### Why not async libusb (libusb async API)

libusb does have an async transfer API, but:
- `rusb` does not expose it (as of v0.9).
- The libusb async API requires running `libusb_handle_events()` in a loop — essentially a dedicated thread anyway.
- The synchronous API is simpler, well-tested, and sufficient for our throughput needs (commands are infrequent, meters are 20Hz).

## Types

```rust
use tokio::sync::oneshot;

/// Request sent from the async state manager to the USB thread.
pub enum UsbRequest {
    /// Execute a protocol command and return the response.
    Command {
        request: Request,
        response_tx: oneshot::Sender<Result<Response, CommandError>>,
    },
    /// Shut down the USB thread cleanly.
    Shutdown,
}

/// Event sent from the USB thread to the async state manager.
pub enum UsbEvent {
    /// Hardware notification — one or more state categories changed.
    /// The state manager should issue follow-up GET commands for
    /// each set bit in the mask.
    Notification { mask: u32 },
    /// Fresh meter levels at ~20Hz.
    MeterData(Vec<f32>),
    /// The USB device was physically disconnected or became
    /// unresponsive. The state manager should notify all clients
    /// and begin scanning for reconnection.
    DeviceDisconnected,
    /// A fatal error occurred on the USB thread.
    Error(String),
}
```

Note: `tokio::sync::oneshot::Sender` is `Send` and can be created in async code, sent into the std thread via the command channel, and used to deliver the response back. The async caller holds the `oneshot::Receiver` and `.await`s it.

Note: `tokio::sync::mpsc::Sender` is `Send + Sync` and its `blocking_send()` method can be called from a std thread without a tokio runtime context.

## Thread Communication

```
Async world                          USB thread
-----------                          ----------
std::sync::mpsc::Sender<UsbRequest> -----> std::sync::mpsc::Receiver<UsbRequest>
                                           (command_rx.try_recv() in main loop)

tokio::sync::mpsc::Receiver<UsbEvent> <--- tokio::sync::mpsc::Sender<UsbEvent>
                                           (event_tx.blocking_send() from std thread)
```

**Why `std::sync::mpsc` for commands (down)?** The USB thread's main loop must interleave command processing with interrupt reads and meter timing. It calls `command_rx.try_recv()` (non-blocking) on each iteration. Using `std::sync::mpsc` avoids pulling in a tokio runtime dependency on the USB thread.

**Why `tokio::sync::mpsc` for events (up)?** The async state manager needs to `.await` on the event stream alongside other async tasks (WebSocket accept, timer ticks). `tokio::sync::mpsc::Receiver` implements `Stream` and works with `tokio::select!`. The sender side exposes `blocking_send()` for use from non-async contexts.

**Why `oneshot` for command responses?** Each command has exactly one response. The async caller creates a `oneshot::channel()`, sends the `Sender` half inside `UsbRequest::Command`, and `.await`s the `Receiver`. This gives clean per-command error handling and timeout support (wrap the `.await` in `tokio::time::timeout`).

## The UsbThread Handle

```rust
pub struct UsbThreadHandle {
    /// Send commands to the USB thread.
    command_tx: std::sync::mpsc::Sender<UsbRequest>,
    /// Receive events (notifications, meters, disconnect) from the USB thread.
    event_rx: tokio::sync::mpsc::Receiver<UsbEvent>,
    /// Join handle for cleanup on shutdown.
    join_handle: Option<std::thread::JoinHandle<()>>,
}

impl UsbThreadHandle {
    /// Send a command to the device and await the response.
    /// Returns Err if the USB thread has exited or the command fails.
    pub async fn execute(&self, request: Request) -> Result<Response, CommandError> {
        let (tx, rx) = oneshot::channel();
        self.command_tx
            .send(UsbRequest::Command { request, response_tx: tx })
            .map_err(|_| CommandError::Transport {
                source: TransportError::DeviceNotFound,
            })?;

        // Timeout: no USB command should take more than 1 second
        match tokio::time::timeout(Duration::from_secs(1), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(CommandError::Transport {
                source: TransportError::DeviceNotFound,
            }),
            Err(_) => Err(CommandError::Timeout),
        }
    }

    /// Take the event receiver for the state manager to poll.
    pub fn take_event_rx(&mut self) -> tokio::sync::mpsc::Receiver<UsbEvent> {
        // Called once during setup; panics if called twice
        // Alternative: return in constructor tuple
        todo!()
    }

    /// Request a clean shutdown and wait for the thread to exit.
    pub async fn shutdown(mut self) {
        let _ = self.command_tx.send(UsbRequest::Shutdown);
        if let Some(handle) = self.join_handle.take() {
            // Join in a blocking context to avoid blocking tokio
            tokio::task::spawn_blocking(move || {
                let _ = handle.join();
            })
            .await
            .ok();
        }
    }
}
```

## USB Thread Main Loop

The USB thread runs a single-threaded loop that multiplexes three concerns:

```rust
fn usb_thread_main(
    handle: rusb::DeviceHandle<rusb::GlobalContext>,
    command_rx: std::sync::mpsc::Receiver<UsbRequest>,
    event_tx: tokio::sync::mpsc::Sender<UsbEvent>,
) {
    let mut runner = CommandRunner::new(RealUsbTransport::new(handle));

    // Initialize the device
    match runner.initialize() {
        Ok(fw) => { /* log firmware version */ }
        Err(e) => {
            let _ = event_tx.blocking_send(UsbEvent::Error(format!("{e}")));
            return;
        }
    }

    let mut last_meter = Instant::now();
    let meter_interval = Duration::from_millis(50); // 20Hz

    loop {
        // 1. Check for commands from the async world (non-blocking)
        match command_rx.try_recv() {
            Ok(UsbRequest::Command { request, response_tx }) => {
                let result = runner.execute(request);
                let _ = response_tx.send(result);
            }
            Ok(UsbRequest::Shutdown) => {
                break;
            }
            Err(std::sync::mpsc::TryRecvError::Empty) => {}
            Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                break;
            }
        }

        // 2. Poll for interrupt notifications (short timeout)
        //    read_interrupt with a 5ms timeout — non-blocking enough
        //    to keep the loop responsive
        match read_interrupt(&runner, Duration::from_millis(5)) {
            Ok(Some(mask)) => {
                let _ = event_tx.blocking_send(UsbEvent::Notification { mask });
            }
            Ok(None) => {} // timeout, no notification pending
            Err(_) => {
                let _ = event_tx.blocking_send(UsbEvent::DeviceDisconnected);
                break;
            }
        }

        // 3. Meter polling at 20Hz
        if last_meter.elapsed() >= meter_interval {
            match runner.execute(Request::GetMeter) {
                Ok(Response::Meter { levels }) => {
                    let floats = levels_to_floats(&levels);
                    let _ = event_tx.blocking_send(UsbEvent::MeterData(floats));
                }
                Err(e) if is_disconnect(&e) => {
                    let _ = event_tx.blocking_send(UsbEvent::DeviceDisconnected);
                    break;
                }
                Err(_) => {} // transient error, skip this frame
                _ => {}
            }
            last_meter = Instant::now();
        }
    }
}
```

### Loop timing analysis

- The interrupt read has a 5ms timeout. If no notification is pending, the call returns after 5ms.
- Command processing is immediate (try_recv is non-blocking).
- Meter polling runs every 50ms.
- Worst-case loop period: 5ms (interrupt timeout) + command execution time (~1-2ms for a control transfer). This gives responsive command handling (commands queue for at most ~7ms) and meets the 20Hz meter target.

### Alternative: Two-thread model

An alternative is to run the interrupt listener on its own thread with a long/infinite timeout, and run commands + meters on the main USB thread. This avoids the 5ms polling overhead but adds complexity:

- The interrupt thread needs its own `DeviceHandle` clone (libusb handles are thread-safe for different endpoints).
- Or, the interrupt thread only reads EP 0x83 while the command thread only does control transfers on EP 0. These are different USB endpoints and can operate concurrently.

This is a valid optimization if the 5ms poll proves wasteful. Start with the single-thread model; refactor if profiling shows unnecessary CPU wake-ups.

## Notification Handling

When the USB thread sends `UsbEvent::Notification { mask }`, the async state manager must:

1. Decode the mask bits (see `specs/02-PROTOCOL.md` notification masks).
2. For each set bit, issue the appropriate GET command via `UsbThreadHandle::execute()`:
   - `SYNC (0x08)` -> `GET_SYNC`
   - `DIM_MUTE (0x00200000)` -> `GET_DATA` at volume status offset
   - `MONITOR (0x00400000)` -> `GET_DATA` at volume status offset
   - `INPUT_OTHER (0x00800000)` -> `GET_DATA` at input config offsets
   - `MONITOR_OTHER (0x01000000)` -> `GET_DATA` at monitor config offset
3. Update `DeviceState` with new values.
4. Broadcast incremental state updates to all connected WebSocket clients.

This keeps the USB thread simple (it only reads raw notifications) and puts the state-management logic in the async world where it belongs.

## Meter Data Pipeline

```
USB Thread                  State Manager               WebSocket Clients
----------                  -------------               -----------------
GET_METER (20Hz)
  -> Vec<f32>           --> event_rx.recv()
                             convert to binary frame
                             (Float32Array)
                                                    --> broadcast to all sessions
                                                        (binary WebSocket frame)
```

Meter data bypasses JSON serialization. The state manager converts the `Vec<f32>` directly into a binary WebSocket frame (4 bytes per channel, IEEE 754 float, little-endian). Clients receive this as an `ArrayBuffer` and render with `requestAnimationFrame` smoothing.

The 20Hz USB poll rate combined with client-side CSS/JS easing (exponential decay toward the target value at 60fps) produces smooth, responsive meters without excessive USB traffic.

## Integration with Existing Code

### What stays the same

- **`UsbTransport` trait** (`src-tauri/src/protocol/transport.rs`) — unchanged. The real implementation wraps `rusb::DeviceHandle` control transfers. The mock implementation stays for unit tests.
- **`CommandRunner<T: UsbTransport>`** (`src-tauri/src/protocol/commands.rs`) — unchanged. It lives inside the USB thread, called synchronously. The sequence counter, serialization, and response validation all work as-is.
- **`Request` and `Response` enums** — unchanged. These are the command vocabulary shared between the USB thread and the async world.

### What gets added

- **`UsbThreadHandle`** — the async-side handle for sending commands and receiving events.
- **`UsbRequest` / `UsbEvent` enums** — the channel message types.
- **`RealUsbTransport`** — the `UsbTransport` impl that wraps `rusb::DeviceHandle` with control transfers (bRequest=2 TX, bRequest=3 RX, wIndex=3).
- **`usb_thread_main()`** — the thread entry point with the multiplexed loop.
- **Device scanner** — periodic `rusb::devices()` enumeration to detect connect/disconnect.

### What the state manager does

The `StateManager` (not yet written) is an async actor that:
- Holds `UsbThreadHandle`
- Holds `DeviceState`
- Receives `UsbEvent`s and updates state
- Receives commands from WebSocket sessions and forwards to USB
- Broadcasts state changes to clients

```rust
// In the state manager's main loop (sketch):
tokio::select! {
    // Client command from a WebSocket session
    Some(cmd) = client_rx.recv() => {
        let response = usb_handle.execute(cmd.request).await;
        cmd.reply(response);
    }
    // Event from the USB thread
    Some(event) = event_rx.recv() => {
        match event {
            UsbEvent::Notification { mask } => {
                handle_notification(mask, &usb_handle, &mut state).await;
                broadcast_state_update(&state, &clients).await;
            }
            UsbEvent::MeterData(levels) => {
                broadcast_meters(&levels, &clients).await;
            }
            UsbEvent::DeviceDisconnected => {
                state.set_disconnected();
                broadcast_disconnect(&clients).await;
                start_reconnect_scan();
            }
            UsbEvent::Error(msg) => {
                log::error!("USB thread error: {msg}");
            }
        }
    }
}
```

## Error Handling and Reconnection

### Device disconnect

Detected by:
- `rusb` returning `Error::NoDevice` or `Error::Io` from a transfer
- The interrupt read returning a pipe error

The USB thread sends `UsbEvent::DeviceDisconnected` and exits its loop. The `JoinHandle` becomes joinable.

### Reconnection

The state manager starts a periodic scan (every 2 seconds):
1. Call `rusb::devices()` and look for VID `0x1235` with a known Scarlett2 PID.
2. On match, open the device, claim interface 3, spawn a new USB thread.
3. Run the init sequence (INIT_1, INIT_2).
4. Do a full state read (GET_DATA, GET_MUX, GET_MIX, GET_SYNC).
5. Broadcast the full state to all connected clients.

### Command timeout

If a command doesn't get a response within 1 second (the `tokio::time::timeout` in `execute()`), it returns `CommandError::Timeout`. The caller (state manager or WebSocket handler) can retry or report the error to the client.

### Channel disconnect

If the USB thread panics or exits unexpectedly, `command_tx.send()` returns `Err` (disconnected channel). The `execute()` method maps this to `DeviceNotFound`. The state manager treats this the same as a device disconnect.

## Testing Strategy

### Unit tests (no USB thread)

The `CommandRunner` + `MockTransport` tests remain the primary protocol test suite. They validate serialization, parsing, sequence handling, and error detection without any threading.

### Integration tests (USB thread with mock)

A `MockUsbThread` can be built that:
- Spawns a std::thread with a `MockTransport`-backed `CommandRunner`
- Accepts commands via the same channel protocol
- Returns canned responses
- Can simulate notifications and disconnects

This tests the channel plumbing, timeout handling, and state manager integration without hardware.

### Hardware tests (manual)

For real device testing:
- The USB thread spawns with a real `rusb::DeviceHandle`
- Safe GET commands only (read-only mode for untested devices)
- Meter data visible in the UI confirms the full pipeline works
- Notification handling verified by turning a hardware knob and observing the UI update

## File Layout

```
src-tauri/src/
  protocol/
    transport.rs        -- UsbTransport trait (exists, unchanged)
    commands.rs         -- CommandRunner, Request, Response (exists, unchanged)
    constants.rs        -- protocol constants (exists, unchanged)
  usb/
    mod.rs              -- pub mod thread; pub mod scanner; pub mod types;
    types.rs            -- UsbRequest, UsbEvent enums
    thread.rs           -- UsbThreadHandle, usb_thread_main()
    scanner.rs          -- device detection and reconnection
    real_transport.rs   -- RealUsbTransport impl (rusb control transfers)
```

## Open Questions for Implementation

1. **Single loop vs two threads for interrupt + commands.** The single-loop design with a 5ms interrupt timeout is simpler. The two-thread design (one for EP 0x83, one for EP 0 control transfers) may be more efficient. Start with single-loop; measure.

2. **Meter level conversion.** The device returns `u16` meter levels. The conversion to `f32` (0.0-1.0 range or dBFS) needs to match what the kernel driver does. Check the kernel source for the scaling formula.

3. **Channel buffer sizes.** The `tokio::sync::mpsc` event channel should be bounded. Meter data at 20Hz is the steady-state load — a buffer of 4-8 frames is sufficient. If the async side falls behind, old meter frames can be dropped (send with `try_send`, discard on full).

4. **Multiple devices.** The current design assumes one device. Supporting multiple Scarlett interfaces simultaneously would require one USB thread per device, each with its own channels. The state manager would need a device registry. This is a future concern — the primary target is a single 18i20.
