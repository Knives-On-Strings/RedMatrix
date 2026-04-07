import type { DeviceState, InputState } from "../../../types";
import { useDevice } from "../../../hooks/useDevice";
import { useMeters } from "../../../hooks/useMeterStore";
import MeterBar from "../../MeterBar";

interface InputMetersProps {
  state: DeviceState;
}

function ChannelStrip({ input, level }: { input: InputState; level: number }) {
  const { getLabel } = useDevice();
  const defaultLabel = input.type === "spdif"
    ? input.index === 0 ? "L" : "R"
    : `${input.index + 1}`;
  const label = getLabel("inputs", `${input.type}_${input.index}`, defaultLabel);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-neutral-400 font-mono truncate max-w-[40px]" title={label}>{label}</span>
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
  const meters = useMeters();

  const hasTalkback = state.features.has_talkback;

  // Separate talkback from analogue inputs
  const allAnalogue = state.inputs.filter((i) => i.type === "analogue");
  const analogue = hasTalkback ? allAnalogue.slice(0, -1) : allAnalogue;
  const talkback = hasTalkback ? allAnalogue.slice(-1) : [];
  const spdif = state.inputs.filter((i) => i.type === "spdif");
  const adat = state.inputs.filter((i) => i.type === "adat");

  // Slice meter data by input group (order matches state.inputs)
  let offset = 0;
  const analogueLevels = Array.from(meters.slice(offset, offset + analogue.length)); offset += analogue.length;
  const talkbackLevels = Array.from(meters.slice(offset, offset + talkback.length)); offset += talkback.length;
  const spdifLevels = Array.from(meters.slice(offset, offset + spdif.length)); offset += spdif.length;
  const adatLevels = Array.from(meters.slice(offset, offset + adat.length));

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
      {talkback.length > 0 && (
        <>
          <div className="w-px h-24 bg-neutral-700/50" />
          <InputGroup label="Talkback" inputs={talkback} levels={talkbackLevels} />
        </>
      )}
    </div>
  );
}
