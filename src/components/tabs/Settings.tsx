import { useEffect, useState } from "react";
import type { DeviceState } from "../../types";
import { mockDeviceState } from "./overview/mockState";

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-neutral-800">
      <span className="text-sm text-neutral-300">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
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

export default function Settings() {
  const [state, setState] = useState<DeviceState | null>(null);

  useEffect(() => {
    setState(mockDeviceState());
  }, []);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <span>Connecting...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 max-w-2xl">
      <SettingGroup title="Audio">
        <SettingRow label="Sample Rate">
          <select className="bg-neutral-700 text-sm text-neutral-300 border border-neutral-600 rounded px-2 py-1">
            <option value="44100">44.1 kHz</option>
            <option value="48000" selected>48 kHz</option>
            <option value="88200">88.2 kHz</option>
            <option value="96000">96 kHz</option>
            <option value="176400">176.4 kHz</option>
            <option value="192000">192 kHz</option>
          </select>
        </SettingRow>

        <SettingRow label="Clock Source">
          <select className="bg-neutral-700 text-sm text-neutral-300 border border-neutral-600 rounded px-2 py-1">
            <option value="internal">Internal</option>
            <option value="spdif">S/PDIF</option>
            <option value="adat">ADAT</option>
          </select>
        </SettingRow>

        <SettingRow label="Sync Status">
          <StatusBadge ok={state.sync_status === "locked"} label={state.sync_status === "locked" ? "Locked" : "Unlocked"} />
        </SettingRow>

        <SettingRow label="Digital I/O Mode">
          <select className="bg-neutral-700 text-sm text-neutral-300 border border-neutral-600 rounded px-2 py-1">
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

      <SettingGroup title="Stereo Pairs">
        {[
          { left: 0, right: 1, name: "Monitor 1 (MAIN)" },
          { left: 2, right: 3, name: "Monitor 2 (ALT)" },
          { left: 4, right: 5, name: "Line 5-6" },
          { left: 6, right: 7, name: "Headphones 1" },
          { left: 8, right: 9, name: "Headphones 2" },
        ].map((pair) => (
          <SettingRow key={pair.left} label={pair.name}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 font-mono">
                Out {pair.left + 1}/{pair.right + 1}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-900 text-green-300">
                Linked
              </span>
            </div>
          </SettingRow>
        ))}
        <div className="py-2">
          <p className="text-[10px] text-neutral-600 leading-relaxed">
            Linked outputs share a single fader in the Mixer and appear as one stereo
            destination in the Patchbay. Unlink to control L and R independently.
          </p>
        </div>
      </SettingGroup>

      <SettingGroup title="Device">
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

      <SettingGroup title="Hardware Config">
        <SettingRow label="Save to Device">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-500">
              {state.save_config_remaining}/12 saves remaining
            </span>
            <button className="text-xs px-3 py-1 bg-amber-700 text-amber-100 rounded hover:bg-amber-600">
              Save Config
            </button>
          </div>
        </SettingRow>
        <div className="py-2">
          <p className="text-[10px] text-neutral-600 leading-relaxed">
            Saves current settings to the device's flash memory. Settings persist when
            unplugged. Flash has limited write cycles — use sparingly.
          </p>
        </div>
      </SettingGroup>
    </div>
  );
}
