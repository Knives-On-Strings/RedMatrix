interface PhantomConfirmDialogProps {
  group: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PhantomConfirmDialog({ group, onConfirm, onCancel }: PhantomConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl max-w-sm w-full mx-4 p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="text-2xl">⚠️</div>
          <div>
            <h3 className="text-sm font-bold text-neutral-200 mb-1">Enable 48V Phantom Power?</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Enabling phantom power on <span className="text-neutral-200 font-medium">{group}</span> can
              damage ribbon and some dynamic microphones. Make sure only condenser microphones are connected
              to these inputs.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            autoFocus
            className="px-4 py-1.5 text-xs font-medium rounded bg-neutral-700 text-neutral-300 hover:bg-neutral-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-xs font-bold rounded bg-red-600 text-white hover:bg-red-500 transition-colors"
          >
            Enable 48V
          </button>
        </div>
      </div>
    </div>
  );
}
