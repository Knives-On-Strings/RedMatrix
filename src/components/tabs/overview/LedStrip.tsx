import type { DeviceState } from "../../../types";

interface LedStripProps {
  state: DeviceState;
}

function Led({ label, active, color = "green" }: { label: string; active: boolean; color?: string }) {
  const colorClasses = {
    green: active ? "bg-green-500 shadow-green-500/50" : "bg-neutral-700",
    red: active ? "bg-red-500 shadow-red-500/50" : "bg-neutral-700",
    amber: active ? "bg-amber-400 shadow-amber-400/50" : "bg-neutral-700",
  }[color] ?? "bg-neutral-700";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-2.5 h-2.5 rounded-full ${colorClasses} ${active ? "shadow-sm" : ""}`} />
      <span className="text-[9px] text-neutral-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function LedStrip({ state }: LedStripProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-neutral-800/50 rounded-lg">
      {/* Status LEDs */}
      <div className="flex gap-3">
        <Led label="USB" active={true} color="green" />
        <Led label="Lock" active={state.sync_status === "locked"} color="green" />
        <Led label="MIDI" active={false} color="green" />
      </div>

      <div className="w-px h-6 bg-neutral-700" />

      {/* Phantom power */}
      <div className="flex gap-3">
        <Led label="48V 1-4" active={state.inputs.slice(0, 4).some((i) => i.phantom)} color="red" />
        <Led label="48V 5-8" active={state.inputs.slice(4, 8).some((i) => i.phantom)} color="red" />
      </div>

      <div className="w-px h-6 bg-neutral-700" />

      {/* Input feature LEDs */}
      <div className="flex gap-2">
        {state.inputs.slice(0, 2).map((input, i) => (
          <Led key={`inst-${i}`} label={`INST ${i + 1}`} active={input.inst} color="amber" />
        ))}
      </div>

      <div className="w-px h-6 bg-neutral-700" />

      {/* Monitor LEDs */}
      <div className="flex gap-3">
        <Led label="TALK" active={state.monitor.talkback} color="amber" />
        <Led label="ALT" active={state.monitor.speaker_switching === "alt"} color="amber" />
        <Led label="DIM" active={state.monitor.dim} color="amber" />
        <Led label="MUTE" active={state.monitor.mute} color="red" />
      </div>
    </div>
  );
}
