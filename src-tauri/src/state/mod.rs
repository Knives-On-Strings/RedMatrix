// Device state management.
//
// Holds the full state of the connected device (routing, mixer gains,
// input settings, monitor config, etc.). Updated from USB reads and
// notification-triggered re-reads. Shared with the frontend via Tauri IPC
// and with remote clients via WebSocket.
