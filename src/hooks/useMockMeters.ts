/**
 * Hook that provides stable mock meter levels that update at ~20Hz.
 * Prevents re-randomization on every React render.
 * Will be replaced by real meter data from the transport.
 */

import { useState, useEffect, useRef } from "react";
import { MOCK_METER_BASE, MOCK_METER_RANGE } from "../constants";

export function useMockMeters(channelCount: number): Float32Array {
  const [levels, setLevels] = useState<Float32Array>(() => generateLevels(channelCount));
  const countRef = useRef(channelCount);

  // Update channel count if it changes (device switch)
  if (countRef.current !== channelCount) {
    countRef.current = channelCount;
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setLevels(generateLevels(countRef.current));
    }, 50); // 20Hz, matches server meter rate

    return () => clearInterval(interval);
  }, []);

  return levels;
}

function generateLevels(count: number): Float32Array {
  const arr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = MOCK_METER_BASE + Math.random() * MOCK_METER_RANGE;
  }
  return arr;
}
