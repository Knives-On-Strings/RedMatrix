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
import { pushMeterData } from "./useMeterStore";

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

export type UndoableAction =
  | { type: "command"; description: string; undo: ClientMessage | ClientMessage[]; redo: ClientMessage | ClientMessage[] }
  | { type: "vca_sub"; description: string; subIndex: number; undoBus: number; redoBus: number }
  | { type: "vca_master"; description: string; busIndex: number; undoDb: number; redoDb: number }
  | { type: "vca_master_db"; description: string; undoDb: number; redoDb: number }
  | { type: "labels"; description: string; undo: ChannelLabels; redo: ChannelLabels }
  | { type: "stereo_pairs"; isInput: boolean; description: string; undo: any[]; redo: any[] }
  | { type: "theme"; description: string; undo: string; redo: string };

interface DeviceContextValue {
  state: DeviceState | null;
  loading: boolean;
  error: string | null;
  sendCommand: (msg: ClientMessage | ClientMessage[], options?: { undo?: ClientMessage | ClientMessage[]; description?: string }) => Promise<void>;
  labels: ChannelLabels;
  setLabel: (category: keyof ChannelLabels, key: string, value: string, options?: { description?: string }) => void;
  getLabel: (category: keyof ChannelLabels, key: string, defaultName: string) => string;
  stereoPairs: StereoPairConfig[];
  setStereoPairs: (pairs: StereoPairConfig[], options?: { description?: string }) => void;
  inputStereoPairs: InputStereoPairConfig[];
  setInputStereoPairs: (pairs: InputStereoPairConfig[], options?: { description?: string }) => void;
  theme: string;
  setTheme: (themeId: string, options?: { description?: string }) => void;
  setSubAssignment: (subIndex: number, busIndex: number, options?: { undoBus?: number; description?: string }) => void;
  setBusMaster: (busIndex: number, db: number, options?: { undoDb?: number; description?: string }) => void;
  setMasterDb: (db: number, options?: { undoDb?: number; description?: string }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoActionDescription: string | null;
  redoActionDescription: string | null;
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

          // Initialize VCA state in backend
          const sub_assignments = savedConfig.sub_assignments ?? [0, 1, 2, 3];
          const bus_masters = savedConfig.bus_masters ?? Array(12).fill(0);
          const master_db = savedConfig.master_db ?? 0;
          transport.sendCommand({
            type: "init_vca_state",
            payload: { sub_assignments, bus_masters, master_db }
          }).catch((e) => console.error("Failed to init VCA state:", e));
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

    // Subscribe to meter data — pushed to external store, NOT React state.
    // This avoids re-rendering the entire context tree at 20Hz.
    const unsubMeters = transport.onMeters((meterData) => {
      pushMeterData(meterData);
    });

    // Subscribe to server messages (disconnect, reconnect, errors)
    const unsubMessage = transport.onMessage((message) => {
      if (message.type === "device_disconnected") {
        setState(null);
        setError("Device disconnected");
        showToast("Device disconnected — reconnecting...", "error");
      } else if (message.type === "device_connected") {
        // Re-fetch full state
        transportRef.current.getState().then((newState) => {
          setState(newState);
          // Re-initialize VCA state on reconnect
          const savedConfig = configRef.current;
          const sub_assignments = savedConfig.sub_assignments ?? [0, 1, 2, 3];
          const bus_masters = savedConfig.bus_masters ?? Array(12).fill(0);
          const master_db = savedConfig.master_db ?? 0;
          transportRef.current.sendCommand({
            type: "init_vca_state",
            payload: { sub_assignments, bus_masters, master_db }
          }).catch((e) => console.error("Failed to re-init VCA state:", e));
        }).catch(() => {});
        setError(null);
        showToast("Device reconnected", "success");
      } else if (message.type === "error") {
        showToast(`Error: ${message.message}`, "error");
      }
    });

    return () => {
      cancelled = true;
      unsub();
      unsubMeters();
      unsubMessage();
      // Flush any pending save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [debouncedSave]);

  const [undoStack, setUndoStack] = useState<UndoableAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoableAction[]>([]);
  const undoStackRef = useRef<UndoableAction[]>([]);
  const redoStackRef = useRef<UndoableAction[]>([]);

  useEffect(() => {
    undoStackRef.current = undoStack;
  }, [undoStack]);

  useEffect(() => {
    redoStackRef.current = redoStack;
  }, [redoStack]);

  const pushToUndo = useCallback((action: UndoableAction) => {
    setUndoStack((prev) => [...prev, action]);
    setRedoStack([]);
  }, []);

  const sendCommand = useCallback(async (msg: ClientMessage | ClientMessage[], options?: { undo?: ClientMessage | ClientMessage[]; description?: string }) => {
    try {
      if (Array.isArray(msg)) {
        for (const m of msg) {
          await transportRef.current.sendCommand(m);
        }
      } else {
        await transportRef.current.sendCommand(msg);
      }
      if (options?.undo && options?.description) {
        pushToUndo({
          type: "command",
          description: options.description,
          undo: options.undo,
          redo: msg
        });
      }
    } catch (e) {
      console.error("Command failed:", e);
      showToast(`Command failed: ${e instanceof Error ? e.message : "unknown error"}`, "error");
    }
  }, [pushToUndo]);

  const setLabel = useCallback((category: keyof ChannelLabels, key: string, value: string, options?: { description?: string }) => {
    setLabels((prev) => {
      const updated = {
        ...prev,
        [category]: { ...prev[category], [key]: value },
      };
      const serial = serialRef.current;
      if (serial) {
        configRef.current = { ...configRef.current, labels: updated };
        debouncedSave(serial, configRef.current);
      }
      if (options?.description) {
        pushToUndo({
          type: "labels",
          description: options.description,
          undo: prev,
          redo: updated
        });
      }
      return updated;
    });
  }, [debouncedSave, pushToUndo]);

  const getLabel = useCallback(
    (category: keyof ChannelLabels, key: string, defaultName: string): string => {
      return labels[category][key] || defaultName;
    },
    [labels],
  );

  const setStereoPairs = useCallback((pairs: StereoPairConfig[], options?: { description?: string }) => {
    setStereoPairsState((prev) => {
      const serial = serialRef.current;
      if (serial) {
        configRef.current = { ...configRef.current, stereo_pairs: pairs };
        debouncedSave(serial, configRef.current);
      }
      if (options?.description) {
        pushToUndo({
          type: "stereo_pairs",
          isInput: false,
          description: options.description,
          undo: prev,
          redo: pairs
        });
      }
      return pairs;
    });
  }, [debouncedSave, pushToUndo]);

  const setInputStereoPairs = useCallback((pairs: InputStereoPairConfig[], options?: { description?: string }) => {
    setInputStereoPairsState((prev) => {
      const serial = serialRef.current;
      if (serial) {
        configRef.current = { ...configRef.current, input_stereo_pairs: pairs };
        debouncedSave(serial, configRef.current);
      }
      if (options?.description) {
        pushToUndo({
          type: "stereo_pairs",
          isInput: true,
          description: options.description,
          undo: prev,
          redo: pairs
        });
      }
      return pairs;
    });
  }, [debouncedSave, pushToUndo]);

  const setTheme = useCallback((themeId: string, options?: { description?: string }) => {
    const themeObj = THEMES[themeId];
    if (themeObj) {
      applyTheme(themeObj);
      setThemeState((prev) => {
        const serial = serialRef.current;
        if (serial) {
          configRef.current = { ...configRef.current, theme: themeId };
          debouncedSave(serial, configRef.current);
        }
        if (options?.description) {
          pushToUndo({
            type: "theme",
            description: options.description,
            undo: prev,
            redo: themeId
          });
        }
        return themeId;
      });
    }
  }, [debouncedSave, pushToUndo]);

  const setSubAssignment = useCallback((subIndex: number, busIndex: number, options?: { undoBus?: number; description?: string }) => {
    const serial = serialRef.current;
    if (serial) {
      const oldAssignments = configRef.current.sub_assignments ?? [0, 1, 2, 3];
      const next = [...oldAssignments];
      next[subIndex] = busIndex;
      configRef.current = { ...configRef.current, sub_assignments: next };
      debouncedSave(serial, configRef.current);
    }
    if (options?.undoBus !== undefined && options?.description) {
      pushToUndo({
        type: "vca_sub",
        description: options.description,
        subIndex,
        undoBus: options.undoBus,
        redoBus: busIndex
      });
    }
    sendCommand({ type: "set_sub_assignment", payload: { sub_index: subIndex, mix: busIndex } }).catch((e) =>
      console.error("Failed to send set_sub_assignment:", e)
    );
  }, [debouncedSave, sendCommand, pushToUndo]);

  const setBusMaster = useCallback((busIndex: number, db: number, options?: { undoDb?: number; description?: string }) => {
    const serial = serialRef.current;
    if (serial) {
      const oldMasters = configRef.current.bus_masters ?? Array(12).fill(0);
      const next = [...oldMasters];
      next[busIndex] = db;
      configRef.current = { ...configRef.current, bus_masters: next };
      debouncedSave(serial, configRef.current);
    }
    if (options?.undoDb !== undefined && options?.description) {
      pushToUndo({
        type: "vca_master",
        description: options.description,
        busIndex,
        undoDb: options.undoDb,
        redoDb: db
      });
    }
    sendCommand({ type: "set_bus_master", payload: { mix: busIndex, gain_db: db } }).catch((e) =>
      console.error("Failed to send set_bus_master:", e)
    );
  }, [debouncedSave, sendCommand, pushToUndo]);

  const setMasterDb = useCallback((db: number, options?: { undoDb?: number; description?: string }) => {
    const serial = serialRef.current;
    if (serial) {
      configRef.current = { ...configRef.current, master_db: db };
      debouncedSave(serial, configRef.current);
    }
    if (options?.undoDb !== undefined && options?.description) {
      pushToUndo({
        type: "vca_master_db",
        description: options.description,
        undoDb: options.undoDb,
        redoDb: db
      });
    }
    sendCommand({ type: "set_master_db", payload: { gain_db: db } }).catch((e) =>
      console.error("Failed to send set_master_db:", e)
    );
  }, [debouncedSave, sendCommand, pushToUndo]);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const action = stack[stack.length - 1];
    if (!action) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, action]);

    showToast(`Undid: ${action.description}`, "info");

    switch (action.type) {
      case "command":
        if (Array.isArray(action.undo)) {
          for (const msg of action.undo) {
            transportRef.current.sendCommand(msg).catch((e) => console.error("Undo command failed:", e));
          }
        } else {
          transportRef.current.sendCommand(action.undo).catch((e) => console.error("Undo command failed:", e));
        }
        break;
      case "vca_sub":
        setSubAssignment(action.subIndex, action.undoBus);
        break;
      case "vca_master":
        setBusMaster(action.busIndex, action.undoDb);
        break;
      case "vca_master_db":
        setMasterDb(action.undoDb);
        break;
      case "labels":
        setLabels(action.undo);
        if (serialRef.current) {
          configRef.current = { ...configRef.current, labels: action.undo };
          debouncedSave(serialRef.current, configRef.current);
        }
        break;
      case "stereo_pairs":
        if (action.isInput) {
          setInputStereoPairsState(action.undo);
          if (serialRef.current) {
            configRef.current = { ...configRef.current, input_stereo_pairs: action.undo };
            debouncedSave(serialRef.current, configRef.current);
          }
        } else {
          setStereoPairsState(action.undo);
          if (serialRef.current) {
            configRef.current = { ...configRef.current, stereo_pairs: action.undo };
            debouncedSave(serialRef.current, configRef.current);
          }
        }
        break;
      case "theme":
        setTheme(action.undo);
        break;
    }
  }, [debouncedSave, setSubAssignment, setBusMaster, setMasterDb, setTheme]);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const action = stack[stack.length - 1];
    if (!action) return;
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, action]);

    showToast(`Redone: ${action.description}`, "info");

    switch (action.type) {
      case "command":
        if (Array.isArray(action.redo)) {
          for (const msg of action.redo) {
            transportRef.current.sendCommand(msg).catch((e) => console.error("Redo command failed:", e));
          }
        } else {
          transportRef.current.sendCommand(action.redo).catch((e) => console.error("Redo command failed:", e));
        }
        break;
      case "vca_sub":
        setSubAssignment(action.subIndex, action.redoBus);
        break;
      case "vca_master":
        setBusMaster(action.busIndex, action.redoDb);
        break;
      case "vca_master_db":
        setMasterDb(action.redoDb);
        break;
      case "labels":
        setLabels(action.redo);
        if (serialRef.current) {
          configRef.current = { ...configRef.current, labels: action.redo };
          debouncedSave(serialRef.current, configRef.current);
        }
        break;
      case "stereo_pairs":
        if (action.isInput) {
          setInputStereoPairsState(action.redo);
          if (serialRef.current) {
            configRef.current = { ...configRef.current, input_stereo_pairs: action.redo };
            debouncedSave(serialRef.current, configRef.current);
          }
        } else {
          setStereoPairsState(action.redo);
          if (serialRef.current) {
            configRef.current = { ...configRef.current, stereo_pairs: action.redo };
            debouncedSave(serialRef.current, configRef.current);
          }
        }
        break;
      case "theme":
        setTheme(action.redo);
        break;
    }
  }, [debouncedSave, setSubAssignment, setBusMaster, setMasterDb, setTheme]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        (target.tagName === "INPUT" && (target as HTMLInputElement).type === "text") ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (isCmdOrCtrl && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (isCmdOrCtrl && e.key.toLowerCase() === "y") ||
        (isCmdOrCtrl && e.key.toLowerCase() === "z" && e.shiftKey)
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [undo, redo]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const undoActionDescription = canUndo ? (undoStack[undoStack.length - 1]?.description ?? null) : null;
  const redoActionDescription = canRedo ? (redoStack[redoStack.length - 1]?.description ?? null) : null;

  return (
    <DeviceContext.Provider value={{ state, loading, error, sendCommand, labels, setLabel, getLabel, stereoPairs, setStereoPairs, inputStereoPairs, setInputStereoPairs, theme, setTheme, setSubAssignment, setBusMaster, setMasterDb, undo, redo, canUndo, canRedo, undoActionDescription, redoActionDescription }}>
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
