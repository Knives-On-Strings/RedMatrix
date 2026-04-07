import { useEffect, useState } from "react";
import type { DeviceState } from "../../types";
import { mockDeviceState } from "./overview/mockState";

function GainCell({ db, onClick }: { db: number; onClick: () => void }) {
  const isActive = db > -80;
  const isUnity = Math.abs(db) < 0.5;

  let bg = "bg-neutral-800";
  if (isUnity) {
    bg = "bg-green-600";
  } else if (isActive) {
    const intensity = Math.min(1, (db + 80) / 80);
    if (intensity > 0.5) bg = "bg-green-700";
    else if (intensity > 0.2) bg = "bg-green-900";
    else bg = "bg-green-950";
  }

  return (
    <button
      onClick={onClick}
      className={`w-8 h-6 text-[8px] font-mono rounded-sm border border-neutral-700/50 ${bg} ${
        isActive ? "text-neutral-200" : "text-neutral-600"
      } hover:border-neutral-500 transition-colors`}
      title={`${db <= -80 ? "-∞" : db.toFixed(1)} dB`}
    >
      {isActive ? (db <= -60 ? "·" : isUnity ? "0" : db.toFixed(0)) : ""}
    </button>
  );
}

export default function Matrix() {
  const [state, setState] = useState<DeviceState | null>(null);

  useEffect(() => {
    setState(mockDeviceState());
  }, []);

  if (!state || !state.features.has_mixer) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <span>{state ? "This device has no DSP mixer" : "Connecting..."}</span>
      </div>
    );
  }

  const busCount = Math.min(state.mixer.gains.length, state.port_counts.mix.outputs);
  const inputCount = state.mixer.gains[0]?.length ?? 0;
  const busLabel = (i: number) => String.fromCharCode(65 + i);

  // Input labels (rows = sources)
  const inputLabels: string[] = [];
  const analogue = state.inputs.filter((i) => i.type === "analogue");
  const spdif = state.inputs.filter((i) => i.type === "spdif");
  const adat = state.inputs.filter((i) => i.type === "adat");
  for (const inp of analogue) inputLabels.push(`An${inp.index + 1}`);
  for (const inp of spdif) inputLabels.push(`SP${inp.index === 0 ? "L" : "R"}`);
  for (const inp of adat) inputLabels.push(`AD${inp.index + 1}`);
  while (inputLabels.length < inputCount) {
    inputLabels.push(`P${inputLabels.length - analogue.length - spdif.length - adat.length + 1}`);
  }

  const handleCellClick = (_bus: number, _channel: number) => {
    // TODO: toggle between 0dB and -80dB, or open gain input
  };

  return (
    <div className="flex flex-col h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-neutral-300 font-medium">
          DSP Mixer ({inputCount} inputs → {busCount} buses)
        </h3>
        <div className="flex gap-2">
          <button className="text-[10px] px-2 py-1 bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600">
            Unity Bus A
          </button>
          <button className="text-[10px] px-2 py-1 bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600">
            Clear All
          </button>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="border-collapse">
          <thead>
            {/* Bus labels as columns (destinations) */}
            <tr>
              <th className="w-12" />
              {Array.from({ length: busCount }, (_, i) => (
                <th key={i} className="text-[9px] text-neutral-500 font-mono px-0.5 pb-1">
                  {busLabel(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Input labels as rows (sources) */}
            {Array.from({ length: inputCount }, (_, ch) => (
              <tr key={ch}>
                <td className="text-[9px] text-neutral-500 font-mono pr-2 text-right">
                  {inputLabels[ch] ?? `${ch + 1}`}
                </td>
                {Array.from({ length: busCount }, (_, bus) => (
                  <td key={bus} className="px-0.5 py-0.5">
                    <GainCell
                      db={state.mixer.gains[bus]?.[ch] ?? -80}
                      onClick={() => handleCellClick(bus, ch)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
