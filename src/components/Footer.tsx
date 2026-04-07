import { useDevice } from "../hooks/useDevice";

export default function Footer() {
  const { state } = useDevice();

  const deviceInfo = state
    ? `${state.device.name} · FW ${state.device.firmware_version} · ${state.sample_rate / 1000}kHz · ${state.sync_status === "locked" ? "Locked" : "Unlocked"}`
    : "Not connected";

  const portSummary = state
    ? `${state.inputs.length} in · ${state.outputs.length} out · ${state.port_counts.mix.outputs} buses`
    : "";

  return (
    <footer className="flex items-center justify-between px-4 py-1.5 bg-neutral-800 border-t border-neutral-700 text-[10px] text-neutral-500">
      <span>{deviceInfo}</span>
      <span>{portSummary}</span>
      <span>RedMatrix v0.1.0-dev</span>
    </footer>
  );
}
