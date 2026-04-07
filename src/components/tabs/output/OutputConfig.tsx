import { useState } from "react";
import type { DeviceState, OutputState } from "../../../types";
import { useDevice } from "../../../hooks/useDevice";

interface OutputConfigProps {
  state: DeviceState;
}

interface PairState {
  left: number;
  right: number;
  linked: boolean;
  name: string;
}

function getDefaultPairs(outputs: OutputState[]): PairState[] {
  const pairs: PairState[] = [];
  for (let i = 0; i < outputs.length - 1; i += 2) {
    const left = outputs[i]!;
    const right = outputs[i + 1]!;
    // Derive a default pair name from the output names
    const baseName = left.name
      .replace(/ L$/, "")
      .replace(/ R$/, "")
      .replace(/\s+\d+$/, (m) => m); // keep trailing number
    pairs.push({
      left: left.index,
      right: right.index,
      linked: true, // default linked
      name: baseName,
    });
  }
  return pairs;
}

function StereoPairRow({ pair, leftName, rightName, onToggle, onNameChange }: {
  pair: PairState;
  leftName: string;
  rightName: string;
  onToggle: () => void;
  onNameChange: (name: string) => void;
}) {
  return (
    <div className="py-3 border-b border-neutral-800 last:border-0">
      <div className="flex items-center gap-3">
        {/* Pair indicator */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-neutral-500 font-mono w-5 text-right">{pair.left + 1}</span>
          <div className={`w-4 h-0.5 ${pair.linked ? "bg-green-500" : "bg-neutral-700"}`} />
          <span className="text-[10px] text-neutral-500 font-mono w-5">{pair.right + 1}</span>
        </div>

        {/* Link toggle */}
        <button
          onClick={onToggle}
          className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${
            pair.linked
              ? "bg-green-900 text-green-300 hover:bg-green-800"
              : "bg-neutral-700 text-neutral-500 hover:bg-neutral-600"
          }`}
        >
          {pair.linked ? "Linked" : "Unlinked"}
        </button>

        {/* Name / labels */}
        {pair.linked ? (
          <input
            type="text"
            value={pair.name}
            onChange={(e) => onNameChange(e.target.value)}
            className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 flex-1 text-neutral-300 focus:border-neutral-500 focus:outline-none"
          />
        ) : (
          <div className="flex gap-2 flex-1">
            <div className="flex items-center gap-1 flex-1">
              <span className="text-[9px] text-neutral-600">L:</span>
              <input
                type="text"
                defaultValue={leftName}
                className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 flex-1 text-neutral-300 focus:border-neutral-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1 flex-1">
              <span className="text-[9px] text-neutral-600">R:</span>
              <input
                type="text"
                defaultValue={rightName}
                className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 flex-1 text-neutral-300 focus:border-neutral-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {pair.linked && (
        <p className="text-[9px] text-neutral-600 mt-1 ml-16">
          Shared fader in Mixer. Shows as single stereo destination in Output Matrix.
        </p>
      )}
    </div>
  );
}

function OutputRow({ output, customLabel, onLabelChange, onMuteToggle }: {
  output: OutputState;
  customLabel: string;
  onLabelChange: (value: string) => void;
  onMuteToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-neutral-800 last:border-0">
      <span className="text-[10px] text-neutral-500 font-mono w-6 text-right">{output.index + 1}</span>
      <span className="text-xs text-neutral-300 w-28">{customLabel || output.name}</span>

      <div className="flex items-center gap-2">
        <span className="text-[9px] text-neutral-500">Vol:</span>
        <span className="text-xs text-neutral-300 font-mono w-12">
          {output.volume_db.toFixed(0)} dB
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onMuteToggle}
          className={`text-[9px] font-bold px-2 py-0.5 rounded ${
            output.muted ? "bg-red-600 text-white" : "bg-neutral-700 text-neutral-500 hover:bg-neutral-600"
          }`}
        >
          MUTE
        </button>
        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
          output.hw_controlled ? "bg-neutral-700 text-neutral-400" : "bg-blue-900 text-blue-300"
        }`}>
          {output.hw_controlled ? "HW" : "SW"}
        </span>
      </div>

      <div className="flex-1" />

      <input
        type="text"
        value={customLabel}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder={output.name}
        className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 w-32 text-neutral-300 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
      />
    </div>
  );
}

export default function OutputConfig({ state }: OutputConfigProps) {
  const { getLabel, setLabel, sendCommand } = useDevice();
  const [pairs, setPairs] = useState<PairState[]>(() => getDefaultPairs(state.outputs));

  const handleToggle = (index: number) => {
    setPairs((prev) => prev.map((p, i) =>
      i === index ? { ...p, linked: !p.linked } : p
    ));
  };

  const handleNameChange = (index: number, name: string) => {
    setPairs((prev) => prev.map((p, i) =>
      i === index ? { ...p, name } : p
    ));
  };

  return (
    <div className="p-4 max-w-2xl">
      <h3 className="text-sm text-neutral-300 font-medium mb-3">Output Configuration</h3>

      {/* Stereo pairs */}
      <div className="mb-6">
        <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Stereo Pairs</h4>
        <div className="bg-neutral-800/30 rounded-lg px-4 py-1">
          {pairs.map((pair, i) => (
            <StereoPairRow
              key={pair.left}
              pair={pair}
              leftName={state.outputs[pair.left]?.name ?? `Output ${pair.left + 1}`}
              rightName={state.outputs[pair.right]?.name ?? `Output ${pair.right + 1}`}
              onToggle={() => handleToggle(i)}
              onNameChange={(name) => handleNameChange(i, name)}
            />
          ))}
        </div>
      </div>

      {/* Individual outputs */}
      <div className="mb-6">
        <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Physical Outputs</h4>
        {state.outputs.map((output) => (
          <OutputRow
            key={output.index}
            output={output}
            customLabel={getLabel("outputs", `analogue_${output.index}`, "")}
            onLabelChange={(v) => setLabel("outputs", `analogue_${output.index}`, v)}
            onMuteToggle={() => sendCommand({ type: "set_output_mute", payload: { index: output.index, muted: !output.muted } })}
          />
        ))}
      </div>

      {/* DAW capture channels */}
      {state.port_counts.pcm.inputs > 0 && (
        <div>
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">DAW to Computer</h4>
          <p className="text-[9px] text-neutral-600 mb-2">
            PCM capture channels sent to your DAW for recording. Route sources to these in the Output Matrix.
          </p>

          <div className="bg-neutral-800/30 rounded-lg px-4 py-1">
            {Array.from({ length: Math.floor(state.port_counts.pcm.inputs / 2) }, (_, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-neutral-800 last:border-0">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-neutral-500 font-mono w-5 text-right">{i * 2 + 1}</span>
                  <div className="w-4 h-0.5 bg-green-500" />
                  <span className="text-[10px] text-neutral-500 font-mono w-5">{i * 2 + 2}</span>
                </div>
                <button className="text-[9px] font-bold px-2 py-1 rounded bg-green-900 text-green-300 hover:bg-green-800">
                  Linked
                </button>
                <input
                  type="text"
                  defaultValue={`DAW In ${i * 2 + 1}/${i * 2 + 2}`}
                  className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 flex-1 text-neutral-300 focus:border-neutral-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
