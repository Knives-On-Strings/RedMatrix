import { useEffect, useState } from "react";
import type { DeviceState } from "../../types";
import LedStrip from "./overview/LedStrip";
import InputMeters from "./overview/InputMeters";
import OutputLevels from "./overview/OutputLevels";
import StatusWidgets from "./overview/StatusWidgets";

// Mock state until transport is wired up
import { mockDeviceState } from "./overview/mockState";

export default function Overview() {
  const [state, setState] = useState<DeviceState | null>(null);

  useEffect(() => {
    // TODO: Replace with transport.getState() when IPC is connected
    setState(mockDeviceState());
  }, []);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <span>Connecting to device...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 h-full overflow-y-auto">
      <LedStrip state={state} />

      <div>
        <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-2 px-4">Inputs</h3>
        <InputMeters state={state} />
      </div>

      <OutputLevels state={state} />

      <StatusWidgets state={state} />
    </div>
  );
}
