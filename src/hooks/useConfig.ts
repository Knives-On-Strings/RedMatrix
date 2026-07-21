/**
 * Config persistence — load and save user config via Tauri IPC.
 *
 * Config files are stored at ~/knivesonstrings/redmatrix/device_{serial}.json.
 * Each device gets its own config file keyed by serial number.
 */

import { invoke } from "@tauri-apps/api/core";

export interface UserConfig {
  theme: string;
  labels: {
    inputs: Record<string, string>;
    outputs: Record<string, string>;
    pcm: Record<string, string>;
    buses: Record<string, string>;
  };
  stereo_pairs: Array<{
    left: number;
    right: number;
    name: string;
    linked: boolean;
  }>;
  input_stereo_pairs: Array<{
    left: number;
    right: number;
    name: string;
    linked: boolean;
    input_type: string;  // "analogue", "spdif", "adat"
  }>;
  bus_names: Record<string, string>;
  sub_assignments: number[];
  bus_masters: number[];
  master_db: number;
}

export const DEFAULT_CONFIG: UserConfig = {
  theme: "dark",
  labels: { inputs: {}, outputs: {}, pcm: {}, buses: {} },
  stereo_pairs: [],
  input_stereo_pairs: [],
  bus_names: {},
  sub_assignments: [0, 1, 2, 3],
  bus_masters: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  master_db: 0,
};

/** Load config for a device. Returns defaults if no saved config exists. */
export async function loadConfig(serial: string): Promise<UserConfig> {
  try {
    return await invoke<UserConfig>("load_user_config", { serial });
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Save config for a device. Creates the config dir if needed. */
export async function saveConfig(
  serial: string,
  config: UserConfig,
): Promise<void> {
  await invoke("save_user_config", { serial, configData: config });
}
