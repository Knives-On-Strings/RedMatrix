import type { DeviceState, PortType } from "../types";
import { PORT_COLORS, busLabel } from "../constants";

export interface PortDef {
  type: PortType;
  index: number;
  label: string;
  color: string;
}

export function buildSourceList(state: DeviceState): PortDef[] {
  const sources: PortDef[] = [];

  for (let i = 0; i < state.port_counts.pcm.outputs; i++) {
    sources.push({ type: "pcm", index: i, label: `DAW Out ${i + 1}`, color: PORT_COLORS.pcm });
  }
  for (let i = 0; i < state.port_counts.analogue.inputs; i++) {
    sources.push({ type: "analogue", index: i, label: `Analogue In ${i + 1}`, color: PORT_COLORS.analogue });
  }
  for (let i = 0; i < state.port_counts.spdif.inputs; i++) {
    sources.push({ type: "spdif", index: i, label: `S/PDIF In ${i === 0 ? "L" : "R"}`, color: PORT_COLORS.spdif });
  }
  for (let i = 0; i < state.port_counts.adat.inputs; i++) {
    sources.push({ type: "adat", index: i, label: `ADAT In ${i + 1}`, color: PORT_COLORS.adat });
  }
  for (let i = 0; i < state.port_counts.mix.outputs; i++) {
    sources.push({ type: "mix", index: i, label: `Mix ${busLabel(i)}`, color: PORT_COLORS.mix });
  }
  sources.push({ type: "off", index: 0, label: "Off", color: PORT_COLORS.off });

  return sources;
}

export function buildDestList(state: DeviceState): PortDef[] {
  const dests: PortDef[] = [];
  let idx = 0;

  for (let i = 0; i < state.port_counts.analogue.outputs; i++) {
    const name = state.outputs[i]?.name ?? `Analogue Out ${i + 1}`;
    dests.push({ type: "analogue", index: idx++, label: name, color: PORT_COLORS.analogue });
  }
  for (let i = 0; i < state.port_counts.spdif.outputs; i++) {
    dests.push({ type: "spdif", index: idx++, label: `S/PDIF Out ${i === 0 ? "L" : "R"}`, color: PORT_COLORS.spdif });
  }
  for (let i = 0; i < state.port_counts.adat.outputs; i++) {
    dests.push({ type: "adat", index: idx++, label: `ADAT Out ${i + 1}`, color: PORT_COLORS.adat });
  }
  for (let i = 0; i < state.port_counts.pcm.inputs; i++) {
    dests.push({ type: "pcm", index: idx++, label: `DAW In ${i + 1}`, color: PORT_COLORS.pcm });
  }

  return dests;
}
