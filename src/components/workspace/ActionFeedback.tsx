"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Toast = {
  id: string;
  message: string;
  undo?: () => void | Promise<void>;
  saving?: boolean;
};

type FeedbackValue = {
  saving: boolean;
  setSaving: (value: boolean) => void;
  toast: (message: string, undo?: () => void | Promise<void>) => void;
};

const FeedbackContext = createContext<FeedbackValue>({
  saving: false,
  setSaving: () => {},
  toast: () => {},
});

export function ActionFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, undo?: () => void | Promise<void>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, undo }].slice(-3));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 6000);
  }, []);

  const value = useMemo(() => ({ saving, setSaving, toast }), [saving, toast]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-4 z-[60] flex w-[min(100%-2rem,22rem)] flex-col gap-2 lg:bottom-6">
        {saving && (
          <div className="pointer-events-auto rounded-xl bg-card px-4 py-3 text-sm shadow-(--shadow-float)">
            กำลังบันทึก...
          </div>
        )}
        {toasts.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 text-sm shadow-(--shadow-float)"
            role="status"
          >
            <span>{item.message}</span>
            {item.undo && (
              <button
                type="button"
                className="min-h-10 font-semibold text-accent"
                onClick={async () => {
                  await item.undo?.();
                  setToasts((prev) => prev.filter((row) => row.id !== item.id));
                }}
              >
                ย้อนกลับ
              </button>
            )}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useActionFeedback() {
  return useContext(FeedbackContext);
}
