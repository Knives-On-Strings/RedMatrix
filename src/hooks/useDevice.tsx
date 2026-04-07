/**
 * Device context — shared transport, state, and labels across all tabs.
 *
 * Provides:
 * - deviceState: current DeviceState from the Rust backend
 * - sendCommand: send a ClientMessage to the device
 * - labels: custom channel/bus labels (useLabels)
 * - loading: true while initial state is being fetched
 * - error: error message if connection failed
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import type { DeviceState, ClientMessage, ChannelLabels } from "../types";
import type { Transport } from "../transport";
import { TauriTransport } from "../transport";

interface DeviceContextValue {
  state: DeviceState | null;
  loading: boolean;
  error: string | null;
  sendCommand: (msg: ClientMessage) => Promise<void>;
  labels: ChannelLabels;
  setLabel: (category: keyof ChannelLabels, key: string, value: string) => void;
  getLabel: (category: keyof ChannelLabels, key: string, defaultName: string) => string;
}

interface DeviceProviderProps {
  transport?: Transport;
  children: ReactNode;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider(props: DeviceProviderProps) {
  const transportRef = useRef<Transport>(props.transport ?? new TauriTransport());
  const { children } = props;
  const [state, setState] = useState<DeviceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labels, setLabels] = useState<ChannelLabels>({
    inputs: {},
    outputs: {},
    pcm: {},
    buses: {},
  });

  useEffect(() => {
    let cancelled = false;

    const transport = transportRef.current;
    async function init() {
      try {
        await transport.connect();
        const deviceState = await transport.getState();
        if (!cancelled) {
          setState(deviceState);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to connect");
          setLoading(false);
        }
      }
    }

    init();

    // Subscribe to state updates
    const unsub = transport.onStateUpdate((newState) => {
      setState(newState);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const sendCommand = useCallback(async (msg: ClientMessage) => {
    try {
      await transportRef.current.sendCommand(msg);
    } catch (e) {
      console.error("Command failed:", e);
    }
  }, []);

  const setLabel = useCallback((category: keyof ChannelLabels, key: string, value: string) => {
    setLabels((prev) => ({
      ...prev,
      [category]: { ...prev[category], [key]: value },
    }));
    // TODO: persist to config file
  }, []);

  const getLabel = useCallback(
    (category: keyof ChannelLabels, key: string, defaultName: string): string => {
      return labels[category][key] || defaultName;
    },
    [labels],
  );

  return (
    <DeviceContext.Provider value={{ state, loading, error, sendCommand, labels, setLabel, getLabel }}>
      {children}
    </DeviceContext.Provider>
  );
}

/**
 * Use the shared device context. Must be inside a DeviceProvider.
 */
export function useDevice(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) {
    throw new Error("useDevice must be used within a DeviceProvider");
  }
  return ctx;
}
