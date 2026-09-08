"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Button, Modal } from "@/components/ui";

type Toast = {
  id: string;
  message: string;
  undo?: () => void | Promise<void>;
};

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
};

type ConfirmRequest = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type FeedbackValue = {
  saving: boolean;
  setSaving: (value: boolean) => void;
  toast: (message: string, undo?: () => void | Promise<void>) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackValue>({
  saving: false,
  setSaving: () => {},
  toast: () => {},
  confirm: () => Promise.resolve(false),
});

export function ActionFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const toast = useCallback((message: string, undo?: () => void | Promise<void>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, undo }].slice(-3));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, undo ? 8000 : 5000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmRequest({ ...options, resolve });
    });
  }, []);

  const settleConfirm = useCallback((value: boolean) => {
    setConfirmRequest((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const value = useMemo(
    () => ({ saving, setSaving, toast, confirm }),
    [saving, toast, confirm]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Modal
        open={Boolean(confirmRequest)}
        onClose={() => settleConfirm(false)}
        title={confirmRequest?.title ?? "ยืนยัน"}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{confirmRequest?.message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => settleConfirm(false)}>
            ยกเลิก
          </Button>
          <Button
            type="button"
            variant={confirmRequest?.danger ? "danger" : "primary"}
            onClick={() => settleConfirm(true)}
          >
            {confirmRequest?.confirmLabel ?? "ยืนยัน"}
          </Button>
        </div>
      </Modal>
      <div className="pointer-events-none fixed inset-x-4 bottom-[5.5rem] z-[60] flex flex-col gap-2 lg:inset-x-auto lg:right-4 lg:bottom-6 lg:w-[min(100%-2rem,22rem)]">
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
                className="min-h-11 shrink-0 font-semibold text-accent"
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
