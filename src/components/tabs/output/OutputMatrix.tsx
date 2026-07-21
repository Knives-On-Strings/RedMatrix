import { useState } from "react";
import type { DeviceState, ClientMessage, PortType } from "../../../types";
import { useDevice } from "../../../hooks/useDevice";
import { buildSourceGroups, buildDestList, type PortDef, type SourceGroup } from "../../../utils/routing";

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

  const { sendCommand, stereoPairs, inputStereoPairs } = useDevice();
  const sourceGroups = buildSourceGroups(state);
  const dests = buildDestList(state);

  const groupedDests: Array<
    | { isStereo: false; index: number; label: string; color: string; type: string }
    | { isStereo: true; leftIndex: number; rightIndex: number; label: string; color: string; type: string }
  > = [];

  const processedDestIndices = new Set<number>();

  dests.forEach((dest) => {
    if (processedDestIndices.has(dest.index)) return;

    if (dest.type === "analogue") {
      const pair = stereoPairs.find(
        (p) => p.linked && (p.left === dest.index || p.right === dest.index)
      );
      if (pair) {
        const leftDest = dests.find((d) => d.type === "analogue" && d.index === pair.left);
        const rightDest = dests.find((d) => d.type === "analogue" && d.index === pair.right);
        if (leftDest && rightDest) {
          groupedDests.push({
            isStereo: true,
            leftIndex: pair.left,
            rightIndex: pair.right,
            label: pair.name || `${leftDest.label} + ${rightDest.label}`,
            color: leftDest.color,
            type: "analogue",
          });
          processedDestIndices.add(pair.left);
          processedDestIndices.add(pair.right);
          return;
        }
      }
    }

    groupedDests.push({
      isStereo: false,
      index: dest.index,
      label: dest.label,
      color: dest.color,
      type: dest.type,
    });
    processedDestIndices.add(dest.index);
  });

  // Track which groups are collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const getSourcePeer = (src: PortDef): { isStereo: boolean; isLeft: boolean; peerIndex: number } => {
    if (src.type === "mix") {
      const isLeft = src.index % 2 === 0;
      const peerIndex = isLeft ? src.index + 1 : src.index - 1;
      return { isStereo: true, isLeft, peerIndex };
    }
    if (src.type === "pcm") {
      const isLeft = src.index % 2 === 0;
      const peerIndex = isLeft ? src.index + 1 : src.index - 1;
      return { isStereo: true, isLeft, peerIndex };
    }
    const linkedPair = inputStereoPairs.find(
      (p) => p.linked && p.input_type === src.type && (p.left === src.index || p.right === src.index)
    );
    if (linkedPair) {
      const isLeft = src.index === linkedPair.left;
      const peerIndex = isLeft ? linkedPair.right : linkedPair.left;
      return { isStereo: true, isLeft, peerIndex };
    }
    return { isStereo: false, isLeft: false, peerIndex: 0 };
  };

  const handleCellClick = (
    cellDest:
      | { isStereo: false; index: number; label: string }
      | { isStereo: true; leftIndex: number; rightIndex: number; label: string },
    src: PortDef
  ) => {
    const active = cellDest.isStereo
      ? isActiveGrouped(cellDest, src)
      : (() => {
          const route = state.routing[cellDest.index];
          return route ? route.type === src.type && route.index === src.index : false;
        })();

    if (cellDest.isStereo) {
      const oldRouteL = state.routing[cellDest.leftIndex] || { type: "off", index: 0 };
      const oldRouteR = state.routing[cellDest.rightIndex] || { type: "off", index: 0 };

      const undoMsg: ClientMessage = {
        type: "set_routes_batch",
        payload: {
          routes: [
            {
              destination: cellDest.leftIndex,
              source_type: oldRouteL.type as PortType,
              source_index: oldRouteL.index,
            },
            {
              destination: cellDest.rightIndex,
              source_type: oldRouteR.type as PortType,
              source_index: oldRouteR.index,
            },
          ],
        },
      };

      if (active) {
        // Toggle off
        const redoMsg: ClientMessage = {
          type: "set_routes_batch",
          payload: {
            routes: [
              {
                destination: cellDest.leftIndex,
                source_type: "off",
                source_index: 0,
              },
              {
                destination: cellDest.rightIndex,
                source_type: "off",
                source_index: 0,
              },
            ],
          },
        };
        sendCommand(redoMsg, {
          undo: undoMsg,
          description: `Disconnect ${src.label} from ${cellDest.label}`,
        });
      } else {
        // Route on
        const peerInfo = getSourcePeer(src);
        const leftSrcIdx = peerInfo.isStereo ? (peerInfo.isLeft ? src.index : peerInfo.peerIndex) : src.index;
        const rightSrcIdx = peerInfo.isStereo ? (peerInfo.isLeft ? peerInfo.peerIndex : src.index) : src.index;

        const redoMsg: ClientMessage = {
          type: "set_routes_batch",
          payload: {
            routes: [
              {
                destination: cellDest.leftIndex,
                source_type: src.type,
                source_index: leftSrcIdx,
              },
              {
                destination: cellDest.rightIndex,
                source_type: src.type,
                source_index: rightSrcIdx,
              },
            ],
          },
        };
        sendCommand(redoMsg, {
          undo: undoMsg,
          description: `Route ${src.label} to ${cellDest.label}`,
        });
      }
    } else {
      const oldRoute = state.routing[cellDest.index] || { type: "off", index: 0 };
      const undoMsg: ClientMessage = {
        type: "set_route",
        payload: {
          destination: cellDest.index,
          source_type: oldRoute.type as PortType,
          source_index: oldRoute.index,
        },
      };

      if (active) {
        // Toggle off
        const redoMsg: ClientMessage = {
          type: "set_route",
          payload: {
            destination: cellDest.index,
            source_type: "off",
            source_index: 0,
          },
        };
        sendCommand(redoMsg, {
          undo: undoMsg,
          description: `Disconnect ${src.label} from ${cellDest.label}`,
        });
      } else {
        // Route on
        const redoMsg: ClientMessage = {
          type: "set_route",
          payload: {
            destination: cellDest.index,
            source_type: src.type,
            source_index: src.index,
          },
        };
        sendCommand(redoMsg, {
          undo: undoMsg,
          description: `Route ${src.label} to ${cellDest.label}`,
        });
      }
    }
  };

  const handleDirect = () => {
    const undoMsg: ClientMessage = {
      type: "set_routes_batch",
      payload: {
        routes: dests.map((dest) => {
          const oldRoute = state.routing[dest.index] || { type: "off", index: 0 };
          return {
            destination: dest.index,
            source_type: oldRoute.type as PortType,
            source_index: oldRoute.index,
          };
        }),
      },
    };
    const redoMsg: ClientMessage = {
      type: "set_routes_batch",
      payload: {
        routes: dests.map((dest, i) => ({
          destination: dest.index,
          source_type: "pcm" as const,
          source_index: i,
        })),
      },
    };
    sendCommand(redoMsg, {
      undo: undoMsg,
      description: "Route Direct (1:1)",
    });
  };

  const handleClearAll = () => {
    const undoMsg: ClientMessage = {
      type: "set_routes_batch",
      payload: {
        routes: dests.map((dest) => {
          const oldRoute = state.routing[dest.index] || { type: "off", index: 0 };
          return {
            destination: dest.index,
            source_type: oldRoute.type as PortType,
            source_index: oldRoute.index,
          };
        }),
      },
    };
    const redoMsg: ClientMessage = {
      type: "set_routes_batch",
      payload: {
        routes: dests.map((dest) => ({
          destination: dest.index,
          source_type: "off" as const,
          source_index: 0,
        })),
      },
    };
    sendCommand(redoMsg, {
      undo: undoMsg,
      description: "Clear All routing",
    });
  };

  const isActiveGrouped = (
    cellDest:
      | { isStereo: false; index: number }
      | { isStereo: true; leftIndex: number; rightIndex: number },
    src: PortDef
  ): boolean => {
    if (cellDest.isStereo) {
      const peerInfo = getSourcePeer(src);
      if (peerInfo.isStereo) {
        const leftSrcIdx = peerInfo.isLeft ? src.index : peerInfo.peerIndex;
        const rightSrcIdx = peerInfo.isLeft ? peerInfo.peerIndex : src.index;
        const routeL = state.routing[cellDest.leftIndex];
        const routeR = state.routing[cellDest.rightIndex];
        return !!(
          routeL &&
          routeL.type === src.type &&
          routeL.index === leftSrcIdx &&
          routeR &&
          routeR.type === src.type &&
          routeR.index === rightSrcIdx
        );
      } else {
        const routeL = state.routing[cellDest.leftIndex];
        const routeR = state.routing[cellDest.rightIndex];
        return !!(
          routeL &&
          routeL.type === src.type &&
          routeL.index === src.index &&
          routeR &&
          routeR.type === src.type &&
          routeR.index === src.index
        );
      }
    } else {
      const route = state.routing[cellDest.index];
      if (!route) return false;
      return route.type === src.type && route.index === src.index;
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-neutral-300 font-medium">
          Source &rarr; Output ({groupedDests.length} columns)
        </h3>
        <div className="flex gap-2">
          <button onClick={handleDirect} className="text-[10px] px-2 py-1 bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600">
            Direct (1:1)
          </button>
          <button onClick={handleClearAll} className="text-[10px] px-2 py-1 bg-red-900 text-red-300 rounded hover:bg-red-800">
            Clear All
          </button>
        </div>
      </div>

      <div className="text-[9px] text-neutral-600 mb-2">
        Rows = signal sources &rarr; Columns = output destinations. Click to route. Click group headers to collapse.
      </div>

      <div className="overflow-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="min-w-[110px]" />
              {groupedDests.map((dest, di) => (
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
            {sourceGroups.map((group) => {
              const isCollapsed = collapsed.has(group.label);
              const isCollapsible = group.sources.length > 1 && group.label !== "";

              return (
                <GroupRows
                  key={group.label || "off"}
                  group={group}
                  groupedDests={groupedDests}
                  isCollapsed={isCollapsed}
                  isCollapsible={isCollapsible}
                  onToggle={() => toggleGroup(group.label)}
                  isActive={isActiveGrouped}
                  onCellClick={handleCellClick}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  groupedDests,
  isCollapsed,
  isCollapsible,
  onToggle,
  isActive,
  onCellClick,
}: {
  group: SourceGroup;
  groupedDests: Array<
    | { isStereo: false; index: number; label: string; color: string; type: string }
    | { isStereo: true; leftIndex: number; rightIndex: number; label: string; color: string; type: string }
  >;
  isCollapsed: boolean;
  isCollapsible: boolean;
  onToggle: () => void;
  isActive: (
    cellDest:
      | { isStereo: false; index: number; label: string }
      | { isStereo: true; leftIndex: number; rightIndex: number; label: string },
    source: PortDef
  ) => boolean;
  onCellClick: (
    cellDest:
      | { isStereo: false; index: number; label: string }
      | { isStereo: true; leftIndex: number; rightIndex: number; label: string },
    source: PortDef
  ) => void;
}) {
  return (
    <>
      {/* Group header row (clickable to collapse) */}
      {isCollapsible && (
        <tr>
          <td
            colSpan={groupedDests.length + 1}
            className="pt-2 pb-0.5 cursor-pointer select-none"
            onClick={onToggle}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] text-neutral-600">{isCollapsed ? "▶" : "▼"}</span>
              <div className={`w-2 h-2 rounded-full ${group.color}`} />
              <span className="text-[9px] text-neutral-500 uppercase tracking-wider font-medium">
                {group.label}
              </span>
              <span className="text-[8px] text-neutral-600">({group.sources.length})</span>
            </div>
          </td>
        </tr>
      )}
      {/* Source rows (hidden when collapsed) */}
      {(!isCollapsed || !isCollapsible) && group.sources.map((src) => (
        <tr key={`${src.type}-${src.index}`}>
          <td className="pr-1.5 py-0.5">
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${src.color} flex-shrink-0`} />
              <span className="text-[7px] text-neutral-400 font-mono whitespace-nowrap">
                {src.label}
              </span>
            </div>
          </td>
          {groupedDests.map((dest, di) => (
            <td key={di} className="px-0.5 py-0.5">
              <RouteCell
                active={isActive(dest, src)}
                sourceColor={src.color}
                onClick={() => onCellClick(dest, src)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
