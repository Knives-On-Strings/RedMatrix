import type { DeviceState } from "../../../types";

interface StatusWidgetsProps {
  state: DeviceState;
}

function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-800/50 rounded-lg px-4 py-3 flex-1 min-w-[140px]">
      <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  );
}

function StatusDot({ active, label, color = "green" }: { active: boolean; label: string; color?: string }) {
  const dotColor = active
    ? { green: "bg-green-500", red: "bg-red-500", amber: "bg-amber-400" }[color] ?? "bg-green-500"
    : "bg-neutral-600";

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${dotColor}`} />
      <span className="text-xs text-neutral-300">{label}</span>
    </div>
  );
}

export default function StatusWidgets({ state }: StatusWidgetsProps) {
  return (
    <div className="flex gap-3 px-4">
      <Widget title="Speakers">
        <StatusDot
          active={state.monitor.speaker_switching === "main"}
          label="MAIN (1/2)"
          color="green"
        />
        <StatusDot
          active={state.monitor.speaker_switching === "alt"}
          label="ALT (3/4)"
          color="amber"
        />
      </Widget>

      <Widget title="Phantom Power">
        <StatusDot
          active={state.inputs.slice(0, 4).some((i) => i.phantom)}
          label="48V 1-4"
          color="red"
        />
        <StatusDot
          active={state.inputs.slice(4, 8).some((i) => i.phantom)}
          label="48V 5-8"
          color="red"
        />
      </Widget>

      <Widget title="Talkback">
        <StatusDot
          active={state.monitor.talkback}
          label={state.monitor.talkback ? "Active" : "Off"}
          color="amber"
        />
        <span className="text-[10px] text-neutral-500 mt-1 block">Route: HP 1 + HP 2</span>
      </Widget>

      <Widget title="Clock">
        <StatusDot
          active={state.sync_status === "locked"}
          label={`${state.sync_status === "locked" ? "Locked" : "Unlocked"}`}
          color={state.sync_status === "locked" ? "green" : "red"}
        />
        <span className="text-[10px] text-neutral-500 mt-1 block">
          {state.clock_source} / {state.sample_rate / 1000}kHz
        </span>
      </Widget>
    </div>
  );
}
