import type { DeviceState, PortType } from "../types";
import { PORT_COLORS, busLabel } from "../constants";

export interface PortDef {
  type: PortType;
  index: number;
  label: string;
  color: string;
}

export interface SourceGroup {
  label: string;
  color: string;
  sources: PortDef[];
}

export function buildSourceGroups(state: DeviceState): SourceGroup[] {
  const groups: SourceGroup[] = [];

  // Off at the top
  groups.push({ label: "", color: PORT_COLORS.off, sources: [
    { type: "off", index: 0, label: "Off", color: PORT_COLORS.off },
  ]});

  // PCM
  const pcm: PortDef[] = [];
  for (let i = 0; i < state.port_counts.pcm.outputs; i++) {
    pcm.push({ type: "pcm", index: i, label: `DAW Out ${i + 1}`, color: PORT_COLORS.pcm });
  }
  if (pcm.length > 0) groups.push({ label: "PCM from DAW", color: PORT_COLORS.pcm, sources: pcm });

  // Analogue
  const analogue: PortDef[] = [];
  for (let i = 0; i < state.port_counts.analogue.inputs; i++) {
    analogue.push({ type: "analogue", index: i, label: `Analogue In ${i + 1}`, color: PORT_COLORS.analogue });
  }
  if (analogue.length > 0) groups.push({ label: "Analogue In", color: PORT_COLORS.analogue, sources: analogue });

  // S/PDIF
  const spdif: PortDef[] = [];
  for (let i = 0; i < state.port_counts.spdif.inputs; i++) {
    spdif.push({ type: "spdif", index: i, label: `S/PDIF In ${i === 0 ? "L" : "R"}`, color: PORT_COLORS.spdif });
  }
  if (spdif.length > 0) groups.push({ label: "S/PDIF In", color: PORT_COLORS.spdif, sources: spdif });

  // ADAT
  const adat: PortDef[] = [];
  for (let i = 0; i < state.port_counts.adat.inputs; i++) {
    adat.push({ type: "adat", index: i, label: `ADAT In ${i + 1}`, color: PORT_COLORS.adat });
  }
  if (adat.length > 0) groups.push({ label: "ADAT In", color: PORT_COLORS.adat, sources: adat });

  // Mixer buses
  const mix: PortDef[] = [];
  for (let i = 0; i < state.port_counts.mix.outputs; i++) {
    mix.push({ type: "mix", index: i, label: `Mix ${busLabel(i)}`, color: PORT_COLORS.mix });
  }
  if (mix.length > 0) groups.push({ label: "Mixer Out", color: PORT_COLORS.mix, sources: mix });

  return groups;
}

/** Flat list of all sources (for backward compat) */
export function buildSourceList(state: DeviceState): PortDef[] {
  return buildSourceGroups(state).flatMap((g) => g.sources);
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
