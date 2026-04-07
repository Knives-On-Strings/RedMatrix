import type { DeviceState, PortType } from "../../../types";

interface OutputMatrixProps {
  state: DeviceState;
}

const PORT_COLORS: Record<PortType, string> = {
  off: "bg-neutral-800",
  analogue: "bg-blue-600",
  spdif: "bg-purple-600",
  adat: "bg-teal-600",
  mix: "bg-amber-600",
  pcm: "bg-green-600",
};

interface PortDef {
  type: PortType;
  index: number;
  label: string;
  color: string;
}

function buildSourceList(state: DeviceState): PortDef[] {
  const sources: PortDef[] = [];

  for (let i = 0; i < state.port_counts.pcm.outputs; i++) {
    sources.push({ type: "pcm", index: i, label: `DAW Out ${i + 1}`, color: PORT_COLORS.pcm });
  }
  for (let i = 0; i < state.port_counts.analogue.inputs; i++) {
    sources.push({ type: "analogue", index: i, label: `Analogue In ${i + 1}`, color: PORT_COLORS.analogue });
  }
  for (let i = 0; i < state.port_counts.spdif.inputs; i++) {
    sources.push({ type: "spdif", index: i, label: `S/PDIF In ${i === 0 ? "L" : "R"}`, color: PORT_COLORS.spdif });
  }
  for (let i = 0; i < state.port_counts.adat.inputs; i++) {
    sources.push({ type: "adat", index: i, label: `ADAT In ${i + 1}`, color: PORT_COLORS.adat });
  }
  for (let i = 0; i < Math.min(state.port_counts.mix.outputs, 25); i++) {
    sources.push({ type: "mix", index: i, label: `Mix ${String.fromCharCode(65 + i)}`, color: PORT_COLORS.mix });
  }
  sources.push({ type: "off", index: 0, label: "Off", color: PORT_COLORS.off });

  return sources;
}

function buildDestList(state: DeviceState): PortDef[] {
  const dests: PortDef[] = [];
  let idx = 0;

  for (let i = 0; i < state.port_counts.analogue.outputs; i++) {
    const name = state.outputs[i]?.name ?? `Analogue Out ${i + 1}`;
    dests.push({ type: "analogue", index: idx++, label: name, color: PORT_COLORS.analogue });
  }
  for (let i = 0; i < state.port_counts.spdif.outputs; i++) {
    dests.push({ type: "spdif", index: idx++, label: `S/PDIF Out ${i === 0 ? "L" : "R"}`, color: PORT_COLORS.spdif });
  }
  for (let i = 0; i < state.port_counts.adat.outputs; i++) {
    dests.push({ type: "adat", index: idx++, label: `ADAT Out ${i + 1}`, color: PORT_COLORS.adat });
  }
  for (let i = 0; i < state.port_counts.pcm.inputs; i++) {
    dests.push({ type: "pcm", index: idx++, label: `DAW In ${i + 1}`, color: PORT_COLORS.pcm });
  }

  return dests;
}

function RouteCell({ active, sourceColor, onClick }: {
  active: boolean;
  sourceColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-5 h-5 rounded-sm border transition-colors ${
        active
          ? `${sourceColor} border-white/30`
          : "bg-neutral-800 border-neutral-700/50 hover:border-neutral-500"
      }`}
    >
      {active && <span className="text-[7px] text-white font-bold">●</span>}
    </button>
  );
}

export default function OutputMatrix({ state }: OutputMatrixProps) {
  if (!state.features.has_mixer) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 p-4">
        This device has no routing matrix
      </div>
    );
  }

  const sources = buildSourceList(state);
  const dests = buildDestList(state);

  const handleCellClick = (_destIdx: number, _source: PortDef) => {
    // TODO: send set_route via transport
  };

  const isActive = (destIdx: number, source: PortDef) => {
    const route = state.routing[destIdx];
    if (!route) return false;
    return route.type === source.type && route.index === source.index;
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-neutral-300 font-medium">
          Source → Output ({sources.length} sources → {dests.length} destinations)
        </h3>
        <div className="flex gap-2">
          <button className="text-[10px] px-2 py-1 bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600">
            Direct (1:1)
          </button>
          <button className="text-[10px] px-2 py-1 bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600">
            Clear All
          </button>
        </div>
      </div>

      <div className="text-[9px] text-neutral-600 mb-2">
        Rows = signal sources → Columns = output destinations. Click to route. One source per destination.
      </div>

      <div className="overflow-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="min-w-[110px]" />
              {dests.map((dest, di) => (
                <th key={di} className="px-0.5 pb-1">
                  <div className="flex flex-col items-center">
                    <div className={`w-1.5 h-1.5 rounded-full ${dest.color} mb-0.5`} />
                    <span className="text-[6px] text-neutral-500 font-mono whitespace-nowrap [writing-mode:vertical-lr] rotate-180 h-16">
                      {dest.label}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((src) => (
              <tr key={`${src.type}-${src.index}`}>
                <td className="pr-1.5 py-0.5">
                  <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${src.color} flex-shrink-0`} />
                    <span className="text-[7px] text-neutral-400 font-mono whitespace-nowrap">
                      {src.label}
                    </span>
                  </div>
                </td>
                {dests.map((dest, di) => (
                  <td key={di} className="px-0.5 py-0.5">
                    <RouteCell
                      active={isActive(dest.index, src)}
                      sourceColor={src.color}
                      onClick={() => handleCellClick(dest.index, src)}
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
