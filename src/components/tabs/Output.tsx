import { useEffect, useState } from "react";
import type { DeviceState } from "../../types";
import { mockDeviceState } from "./overview/mockState";
import SubTabBar from "../SubTabBar";
import OutputMatrix from "./output/OutputMatrix";
import OutputConfig from "./output/OutputConfig";

const SUB_TABS = ["Matrix", "Config"] as const;

export default function Output() {
  const [state, setState] = useState<DeviceState | null>(null);
  const [subTab, setSubTab] = useState<string>("Matrix");

  useEffect(() => {
    setState(mockDeviceState());
  }, []);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        Connecting...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <SubTabBar tabs={SUB_TABS} activeTab={subTab} onTabChange={setSubTab} />
      <div className="flex-1 overflow-auto">
        {subTab === "Matrix" && <OutputMatrix state={state} />}
        {subTab === "Config" && <OutputConfig state={state} />}
      </div>
    </div>
  );
}
