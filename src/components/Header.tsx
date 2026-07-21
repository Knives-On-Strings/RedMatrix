import { useState } from "react";
import DeviceSelector from "./DeviceSelector";
import { useDevice } from "../hooks/useDevice";
import { formatDb } from "../constants";

interface HeaderProps {
  onSettingsClick: () => void;
  onAboutClick: () => void;
  onDeviceSwitch: () => void;
  isSettingsActive?: boolean;
}

export default function Header({ onSettingsClick, onAboutClick, onDeviceSwitch, isSettingsActive }: HeaderProps) {
  const { state, sendCommand, undo, redo, canUndo, canRedo, undoActionDescription, redoActionDescription } = useDevice();
  const [dragStartVol, setDragStartVol] = useState<number | null>(null);

  const dim = state?.monitor.dim ?? false;
  const mute = state?.monitor.mute ?? false;
  const talkback = state?.monitor.talkback ?? false;
  const speakerMode = state?.monitor.speaker_switching ?? "main";
  const masterVolumeDb = state?.monitor.master_volume_db ?? 0;
  const hasTalkback = state?.features.has_talkback ?? false;
  const hasSpeakerSwitching = state?.features.has_speaker_switching ?? false;

  const isUsb = state?.device.is_usb ?? false;

  const handleStart = () => {
    setDragStartVol(masterVolumeDb);
  };

  const handleEnd = () => {
    if (dragStartVol !== null && dragStartVol !== masterVolumeDb) {
      sendCommand(
        { type: "set_master_volume", payload: { db: masterVolumeDb } },
        { undo: { type: "set_master_volume", payload: { db: dragStartVol } }, description: "Adjust monitor volume" }
      );
    }
    setDragStartVol(null);
  };

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700">
      {/* Left: logo + connection + device selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tracking-widest text-red-400 uppercase">RedMatrix</span>
        <div className="w-px h-4 bg-neutral-700" />
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isUsb ? "bg-green-500" : "bg-amber-500"}`} />
          <span className={`text-[10px] ${isUsb ? "text-green-400" : "text-amber-400"} font-bold uppercase`}>
            {isUsb ? "USB" : "Mock"}
          </span>
        </div>
        <DeviceSelector onDeviceSwitch={onDeviceSwitch} />
      </div>

      {/* Center: monitor buttons */}
      <div className="flex items-center gap-2">
        {hasTalkback && (
          <button
            onClick={() => sendCommand(
              { type: "set_talkback", payload: { enabled: !talkback } },
              { undo: { type: "set_talkback", payload: { enabled: talkback } }, description: `${talkback ? "Deactivate" : "Activate"} Talkback` }
            )}
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
            onClick={() => sendCommand(
              { type: "set_speaker_switching", payload: { mode: speakerMode === "main" ? "alt" : "main" } },
              { undo: { type: "set_speaker_switching", payload: { mode: speakerMode } }, description: `Switch speaker to ${speakerMode === "main" ? "ALT" : "MAIN"}` }
            )}
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
          onClick={() => sendCommand(
            { type: "set_dim", payload: { enabled: !dim } },
            { undo: { type: "set_dim", payload: { enabled: dim } }, description: `${dim ? "Disable" : "Enable"} DIM` }
          )}
          className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
            dim
              ? "bg-amber-500 text-black"
              : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
          }`}
        >
          DIM
        </button>
        <button
          onClick={() => sendCommand(
            { type: "set_mute", payload: { enabled: !mute } },
            { undo: { type: "set_mute", payload: { enabled: mute } }, description: `${mute ? "Unmute" : "Mute"} monitor` }
          )}
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
            onClick={() => sendCommand(
              { type: "set_master_volume", payload: { db: Math.max(-127, masterVolumeDb - 1) } },
              { undo: { type: "set_master_volume", payload: { db: masterVolumeDb } }, description: "Decrease monitor volume" }
            )}
            className="w-5 h-5 text-xs bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600"
          >
            −
          </button>
          <input
            type="range"
            min={0}
            max={127}
            value={masterVolumeDb + 127}
            onFocus={handleStart}
            onMouseDown={handleStart}
            onTouchStart={handleStart}
            onBlur={handleEnd}
            onMouseUp={handleEnd}
            onTouchEnd={handleEnd}
            onChange={(e) => sendCommand({ type: "set_master_volume", payload: { db: Number(e.target.value) - 127 } })}
            className="w-20 h-1.5 appearance-none cursor-pointer accent-neutral-400 bg-neutral-700 rounded-full"
          />
          <button
            onClick={() => sendCommand(
              { type: "set_master_volume", payload: { db: Math.min(0, masterVolumeDb + 1) } },
              { undo: { type: "set_master_volume", payload: { db: masterVolumeDb } }, description: "Increase monitor volume" }
            )}
            className="w-5 h-5 text-xs bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600"
          >
            +
          </button>
          <span className="text-sm text-neutral-300 font-mono w-14 text-right">{formatDb(masterVolumeDb)} dB</span>
        </div>

        <div className="w-px h-5 bg-neutral-700" />

        {/* Undo/Redo Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            title={undoActionDescription ? `Undo: ${undoActionDescription} (Ctrl+Z)` : "Undo (Ctrl+Z)"}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
              canUndo
                ? "bg-neutral-700 text-neutral-200 hover:bg-neutral-600 hover:text-white cursor-pointer"
                : "text-neutral-600 cursor-not-allowed opacity-50"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>

          <button
            onClick={redo}
            disabled={!canRedo}
            title={redoActionDescription ? `Redo: ${redoActionDescription} (Ctrl+Shift+Z)` : "Redo (Ctrl+Shift+Z)"}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
              canRedo
                ? "bg-neutral-700 text-neutral-200 hover:bg-neutral-600 hover:text-white cursor-pointer"
                : "text-neutral-600 cursor-not-allowed opacity-50"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
            </svg>
          </button>
        </div>

        <div className="w-px h-5 bg-neutral-700" />

        <button
          onClick={onSettingsClick}
          title="Settings"
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            isSettingsActive
              ? "bg-neutral-600 text-neutral-100"
              : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
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
