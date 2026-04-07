import type { DeviceState } from "../../../types";
import { useDevice } from "../../../hooks/useDevice";
import { busLabel } from "../../../constants";
import GainCell from "../../GainCell";

interface InputMatrixProps {
  state: DeviceState;
}

export default function InputMatrix({ state }: InputMatrixProps) {
  if (!state.features.has_mixer) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 p-4">
        This device has no DSP mixer
      </div>
    );
  }

  const busCount = Math.min(state.mixer.gains.length, state.port_counts.mix.outputs);
  const inputCount = state.mixer.gains[0]?.length ?? 0;

  // Input labels (rows = sources)
  const inputLabels: string[] = [];
  const analogue = state.inputs.filter((i) => i.type === "analogue");
  const spdif = state.inputs.filter((i) => i.type === "spdif");
  const adat = state.inputs.filter((i) => i.type === "adat");
  for (const inp of analogue) inputLabels.push(`Analogue In ${inp.index + 1}`);
  for (const inp of spdif) inputLabels.push(`S/PDIF In ${inp.index === 0 ? "L" : "R"}`);
  for (const inp of adat) inputLabels.push(`ADAT In ${inp.index + 1}`);
  while (inputLabels.length < inputCount) {
    inputLabels.push(`DAW Out ${inputLabels.length - analogue.length - spdif.length - adat.length + 1}`);
  }

  const { sendCommand, state: deviceState } = useDevice();

  const handleCellClick = (bus: number, channel: number) => {
    const currentGain = deviceState?.mixer.gains[bus]?.[channel] ?? -80;
    const newGain = currentGain > -80 ? -80 : 0;
    sendCommand({
      type: "set_mix_gain",
      payload: { mix: bus, channel, gain_db: newGain },
    });
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-neutral-300 font-medium">
          Input &rarr; Mixer Bus ({inputCount} sources &rarr; {busCount} buses)
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => sendCommand({ type: "set_bus_gains", payload: { mix: 0, gain_db: 0 } })}
            className="text-[10px] px-2 py-1 bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600"
          >
            Unity Bus A
          </button>
          <button
            onClick={() => sendCommand({ type: "clear_mixer", payload: {} })}
            className="text-[10px] px-2 py-1 bg-red-900 text-red-300 rounded hover:bg-red-800"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="text-[9px] text-neutral-600 mb-2">
        Rows = input sources &rarr; Columns = mixer buses. Click to set gain.
      </div>

      <div className="overflow-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="min-w-[120px]" />
              {Array.from({ length: busCount }, (_, i) => (
                <th key={i} className="text-[9px] text-neutral-500 font-mono px-0.5 pb-1">
                  Bus {busLabel(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: inputCount }, (_, ch) => (
              <tr key={ch}>
                <td className="text-[8px] text-neutral-400 font-mono pr-2 text-right whitespace-nowrap">
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
