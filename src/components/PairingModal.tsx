/**
 * Modal shown when a remote client requests pairing approval.
 *
 * The user verifies the fingerprint matches the connecting device,
 * then approves or denies.
 */

interface PairingModalProps {
  clientName: string;
  clientFingerprint: string;
  onApprove: () => void;
  onDeny: () => void;
}

export default function PairingModal({ clientName, clientFingerprint, onApprove, onDeny }: PairingModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-xl p-6 max-w-md w-full border border-neutral-700 shadow-2xl">
        <h2 className="text-lg font-bold text-neutral-100 mb-2">Pairing Request</h2>
        <p className="text-sm text-neutral-400 mb-4">
          A new device wants to connect to RedMatrix.
        </p>

        <div className="bg-neutral-900 rounded-lg p-3 mb-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-neutral-500">Device</span>
            <span className="text-sm text-neutral-200">{clientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-neutral-500">Fingerprint</span>
            <span className="text-sm text-neutral-200 font-mono">{clientFingerprint}</span>
          </div>
        </div>

        <p className="text-xs text-neutral-500 mb-4">
          Verify the fingerprint matches what's shown on the connecting device.
        </p>

        <div className="flex gap-3 justify-end">
          <button onClick={onDeny} className="text-sm px-4 py-2 bg-neutral-700 text-neutral-300 rounded hover:bg-neutral-600">
            Deny
          </button>
          <button onClick={onApprove} className="text-sm px-4 py-2 bg-green-700 text-green-100 rounded hover:bg-green-600">
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
