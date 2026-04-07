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

function DawChannelRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-neutral-800">
      <span className="text-xs text-neutral-300 w-28">{label}</span>
      <span className="text-[9px] text-neutral-500 w-16">PCM</span>
      <div className="flex-1" />
      <input
        type="text"
        placeholder="Custom label..."
        className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 w-32 text-neutral-300 placeholder-neutral-600"
      />
    </div>
  );
}

function DawStereoPairRow({ left, right, name }: { left: number; right: number; name: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-neutral-800">
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-300">{name}</span>
        <span className="text-[10px] text-neutral-500 font-mono">DAW Out {left + 1}/{right + 1}</span>
      </div>
      <button className="text-[9px] px-1.5 py-0.5 rounded bg-green-900 text-green-300 hover:bg-green-800">
        Linked
      </button>
    </div>
  );
}

export default function InputConfig({ state }: InputConfigProps) {
  const analogue = state.inputs.filter((i) => i.type === "analogue");
  const spdif = state.inputs.filter((i) => i.type === "spdif");
  const adat = state.inputs.filter((i) => i.type === "adat");
  const dawOutCount = state.port_counts.pcm.outputs;

  return (
    <div className="p-4 max-w-2xl">
      <h3 className="text-sm text-neutral-300 font-medium mb-3">Input Configuration</h3>

      {analogue.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Analogue Inputs</h4>
          {analogue.map((input) => (
            <InputRow key={`${input.type}-${input.index}`} input={input} />
          ))}
        </div>
      )}

      {spdif.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">S/PDIF Inputs</h4>
          {spdif.map((input) => (
            <InputRow key={`${input.type}-${input.index}`} input={input} />
          ))}
        </div>
      )}

      {adat.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">ADAT Inputs</h4>
          {adat.map((input) => (
            <InputRow key={`${input.type}-${input.index}`} input={input} />
          ))}
        </div>
      )}

      {dawOutCount > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">DAW from Computer</h4>
          <p className="text-[9px] text-neutral-600 mb-2">
            PCM channels from your DAW. These are sources you can route to the mixer or directly to outputs.
          </p>

          {/* DAW stereo pairs */}
          <div className="mb-3 bg-neutral-800/30 rounded-lg px-3 py-1">
            <h5 className="text-[9px] text-neutral-500 uppercase tracking-wider my-1.5">Stereo Pairs</h5>
            {Array.from({ length: Math.floor(dawOutCount / 2) }, (_, i) => (
              <DawStereoPairRow
                key={i}
                left={i * 2}
                right={i * 2 + 1}
                name={`DAW Out ${i * 2 + 1}/${i * 2 + 2}`}
              />
            ))}
          </div>

          {/* Individual DAW channels */}
          {Array.from({ length: dawOutCount }, (_, i) => (
            <DawChannelRow key={i} label={`DAW Out ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
}
