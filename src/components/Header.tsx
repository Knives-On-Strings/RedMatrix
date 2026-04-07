interface HeaderProps {
  onSettingsClick: () => void;
  onAboutClick: () => void;
}

export default function Header({ onSettingsClick, onAboutClick }: HeaderProps) {
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

      {/* Right: volume readout + settings/about */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">MON</span>
          <span className="text-sm text-neutral-300 font-mono">0 dB</span>
        </div>

        <div className="w-px h-5 bg-neutral-700" />

        <button
          onClick={onSettingsClick}
          title="Settings"
          className="w-8 h-8 flex items-center justify-center rounded bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
          </svg>
        </button>

        <button
          onClick={onAboutClick}
          title="About RedMatrix"
          className="w-8 h-8 flex items-center justify-center rounded bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 11V7.5M8 5.5V5" />
          </svg>
        </button>
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
