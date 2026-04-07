/**
 * Transport layer — abstracts device communication.
 *
 * Desktop: Tauri IPC (TauriTransport)
 * iPad: WebSocket (WebSocketTransport — implemented in the iPad app repo)
 */

export type { Transport } from "./types";
export { TauriTransport } from "./tauri";
