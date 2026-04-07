import { useRef } from "react";
import { meterColor, METER_PEAK_THRESHOLD } from "../constants";

interface MeterBarProps {
  level: number;
  height?: string;  // Tailwind height class, default "h-24"
  width?: string;    // Tailwind width class, default "w-3"
}

/** Peak hold decay rate (percentage points per frame at 20Hz). */
const PEAK_DECAY_RATE = 0.8;
/** How long peak holds before starting to decay (ms). */
const PEAK_HOLD_TIME = 1000;

export default function MeterBar({ level, height = "h-24", width = "w-3" }: MeterBarProps) {
  const peakRef = useRef(0);
  const peakTimeRef = useRef(0);

  // Update peak hold
  const now = Date.now();
  if (level >= peakRef.current) {
    // New peak — capture it
    peakRef.current = level;
    peakTimeRef.current = now;
  } else if (now - peakTimeRef.current > PEAK_HOLD_TIME) {
    // Decay the peak
    peakRef.current = Math.max(0, peakRef.current - PEAK_DECAY_RATE / 100);
  }

  const h = Math.max(0, Math.min(100, level * 100));
  const peakH = Math.max(0, Math.min(100, peakRef.current * 100));
  const peakColor = peakRef.current > METER_PEAK_THRESHOLD ? "bg-red-500" : "bg-neutral-400";

  return (
    <div className={`${width} ${height} bg-neutral-800 rounded-sm overflow-hidden relative`}>
      {/* Level bar (grows from bottom) */}
      <div
        className={`absolute bottom-0 left-0 right-0 ${meterColor(level)} rounded-sm transition-all duration-75`}
        style={{ height: `${h}%` }}
      />
      {/* Peak hold line */}
      {peakH > 1 && (
        <div
          className={`absolute left-0 right-0 ${peakColor} transition-all duration-150`}
          style={{ bottom: `${peakH}%`, height: "1.5px" }}
        />
      )}
    </div>
  );
}
