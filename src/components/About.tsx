interface AboutProps {
  onClose: () => void;
}

export default function About({ onClose }: AboutProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-neutral-800 rounded-xl p-8 max-w-md border border-neutral-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-neutral-100 mb-1">RedMatrix</h2>
        <p className="text-xs text-neutral-500 mb-4">
          A <a href="https://github.com/Knives-On-Strings" className="text-red-400 hover:underline">Knives on Strings</a> product
        </p>

        <p className="text-sm text-neutral-300 mb-4">
          Open-source replacement for Focusrite Control. Supports Scarlett Gen 2/3 and Clarett USB/+ interfaces.
        </p>

        <div className="space-y-1 text-xs text-neutral-400 mb-6">
          <div className="flex justify-between">
            <span>Version</span>
            <span className="text-neutral-300 font-mono">0.1.0-dev</span>
          </div>
          <div className="flex justify-between">
            <span>License</span>
            <span className="text-neutral-300">GPL-3.0</span>
          </div>
          <div className="flex justify-between">
            <span>Protocol</span>
            <span className="text-neutral-300">Based on Geoffrey Bennett's Linux kernel driver</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-xs px-4 py-1.5 bg-neutral-700 text-neutral-300 rounded hover:bg-neutral-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
