import type { DeviceState, InputState } from "../../../types";

interface InputMetersProps {
  state: DeviceState;
}

function MeterBar({ level }: { level: number }) {
  // level: 0.0 (silence) to 1.0 (full scale)
  const height = Math.max(0, Math.min(100, level * 100));
  const color = level > 0.9 ? "bg-red-500" : level > 0.7 ? "bg-amber-400" : "bg-green-500";

  return (
    <div className="w-3 h-24 bg-neutral-800 rounded-sm overflow-hidden flex flex-col-reverse">
      <div className={`${color} rounded-sm transition-all duration-75`} style={{ height: `${height}%` }} />
    </div>
  );
}

function ChannelStrip({ input, level }: { input: InputState; level: number }) {
  const label = input.type === "spdif"
    ? input.index === 0 ? "L" : "R"
    : `${input.index + 1}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-neutral-400 font-mono">{label}</span>
      <MeterBar level={level} />
    </div>
  );
}

function InputGroup({ label, inputs, levels }: { label: string; inputs: InputState[]; levels: number[] }) {
  if (inputs.length === 0) return null;

  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-1.5">
        {inputs.map((input, i) => (
          <ChannelStrip key={`${input.type}-${input.index}`} input={input} level={levels[i] ?? 0} />
        ))}
      </div>
      <span className="text-[10px] text-neutral-500 mt-1.5 uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function InputMeters({ state }: InputMetersProps) {
  const analogue = state.inputs.filter((i) => i.type === "analogue");
  const spdif = state.inputs.filter((i) => i.type === "spdif");
  const adat = state.inputs.filter((i) => i.type === "adat");

  // Mock meter levels (will be replaced by real meter data from transport)
  const mockLevel = (_input: InputState) => 0.15 + Math.random() * 0.3;
  const analogueLevels = analogue.map(mockLevel);
  const spdifLevels = spdif.map(mockLevel);
  const adatLevels = adat.map(mockLevel);

  return (
    <div className="flex items-end gap-6 px-4">
      <InputGroup label="Analogue" inputs={analogue} levels={analogueLevels} />
      {spdif.length > 0 && (
        <>
          <div className="w-px h-24 bg-neutral-700/50" />
          <InputGroup label="S/PDIF" inputs={spdif} levels={spdifLevels} />
        </>
      )}
      {adat.length > 0 && (
        <>
          <div className="w-px h-24 bg-neutral-700/50" />
          <InputGroup label="ADAT" inputs={adat} levels={adatLevels} />
        </>
      )}
    </div>
  );
}
