import { useEffect, useState } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  type: "error" | "info" | "success";
}

let nextId = 0;
const listeners: Set<(msg: ToastMessage) => void> = new Set();

/** Show a toast message from anywhere (no hook required). */
export function showToast(text: string, type: "error" | "info" | "success" = "info") {
  const msg: ToastMessage = { id: nextId++, text, type };
  listeners.forEach((fn) => fn(msg));
}

/** Toast container — render once at the app root. */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setToasts((prev) => [...prev, msg]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== msg.id));
      }, 4000);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const bg = {
          error: "bg-red-900 border-red-700 text-red-200",
          info: "bg-neutral-800 border-neutral-600 text-neutral-200",
          success: "bg-green-900 border-green-700 text-green-200",
        }[toast.type];

        return (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-lg border text-sm shadow-lg animate-in fade-in ${bg}`}
          >
            {toast.text}
          </div>
        );
      })}
    </div>
  );
}
