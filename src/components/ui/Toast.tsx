// What this file is: a single shared "undo" toast -- a bottom-of-screen
// notification with an Undo button that auto-dismisses after a few seconds.
// `ToastProvider` is mounted once at the app root (above the router), so the
// toast survives a navigation triggered by the very action it's offering to
// undo (e.g. deleting a job posting navigates back to /jobs immediately).
// Only one toast at a time -- showing a new one replaces whatever's showing.
// In plain terms: the little "Deleted. Undo" bar that pops up after a
// destructive action, giving you a few seconds to take it back.

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Undo2 } from 'lucide-react';

const UNDO_TIMEOUT_MS = 6000;

interface UndoToastState {
  id: number;
  message: string;
  onUndo: () => void;
}

const ToastContext = createContext<{ showUndo: (message: string, onUndo: () => void) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<UndoToastState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const showUndo = useCallback((message: string, onUndo: () => void) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const id = ++nextId.current;
    setToast({ id, message, onUndo });
    timeoutRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, UNDO_TIMEOUT_MS);
  }, []);

  function handleUndo() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    toast?.onUndo();
    setToast(null);
  }

  return (
    <ToastContext.Provider value={{ showUndo }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-sm pl-4 pr-3 py-3 rounded-xl shadow-[0_8px_24px_rgba(15,23,42,0.35)] print:hidden"
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="inline-flex items-center gap-1.5 font-semibold px-2 py-1 rounded-lg hover:bg-white/10 dark:hover:bg-slate-900/10 transition-colors"
          >
            <Undo2 size={13} />
            Undo
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

// In plain terms: call `showUndo(message, undoFn)` right after a destructive
// action completes -- undoFn should reverse it (e.g. re-save what was just
// deleted).
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
