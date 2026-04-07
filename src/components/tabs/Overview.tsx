import { useDevice } from "../../hooks/useDevice";
import LedStrip from "./overview/LedStrip";
import InputMeters from "./overview/InputMeters";
import OutputLevels from "./overview/OutputLevels";
import StatusWidgets from "./overview/StatusWidgets";

export default function Overview() {
  const { state, loading, error } = useDevice();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <span>Connecting to device...</span>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <span>{error ?? "No device connected"}</span>
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
