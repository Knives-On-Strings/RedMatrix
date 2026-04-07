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
import { loadConfig, saveConfig, DEFAULT_CONFIG } from "./useConfig";
import type { UserConfig } from "./useConfig";
import { THEMES, applyTheme } from "../themes";
import { showToast } from "../components/Toast";

export interface StereoPairConfig {
  left: number;
  right: number;
  name: string;
  linked: boolean;
}

export interface InputStereoPairConfig {
  left: number;
  right: number;
  name: string;
  linked: boolean;
  input_type: string;
}

interface DeviceContextValue {
  state: DeviceState | null;
  loading: boolean;
  error: string | null;
  sendCommand: (msg: ClientMessage) => Promise<void>;
  labels: ChannelLabels;
  setLabel: (category: keyof ChannelLabels, key: string, value: string) => void;
  getLabel: (category: keyof ChannelLabels, key: string, defaultName: string) => string;
  stereoPairs: StereoPairConfig[];
  setStereoPairs: (pairs: StereoPairConfig[]) => void;
  inputStereoPairs: InputStereoPairConfig[];
  setInputStereoPairs: (pairs: InputStereoPairConfig[]) => void;
  theme: string;
  setTheme: (themeId: string) => void;
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
  const [stereoPairs, setStereoPairsState] = useState<StereoPairConfig[]>([]);
  const [inputStereoPairs, setInputStereoPairsState] = useState<InputStereoPairConfig[]>([]);
  const [theme, setThemeState] = useState<string>("dark");

  // Track the current device serial for config persistence
  const serialRef = useRef<string | null>(null);
  const configRef = useRef<UserConfig>(DEFAULT_CONFIG);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSave = useCallback((serial: string, config: UserConfig) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveConfig(serial, config).catch((e) =>
        console.error("Failed to save config:", e),
      );
    }, 500);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const transport = transportRef.current;
    async function init() {
      try {
        await transport.connect();
        const deviceState = await transport.getState();
        if (!cancelled) {
          setState(deviceState);

          // Load saved config for this device
          const serial = deviceState.device.serial;
          serialRef.current = serial;
          const savedConfig = await loadConfig(serial);
          configRef.current = savedConfig;
          if (savedConfig.labels) {
            setLabels(savedConfig.labels);
          }
          if (savedConfig.stereo_pairs && savedConfig.stereo_pairs.length > 0) {
            setStereoPairsState(savedConfig.stereo_pairs);
          }
          if (savedConfig.input_stereo_pairs && savedConfig.input_stereo_pairs.length > 0) {
            setInputStereoPairsState(savedConfig.input_stereo_pairs);
          }
          if (savedConfig.theme) {
            setThemeState(savedConfig.theme);
            const themeObj = THEMES[savedConfig.theme];
            if (themeObj) applyTheme(themeObj);
          }

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

    // Subscribe to server messages (disconnect, reconnect, errors)
    const unsubMessage = transport.onMessage((message) => {
      if (message.type === "device_disconnected") {
        setState(null);
        setError("Device disconnected");
        showToast("Device disconnected — reconnecting...", "error");
      } else if (message.type === "device_connected") {
        // Re-fetch full state
        transportRef.current.getState().then(setState).catch(() => {});
        setError(null);
        showToast("Device reconnected", "success");
      } else if (message.type === "error") {
        showToast(`Error: ${message.message}`, "error");
      }
    });

    return () => {
      cancelled = true;
      unsub();
      unsubMessage();
      // Flush any pending save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [debouncedSave]);

  const sendCommand = useCallback(async (msg: ClientMessage) => {
    try {
      await transportRef.current.sendCommand(msg);
    } catch (e) {
      console.error("Command failed:", e);
      const { showToast } = await import("../components/Toast");
      showToast(`Command failed: ${e instanceof Error ? e.message : "unknown error"}`, "error");
    }
  }, []);

  const setLabel = useCallback((category: keyof ChannelLabels, key: string, value: string) => {
    setLabels((prev) => {
      const updated = {
        ...prev,
        [category]: { ...prev[category], [key]: value },
      };
      // Persist to config file (debounced)
      const serial = serialRef.current;
      if (serial) {
        configRef.current = { ...configRef.current, labels: updated };
        debouncedSave(serial, configRef.current);
      }
      return updated;
    });
  }, [debouncedSave]);

  const getLabel = useCallback(
    (category: keyof ChannelLabels, key: string, defaultName: string): string => {
      return labels[category][key] || defaultName;
    },
    [labels],
  );

  const setStereoPairs = useCallback((pairs: StereoPairConfig[]) => {
    setStereoPairsState(pairs);
    const serial = serialRef.current;
    if (serial) {
      configRef.current = { ...configRef.current, stereo_pairs: pairs };
      debouncedSave(serial, configRef.current);
    }
  }, [debouncedSave]);

  const setInputStereoPairs = useCallback((pairs: InputStereoPairConfig[]) => {
    setInputStereoPairsState(pairs);
    const serial = serialRef.current;
    if (serial) {
      configRef.current = { ...configRef.current, input_stereo_pairs: pairs };
      debouncedSave(serial, configRef.current);
    }
  }, [debouncedSave]);

  const setTheme = useCallback((themeId: string) => {
    const themeObj = THEMES[themeId];
    if (themeObj) {
      applyTheme(themeObj);
      setThemeState(themeId);
      const serial = serialRef.current;
      if (serial) {
        configRef.current = { ...configRef.current, theme: themeId };
        debouncedSave(serial, configRef.current);
      }
    }
  }, [debouncedSave]);

  return (
    <DeviceContext.Provider value={{ state, loading, error, sendCommand, labels, setLabel, getLabel, stereoPairs, setStereoPairs, inputStereoPairs, setInputStereoPairs, theme, setTheme }}>
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
