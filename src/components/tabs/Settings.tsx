import { useState } from "react";
import { useDevice } from "../../hooks/useDevice";
import { THEMES, applyTheme, type Theme } from "../../themes";
import type { ClockSource } from "../../types";

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0">
      <span className="text-sm text-neutral-300">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-2">{title}</h3>
      <div className="bg-neutral-800/30 rounded-lg px-4 py-1">{children}</div>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${ok ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
      {label}
    </span>
  );
}

function ThemeCard({ theme, isActive, onSelect }: { theme: Theme; isActive: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors ${
        isActive
          ? "border-red-400 bg-neutral-800"
          : "border-neutral-700 bg-neutral-800/30 hover:border-neutral-500"
      }`}
    >
      {/* Color preview swatches */}
      <div className="flex gap-0.5">
        <div className="w-4 h-4 rounded-sm" style={{ background: theme.colors["bg-app"] }} />
        <div className="w-4 h-4 rounded-sm" style={{ background: theme.colors["bg-surface"] }} />
        <div className="w-4 h-4 rounded-sm" style={{ background: theme.colors["accent"] }} />
        <div className="w-4 h-4 rounded-sm" style={{ background: theme.colors["meter-green"] }} />
        <div className="w-4 h-4 rounded-sm" style={{ background: theme.colors["port-analogue"] }} />
      </div>
      <span className={`text-[10px] ${isActive ? "text-neutral-200" : "text-neutral-400"}`}>
        {theme.name}
      </span>
    </button>
  );
}

export default function Settings() {
  const { state, loading, sendCommand } = useDevice();
  const [activeTheme, setActiveTheme] = useState("dark");

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <span>Connecting...</span>
      </div>
    );
  }

  const handleThemeChange = (themeId: string) => {
    const theme = THEMES[themeId];
    if (theme) {
      applyTheme(theme);
      setActiveTheme(themeId);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 max-w-4xl">
        {/* Left column */}
        <div>
          <SettingGroup title="Audio">
            <SettingRow label="Sample Rate">
              <select
                value={state.sample_rate}
                onChange={(e) => sendCommand({ type: "set_sample_rate", payload: { rate: Number(e.target.value) } })}
                className="bg-neutral-700 text-sm text-neutral-300 border border-neutral-600 rounded px-2 py-1"
              >
                <option value="44100">44.1 kHz</option>
                <option value="48000">48 kHz</option>
                <option value="88200">88.2 kHz</option>
                <option value="96000">96 kHz</option>
                <option value="176400">176.4 kHz</option>
                <option value="192000">192 kHz</option>
              </select>
            </SettingRow>

            <SettingRow label="Clock Source">
              <select
                value={state.clock_source}
                onChange={(e) => sendCommand({ type: "set_clock_source", payload: { source: e.target.value as ClockSource } })}
                className="bg-neutral-700 text-sm text-neutral-300 border border-neutral-600 rounded px-2 py-1"
              >
                <option value="internal">Internal</option>
                <option value="spdif">S/PDIF</option>
                <option value="adat">ADAT</option>
              </select>
            </SettingRow>

            <SettingRow label="Sync Status">
              <StatusBadge ok={state.sync_status === "locked"} label={state.sync_status === "locked" ? "Locked" : "Unlocked"} />
            </SettingRow>

            <SettingRow label="Digital I/O Mode">
              <select
                value={state.spdif_mode}
                onChange={(e) => sendCommand({ type: "set_spdif_mode", payload: { mode: e.target.value } })}
                className="bg-neutral-700 text-sm text-neutral-300 border border-neutral-600 rounded px-2 py-1"
              >
                <option value="spdif_rca">S/PDIF RCA</option>
                <option value="spdif_optical">S/PDIF Optical</option>
                <option value="dual_adat">Dual ADAT</option>
              </select>
            </SettingRow>
          </SettingGroup>

          <SettingGroup title="Monitor">
            <SettingRow label="Speaker Switching">
              <StatusBadge
                ok={state.features.has_speaker_switching}
                label={state.features.has_speaker_switching ? "Available" : "Not available"}
              />
            </SettingRow>
            <SettingRow label="Talkback">
              <StatusBadge
                ok={state.features.has_talkback}
                label={state.features.has_talkback ? "Available" : "Not available"}
              />
            </SettingRow>
          </SettingGroup>

          <SettingGroup title="Hardware Config">
            <SettingRow label="Save to Device">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-neutral-500">
                  {state.save_config_remaining}/12 remaining
                </span>
                <button
                  onClick={() => sendCommand({ type: "save_config", payload: {} })}
                  className="text-xs px-3 py-1 bg-amber-700 text-amber-100 rounded hover:bg-amber-600"
                >
                  Save
                </button>
              </div>
            </SettingRow>
            <div className="py-2">
              <p className="text-[10px] text-neutral-600 leading-relaxed">
                Saves to flash memory. Settings persist when unplugged.
                Flash has limited write cycles — use sparingly.
              </p>
            </div>
          </SettingGroup>
        </div>

        {/* Right column */}
        <div>
          <SettingGroup title="Appearance">
            <div className="py-3">
              <div className="flex flex-wrap gap-2">
                {Object.values(THEMES).map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    isActive={activeTheme === theme.id}
                    onSelect={() => handleThemeChange(theme.id)}
                  />
                ))}
              </div>
            </div>
          </SettingGroup>

          <SettingGroup title="Device Info">
            <SettingRow label="Device">
              <span className="text-sm text-neutral-400">{state.device.name}</span>
            </SettingRow>
            <SettingRow label="Series">
              <span className="text-sm text-neutral-400">{state.device.series}</span>
            </SettingRow>
            <SettingRow label="Firmware">
              <span className="text-sm text-neutral-400 font-mono">{state.device.firmware_version}</span>
            </SettingRow>
            <SettingRow label="Serial">
              <span className="text-sm text-neutral-400 font-mono">{state.device.serial}</span>
            </SettingRow>
            <SettingRow label="USB PID">
              <span className="text-sm text-neutral-400 font-mono">{state.device.pid}</span>
            </SettingRow>
          </SettingGroup>

          <SettingGroup title="Remote Control">
            <SettingRow label="WebSocket Server">
              <StatusBadge ok={true} label="Running on :18120" />
            </SettingRow>
            <SettingRow label="Paired Devices">
              <span className="text-sm text-neutral-400">0 devices</span>
            </SettingRow>
            <SettingRow label="Connected Clients">
              <span className="text-sm text-neutral-400">0</span>
            </SettingRow>
          </SettingGroup>
        </div>
      </div>
    </div>
  );
}
