"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, Copy, CornerDownLeft } from "lucide-react";
import { Button, StatusStamp } from "@/components/ui";
import { useRole } from "@/components/RoleProvider";

const DEFAULT_QUESTION =
  "สรุปภาพรวมทั้งระบบตอนนี้ งานค้าง ดีลที่ต้องตาม และสิ่งที่ควรทำต่อ";

const CHIPS = [
  { id: "all", label: "สรุปทั้งระบบ", question: DEFAULT_QUESTION },
  { id: "tasks", label: "งานที่ต้องเร่ง", question: "งานไหนเร่งหรือเลยกำหนด และควรทำต่ออะไรก่อน" },
  { id: "sales", label: "ท่อขายตอนนี้", question: "สรุปท่อขายและเป้าหมายที่ต้องตามวันนี้" },
  { id: "finance", label: "การเงินเดือนนี้", question: "สรุปการเงินเดือนนี้ เงินเข้า เงินออก และยอดค้างรับ" },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function WorkspaceBrief() {
  const { canViewFinance } = useRole();
  const reducedMotion = usePrefersReducedMotion();
  const [question, setQuestion] = useState("");
  const [target, setTarget] = useState("");
  const [shown, setShown] = useState("");
  const [phase, setPhase] = useState<"idle" | "waiting" | "typing" | "done">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const targetRef = useRef("");
  const shownRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  const chips = CHIPS.filter((chip) => chip.id !== "finance" || canViewFinance);
  const busy = phase === "waiting" || phase === "typing";

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (phase !== "typing" && phase !== "waiting") return;
    if (reducedMotion) {
      shownRef.current = targetRef.current;
      setShown(targetRef.current);
      return;
    }

    let frame = 0;
    const tick = () => {
      const nextTarget = targetRef.current;
      let nextShown = shownRef.current;
      if (nextShown.length < nextTarget.length) {
        const remaining = nextTarget.length - nextShown.length;
        const step = Math.max(1, Math.ceil(remaining / 10));
        nextShown = nextTarget.slice(0, nextShown.length + step);
        shownRef.current = nextShown;
        setShown(nextShown);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, reducedMotion, target]);

  async function run(nextQuestion: string) {
    const asked = nextQuestion.trim() || DEFAULT_QUESTION;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setQuestion(asked);
    setError("");
    setCopied(false);
    setTarget("");
    setShown("");
    targetRef.current = "";
    shownRef.current = "";
    setPhase("waiting");

    try {
      const response = await fetch("/api/ai/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked }),
        signal: abort.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "เรียก Gemini ไม่สำเร็จ");
      }
      if (!response.body) throw new Error("ไม่ได้รับคำตอบจาก Gemini");

      setPhase("typing");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        targetRef.current = full;
        setTarget(full);
        if (reducedMotion) {
          shownRef.current = full;
          setShown(full);
        }
      }

      targetRef.current = full;
      setTarget(full);
      if (reducedMotion || !full) {
        shownRef.current = full;
        setShown(full);
      } else {
        await waitUntilCaughtUp();
      }
      setPhase(full ? "done" : "idle");
      if (!full) setError("Gemini ไม่ได้ส่งข้อความกลับมา");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setPhase("idle");
      setError(err instanceof Error ? err.message : "เรียก AI ไม่สำเร็จ");
    }
  }

  function waitUntilCaughtUp() {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (shownRef.current.length >= targetRef.current.length) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  async function copyAnswer() {
    if (!target) return;
    await navigator.clipboard.writeText(target);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="ticket-card">
      <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList size={18} className="text-accent" />
            สรุปโต๊ะงาน
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            พิมพ์ถามได้เลย ใช้ข้อมูลจริงจากงาน ลูกค้า ขาย และการเงินในระบบ
          </p>
        </div>
        <StatusStamp
          label={
            phase === "waiting" || phase === "typing"
              ? "กำลังพิมพ์"
              : phase === "done"
                ? "สรุปแล้ว"
                : "พร้อมถาม"
          }
          tone={phase === "done" ? "green" : phase === "idle" ? "slate" : "blue"}
        />
      </header>

      <form
        className="space-y-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(question);
        }}
      >
        <label htmlFor="workspace-brief" className="sr-only">
          คำถามถึง Gemini
        </label>
        <div className="rounded-2xl bg-surface-soft p-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <textarea
            id="workspace-brief"
            rows={3}
            value={question}
            disabled={busy}
            placeholder="สรุปทั้งระบบตอนนี้ มีอะไรที่ต้องทำต่อบ้าง"
            className="w-full resize-none bg-transparent text-base leading-relaxed placeholder:text-muted focus-visible:outline-none disabled:opacity-70"
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!busy) void run(question);
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              <CornerDownLeft size={14} className="mr-1 inline align-[-2px]" />
              Enter เพื่อสรุป
            </p>
            <Button type="submit" loading={busy} className="min-w-24">
              {busy ? "กำลังสรุป" : "สรุป"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              disabled={busy}
              onClick={() => void run(chip.question)}
              className="min-h-11 rounded-xl bg-background px-3.5 text-sm font-medium text-muted transition-colors hover:bg-card-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </form>

      {(busy || shown || error) && (
        <div className="border-t border-border px-4 py-4">
          {error && !shown ? (
            <p className="text-sm text-(--status-red-fg)" role="alert">
              {error}
            </p>
          ) : (
            <div className="space-y-3">
              {phase === "waiting" && !shown && (
                <p className="brief-typing text-sm text-muted" aria-live="polite">
                  <span className="brief-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  กำลังพิมพ์สรุปจากข้อมูลในระบบ
                </p>
              )}
              <p
                className="max-w-[70ch] whitespace-pre-wrap text-base leading-relaxed"
                aria-live="polite"
              >
                {shown}
                {(phase === "waiting" || phase === "typing") && (
                  <span className="brief-caret" aria-hidden="true" />
                )}
              </p>
              {phase === "done" && (
                <Button type="button" variant="secondary" onClick={() => void copyAnswer()}>
                  <Copy size={16} />
                  {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
