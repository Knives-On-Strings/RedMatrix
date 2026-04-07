import { useEffect, useState } from "react";
import type { DeviceState, PortType } from "../../types";
import { mockDeviceState } from "./overview/mockState";

const PORT_COLORS: Record<PortType, string> = {
  off: "bg-neutral-800",
  analogue: "bg-blue-600",
  spdif: "bg-purple-600",
  adat: "bg-teal-600",
  mix: "bg-amber-600",
  pcm: "bg-green-600",
};

interface SourceDef {
  type: PortType;
  index: number;
  label: string;
  color: string;
}

function buildSourceList(state: DeviceState): SourceDef[] {
  const sources: SourceDef[] = [];

  // PCM (DAW outputs)
  for (let i = 0; i < state.port_counts.pcm.outputs; i++) {
    sources.push({ type: "pcm", index: i, label: `P${i + 1}`, color: PORT_COLORS.pcm });
  }
  // Analogue inputs
  for (let i = 0; i < state.port_counts.analogue.inputs; i++) {
    sources.push({ type: "analogue", index: i, label: `An${i + 1}`, color: PORT_COLORS.analogue });
  }
  // S/PDIF inputs
  for (let i = 0; i < state.port_counts.spdif.inputs; i++) {
    sources.push({ type: "spdif", index: i, label: i === 0 ? "SPL" : "SPR", color: PORT_COLORS.spdif });
  }
  // ADAT inputs
  for (let i = 0; i < state.port_counts.adat.inputs; i++) {
    sources.push({ type: "adat", index: i, label: `AD${i + 1}`, color: PORT_COLORS.adat });
  }
  // Mixer bus outputs
  for (let i = 0; i < Math.min(state.port_counts.mix.outputs, 25); i++) {
    sources.push({ type: "mix", index: i, label: `M${String.fromCharCode(65 + i)}`, color: PORT_COLORS.mix });
  }
  // Off
  sources.push({ type: "off", index: 0, label: "Off", color: PORT_COLORS.off });

  return sources;
}

interface DestDef {
  index: number;
  label: string;
  group: string;
  color: string;
}

function buildDestList(state: DeviceState): DestDef[] {
  const dests: DestDef[] = [];
  let idx = 0;

  for (let i = 0; i < state.port_counts.analogue.outputs; i++) {
    const name = state.outputs[i]?.name ?? `Analogue ${i + 1}`;
    dests.push({ index: idx++, label: name, group: "Analogue", color: PORT_COLORS.analogue });
  }
  for (let i = 0; i < state.port_counts.spdif.outputs; i++) {
    dests.push({ index: idx++, label: `S/PDIF ${i === 0 ? "L" : "R"}`, group: "S/PDIF", color: PORT_COLORS.spdif });
  }
  for (let i = 0; i < state.port_counts.adat.outputs; i++) {
    dests.push({ index: idx++, label: `ADAT ${i + 1}`, group: "ADAT", color: PORT_COLORS.adat });
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
      className={`w-6 h-6 rounded-sm border transition-colors ${
        active
          ? `${sourceColor} border-white/30`
          : "bg-neutral-800 border-neutral-700/50 hover:border-neutral-500"
      }`}
      title={active ? "Active" : "Click to route"}
    >
      {active && <span className="text-[8px] text-white font-bold">●</span>}
    </button>
  );
}

export default function Routing() {
  const [state, setState] = useState<DeviceState | null>(null);

  useEffect(() => {
    setState(mockDeviceState());
  }, []);

  if (!state || !state.features.has_mixer) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <span>{state ? "This device has no routing matrix" : "Connecting..."}</span>
      </div>
    );
  }

  const sources = buildSourceList(state);
  const dests = buildDestList(state);

  const handleCellClick = (_destIdx: number, _source: SourceDef) => {
    // TODO: send set_route via transport
  };

  // Check if a source matches the current route for a destination
  const isActive = (destIdx: number, source: SourceDef) => {
    const route = state.routing[destIdx];
    if (!route) return false;
    return route.type === source.type && route.index === source.index;
  };

  // Group headers for sources (find where each type starts)
  const sourceGroups: { label: string; startCol: number; count: number; color: string }[] = [];
  let lastType = "";
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]!;
    if (src.type !== lastType) {
      sourceGroups.push({
        label: src.type === "off" ? "" : src.type.toUpperCase(),
        startCol: i,
        count: 0,
        color: src.color,
      });
      lastType = src.type;
    }
    const lastGroup = sourceGroups[sourceGroups.length - 1];
    if (lastGroup) lastGroup.count++;
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-neutral-300 font-medium">
          Signal Routing ({dests.length} destinations × {sources.length} sources)
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

      <div className="overflow-auto">
        <table className="border-collapse">
          {/* Source group headers */}
          <thead>
            <tr>
              <th className="w-28" />
              {sourceGroups.map((group, gi) => (
                <th
                  key={gi}
                  colSpan={group.count}
                  className="text-[8px] text-neutral-500 font-normal uppercase tracking-wider pb-0.5"
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              <th className="w-28" />
              {sources.map((src, si) => (
                <th key={si} className="px-0.5 pb-1">
                  <div className="flex flex-col items-center">
                    <div className={`w-1.5 h-1.5 rounded-full ${src.color} mb-0.5`} />
                    <span className="text-[7px] text-neutral-500 font-mono">{src.label}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dests.map((dest) => (
              <tr key={dest.index}>
                <td className="pr-2 py-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${dest.color}`} />
                    <span className="text-[9px] text-neutral-400 truncate max-w-[100px]">
                      {dest.label}
                    </span>
                  </div>
                </td>
                {sources.map((src, si) => (
                  <td key={si} className="px-0.5 py-0.5">
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
