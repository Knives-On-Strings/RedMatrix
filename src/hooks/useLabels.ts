/**
 * Shared channel label state.
 *
 * Provides custom labels for inputs, outputs, PCM channels, and mixer buses.
 * Labels are stored in React state for now — will persist to local config
 * file when the transport is wired up.
 *
 * Usage:
 *   const { getInputLabel, getOutputLabel, getBusLabel, setLabel } = useLabels();
 *   const name = getInputLabel("analogue", 0, "Analogue 1"); // returns custom or default
 */

import { useState, useCallback } from "react";
import type { ChannelLabels } from "../types";

export function useLabels() {
  const [labels, setLabels] = useState<ChannelLabels>({
    inputs: {},
    outputs: {},
    pcm: {},
    buses: {},
  });

  const getLabel = useCallback(
    (category: keyof ChannelLabels, key: string, defaultName: string): string => {
      return labels[category][key] || defaultName;
    },
    [labels],
  );

  const getInputLabel = useCallback(
    (type: string, index: number, defaultName: string): string => {
      return getLabel("inputs", `${type}_${index}`, defaultName);
    },
    [getLabel],
  );

  const getOutputLabel = useCallback(
    (type: string, index: number, defaultName: string): string => {
      return getLabel("outputs", `${type}_${index}`, defaultName);
    },
    [getLabel],
  );

  const getPcmLabel = useCallback(
    (direction: "in" | "out", index: number, defaultName: string): string => {
      return getLabel("pcm", `pcm_${direction}_${index}`, defaultName);
    },
    [getLabel],
  );

  const getBusLabel = useCallback(
    (index: number, defaultName: string): string => {
      return getLabel("buses", `${index}`, defaultName);
    },
    [getLabel],
  );

  const setInputLabel = useCallback((type: string, index: number, name: string) => {
    setLabels((prev) => ({
      ...prev,
      inputs: { ...prev.inputs, [`${type}_${index}`]: name },
    }));
    // TODO: persist to config file
  }, []);

  const setOutputLabel = useCallback((type: string, index: number, name: string) => {
    setLabels((prev) => ({
      ...prev,
      outputs: { ...prev.outputs, [`${type}_${index}`]: name },
    }));
  }, []);

  const setPcmLabel = useCallback((direction: "in" | "out", index: number, name: string) => {
    setLabels((prev) => ({
      ...prev,
      pcm: { ...prev.pcm, [`pcm_${direction}_${index}`]: name },
    }));
  }, []);

  const setBusLabel = useCallback((index: number, name: string) => {
    setLabels((prev) => ({
      ...prev,
      buses: { ...prev.buses, [`${index}`]: name },
    }));
  }, []);

  return {
    labels,
    getInputLabel,
    getOutputLabel,
    getPcmLabel,
    getBusLabel,
    setInputLabel,
    setOutputLabel,
    setPcmLabel,
    setBusLabel,
  };
}
