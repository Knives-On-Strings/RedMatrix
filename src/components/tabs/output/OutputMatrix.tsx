import type { DeviceState } from "../../../types";
import { useDevice } from "../../../hooks/useDevice";
import { buildSourceList, buildDestList, type PortDef } from "../../../utils/routing";

interface OutputMatrixProps {
  state: DeviceState;
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
      {active && <span className="text-[7px] text-white font-bold">{"\u25cf"}</span>}
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

  const { sendCommand } = useDevice();
  const sources = buildSourceList(state);
  const dests = buildDestList(state);

  const handleCellClick = (destIdx: number, source: PortDef) => {
    sendCommand({
      type: "set_route",
      payload: {
        destination: destIdx,
        source_type: source.type,
        source_index: source.index,
      },
    });
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
          Source &rarr; Output ({sources.length} sources &rarr; {dests.length} destinations)
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
        Rows = signal sources &rarr; Columns = output destinations. Click to route. One source per destination.
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
