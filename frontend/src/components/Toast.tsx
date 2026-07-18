import { useEffect } from "react";

export interface ToastMessage {
  text: string;
  kind: "success" | "error";
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
  durationMs?: number;
}

/** Minimal inline notification, e.g. for Save feedback. Auto-dismisses. */
export default function Toast({ toast, onDismiss, durationMs = 3500 }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [toast, onDismiss, durationMs]);

  if (!toast) return null;

  const kindClass =
    toast.kind === "success"
      ? "border-satya/40 bg-satya text-white"
      : "border-evidence-contradictory/40 bg-evidence-contradictory text-white";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <div
        className={`flex max-w-md items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${kindClass}`}
      >
        <span>{toast.text}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="ml-2 text-white/80 hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}
