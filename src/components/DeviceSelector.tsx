import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DeviceSelectorProps {
  onDeviceSwitch: () => void;
}

export default function DeviceSelector({ onDeviceSwitch }: DeviceSelectorProps) {
  const [devices, setDevices] = useState<[number, string][]>([]);
  const [currentPid, setCurrentPid] = useState(0x8215);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    invoke<[number, string][]>("list_mock_devices")
      .then(setDevices)
      .catch(() => {});
  }, []);

  const handleSwitch = async (pid: number) => {
    setSwitching(true);
    try {
      await invoke("switch_mock_device", { pid });
      setCurrentPid(pid);
      onDeviceSwitch();
    } catch (e) {
      console.error("Failed to switch device:", e);
    } finally {
      setSwitching(false);
    }
  };

  if (devices.length === 0) return null;

  // Group by series
  const gen2 = devices.filter(([, name]) => name.includes("Gen 2"));
  const gen3 = devices.filter(([, name]) => name.includes("Gen 3"));
  const clarett = devices.filter(([, name]) => name.includes("Clarett"));

  return (
    <div className="flex items-center gap-2">
      <select
        value={currentPid}
        onChange={(e) => handleSwitch(Number(e.target.value))}
        disabled={switching}
        className="text-xs bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-neutral-300"
      >
        <optgroup label="Scarlett Gen 3">
          {gen3.map(([pid, name]) => (
            <option key={pid} value={pid}>{name}</option>
          ))}
        </optgroup>
        <optgroup label="Scarlett Gen 2">
          {gen2.map(([pid, name]) => (
            <option key={pid} value={pid}>{name}</option>
          ))}
        </optgroup>
        <optgroup label="Clarett">
          {clarett.map(([pid, name]) => (
            <option key={pid} value={pid}>{name}</option>
          ))}
        </optgroup>
      </select>
      {switching && <span className="text-[9px] text-neutral-500">Switching...</span>}
    </div>
  );
}
