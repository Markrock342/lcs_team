"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Bot,
  Braces,
  Code2,
  FileCode2,
  History,
  LoaderCircle,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { neonRequest } from "@/lib/neon/client";
import { Button } from "@/components/ui";

type Conversation = {
  id: string;
  title: string;
  repository: string | null;
  created_at: string;
  updated_at: string;
};

type AssistantMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  context_files: Array<{ repository: string; path: string; ref: string | null }>;
  created_at: string;
  pending?: boolean;
};

type ContextFile = { repository: string; path: string; ref: string | null };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(value));
}

function MessageContent({ content }: { content: string }) {
  const blocks = content.split(/(```[\s\S]*?```)/g).filter(Boolean);
  return (
    <div className="assistant-message space-y-3">
      {blocks.map((block, index) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const inner = block.slice(3, -3);
          const firstBreak = inner.indexOf("\n");
          const language = firstBreak >= 0 ? inner.slice(0, firstBreak).trim() : "";
          const code = firstBreak >= 0 ? inner.slice(firstBreak + 1) : inner;
          return (
            <div key={index}>
              {language && <p className="mb-1 text-xs text-muted">{language}</p>}
              <pre><code>{code}</code></pre>
            </div>
          );
        }
        return <p key={index} className="whitespace-pre-wrap break-words leading-7">{block}</p>;
      })}
    </div>
  );
}

export default function AssistantPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [input, setInput] = useState("");
  const [configured, setConfigured] = useState(true);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const optimisticSequence = useRef(0);

  const currentConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId) ?? null,
    [conversations, conversationId],
  );

  const loadConversation = useCallback(async (id: string) => {
    setThreadLoading(true);
    setError("");
    try {
      const data = await neonRequest<{
        conversations: Conversation[];
        conversation: Conversation;
        messages: AssistantMessage[];
        configured: boolean;
        model: string;
      }>(`/api/assistant?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      setConversations(data.conversations);
      setConversationId(data.conversation.id);
      setMessages(data.messages ?? []);
      setConfigured(data.configured);
      setModel(data.model);
      setSidebarOpen(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดบทสนทนาไม่สำเร็จ");
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await neonRequest<{ conversations: Conversation[]; configured: boolean; model: string }>(
        "/api/assistant",
        { cache: "no-store" },
      );
      setConversations(data.conversations ?? []);
      setConfigured(data.configured);
      setModel(data.model);

      const params = new URLSearchParams(window.location.search);
      const repository = params.get("repo")?.trim();
      const path = params.get("path")?.trim();
      const ref = params.get("ref")?.trim() || null;
      const requestedConversation = params.get("conversation")?.trim();
      if (repository && path) {
        setContextFiles([{ repository, path, ref }]);
        setConversationId(null);
        setMessages([]);
      } else if (requestedConversation && data.conversations?.some((item) => item.id === requestedConversation)) {
        await loadConversation(requestedConversation);
      } else if (data.conversations?.[0]) {
        await loadConversation(data.conversations[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "เปิด LCS Assistant ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [loadConversation]);

  useEffect(() => {
    // Initial client-side data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void initialize();
  }, [initialize]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: sending ? "smooth" : "auto" }); }, [messages, sending]);

  function newConversation() {
    setConversationId(null);
    setMessages([]);
    setContextFiles([]);
    setInput("");
    setError("");
    setSidebarOpen(false);
    window.history.replaceState(null, "", "/assistant");
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function sendMessage(prefill?: string) {
    const content = (prefill ?? input).trim();
    if (!content || sending || !configured) return;
    setSending(true);
    setError("");
    setInput("");
    optimisticSequence.current += 1;
    const optimistic: AssistantMessage = {
      id: `pending-${optimisticSequence.current}`,
      conversation_id: conversationId ?? "pending",
      role: "user",
      content,
      model: null,
      context_files: contextFiles,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((current) => [...current, optimistic]);

    try {
      const data = await neonRequest<{
        conversationId: string;
        messages: AssistantMessage[];
        model: string;
      }>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          action: "message",
          conversationId,
          content,
          contextFiles,
        }),
      });
      setConversationId(data.conversationId);
      setModel(data.model);
      setMessages((current) => [...current.filter((message) => message.id !== optimistic.id), ...data.messages]);
      setContextFiles([]);
      window.history.replaceState(null, "", `/assistant?conversation=${encodeURIComponent(data.conversationId)}`);
      const refreshed = await neonRequest<{ conversations: Conversation[] }>("/api/assistant", { cache: "no-store" });
      setConversations(refreshed.conversations ?? []);
    } catch (sendError) {
      setMessages((current) => current.map((message) => message.id === optimistic.id ? { ...message, pending: false } : message));
      setError(sendError instanceof Error ? sendError.message : "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div className="assistant-grid h-full min-h-0 overflow-hidden rounded-[var(--radius-section)] bg-card shadow-[var(--shadow-card)]">
      <aside className={`${sidebarOpen ? "fixed inset-0 z-50 flex" : "hidden"} flex-col border-r border-border bg-sidebar lg:static lg:flex lg:min-h-0`}>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <button type="button" onClick={() => setSidebarOpen(false)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover lg:hidden" aria-label="ปิดรายการบทสนทนา"><PanelLeftClose size={18} /></button>
          <Button onClick={newConversation} className="flex-1"><Plus size={17} /> แชตใหม่</Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-3 pb-2 pt-1 text-xs font-semibold text-muted">ประวัติของฉัน</p>
          {conversations.length ? conversations.map((conversation) => {
            const active = conversation.id === conversationId;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void loadConversation(conversation.id)}
                className={`mb-1 flex min-h-14 w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${active ? "bg-accent/12" : "hover:bg-card-hover"}`}
              >
                <History size={15} className={`mt-1 shrink-0 ${active ? "text-accent" : "text-muted"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{conversation.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{conversation.repository ?? dateLabel(conversation.updated_at)}</span>
                </span>
              </button>
            );
          }) : (
            <p className="px-3 py-8 text-center text-sm text-muted">บทสนทนาใหม่จะอยู่ตรงนี้</p>
          )}
        </div>
        <div className="border-t border-border p-4 text-xs leading-relaxed text-muted">
          <div className="flex items-center gap-2"><ShieldCheck size={15} className="text-(--status-green-fg)" /> ประวัติเก็บใน Neon ของทีม</div>
          <p className="mt-2">ส่งคำขอ OpenAI แบบ <code>store: false</code></p>
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <header className="flex min-h-16 items-center gap-3 border-b border-border px-3 sm:px-5">
          <button type="button" onClick={() => setSidebarOpen(true)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover lg:hidden" aria-label="เปิดรายการบทสนทนา"><Menu size={19} /></button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent"><Bot size={19} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{currentConversation?.title ?? "LCS Assistant"}</h1>
            <p className="truncate text-xs text-muted">{model || "OpenAI"} · อ่านอย่างเดียว · ต่อจากมือถือได้</p>
          </div>
          <Link href="/code" className="hidden min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-card-hover hover:text-foreground sm:flex"><Code2 size={16} /> เปิดโค้ด</Link>
        </header>

        {!configured && (
          <div className="border-b border-border bg-(--status-amber-bg) px-4 py-3 text-sm text-(--status-amber-fg)" role="alert">
            ยังไม่ได้ตั้งค่า <strong>OPENAI_API_KEY</strong> บนเซิร์ฟเวอร์ ห้องแชตและประวัติพร้อมแล้ว แต่ยังส่งหาโมเดลไม่ได้
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6" aria-live="polite">
          {loading || threadLoading ? (
            <div className="flex min-h-full items-center justify-center gap-2 text-muted" role="status"><LoaderCircle size={18} className="animate-spin" /> กำลังเปิดบทสนทนา...</div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center py-10">
              <p className="ticket-kicker">LCS ASSISTANT</p>
              <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">อ่านงานและโค้ดของทีมให้เข้าใจได้ แม้ไม่ได้อยู่หน้าคอม</h2>
              <p className="mt-3 max-w-2xl text-muted">เลือกคำถามด้านล่าง หรือไปที่ Code Workspace แล้วกด “ถาม AI” จากไฟล์ที่ต้องการ</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Braces, text: "ช่วยอธิบายโครงสร้างโปรเจกต์นี้ให้ทีมใหม่เข้าใจ" },
                  { icon: Sparkles, text: "จากงานของฉัน วันนี้ควรเริ่มอะไรเป็นอันดับแรก" },
                  { icon: FileCode2, text: "สรุปความเสี่ยงและจุดที่ควรตรวจในโค้ดที่แนบ" },
                  { icon: MessageSquarePlus, text: "ช่วยเขียน handoff งานวันนี้ให้ทีมแบบกระชับ" },
                ].map(({ icon: Icon, text }) => (
                  <button key={text} type="button" onClick={() => void sendMessage(text)} disabled={!configured} className="job-jacket flex min-h-24 items-start gap-3 p-4 text-left disabled:opacity-50">
                    <Icon size={18} className="mt-1 shrink-0 text-accent" />
                    <span className="font-medium leading-relaxed">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((message) => (
                <article key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "assistant" && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent"><Bot size={16} /></div>}
                  <div className={`min-w-0 max-w-[88%] ${message.role === "user" ? "rounded-2xl rounded-br-md bg-accent px-4 py-3 text-on-accent" : "py-1"}`}>
                    {message.context_files?.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {message.context_files.map((item) => <span key={`${item.repository}-${item.path}`} className="rounded-lg bg-black/10 px-2 py-1 text-xs">{item.path}</span>)}
                      </div>
                    )}
                    <MessageContent content={message.content} />
                    {message.pending && <p className="mt-2 text-xs opacity-70">กำลังส่ง...</p>}
                  </div>
                </article>
              ))}
              {sending && (
                <div className="flex items-center gap-3 text-muted" role="status">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/12 text-accent"><Bot size={16} /></div>
                  <div className="brief-dots" aria-label="ผู้ช่วยกำลังคิด"><span /><span /><span /></div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <footer className="border-t border-border bg-card px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
          <div className="mx-auto max-w-3xl">
            {contextFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {contextFiles.map((item) => (
                  <span key={`${item.repository}-${item.path}`} className="flex min-h-9 items-center gap-2 rounded-xl bg-accent/10 px-3 text-sm text-accent">
                    <FileCode2 size={14} /> <span className="max-w-[15rem] truncate">{item.path}</span>
                    <button type="button" onClick={() => setContextFiles((current) => current.filter((file) => file.path !== item.path || file.repository !== item.repository))} className="flex min-h-8 min-w-8 items-center justify-center rounded-lg hover:bg-card-hover" aria-label={`เอา ${item.path} ออกจากบริบท`}><X size={14} /></button>
                  </span>
                ))}
              </div>
            )}
            {error && <div className="mb-2 rounded-xl bg-(--status-red-bg) px-4 py-3 text-sm text-(--status-red-fg)" role="alert">{error}</div>}
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 focus-within:border-accent">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                maxLength={8000}
                disabled={sending || !configured}
                placeholder={configured ? "ถามเรื่องงาน โค้ด หรือขอให้ช่วยสรุป..." : "ตั้งค่า OPENAI_API_KEY ก่อนเริ่มสนทนา"}
                aria-label="ข้อความถึง LCS Assistant"
                className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted disabled:opacity-60"
              />
              <button type="button" onClick={() => void sendMessage()} disabled={!input.trim() || sending || !configured} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent transition-colors hover:bg-accent-dim disabled:bg-surface-soft disabled:text-muted" aria-label="ส่งข้อความ"><ArrowUp size={19} /></button>
            </div>
            <p className="mt-1.5 text-center text-[0.6875rem] text-muted">Enter เพื่อส่ง · Shift + Enter ขึ้นบรรทัดใหม่ · ตรวจคำตอบก่อนนำไปใช้</p>
          </div>
        </footer>
      </section>
    </div>
  );
}
