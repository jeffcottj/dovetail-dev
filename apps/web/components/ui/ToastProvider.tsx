'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { ToastContext, type Toast, type ToastVariant } from '../../lib/hooks/useToast';

let nextId = 0;

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'bg-success/10 border-success/30 text-success',
  error: 'bg-danger/10 border-danger/30 text-danger',
  info: 'bg-accent/10 border-accent/30 text-accent',
};

const ICON: Record<ToastVariant, string> = {
  success: '\u2713',
  error: '\u2717',
  info: '\u2139',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 px-4 py-3 rounded-lg border shadow-md font-[family-name:var(--font-ui)] text-sm animate-slide-in ${VARIANT_STYLES[toast.variant]}`}
    >
      <span className="font-bold text-base leading-none">{ICON[toast.variant]}</span>
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="ml-2 opacity-60 hover:opacity-100 transition-opacity text-xs"
        aria-label="Dismiss notification"
      >
        \u2715
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = String(++nextId);
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext value={{ toasts, addToast, removeToast }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-label="Notifications"
          className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm"
        >
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onDismiss={() => removeToast(toast.id)}
            />
          ))}
        </div>
      )}
    </ToastContext>
  );
}
