export default function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700">
      {/* Left: connection + sync */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-neutral-500" />
          <span className="text-sm text-neutral-400">No device</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-neutral-600" />
          <span className="text-xs text-neutral-500">--</span>
        </div>
      </div>

      {/* Center: transport buttons */}
      <div className="flex items-center gap-2">
        <HeaderButton label="TALK" />
        <HeaderButton label="MAIN" />
        <HeaderButton label="DIM" />
        <HeaderButton label="MUTE" />
      </div>

      {/* Right: master volume + remote */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">VOL</span>
          <div className="w-24 h-1.5 bg-neutral-700 rounded-full">
            <div className="w-3/4 h-full bg-neutral-400 rounded-full" />
          </div>
          <span className="text-xs text-neutral-400 w-10 text-right">0 dB</span>
        </div>
      </div>
    </header>
  );
}

function HeaderButton({ label }: { label: string }) {
  return (
    <button className="px-3 py-1 text-xs font-bold rounded bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors">
      {label}
    </button>
  );
}
