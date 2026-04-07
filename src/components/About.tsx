interface AboutProps {
  onClose: () => void;
}

export default function About({ onClose }: AboutProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-neutral-800 rounded-xl p-8 max-w-xl w-full border border-neutral-700 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>

        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-red-400 tracking-wider mb-1">REDMATRIX</h1>
          <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2">
            Open-Source Focusrite Scarlett Controller
          </p>
          <p className="text-sm text-red-400 font-mono">v0.1.0-dev (20260407)</p>
          <div className="flex justify-center gap-2 mt-3">
            <LinkButton label="WEBSITE" href="https://github.com/Knives-On-Strings" />
            <LinkButton label="GITHUB" href="https://github.com/Knives-On-Strings/RedMatrix" />
          </div>
        </div>

        {/* Two-column detail grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-xs">
          {/* Left column */}
          <div>
            <SectionHeader>SUPPORTED DEVICES</SectionHeader>
            <DetailRow label="Scarlett Gen 2" desc="6i6, 18i8, 18i20" />
            <DetailRow label="Scarlett Gen 3" desc="Solo, 2i2, 4i4, 8i6, 18i8, 18i20" />
            <DetailRow label="Clarett USB" desc="2Pre, 4Pre, 8Pre" />
            <DetailRow label="Clarett+" desc="2Pre, 4Pre, 8Pre" />

            <SectionHeader className="mt-4">BUILT WITH</SectionHeader>
            <DetailRow label="Tauri 2" desc="Desktop app framework" highlight />
            <DetailRow label="Rust" desc="USB protocol + WebSocket server" />
            <DetailRow label="React" desc="Frontend UI" />
            <DetailRow label="Tailwind CSS" desc="Styling" />
          </div>

          {/* Right column */}
          <div>
            <SectionHeader>OPEN SOURCE</SectionHeader>
            <DetailRow label="mixer_scarlett2.c" desc="Linux kernel driver by Geoffrey Bennett" highlight />
            <DetailRow label="p256 / aes-gcm" desc="RustCrypto — ECDH + encryption" />
            <DetailRow label="tokio-tungstenite" desc="WebSocket server" />
            <DetailRow label="mdns-sd" desc="LAN discovery" />

            <SectionHeader className="mt-4">THANKS</SectionHeader>
            <p className="text-neutral-400 leading-relaxed">
              Geoffrey Bennett for his extraordinary reverse engineering of the Scarlett2 USB
              protocol. This project could not exist without his Linux kernel driver work.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-neutral-700 flex items-center justify-between">
          <span className="text-[10px] text-neutral-600">
            GPL-3.0 &middot; A Knives on Strings product
          </span>
          <span className="text-[10px] text-neutral-600 font-mono">
            Scarlett2 Protocol
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-[10px] text-red-400 font-bold uppercase tracking-widest mb-2 ${className}`}>
      {children}
    </h3>
  );
}

function DetailRow({ label, desc, highlight = false }: { label: string; desc: string; highlight?: boolean }) {
  return (
    <div className="flex gap-2 mb-1.5">
      <span className={`${highlight ? "text-red-400" : "text-neutral-300"} font-medium whitespace-nowrap`}>
        {label}
      </span>
      <span className="text-neutral-500">{desc}</span>
    </div>
  );
}

function LinkButton({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] font-bold px-4 py-1.5 border border-red-400 text-red-400 rounded hover:bg-red-400 hover:text-black transition-colors uppercase tracking-wider"
    >
      {label}
    </a>
  );
}
