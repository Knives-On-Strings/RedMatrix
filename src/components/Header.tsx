import DeviceSelector from "./DeviceSelector";
import { useDevice } from "../hooks/useDevice";
import { formatDb } from "../constants";

interface HeaderProps {
  onSettingsClick: () => void;
  onAboutClick: () => void;
  onDeviceSwitch: () => void;
}

export default function Header({ onSettingsClick, onAboutClick, onDeviceSwitch }: HeaderProps) {
  const { state, sendCommand } = useDevice();

  const dim = state?.monitor.dim ?? false;
  const mute = state?.monitor.mute ?? false;
  const talkback = state?.monitor.talkback ?? false;
  const speakerMode = state?.monitor.speaker_switching ?? "main";
  const masterVolumeDb = state?.monitor.master_volume_db ?? 0;
  const hasTalkback = state?.features.has_talkback ?? false;
  const hasSpeakerSwitching = state?.features.has_speaker_switching ?? false;

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700">
      {/* Left: logo + connection + device selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tracking-widest text-red-400 uppercase">RedMatrix</span>
        <div className="w-px h-4 bg-neutral-700" />
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-[10px] text-amber-400 font-bold uppercase">Mock</span>
        </div>
        <DeviceSelector onDeviceSwitch={onDeviceSwitch} />
      </div>

      {/* Center: monitor buttons */}
      <div className="flex items-center gap-2">
        {hasTalkback && (
          <button
            onClick={() => sendCommand({ type: "set_talkback", payload: { enabled: !talkback } })}
            className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
              talkback
                ? "bg-amber-500 text-black"
                : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
            }`}
          >
            TALK
          </button>
        )}
        {hasSpeakerSwitching && (
          <button
            onClick={() => sendCommand({ type: "set_speaker_switching", payload: { mode: speakerMode === "main" ? "alt" : "main" } })}
            className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
              speakerMode === "alt"
                ? "bg-blue-500 text-white"
                : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
            }`}
          >
            {speakerMode === "main" ? "MAIN" : "ALT"}
          </button>
        )}
        <button
          onClick={() => sendCommand({ type: "set_dim", payload: { enabled: !dim } })}
          className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
            dim
              ? "bg-amber-500 text-black"
              : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
          }`}
        >
          DIM
        </button>
        <button
          onClick={() => sendCommand({ type: "set_mute", payload: { enabled: !mute } })}
          className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
            mute
              ? "bg-red-600 text-white"
              : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
          }`}
        >
          MUTE
        </button>
      </div>

      {/* Right: volume control + settings/about */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">MON</span>
          <button
            onClick={() => sendCommand({ type: "set_master_volume", payload: { db: Math.max(-127, masterVolumeDb - 1) } })}
            className="w-5 h-5 text-xs bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600"
          >
            −
          </button>
          <input
            type="range"
            min={0}
            max={127}
            value={masterVolumeDb + 127}
            onChange={(e) => sendCommand({ type: "set_master_volume", payload: { db: Number(e.target.value) - 127 } })}
            className="w-20 h-1.5 appearance-none cursor-pointer accent-neutral-400 bg-neutral-700 rounded-full"
          />
          <button
            onClick={() => sendCommand({ type: "set_master_volume", payload: { db: Math.min(0, masterVolumeDb + 1) } })}
            className="w-5 h-5 text-xs bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600"
          >
            +
          </button>
          <span className="text-sm text-neutral-300 font-mono w-14 text-right">{formatDb(masterVolumeDb)} dB</span>
        </div>

        <div className="w-px h-5 bg-neutral-700" />

        <button
          onClick={onSettingsClick}
          title="Settings"
          className="w-8 h-8 flex items-center justify-center rounded bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
          </svg>
        </button>

        <button
          onClick={onAboutClick}
          title="About RedMatrix"
          className="w-8 h-8 flex items-center justify-center rounded bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 11V7.5M8 5.5V5" />
          </svg>
        </button>
      </div>
    </header>
  );
}
