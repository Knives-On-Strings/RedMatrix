import type { DeviceState, OutputState } from "../../../types";

interface OutputConfigProps {
  state: DeviceState;
}

function OutputRow({ output }: { output: OutputState }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-neutral-800">
      <span className="text-[10px] text-neutral-500 font-mono w-6 text-right">{output.index + 1}</span>
      <span className="text-xs text-neutral-300 w-28">{output.name}</span>

      <div className="flex items-center gap-2">
        <span className="text-[9px] text-neutral-500">Vol:</span>
        <span className="text-xs text-neutral-300 font-mono w-12">
          {output.volume_db.toFixed(0)} dB
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button className={`text-[9px] font-bold px-2 py-0.5 rounded ${
          output.muted ? "bg-red-600 text-white" : "bg-neutral-700 text-neutral-500 hover:bg-neutral-600"
        }`}>
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
        placeholder="Custom label..."
        className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 w-32 text-neutral-300 placeholder-neutral-600"
      />
    </div>
  );
}

export default function OutputConfig({ state }: OutputConfigProps) {
  // Default stereo pairs from device config
  const defaultPairs = [
    { left: 0, right: 1, name: "Monitor 1 (MAIN)" },
    { left: 2, right: 3, name: "Monitor 2 (ALT)" },
    { left: 4, right: 5, name: "Line 5-6" },
    { left: 6, right: 7, name: "Headphones 1" },
    { left: 8, right: 9, name: "Headphones 2" },
  ];

  return (
    <div className="p-4 max-w-2xl">
      <h3 className="text-sm text-neutral-300 font-medium mb-3">Output Configuration</h3>

      {/* Stereo pairs */}
      <div className="mb-6">
        <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Stereo Pairs</h4>
        <div className="bg-neutral-800/30 rounded-lg px-4 py-1">
          {defaultPairs.map((pair) => (
            <div key={pair.left} className="flex items-center justify-between py-2 border-b border-neutral-800">
              <span className="text-xs text-neutral-300">{pair.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-neutral-500 font-mono">
                  Out {pair.left + 1}/{pair.right + 1}
                </span>
                <button className="text-[9px] px-1.5 py-0.5 rounded bg-green-900 text-green-300 hover:bg-green-800">
                  Linked
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-neutral-600 mt-1.5 px-1">
          Linked outputs share a single fader in the Mixer. Click to unlink for independent L/R control.
        </p>
      </div>

      {/* Individual outputs */}
      <div>
        <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">All Outputs</h4>
        {state.outputs.map((output) => (
          <OutputRow key={output.index} output={output} />
        ))}
      </div>
    </div>
  );
}
