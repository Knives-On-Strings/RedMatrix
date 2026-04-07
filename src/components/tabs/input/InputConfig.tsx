import type { DeviceState, InputState } from "../../../types";

interface InputConfigProps {
  state: DeviceState;
}

function ToggleBadge({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[9px] font-bold px-2 py-0.5 rounded transition-colors ${
        active
          ? "bg-amber-600 text-white"
          : "bg-neutral-700 text-neutral-500 hover:bg-neutral-600"
      }`}
    >
      {label}
    </button>
  );
}

function InputRow({ input }: { input: InputState }) {
  const handleToggle = () => {
    // TODO: send via transport
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-neutral-800">
      <span className="text-xs text-neutral-300 w-28">{input.name}</span>
      <span className="text-[9px] text-neutral-500 w-16">{input.type}</span>

      {input.type === "analogue" && (
        <div className="flex gap-1.5">
          {input.index < 2 && (
            <ToggleBadge label="INST" active={input.inst} onClick={handleToggle} />
          )}
          <ToggleBadge label="PAD" active={input.pad} onClick={handleToggle} />
          <ToggleBadge label="AIR" active={input.air} onClick={handleToggle} />
          <ToggleBadge label="48V" active={input.phantom} onClick={handleToggle} />
        </div>
      )}

      <div className="flex-1" />

      <input
        type="text"
        placeholder="Custom label..."
        className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 w-32 text-neutral-300 placeholder-neutral-600"
      />
    </div>
  );
}

export default function InputConfig({ state }: InputConfigProps) {
  const analogue = state.inputs.filter((i) => i.type === "analogue");
  const spdif = state.inputs.filter((i) => i.type === "spdif");
  const adat = state.inputs.filter((i) => i.type === "adat");

  return (
    <div className="p-4 max-w-2xl">
      <h3 className="text-sm text-neutral-300 font-medium mb-3">Input Configuration</h3>

      {analogue.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Analogue</h4>
          {analogue.map((input) => (
            <InputRow key={`${input.type}-${input.index}`} input={input} />
          ))}
        </div>
      )}

      {spdif.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">S/PDIF</h4>
          {spdif.map((input) => (
            <InputRow key={`${input.type}-${input.index}`} input={input} />
          ))}
        </div>
      )}

      {adat.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">ADAT</h4>
          {adat.map((input) => (
            <InputRow key={`${input.type}-${input.index}`} input={input} />
          ))}
        </div>
      )}
    </div>
  );
}
