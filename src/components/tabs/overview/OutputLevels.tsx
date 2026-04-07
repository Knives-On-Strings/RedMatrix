import type { DeviceState, OutputState } from "../../../types";

interface OutputLevelsProps {
  state: DeviceState;
}

function OutputRow({ output, isInactive }: { output: OutputState; isInactive: boolean }) {
  // Mock level bar (will be real meter data later)
  const level = output.muted ? 0 : 0.3 + Math.random() * 0.2;
  const width = Math.max(0, Math.min(100, level * 100));

  // Determine badges
  const badges: string[] = [];
  if (output.name.includes("Monitor 1")) badges.push("MAIN");
  if (output.name.includes("Monitor 2")) badges.push("ALT");

  return (
    <div className={`flex items-center gap-3 py-1.5 ${isInactive ? "opacity-40" : ""}`}>
      <span className="text-xs text-neutral-400 w-28 truncate">{output.name}</span>
      {badges.map((badge) => (
        <span
          key={badge}
          className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300 font-bold uppercase"
        >
          {badge}
        </span>
      ))}
      <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-75"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-[10px] text-neutral-500 w-12 text-right font-mono">
        {output.muted ? "MUTE" : `${output.volume_db.toFixed(0)} dB`}
      </span>
    </div>
  );
}

export default function OutputLevels({ state }: OutputLevelsProps) {
  const isAlt = state.monitor.speaker_switching === "alt";

  return (
    <div className="px-4">
      <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Outputs</h3>
      <div className="space-y-0.5">
        {state.outputs.map((output) => {
          // Dim MAIN outputs when ALT is active, and vice versa
          const isMainOutput = output.name.includes("Monitor 1");
          const isAltOutput = output.name.includes("Monitor 2");
          const isInactive = (isAlt && isMainOutput) || (!isAlt && isAltOutput);

          return (
            <OutputRow key={output.index} output={output} isInactive={isInactive} />
          );
        })}
      </div>
    </div>
  );
}
