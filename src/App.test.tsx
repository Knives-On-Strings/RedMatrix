import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Mock the Tauri invoke API so DeviceProvider doesn't try real IPC
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "list_mock_devices") {
      return Promise.resolve([
        [0x8215, "Scarlett 18i20 Gen 3"],
        [0x8211, "Scarlett Solo Gen 3"],
      ]);
    }
    if (cmd === "get_device_state") {
      return Promise.resolve({
        device: { name: "Scarlett 18i20 USB", pid: "0x8215", series: "Scarlett Gen 3", firmware_version: 1644, serial: "TEST" },
        sample_rate: 48000,
        sync_status: "locked",
        clock_source: "internal",
        spdif_mode: "spdif_rca",
        features: { has_mixer: true, has_speaker_switching: true, has_talkback: true, direct_monitor: 0 },
        meter_count: 65,
        save_config_remaining: 12,
        port_counts: {
          analogue: { inputs: 9, outputs: 10 },
          spdif: { inputs: 2, outputs: 2 },
          adat: { inputs: 8, outputs: 8 },
          mix: { inputs: 12, outputs: 25 },
          pcm: { inputs: 20, outputs: 20 },
        },
        monitor: { dim: false, mute: false, talkback: false, speaker_switching: "main", master_volume_db: 0 },
        outputs: Array.from({ length: 10 }, (_, i) => ({
          index: i, name: `Output ${i + 1}`, volume_db: 0, muted: false, hw_controlled: true,
        })),
        inputs: Array.from({ length: 9 }, (_, i) => ({
          index: i, name: `Analogue ${i + 1}`, type: "analogue", pad: false, air: false, phantom: false, inst: false,
        })),
        mixer: {
          gains: Array.from({ length: 25 }, () => Array.from({ length: 12 }, () => -80)),
          soloed: Array.from({ length: 25 }, () => Array.from({ length: 12 }, () => false)),
        },
        routing: Array.from({ length: 20 }, (_, i) => ({ type: "pcm", index: i })),
      });
    }
    if (cmd === "load_user_config") {
      return Promise.resolve({
        theme: "dark",
        labels: { inputs: {}, outputs: {}, pcm: {}, buses: {} },
        stereo_pairs: [],
        bus_names: {},
      });
    }
    return Promise.resolve(null);
  }),
}));

describe("App", () => {
  it("renders the header with mock indicator", () => {
    render(<App />);
    expect(screen.getByText("Mock")).toBeDefined();
  });

  it("renders all tab buttons", async () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    expect(nav).toBeDefined();
    const tabNames = ["Overview", "Mixer", "Input", "Output"];
    const buttons = screen.getAllByRole("button");
    for (const name of tabNames) {
      expect(buttons.some((b) => b.textContent === name)).toBe(true);
    }
  });

  it("shows loading state then content", async () => {
    render(<App />);
    // After the mock resolves, should show content
    const inputs = await screen.findByText("Inputs", {}, { timeout: 2000 });
    expect(inputs).toBeDefined();
  });

  it("renders the footer", () => {
    render(<App />);
    expect(screen.getByText("RedMatrix v0.1.0-dev")).toBeDefined();
  });
});
