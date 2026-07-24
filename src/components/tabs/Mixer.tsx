import { useState } from "react";
import type { InputState, ClientMessage } from "../../types";
import { useDevice } from "../../hooks/useDevice";
import { useSmoothedMeters } from "../../hooks/useMeterStore";
import { dbToNormalized, normalizedToDb, formatDb, busLabel as busLabelFn } from "../../constants";
import MeterBar from "../MeterBar";

function Fader({ value, onChange, onCommit }: { value: number; onChange: (v: number) => void; onCommit?: (startVal: number, endVal: number) => void }) {
  // value in dB, range -80 to +6
  const normalized = dbToNormalized(value);
  const [initialValue, setInitialValue] = useState<number | null>(null);

  const handleStart = () => {
    setInitialValue(value);
  };

  const handleEnd = () => {
    if (initialValue !== null && onCommit && initialValue !== value) {
      onCommit(initialValue, value);
    }
    setInitialValue(null);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        type="range"
        min={0}
        max={100}
        value={normalized * 100}
        onFocus={handleStart}
        onMouseDown={handleStart}
        onTouchStart={handleStart}
        onBlur={handleEnd}
        onMouseUp={handleEnd}
        onTouchEnd={handleEnd}
        onChange={(e) => {
          const norm = Number(e.target.value) / 100;
          onChange(normalizedToDb(norm));
        }}
        className="h-32 appearance-none cursor-pointer accent-neutral-400"
        style={{ writingMode: "vertical-lr" as React.CSSProperties["writingMode"], direction: "rtl" }}
      />
      <span className="text-[9px] text-neutral-500 font-mono w-10 text-center">
        {formatDb(value)}
      </span>
    </div>
  );
}

function ChannelStrip({ input, gainDb, soloed, muted, onGainChange, onSoloToggle, onMuteToggle, level }: {
  input: InputState;
  gainDb: number;
  soloed: boolean;
  muted: boolean;
  onGainChange: (db: number, startDb?: number) => void;
  onSoloToggle: () => void;
  onMuteToggle: () => void;
  level: number;
}) {
  const { getLabel } = useDevice();
  const defaultLabel = input.type === "spdif"
    ? `S/${input.index === 0 ? "L" : "R"}`
    : input.type === "adat"
    ? `AD${input.index + 1}`
    : `${input.index + 1}`;
  const label = getLabel("inputs", `${input.type}_${input.index}`, defaultLabel);

  return (
    <div className={`flex flex-col items-center gap-1.5 px-1 py-2 rounded ${soloed ? "bg-amber-900/20" : ""}`}>
      <span className="text-[10px] text-neutral-400 font-mono">{label}</span>

      {/* Input feature badges */}
      <div className="flex gap-0.5 h-3">
        {input.type === "analogue" && input.index < 2 && (
          <span className={`text-[7px] px-0.5 rounded ${input.inst ? "bg-amber-600 text-white" : "text-neutral-600"}`}>
            INST
          </span>
        )}
        {input.type === "analogue" && (
          <>
            {input.pad && <span className="text-[7px] px-0.5 rounded bg-blue-600 text-white">PAD</span>}
            {input.air && <span className="text-[7px] px-0.5 rounded bg-sky-500 text-white">AIR</span>}
          </>
        )}
      </div>

      <div className="flex gap-1 items-end">
        <MeterBar level={muted ? 0 : level} width="w-2" height="h-32" />
        <Fader value={gainDb} onChange={onGainChange} onCommit={(start, end) => onGainChange(end, start)} />
      </div>

      <div className="flex gap-1">
        <button
          onClick={onSoloToggle}
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
            soloed ? "bg-amber-500 text-black" : "bg-neutral-700 text-neutral-500 hover:bg-neutral-600"
          }`}
        >
          S
        </button>
        <button
          onClick={onMuteToggle}
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
            muted ? "bg-red-600 text-white" : "bg-neutral-700 text-neutral-500 hover:bg-neutral-600"
          }`}
        >
          M
        </button>
      </div>
    </div>
  );
}

function StereoChannelStrip({
  inputLeft,
  inputRight,
  gainDbLeft,
  soloedLeft,
  soloedRight,
  mutedLeft,
  mutedRight,
  levelLeft,
  levelRight,
  onGainChange,
  onSoloToggle,
  onMuteToggle,
}: {
  inputLeft: InputState;
  inputRight: InputState;
  gainDbLeft: number;
  soloedLeft: boolean;
  soloedRight: boolean;
  mutedLeft: boolean;
  mutedRight: boolean;
  levelLeft: number;
  levelRight: number;
  onGainChange: (db: number, startDb?: number) => void;
  onSoloToggle: () => void;
  onMuteToggle: () => void;
}) {
  const { getLabel } = useDevice();
  const defaultLabelLeft = inputLeft.type === "spdif"
    ? `S/${inputLeft.index === 0 ? "L" : "R"}`
    : inputLeft.type === "adat"
    ? `AD${inputLeft.index + 1}`
    : `${inputLeft.index + 1}`;
  const defaultLabelRight = inputRight.type === "spdif"
    ? `S/${inputRight.index === 0 ? "L" : "R"}`
    : inputRight.type === "adat"
    ? `AD${inputRight.index + 1}`
    : `${inputRight.index + 1}`;

  const labelLeft = getLabel("inputs", `${inputLeft.type}_${inputLeft.index}`, defaultLabelLeft);
  const labelRight = getLabel("inputs", `${inputRight.type}_${inputRight.index}`, defaultLabelRight);
  const label = `${labelLeft} + ${labelRight}`;

  const soloed = soloedLeft || soloedRight;
  const muted = mutedLeft || mutedRight;

  return (
    <div className={`flex flex-col items-center gap-1.5 px-2 py-2 rounded ${soloed ? "bg-amber-900/20" : ""}`}>
      <span className="text-[10px] text-neutral-400 font-mono w-24 text-center truncate">{label}</span>

      {/* Input feature badges */}
      <div className="flex gap-0.5 h-3">
        {inputLeft.type === "analogue" && (
          <>
            {(inputLeft.inst || inputRight.inst) && <span className="text-[7px] px-0.5 rounded bg-amber-600 text-white">INST</span>}
            {(inputLeft.pad || inputRight.pad) && <span className="text-[7px] px-0.5 rounded bg-blue-600 text-white">PAD</span>}
            {(inputLeft.air || inputRight.air) && <span className="text-[7px] px-0.5 rounded bg-sky-500 text-white">AIR</span>}
          </>
        )}
      </div>

      <div className="flex gap-1 items-end">
        <div className="flex gap-0.5">
          <MeterBar level={muted ? 0 : levelLeft} width="w-1.5" height="h-32" />
          <MeterBar level={muted ? 0 : levelRight} width="w-1.5" height="h-32" />
        </div>
        <Fader value={gainDbLeft} onChange={onGainChange} onCommit={(start, end) => onGainChange(end, start)} />
      </div>

      <div className="flex gap-1">
        <button
          onClick={onSoloToggle}
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
            soloed ? "bg-amber-500 text-black" : "bg-neutral-700 text-neutral-500 hover:bg-neutral-600"
          }`}
        >
          S
        </button>
        <button
          onClick={onMuteToggle}
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
            muted ? "bg-red-600 text-white" : "bg-neutral-700 text-neutral-500 hover:bg-neutral-600"
          }`}
        >
          M
        </button>
      </div>
    </div>
  );
}

function ChannelGroup({ label, inputs, gains, solos, mutes, levels, busIndex, indexOffset, onGainChange, onSoloToggle, onMuteToggle }: {
  label: string;
  inputs: InputState[];
  gains: number[];
  solos: boolean[];
  mutes: boolean[];
  levels: number[];
  busIndex: number;
  indexOffset: number;
  onGainChange: (bus: number, ch: number | [number, number], db: number, startDb?: number) => void;
  onSoloToggle: (bus: number, ch: number | [number, number]) => void;
  onMuteToggle: (bus: number, ch: number | [number, number]) => void;
}) {
  const { inputStereoPairs } = useDevice();
  if (inputs.length === 0) return null;

  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < inputs.length) {
    const current = inputs[i];
    if (!current) {
      i += 1;
      continue;
    }
    const next = inputs[i + 1];

    // Check if current and next are linked
    const linkedPair = next
      ? inputStereoPairs.find(
          (p) => p.linked && p.input_type === current.type && p.left === current.index && p.right === next.index
        )
      : null;

    if (linkedPair && next) {
      const idxLeft = i;
      const idxRight = i + 1;

      elements.push(
        <StereoChannelStrip
          key={`stereo-${current.type}-${current.index}-${next.index}`}
          inputLeft={current}
          inputRight={next}
          gainDbLeft={gains[idxLeft] ?? -80}
          soloedLeft={solos[idxLeft] ?? false}
          soloedRight={solos[idxRight] ?? false}
          mutedLeft={mutes[idxLeft] ?? false}
          mutedRight={mutes[idxRight] ?? false}
          levelLeft={levels[idxLeft] ?? 0}
          levelRight={levels[idxRight] ?? 0}
          onGainChange={(db, startDb) => {
            onGainChange(busIndex, [indexOffset + idxLeft, indexOffset + idxRight], db, startDb);
          }}
          onSoloToggle={() => {
            onSoloToggle(busIndex, [indexOffset + idxLeft, indexOffset + idxRight]);
          }}
          onMuteToggle={() => {
            onMuteToggle(busIndex, [indexOffset + idxLeft, indexOffset + idxRight]);
          }}
        />
      );
      i += 2;
    } else {
      const idx = i;
      elements.push(
        <ChannelStrip
          key={`${current.type}-${current.index}`}
          input={current}
          gainDb={gains[idx] ?? -80}
          soloed={solos[idx] ?? false}
          muted={mutes[idx] ?? false}
          level={levels[idx] ?? 0}
          onGainChange={(db, startDb) => onGainChange(busIndex, indexOffset + idx, db, startDb)}
          onSoloToggle={() => onSoloToggle(busIndex, indexOffset + idx)}
          onMuteToggle={() => onMuteToggle(busIndex, indexOffset + idx)}
        />
      );
      i += 1;
    }
  }

  return (
    <div>
      <div className="flex gap-0.5">{elements}</div>
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider text-center mt-1">{label}</div>
    </div>
  );
}

function BusButton({ isActive, label, customName, onClick, onRename }: {
  isActive: boolean;
  label: string;
  customName: string;
  onClick: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(customName);

  const handleDoubleClick = () => {
    setEditValue(customName);
    setEditing(true);
  };

  const handleBlur = () => {
    setEditing(false);
    onRename(editValue.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setEditing(false);
      onRename(editValue.trim());
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        className="w-20 h-7 text-[10px] bg-neutral-800 border border-neutral-500 rounded px-1 text-neutral-200 focus:outline-none"
        placeholder={label}
      />
    );
  }

  return (
    <button
      onClick={onClick}
      onDoubleClick={handleDoubleClick}
      title={customName ? `${label}: ${customName} (double-click to rename)` : `${label} (double-click to name)`}
      className={`h-7 px-2 text-xs font-bold rounded flex items-center gap-1 ${
        isActive
          ? "bg-red-500 text-white"
          : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
      }`}
    >
      <span>{label}</span>
      {customName && (
        <span className={`text-[9px] font-normal ${isActive ? "text-red-100" : "text-neutral-500"}`}>
          {customName}
        </span>
      )}
    </button>
  );
}

export default function Mixer() {
  const { state, loading, sendCommand, getLabel, setLabel, setSubAssignment, setBusMaster, setMasterDb } = useDevice();
  const meters = useSmoothedMeters();
  const [activeBus, setActiveBus] = useState(0);
  const [dragStartGains, setDragStartGains] = useState<Record<string, number>>({});

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <span>Connecting...</span>
      </div>
    );
  }

  if (!state.features.has_mixer) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <span>This device has no mixer</span>
      </div>
    );
  }

  const busCount = state.port_counts.mix.outputs;
  const subAssignments = state.sub_assignments ?? [0, 1, 2, 3];
  const busMasters = state.bus_masters ?? Array(12).fill(0);
  const masterDb = state.master_db ?? 0;

  const handleBusRename = (index: number, name: string) => {
    const prevName = getLabel("buses", String(index), "");
    setLabel("buses", String(index), name, {
      description: `Rename Bus ${busLabelFn(index)}${prevName ? ` ("${prevName}")` : ""} to "${name}"`
    });
  };

  const handleBusMasterChange = (busIndex: number, db: number, startDb?: number) => {
    const options = startDb !== undefined ? {
      undoDb: startDb,
      description: `Adjust VCA Bus ${busLabelFn(busIndex)}${getLabel("buses", String(busIndex), "") ? ` ("${getLabel("buses", String(busIndex), "")}")` : ""} fader`
    } : undefined;
    setBusMaster(busIndex, db, options);
  };

  const handleSubAssignment = (subIndex: number, busIndex: number) => {
    const oldAssignments = state.sub_assignments ?? [0, 1, 2, 3];
    const prevBus = oldAssignments[subIndex];
    setSubAssignment(subIndex, busIndex, {
      undoBus: prevBus,
      description: `Assign VCA Master ${subIndex + 1} to Bus ${busLabelFn(busIndex)}`
    });
  };

  const handleMasterChange = (db: number, startDb?: number) => {
    const options = startDb !== undefined ? {
      undoDb: startDb,
      description: "Adjust Master volume"
    } : undefined;
    setMasterDb(db, options);
  };

  const busGains = state.mixer.gains[activeBus] ?? [];
  const busSolos = state.mixer.soloed[activeBus] ?? [];
  const busMutes = busGains.map((g) => g <= -80);

  const hasTalkback = state.features.has_talkback;
  const allAnalogue = state.inputs.filter((i) => i.type === "analogue");
  const analogue = hasTalkback ? allAnalogue.slice(0, -1) : allAnalogue;
  const talkback = hasTalkback ? allAnalogue.slice(-1) : [];
  const spdif = state.inputs.filter((i) => i.type === "spdif");
  const adat = state.inputs.filter((i) => i.type === "adat");
  const meterLevels = meters;

  const handleGainChange = (bus: number, ch: number | [number, number], db: number, startDb?: number) => {
    if (Array.isArray(ch)) {
      const [chL, chR] = ch;
      const inputL = state.inputs[chL];
      const inputR = state.inputs[chR];
      const labelL = inputL ? getLabel("inputs", `${inputL.type}_${inputL.index}`, `${chL + 1}`) : `${chL + 1}`;
      const labelR = inputR ? getLabel("inputs", `${inputR.type}_${inputR.index}`, `${chR + 1}`) : `${chR + 1}`;
      const channelLabel = `${labelL} + ${labelR}`;

      const redoMsgs: ClientMessage[] = [
        { type: "set_mix_gain" as const, payload: { mix: bus, channel: chL, gain_db: db } },
        { type: "set_mix_gain" as const, payload: { mix: bus, channel: chR, gain_db: db } },
      ];
      const undoMsgs: ClientMessage[] = startDb !== undefined ? [
        { type: "set_mix_gain" as const, payload: { mix: bus, channel: chL, gain_db: startDb } },
        { type: "set_mix_gain" as const, payload: { mix: bus, channel: chR, gain_db: startDb } },
      ] : [];

      const options = startDb !== undefined ? {
        undo: undoMsgs,
        description: `Adjust fader on ${channelLabel} (Mix ${busLabelFn(bus)})`
      } : undefined;

      sendCommand(redoMsgs, options);
    } else {
      const input = state.inputs[ch];
      const defaultLabel = input ? (input.type === "spdif" ? `S/PDIF ${input.index === 0 ? "L" : "R"}` : `${input.type === "adat" ? "ADAT " : ""}${input.index + 1}`) : `Ch ${ch + 1}`;
      const channelLabel = input ? getLabel("inputs", `${input.type}_${input.index}`, defaultLabel) : `Ch ${ch + 1}`;
      const options = startDb !== undefined ? {
        undo: { type: "set_mix_gain" as const, payload: { mix: bus, channel: ch, gain_db: startDb } },
        description: `Adjust fader on ${channelLabel} (Mix ${busLabelFn(bus)})`
      } : undefined;
      sendCommand({ type: "set_mix_gain" as const, payload: { mix: bus, channel: ch, gain_db: db } }, options);
    }
  };

  const handleSoloToggle = (bus: number, ch: number | [number, number]) => {
    if (Array.isArray(ch)) {
      const [chL, chR] = ch;
      const currentSoloedL = state.mixer.soloed[bus]?.[chL] ?? false;
      const currentSoloedR = state.mixer.soloed[bus]?.[chR] ?? false;
      const targetSoloed = !(currentSoloedL || currentSoloedR);

      const inputL = state.inputs[chL];
      const inputR = state.inputs[chR];
      const labelL = inputL ? getLabel("inputs", `${inputL.type}_${inputL.index}`, `${chL + 1}`) : `${chL + 1}`;
      const labelR = inputR ? getLabel("inputs", `${inputR.type}_${inputR.index}`, `${chR + 1}`) : `${chR + 1}`;
      const channelLabel = `${labelL} + ${labelR}`;

      const redoMsgs: ClientMessage[] = [];
      const undoMsgs: ClientMessage[] = [];

      if (currentSoloedL !== targetSoloed) {
        redoMsgs.push({ type: "set_mix_solo" as const, payload: { mix: bus, channel: chL, soloed: targetSoloed } });
        undoMsgs.push({ type: "set_mix_solo" as const, payload: { mix: bus, channel: chL, soloed: currentSoloedL } });
      }
      if (currentSoloedR !== targetSoloed) {
        redoMsgs.push({ type: "set_mix_solo" as const, payload: { mix: bus, channel: chR, soloed: targetSoloed } });
        undoMsgs.push({ type: "set_mix_solo" as const, payload: { mix: bus, channel: chR, soloed: currentSoloedR } });
      }

      if (redoMsgs.length > 0) {
        sendCommand(redoMsgs, {
          undo: undoMsgs,
          description: `${targetSoloed ? "Solo" : "Unsolo"} ${channelLabel} (Mix ${busLabelFn(bus)})`
        });
      }
    } else {
      const currentSoloed = state.mixer.soloed[bus]?.[ch] ?? false;
      const input = state.inputs[ch];
      const defaultLabel = input ? (input.type === "spdif" ? `S/PDIF ${input.index === 0 ? "L" : "R"}` : `${input.type === "adat" ? "ADAT " : ""}${input.index + 1}`) : `Ch ${ch + 1}`;
      const channelLabel = input ? getLabel("inputs", `${input.type}_${input.index}`, defaultLabel) : `Ch ${ch + 1}`;
      sendCommand(
        { type: "set_mix_solo" as const, payload: { mix: bus, channel: ch, soloed: !currentSoloed } },
        {
          undo: { type: "set_mix_solo" as const, payload: { mix: bus, channel: ch, soloed: currentSoloed } },
          description: `${currentSoloed ? "Unsolo" : "Solo"} ${channelLabel} (Mix ${busLabelFn(bus)})`
        }
      );
    }
  };

  const handleMuteToggle = (bus: number, ch: number | [number, number]) => {
    if (Array.isArray(ch)) {
      const [chL, chR] = ch;
      const busGains = state.mixer.gains[bus] ?? [];
      const currentMutedL = busGains[chL] !== undefined && busGains[chL]! <= -80;
      const currentMutedR = busGains[chR] !== undefined && busGains[chR]! <= -80;
      const targetMuted = !(currentMutedL || currentMutedR);

      const inputL = state.inputs[chL];
      const inputR = state.inputs[chR];
      const labelL = inputL ? getLabel("inputs", `${inputL.type}_${inputL.index}`, `${chL + 1}`) : `${chL + 1}`;
      const labelR = inputR ? getLabel("inputs", `${inputR.type}_${inputR.index}`, `${chR + 1}`) : `${chR + 1}`;
      const channelLabel = `${labelL} + ${labelR}`;

      const redoMsgs: ClientMessage[] = [];
      const undoMsgs: ClientMessage[] = [];

      if (currentMutedL !== targetMuted) {
        redoMsgs.push({ type: "set_mix_gain" as const, payload: { mix: bus, channel: chL, gain_db: targetMuted ? -80 : 0 } });
        undoMsgs.push({ type: "set_mix_gain" as const, payload: { mix: bus, channel: chL, gain_db: currentMutedL ? -80 : 0 } });
      }
      if (currentMutedR !== targetMuted) {
        redoMsgs.push({ type: "set_mix_gain" as const, payload: { mix: bus, channel: chR, gain_db: targetMuted ? -80 : 0 } });
        undoMsgs.push({ type: "set_mix_gain" as const, payload: { mix: bus, channel: chR, gain_db: currentMutedR ? -80 : 0 } });
      }

      if (redoMsgs.length > 0) {
        sendCommand(redoMsgs, {
          undo: undoMsgs,
          description: `${targetMuted ? "Mute" : "Unmute"} ${channelLabel} (Mix ${busLabelFn(bus)})`
        });
      }
    } else {
      const currentMuted = busGains[ch] !== undefined && busGains[ch]! <= -80;
      const input = state.inputs[ch];
      const defaultLabel = input ? (input.type === "spdif" ? `S/PDIF ${input.index === 0 ? "L" : "R"}` : `${input.type === "adat" ? "ADAT " : ""}${input.index + 1}`) : `Ch ${ch + 1}`;
      const channelLabel = input ? getLabel("inputs", `${input.type}_${input.index}`, defaultLabel) : `Ch ${ch + 1}`;
      sendCommand(
        { type: "set_mix_gain" as const, payload: { mix: bus, channel: ch, gain_db: currentMuted ? 0 : -80 } },
        {
          undo: { type: "set_mix_gain" as const, payload: { mix: bus, channel: ch, gain_db: currentMuted ? -80 : 0 } },
          description: `${currentMuted ? "Unmute" : "Mute"} ${channelLabel} (Mix ${busLabelFn(bus)})`
        }
      );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Bus selector */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-neutral-700 overflow-x-auto">
        <span className="text-xs text-neutral-500 mr-2 flex-shrink-0">Mix Bus:</span>
        {Array.from({ length: Math.min(busCount, 12) }, (_, i) => (
          <BusButton
            key={i}
            isActive={activeBus === i}
            label={busLabelFn(i)}
            customName={getLabel("buses", String(i), "")}
            onClick={() => setActiveBus(i)}
            onRename={(name) => handleBusRename(i, name)}
          />
        ))}
        <span className="text-[9px] text-neutral-600 ml-2 flex-shrink-0">double-click to name</span>

        {/* Clear Solo — visible when any channel is soloed */}
        {state.mixer.soloed.some((bus) => bus.some((s) => s)) && (
          <button
            onClick={() => {
              const undoMsgs: ClientMessage[] = [];
              state.mixer.soloed.forEach((bus, busIdx) => {
                bus.forEach((isSoloed, chIdx) => {
                  if (isSoloed) {
                    undoMsgs.push({
                      type: "set_mix_solo" as const,
                      payload: { mix: busIdx, channel: chIdx, soloed: true }
                    });
                  }
                });
              });
              sendCommand(
                { type: "clear_solo", payload: {} },
                { undo: undoMsgs, description: "Clear all solo channels" }
              );
            }}
            className="ml-2 text-[9px] font-bold px-2 py-1 rounded bg-amber-600 text-black hover:bg-amber-500 flex-shrink-0"
          >
            CLEAR SOLO
          </button>
        )}
      </div>

      {/* Channel strips + bus master */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 p-4 min-w-max">
          <ChannelGroup
            label="Analogue"
            inputs={analogue}
            gains={busGains.slice(0, analogue.length)}
            solos={busSolos.slice(0, analogue.length)}
            mutes={busMutes.slice(0, analogue.length)}
            levels={Array.from(meterLevels.slice(0, analogue.length))}
            busIndex={activeBus}
            indexOffset={0}
            onGainChange={handleGainChange}
            onSoloToggle={handleSoloToggle}
            onMuteToggle={handleMuteToggle}
          />
          {spdif.length > 0 && (
            <>
              <div className="w-px bg-neutral-700/50 self-stretch" />
              <ChannelGroup
                label="S/PDIF"
                inputs={spdif}
                gains={busGains.slice(analogue.length + talkback.length, analogue.length + talkback.length + spdif.length)}
                solos={busSolos.slice(analogue.length + talkback.length, analogue.length + talkback.length + spdif.length)}
                mutes={busMutes.slice(analogue.length + talkback.length, analogue.length + talkback.length + spdif.length)}
                levels={Array.from(meterLevels.slice(analogue.length + talkback.length, analogue.length + talkback.length + spdif.length))}
                busIndex={activeBus}
                indexOffset={analogue.length + talkback.length}
                onGainChange={handleGainChange}
                onSoloToggle={handleSoloToggle}
                onMuteToggle={handleMuteToggle}
              />
            </>
          )}
          {adat.length > 0 && (
            <>
              <div className="w-px bg-neutral-700/50 self-stretch" />
              <ChannelGroup
                label="ADAT"
                inputs={adat}
                gains={busGains.slice(analogue.length + talkback.length + spdif.length)}
                solos={busSolos.slice(analogue.length + talkback.length + spdif.length)}
                mutes={busMutes.slice(analogue.length + talkback.length + spdif.length)}
                levels={Array.from(meterLevels.slice(analogue.length + talkback.length + spdif.length))}
                busIndex={activeBus}
                indexOffset={analogue.length + talkback.length + spdif.length}
                onGainChange={handleGainChange}
                onSoloToggle={handleSoloToggle}
                onMuteToggle={handleMuteToggle}
              />
            </>
          )}
          {talkback.length > 0 && (
            <>
              <div className="w-px bg-neutral-700/50 self-stretch" />
              <ChannelGroup
                label="Talkback"
                inputs={talkback}
                gains={busGains.slice(analogue.length, analogue.length + talkback.length)}
                solos={busSolos.slice(analogue.length, analogue.length + talkback.length)}
                mutes={busMutes.slice(analogue.length, analogue.length + talkback.length)}
                levels={Array.from(meterLevels.slice(analogue.length, analogue.length + talkback.length))}
                busIndex={activeBus}
                indexOffset={analogue.length}
                onGainChange={handleGainChange}
                onSoloToggle={handleSoloToggle}
                onMuteToggle={handleMuteToggle}
              />
            </>
          )}

          {/* Sub faders + Master */}
          <div className="w-px bg-neutral-600 self-stretch" />
          <div className="flex gap-2">
            {/* 4 assignable sub faders */}
            {subAssignments.map((assignedBus, subIdx) => {
              const subDb = busMasters[assignedBus] ?? 0;
              const handleStart = () => {
                setDragStartGains((prev) => ({ ...prev, ["sub_" + assignedBus]: subDb }));
              };
              const handleEnd = () => {
                const startDb = dragStartGains["sub_" + assignedBus];
                if (startDb !== undefined && startDb !== subDb) {
                  handleBusMasterChange(assignedBus, subDb, startDb);
                }
                setDragStartGains((prev) => {
                  const next = { ...prev };
                  delete next["sub_" + assignedBus];
                  return next;
                });
              };

              return (
                <div key={subIdx} className="flex flex-col items-center gap-1 px-2 py-2 bg-neutral-800/50 rounded-lg min-w-[56px]">
                  {/* Bus assignment dropdown */}
                  <select
                    value={assignedBus}
                    onChange={(e) => handleSubAssignment(subIdx, Number(e.target.value))}
                    className="w-full text-[9px] bg-neutral-700 border border-neutral-600 rounded px-1 py-0.5 text-neutral-300"
                  >
                    {Array.from({ length: Math.min(busCount, 12) }, (_, i) => {
                      const name = getLabel("buses", String(i), "");
                      return (
                        <option key={i} value={i}>
                          {busLabelFn(i)}{name ? ` ${name}` : ""}
                        </option>
                      );
                    })}
                  </select>

                  <div className="flex gap-1 items-end">
                    <div className="w-2 h-32 bg-neutral-800 rounded-sm overflow-hidden flex flex-col-reverse">
                      <div
                        className="bg-amber-500 rounded-sm"
                        style={{ height: `${Math.max(0, Math.min(100, dbToNormalized(subDb) * 100))}%` }}
                      />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={dbToNormalized(subDb) * 100}
                        onFocus={handleStart}
                        onMouseDown={handleStart}
                        onTouchStart={handleStart}
                        onBlur={handleEnd}
                        onMouseUp={handleEnd}
                        onTouchEnd={handleEnd}
                        onChange={(e) => {
                          const norm = Number(e.target.value) / 100;
                          handleBusMasterChange(assignedBus, normalizedToDb(norm));
                        }}
                        className="h-32 appearance-none cursor-pointer accent-amber-500"
                        style={{ writingMode: "vertical-lr" as React.CSSProperties["writingMode"], direction: "rtl" }}
                      />
                      <span className="text-[8px] text-neutral-400 font-mono w-10 text-center">
                        {formatDb(subDb)}
                      </span>
                    </div>
                  </div>

                  <span className="text-[8px] text-amber-500 font-bold">SUB {subIdx + 1}</span>
                </div>
              );
            })}

            {/* Master fader */}
            {(() => {
              const handleMasterStart = () => {
                setDragStartGains((prev) => ({ ...prev, master: masterDb }));
              };
              const handleMasterEnd = () => {
                const startDb = dragStartGains.master;
                if (startDb !== undefined && startDb !== masterDb) {
                  handleMasterChange(masterDb, startDb);
                }
                setDragStartGains((prev) => {
                  const next = { ...prev };
                  delete next.master;
                  return next;
                });
              };

              return (
                <div className="flex flex-col items-center gap-1 px-2 py-2 bg-neutral-700/50 rounded-lg min-w-[56px] border border-neutral-600">
                  <span className="text-[10px] text-red-400 font-bold">MAIN</span>

                  <div className="flex gap-1 items-end">
                    <div className="w-2 h-32 bg-neutral-800 rounded-sm overflow-hidden flex flex-col-reverse">
                      <div
                        className="bg-red-500 rounded-sm"
                        style={{ height: `${Math.max(0, Math.min(100, dbToNormalized(masterDb) * 100))}%` }}
                      />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={dbToNormalized(masterDb) * 100}
                        onFocus={handleMasterStart}
                        onMouseDown={handleMasterStart}
                        onTouchStart={handleMasterStart}
                        onBlur={handleMasterEnd}
                        onMouseUp={handleMasterEnd}
                        onTouchEnd={handleMasterEnd}
                        onChange={(e) => {
                          const norm = Number(e.target.value) / 100;
                          handleMasterChange(normalizedToDb(norm));
                        }}
                        className="h-32 appearance-none cursor-pointer accent-red-500"
                        style={{ writingMode: "vertical-lr" as React.CSSProperties["writingMode"], direction: "rtl" }}
                      />
                      <span className="text-[8px] text-neutral-400 font-mono w-10 text-center">
                        {formatDb(masterDb)}
                      </span>
                    </div>
                  </div>

                  <span className="text-[8px] text-red-400 font-bold">MASTER</span>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
