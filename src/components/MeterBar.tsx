import { meterColor } from "../constants";

interface MeterBarProps {
  level: number;
  height?: string;  // Tailwind height class, default "h-24"
  width?: string;    // Tailwind width class, default "w-3"
}

export default function MeterBar({ level, height = "h-24", width = "w-3" }: MeterBarProps) {
  const h = Math.max(0, Math.min(100, level * 100));
  return (
    <div className={`${width} ${height} bg-neutral-800 rounded-sm overflow-hidden flex flex-col-reverse`}>
      <div className={`${meterColor(level)} rounded-sm transition-all duration-75`} style={{ height: `${h}%` }} />
    </div>
  );
}
