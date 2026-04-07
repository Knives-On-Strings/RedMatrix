import type { DeviceState, InputState } from "../../../types";
import { useDevice, type InputStereoPairConfig } from "../../../hooks/useDevice";

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

function InputRow({ input, onToggle, customLabel, onLabelChange }: {
  input: InputState;
  onToggle: (feature: string) => void;
  customLabel: string;
  onLabelChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-neutral-800">
      <span className="text-xs text-neutral-300 w-28">{customLabel || input.name}</span>
      <span className="text-[9px] text-neutral-500 w-16">{input.type}</span>

      {input.type === "analogue" && (
        <div className="flex gap-1.5">
          {input.index < 2 && (
            <ToggleBadge label="INST" active={input.inst} onClick={() => onToggle("inst")} />
          )}
          <ToggleBadge label="PAD" active={input.pad} onClick={() => onToggle("pad")} />
          <ToggleBadge label="AIR" active={input.air} onClick={() => onToggle("air")} />
          <ToggleBadge label="48V" active={input.phantom} onClick={() => onToggle("phantom")} />
        </div>
      )}

      <div className="flex-1" />

      <input
        type="text"
        value={customLabel}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder={input.name}
        className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 w-32 text-neutral-300 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
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

function InputPairSection({ label, inputs, pairs, onTogglePair, onRenamePair }: {
  label: string;
  inputs: InputState[];
  pairs: InputStereoPairConfig[];
  onTogglePair: (left: number, right: number, inputType: string) => void;
  onRenamePair: (left: number, right: number, inputType: string, name: string) => void;
}) {
  if (inputs.length < 2) return null;

  const adjacentPairs: { left: InputState; right: InputState }[] = [];
  for (let i = 0; i < inputs.length - 1; i += 2) {
    adjacentPairs.push({ left: inputs[i]!, right: inputs[i + 1]! });
  }

  return (
    <div className="mb-3 bg-neutral-800/30 rounded-lg px-3 py-1">
      <h5 className="text-[9px] text-neutral-500 uppercase tracking-wider my-1.5">{label} Stereo Pairs</h5>
      {adjacentPairs.map(({ left, right }) => {
        const existing = pairs.find(
          (p) => p.left === left.index && p.right === right.index && p.input_type === left.type
        );
        const isLinked = existing?.linked ?? false;
        const pairName = existing?.name ?? "";

        return (
          <div key={`${left.type}-${left.index}`} className="flex items-center gap-3 py-2 border-b border-neutral-800 last:border-0">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-neutral-500 font-mono w-5 text-right">{left.index + 1}</span>
              <div className={`w-4 h-0.5 ${isLinked ? "bg-green-500" : "bg-neutral-700"}`} />
              <span className="text-[10px] text-neutral-500 font-mono w-5">{right.index + 1}</span>
            </div>
            <button
              onClick={() => onTogglePair(left.index, right.index, left.type)}
              className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${
                isLinked
                  ? "bg-green-900 text-green-300 hover:bg-green-800"
                  : "bg-neutral-700 text-neutral-500 hover:bg-neutral-600"
              }`}
            >
              {isLinked ? "Linked" : "Unlinked"}
            </button>
            {isLinked ? (
              <input
                type="text"
                value={pairName}
                onChange={(e) => onRenamePair(left.index, right.index, left.type, e.target.value)}
                placeholder={`${left.name} / ${right.name}`}
                className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 flex-1 text-neutral-300 focus:border-neutral-500 focus:outline-none"
              />
            ) : (
              <span className="text-xs text-neutral-400">
                {left.name} / {right.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function InputConfig({ state }: InputConfigProps) {
  const { sendCommand, getLabel, setLabel, inputStereoPairs, setInputStereoPairs } = useDevice();

  const hasTalkback = state.features.has_talkback;
  const allAnalogue = state.inputs.filter((i) => i.type === "analogue");
  const analogue = hasTalkback ? allAnalogue.slice(0, -1) : allAnalogue;
  const talkback = hasTalkback ? allAnalogue.slice(-1) : [];
  const spdif = state.inputs.filter((i) => i.type === "spdif");
  const adat = state.inputs.filter((i) => i.type === "adat");
  const dawOutCount = state.port_counts.pcm.outputs;

  const handleTogglePair = (left: number, right: number, inputType: string) => {
    const existing = inputStereoPairs.find(
      (p) => p.left === left && p.right === right && p.input_type === inputType
    );
    if (existing) {
      setInputStereoPairs(
        inputStereoPairs.map((p) =>
          p.left === left && p.right === right && p.input_type === inputType
            ? { ...p, linked: !p.linked }
            : p
        )
      );
    } else {
      setInputStereoPairs([
        ...inputStereoPairs,
        { left, right, name: "", linked: true, input_type: inputType },
      ]);
    }
  };

  const handleRenamePair = (left: number, right: number, inputType: string, name: string) => {
    setInputStereoPairs(
      inputStereoPairs.map((p) =>
        p.left === left && p.right === right && p.input_type === inputType
          ? { ...p, name }
          : p
      )
    );
  };

  const handleToggle = (input: InputState, feature: string) => {
    switch (feature) {
      case "pad":
        sendCommand({ type: "set_input_pad", payload: { index: input.index, enabled: !input.pad } });
        break;
      case "air":
        sendCommand({ type: "set_input_air", payload: { index: input.index, enabled: !input.air } });
        break;
      case "phantom":
        sendCommand({ type: "set_input_phantom", payload: { group: input.index, enabled: !input.phantom } });
        break;
      case "inst":
        sendCommand({ type: "set_input_inst", payload: { index: input.index, enabled: !input.inst } });
        break;
    }
  };

  return (
    <div className="p-4 max-w-2xl">
      <h3 className="text-sm text-neutral-300 font-medium mb-3">Input Configuration</h3>

      {/* Stereo pairs for all input types */}
      <div className="mb-4">
        <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Stereo Pairs</h4>
        <InputPairSection label="Analogue" inputs={analogue} pairs={inputStereoPairs} onTogglePair={handleTogglePair} onRenamePair={handleRenamePair} />
        <InputPairSection label="S/PDIF" inputs={spdif} pairs={inputStereoPairs} onTogglePair={handleTogglePair} onRenamePair={handleRenamePair} />
        <InputPairSection label="ADAT" inputs={adat} pairs={inputStereoPairs} onTogglePair={handleTogglePair} onRenamePair={handleRenamePair} />
        <p className="text-[10px] text-neutral-600 mt-1.5 px-1">
          Linked inputs share a single fader in the Mixer and pan hard L/R automatically.
        </p>
      </div>

      {analogue.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Analogue Inputs</h4>
          {analogue.map((input) => (
            <InputRow
              key={`${input.type}-${input.index}`}
              input={input}
              onToggle={(f) => handleToggle(input, f)}
              customLabel={getLabel("inputs", `${input.type}_${input.index}`, "")}
              onLabelChange={(v) => setLabel("inputs", `${input.type}_${input.index}`, v)}
            />
          ))}
        </div>
      )}

      {spdif.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">S/PDIF Inputs</h4>
          {spdif.map((input) => (
            <InputRow
              key={`${input.type}-${input.index}`}
              input={input}
              onToggle={(f) => handleToggle(input, f)}
              customLabel={getLabel("inputs", `${input.type}_${input.index}`, "")}
              onLabelChange={(v) => setLabel("inputs", `${input.type}_${input.index}`, v)}
            />
          ))}
        </div>
      )}

      {adat.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">ADAT Inputs</h4>
          {adat.map((input) => (
            <InputRow
              key={`${input.type}-${input.index}`}
              input={input}
              onToggle={(f) => handleToggle(input, f)}
              customLabel={getLabel("inputs", `${input.type}_${input.index}`, "")}
              onLabelChange={(v) => setLabel("inputs", `${input.type}_${input.index}`, v)}
            />
          ))}
        </div>
      )}

      {talkback.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Talkback</h4>
          {talkback.map((input) => (
            <InputRow
              key={`${input.type}-${input.index}`}
              input={input}
              onToggle={(f) => handleToggle(input, f)}
              customLabel={getLabel("inputs", `${input.type}_${input.index}`, "")}
              onLabelChange={(v) => setLabel("inputs", `${input.type}_${input.index}`, v)}
            />
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
