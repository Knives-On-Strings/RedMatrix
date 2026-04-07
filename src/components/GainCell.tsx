import { DB_MIN, dbToNormalized, formatDb } from "../constants";

interface GainCellProps {
  db: number;
  onClick: () => void;
}

export default function GainCell({ db, onClick }: GainCellProps) {
  const isActive = db > DB_MIN;
  const isUnity = Math.abs(db) < 0.5;

  let bg = "bg-neutral-800";
  if (isUnity) bg = "bg-green-600";
  else if (isActive) {
    const intensity = dbToNormalized(db);
    if (intensity > 0.5) bg = "bg-green-700";
    else if (intensity > 0.2) bg = "bg-green-900";
    else bg = "bg-green-950";
  }

  return (
    <button
      onClick={onClick}
      className={`w-8 h-6 text-[8px] font-mono rounded-sm border border-neutral-700/50 ${bg} ${
        isActive ? "text-neutral-200" : "text-neutral-600"
      } hover:border-neutral-500 transition-colors`}
      title={`${formatDb(db)} dB`}
    >
      {isActive ? (db <= -60 ? "\u00b7" : isUnity ? "0" : db.toFixed(0)) : ""}
    </button>
  );
}
