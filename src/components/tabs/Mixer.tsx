import { useEffect, useState } from "react";
import type { DeviceState, InputState } from "../../types";
import { mockDeviceState } from "./overview/mockState";

function MeterBar({ level }: { level: number }) {
  const height = Math.max(0, Math.min(100, level * 100));
  const color = level > 0.9 ? "bg-red-500" : level > 0.7 ? "bg-amber-400" : "bg-green-500";
  return (
    <div className="w-2 h-32 bg-neutral-800 rounded-sm overflow-hidden flex flex-col-reverse">
      <div className={`${color} rounded-sm`} style={{ height: `${height}%` }} />
    </div>
  );
}

function Fader({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // value in dB, range -80 to +6
  const normalized = (value + 80) / 86; // 0..1
  return (
    <div className="flex flex-col items-center gap-1">
      <input
        type="range"
        min={0}
        max={100}
        value={normalized * 100}
        onChange={(e) => {
          const norm = Number(e.target.value) / 100;
          onChange(norm * 86 - 80);
        }}
        className="h-32 appearance-none cursor-pointer accent-neutral-400"
        style={{ writingMode: "vertical-lr" as React.CSSProperties["writingMode"], direction: "rtl" }}
      />
      <span className="text-[9px] text-neutral-500 font-mono w-10 text-center">
        {value <= -80 ? "-∞" : `${value.toFixed(0)}`}
      </span>
    </div>
  );
}

function ChannelStrip({ input, gainDb, soloed, muted, onGainChange, onSoloToggle, onMuteToggle }: {
  input: InputState;
  gainDb: number;
  soloed: boolean;
  muted: boolean;
  onGainChange: (db: number) => void;
  onSoloToggle: () => void;
  onMuteToggle: () => void;
}) {
  const level = 0.2 + Math.random() * 0.3; // Mock meter
  const label = input.type === "spdif"
    ? `S/${input.index === 0 ? "L" : "R"}`
    : input.type === "adat"
    ? `AD${input.index + 1}`
    : `${input.index + 1}`;

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
        <MeterBar level={muted ? 0 : level} />
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

function ChannelGroup({ label, inputs, gains, solos, mutes, busIndex, onGainChange, onSoloToggle, onMuteToggle }: {
  label: string;
  inputs: InputState[];
  gains: number[];
  solos: boolean[];
  mutes: boolean[];
  busIndex: number;
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
            onGainChange={(db) => onGainChange(busIndex, i, db)}
            onSoloToggle={() => onSoloToggle(busIndex, i)}
            onMuteToggle={() => onMuteToggle(busIndex, i)}
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
  const [state, setState] = useState<DeviceState | null>(null);
  const [activeBus, setActiveBus] = useState(0);
  const [busNames, setBusNames] = useState<Record<number, string>>({});
  const [busMasters, setBusMasters] = useState<Record<number, number>>({});

  useEffect(() => {
    setState(mockDeviceState());
  }, []);

  if (!state || !state.features.has_mixer) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <span>{state ? "This device has no mixer" : "Connecting..."}</span>
      </div>
    );
  }

  const busCount = state.port_counts.mix.outputs;
  const busLabel = (i: number) => String.fromCharCode(65 + i);

  const handleBusRename = (index: number, name: string) => {
    setBusNames((prev) => ({ ...prev, [index]: name }));
    // TODO: persist to local config file
  };

  const handleBusMasterChange = (db: number) => {
    setBusMasters((prev) => ({ ...prev, [activeBus]: db }));
    // TODO: apply as offset to all crosspoint gains for this bus via transport
  };

  const busMasterDb = busMasters[activeBus] ?? 0;

  const busGains = state.mixer.gains[activeBus] ?? [];
  const busSolos = state.mixer.soloed[activeBus] ?? [];
  // Mutes derived from gains (channel is "muted" if gain is -80)
  const busMutes = busGains.map((g) => g <= -80);

  const analogue = state.inputs.filter((i) => i.type === "analogue");
  const spdif = state.inputs.filter((i) => i.type === "spdif");
  const adat = state.inputs.filter((i) => i.type === "adat");

  const handleGainChange = (_bus: number, _ch: number, _db: number) => {
    // TODO: send via transport
  };
  const handleSoloToggle = (_bus: number, _ch: number) => {
    // TODO: send via transport
  };
  const handleMuteToggle = (_bus: number, _ch: number) => {
    // TODO: send via transport
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
            label={busLabel(i)}
            customName={busNames[i] ?? ""}
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
            busIndex={activeBus}
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
                busIndex={activeBus}
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
                busIndex={activeBus}
                onGainChange={handleGainChange}
                onSoloToggle={handleSoloToggle}
                onMuteToggle={handleMuteToggle}
              />
            </>
          )}

          {/* Bus master fader */}
          <div className="w-px bg-neutral-600 self-stretch" />
          <div className="flex flex-col items-center gap-1.5 px-3 py-2 bg-neutral-800/50 rounded-lg min-w-[60px]">
            <span className="text-[10px] text-neutral-300 font-bold">
              {busLabel(activeBus)}
            </span>
            {busNames[activeBus] && (
              <span className="text-[8px] text-neutral-500 truncate max-w-[56px]">
                {busNames[activeBus]}
              </span>
            )}

            <div className="flex gap-1 items-end">
              {/* Bus master meter (average of all active channels) */}
              <div className="w-3 h-32 bg-neutral-800 rounded-sm overflow-hidden flex flex-col-reverse">
                <div
                  className="bg-amber-500 rounded-sm"
                  style={{
                    height: `${Math.max(0, Math.min(100, ((busMasterDb + 80) / 86) * 100))}%`,
                  }}
                />
              </div>

              {/* Bus master fader */}
              <div className="flex flex-col items-center gap-1">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={((busMasterDb + 80) / 86) * 100}
                  onChange={(e) => {
                    const norm = Number(e.target.value) / 100;
                    handleBusMasterChange(norm * 86 - 80);
                  }}
                  className="h-32 appearance-none cursor-pointer accent-amber-500"
                  style={{ writingMode: "vertical-lr" as React.CSSProperties["writingMode"], direction: "rtl" }}
                />
                <span className="text-[9px] text-neutral-400 font-mono w-10 text-center">
                  {busMasterDb <= -80 ? "-∞" : `${busMasterDb >= 0 ? "+" : ""}${busMasterDb.toFixed(0)}`}
                </span>
              </div>
            </div>

            <span className="text-[9px] text-amber-500 font-bold uppercase">Master</span>
          </div>
        </div>
      </div>
    </div>
  );
}
