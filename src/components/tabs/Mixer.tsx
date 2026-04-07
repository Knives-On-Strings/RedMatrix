import { useState } from "react";
import type { InputState } from "../../types";
import { useDevice } from "../../hooks/useDevice";
import { dbToNormalized, normalizedToDb, formatDb, busLabel as busLabelFn } from "../../constants";
import { useMockMeters } from "../../hooks/useMockMeters";
import MeterBar from "../MeterBar";

function Fader({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // value in dB, range -80 to +6
  const normalized = dbToNormalized(value);
  return (
    <div className="flex flex-col items-center gap-1">
      <input
        type="range"
        min={0}
        max={100}
        value={normalized * 100}
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
  onGainChange: (db: number) => void;
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
        <Fader value={gainDb} onChange={onGainChange} />
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
  onGainChange: (bus: number, ch: number, db: number) => void;
  onSoloToggle: (bus: number, ch: number) => void;
  onMuteToggle: (bus: number, ch: number) => void;
}) {
  if (inputs.length === 0) return null;

  return (
    <div>
      <div className="flex gap-0.5">
        {inputs.map((input, i) => (
          <ChannelStrip
            key={`${input.type}-${input.index}`}
            input={input}
            gainDb={gains[i] ?? -80}
            soloed={solos[i] ?? false}
            muted={mutes[i] ?? false}
            level={levels[i] ?? 0}
            onGainChange={(db) => onGainChange(busIndex, indexOffset + i, db)}
            onSoloToggle={() => onSoloToggle(busIndex, indexOffset + i)}
            onMuteToggle={() => onMuteToggle(busIndex, indexOffset + i)}
          />
        ))}
      </div>
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
  const { state, loading, sendCommand, getLabel, setLabel } = useDevice();
  const [activeBus, setActiveBus] = useState(0);
  const [busMasters, setBusMasters] = useState<Record<number, number>>({});
  const [subAssignments, setSubAssignments] = useState<[number, number, number, number]>([0, 1, 2, 3]);
  const [masterDb, setMasterDb] = useState(0);

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

  const handleBusRename = (index: number, name: string) => {
    setLabel("buses", String(index), name);
  };

  const handleBusMasterChange = (busIndex: number, db: number) => {
    setBusMasters((prev) => ({ ...prev, [busIndex]: db }));
    // TODO: Bus master is a UI-only dB offset for now. Proper implementation
    // requires the backend state manager to apply the offset to all active
    // crosspoint gains in the bus before sending individual SET_MIX commands.
  };

  const handleSubAssignment = (subIndex: number, busIndex: number) => {
    setSubAssignments((prev) => {
      const next = [...prev] as [number, number, number, number];
      next[subIndex] = busIndex;
      return next;
    });
  };

  const handleMasterChange = (db: number) => {
    setMasterDb(db);
    // TODO: Master fader is a UI-only global dB offset for now. Proper
    // implementation requires backend support to apply a global offset
    // across all bus masters before sending per-channel SET_MIX commands.
  };

  const busGains = state.mixer.gains[activeBus] ?? [];
  const busSolos = state.mixer.soloed[activeBus] ?? [];
  // Mutes derived from gains (channel is "muted" if gain is -80)
  const busMutes = busGains.map((g) => g <= -80);

  const analogue = state.inputs.filter((i) => i.type === "analogue");
  const spdif = state.inputs.filter((i) => i.type === "spdif");
  const adat = state.inputs.filter((i) => i.type === "adat");
  const totalChannels = analogue.length + spdif.length + adat.length;
  const meterLevels = useMockMeters(totalChannels);

  const handleGainChange = (bus: number, ch: number, db: number) => {
    sendCommand({ type: "set_mix_gain", payload: { mix: bus, channel: ch, gain_db: db } });
  };
  const handleSoloToggle = (bus: number, ch: number) => {
    const currentSoloed = state.mixer.soloed[bus]?.[ch] ?? false;
    sendCommand({ type: "set_mix_solo", payload: { mix: bus, channel: ch, soloed: !currentSoloed } });
  };
  const handleMuteToggle = (bus: number, ch: number) => {
    const currentMuted = busGains[ch] !== undefined && busGains[ch]! <= -80;
    sendCommand({
      type: "set_mix_gain",
      payload: { mix: bus, channel: ch, gain_db: currentMuted ? 0 : -80 },
    });
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
                gains={busGains.slice(analogue.length, analogue.length + spdif.length)}
                solos={busSolos.slice(analogue.length, analogue.length + spdif.length)}
                mutes={busMutes.slice(analogue.length, analogue.length + spdif.length)}
                levels={Array.from(meterLevels.slice(analogue.length, analogue.length + spdif.length))}
                busIndex={activeBus}
                indexOffset={analogue.length}
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
                gains={busGains.slice(analogue.length + spdif.length)}
                solos={busSolos.slice(analogue.length + spdif.length)}
                mutes={busMutes.slice(analogue.length + spdif.length)}
                levels={Array.from(meterLevels.slice(analogue.length + spdif.length))}
                busIndex={activeBus}
                indexOffset={analogue.length + spdif.length}
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
          </div>
        </div>
      </div>
    </div>
  );
}
