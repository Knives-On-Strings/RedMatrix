import { useState } from "react";
import { useDevice } from "../../hooks/useDevice";
import SubTabBar from "../SubTabBar";
import InputMatrix from "./input/InputMatrix";
import InputConfig from "./input/InputConfig";

const SUB_TABS = ["Matrix", "Config"] as const;

export default function Input() {
  const { state, loading } = useDevice();
  const [subTab, setSubTab] = useState<string>("Matrix");

  if (loading || !state) {
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
        {subTab === "Matrix" && <InputMatrix state={state} />}
        {subTab === "Config" && <InputConfig state={state} />}
      </div>
    </div>
  );
}
