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

const PORT_LABELS: Record<PortType, string> = {
  off: "Off",
  analogue: "Analogue",
  spdif: "S/PDIF",
  adat: "ADAT",
  mix: "Mix",
  pcm: "PCM",
};

function RouteRow({ destIndex, destName, sourceType, sourceIndex, onSourceChange }: {
  destIndex: number;
  destName: string;
  sourceType: PortType;
  sourceIndex: number;
  onSourceChange: (dest: number, type: PortType, index: number) => void;
}) {
  const sourceLabel = sourceType === "off"
    ? "—"
    : `${PORT_LABELS[sourceType]} ${sourceIndex + 1}`;

  return (
    <div className="flex items-center gap-3 py-1 px-2 hover:bg-neutral-800/50 rounded">
      <span className="text-xs text-neutral-400 w-6 text-right font-mono">{destIndex + 1}</span>
      <span className="text-xs text-neutral-300 w-32 truncate">{destName}</span>
      <div className="flex items-center gap-2 flex-1">
        <div className={`w-2 h-2 rounded-full ${PORT_COLORS[sourceType]}`} />
        <select
          value={`${sourceType}:${sourceIndex}`}
          onChange={(e) => {
            const [type, idx] = e.target.value.split(":");
            onSourceChange(destIndex, type as PortType, Number(idx));
          }}
          className="bg-neutral-800 text-xs text-neutral-300 border border-neutral-700 rounded px-2 py-1 flex-1 max-w-xs"
        >
          <option value="off:0">Off</option>
          <optgroup label="PCM (DAW)">
            {Array.from({ length: 20 }, (_, i) => (
              <option key={`pcm-${i}`} value={`pcm:${i}`}>PCM {i + 1}</option>
            ))}
          </optgroup>
          <optgroup label="Analogue">
            {Array.from({ length: 10 }, (_, i) => (
              <option key={`an-${i}`} value={`analogue:${i}`}>Analogue {i + 1}</option>
            ))}
          </optgroup>
          <optgroup label="S/PDIF">
            <option value="spdif:0">S/PDIF L</option>
            <option value="spdif:1">S/PDIF R</option>
          </optgroup>
          <optgroup label="ADAT">
            {Array.from({ length: 8 }, (_, i) => (
              <option key={`adat-${i}`} value={`adat:${i}`}>ADAT {i + 1}</option>
            ))}
          </optgroup>
          <optgroup label="Mixer">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={`mix-${i}`} value={`mix:${i}`}>Mix {String.fromCharCode(65 + i)}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <span className="text-[9px] text-neutral-600 font-mono">{sourceLabel}</span>
    </div>
  );
}

function DestinationGroup({ label, color, routes, startIndex, names, onSourceChange }: {
  label: string;
  color: string;
  routes: { type: PortType; index: number }[];
  startIndex: number;
  names: string[];
  onSourceChange: (dest: number, type: PortType, index: number) => void;
}) {
  if (routes.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1 px-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider">{label}</h4>
      </div>
      {routes.map((route, i) => (
        <RouteRow
          key={startIndex + i}
          destIndex={startIndex + i}
          destName={names[i] ?? `Output ${startIndex + i + 1}`}
          sourceType={route.type}
          sourceIndex={route.index}
          onSourceChange={onSourceChange}
        />
      ))}
    </div>
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

  const handleSourceChange = (_dest: number, _type: PortType, _index: number) => {
    // TODO: send via transport
  };

  // Split routing into destination groups
  const anOut = state.port_counts.analogue.outputs;
  const spOut = state.port_counts.spdif.outputs;
  const adOut = state.port_counts.adat.outputs;

  const analogueRoutes = state.routing.slice(0, anOut);
  const spdifRoutes = state.routing.slice(anOut, anOut + spOut);
  const adatRoutes = state.routing.slice(anOut + spOut, anOut + spOut + adOut);

  const outputNames = state.outputs.map((o) => o.name);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm text-neutral-300 font-medium">Signal Routing</h3>
        <div className="flex gap-2">
          <button className="text-[10px] px-2 py-1 bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600">
            Direct (1:1)
          </button>
          <button className="text-[10px] px-2 py-1 bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600">
            Clear All
          </button>
        </div>
      </div>

      <DestinationGroup
        label="Analogue Outputs"
        color="bg-blue-600"
        routes={analogueRoutes}
        startIndex={0}
        names={outputNames.slice(0, anOut)}
        onSourceChange={handleSourceChange}
      />
      <DestinationGroup
        label="S/PDIF Outputs"
        color="bg-purple-600"
        routes={spdifRoutes}
        startIndex={anOut}
        names={[`S/PDIF L`, `S/PDIF R`]}
        onSourceChange={handleSourceChange}
      />
      <DestinationGroup
        label="ADAT Outputs"
        color="bg-teal-600"
        routes={adatRoutes}
        startIndex={anOut + spOut}
        names={Array.from({ length: adOut }, (_, i) => `ADAT ${i + 1}`)}
        onSourceChange={handleSourceChange}
      />
    </div>
  );
}
