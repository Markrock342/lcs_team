"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { Modal } from "@/components/ui";
import { neonRequest } from "@/lib/neon/client";
import { notifyNotificationsChanged } from "@/lib/notifications";
import { CHAT_MUTE_DURATIONS, chatMuteLabel, isChatMuted, type ChatMutePreference } from "@/lib/chat-mute";
export function ChatMuteButton({ channelId, title, preference, onUpdated }: {
    channelId: string;
    title: string;
    preference: ChatMutePreference;
    onUpdated: (preference: ChatMutePreference) => void;
}) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [, tick] = useState(0);
    const muted = isChatMuted(preference);
    const { mute_forever, muted_until } = preference;
    useEffect(() => {
        const timed = { mute_forever, muted_until };
        if (mute_forever || !isChatMuted(timed))
            return;
        const timer = setInterval(() => {
            tick((value) => value + 1);
            if (!isChatMuted(timed)) {
                clearInterval(timer);
                notifyNotificationsChanged();
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [mute_forever, muted_until]);
    async function save(duration: number | "forever") {
        if (saving)
            return;
        setSaving(true);
        setError("");
        try {
            const data = await neonRequest<{
                preference: ChatMutePreference;
            }>("/api/neon/chat-notifications", {
                method: "PATCH", body: JSON.stringify({ channelId, duration }),
            });
            onUpdated(data.preference);
            notifyNotificationsChanged();
            setOpen(false);
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
        }
        finally {
            setSaving(false);
        }
    }
    return <>
    <button type="button" onClick={() => { setError(""); setOpen(true); }} aria-label={`ตั้งค่าการแจ้งเตือน ${title}`} aria-haspopup="dialog" title={chatMuteLabel(preference)} className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl hover:bg-card-hover ${muted ? "text-(--status-amber-fg)" : "text-muted"}`}>
      {muted ? <BellOff size={18}/> : <Bell size={18}/>}
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title={`การแจ้งเตือน · ${title}`}>
      <div className="space-y-4">
        <p role="status" className="text-sm font-medium">{chatMuteLabel(preference)}</p>
        <p className="text-sm leading-relaxed text-muted">ปิดป๊อปอัปในเว็บและ Push ของแชทนี้ รวมถึง mention เฉพาะคุณ ข้อความและจำนวนที่ยังไม่อ่านยังอยู่ครบ</p>
        <div className="space-y-1">
          {muted && <button type="button" disabled={saving} onClick={() => void save(0)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-accent hover:bg-card-hover disabled:opacity-50"><Bell size={18}/> เปิดแจ้งเตือนอีกครั้ง</button>}
          {CHAT_MUTE_DURATIONS.map((option) => <button key={option.value} type="button" disabled={saving} onClick={() => void save(option.value)} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-base hover:bg-card-hover disabled:opacity-50">
            <BellOff size={16} className="shrink-0 text-muted"/><span className="flex-1">{option.label}</span>
            {option.value === "forever" && preference.mute_forever && <Check size={16} className="text-accent"/>}
          </button>)}
        </div>
        {saving && <p role="status" className="text-sm text-muted">กำลังบันทึก…</p>}
        {error && <p role="alert" className="text-sm text-(--status-red-fg)">{error}</p>}
        <p className="text-xs leading-relaxed text-muted">เมื่อครบเวลา ระบบกลับมาแจ้งเตือนอัตโนมัติ โดยไม่แจ้งข้อความเก่าย้อนหลัง</p>
      </div>
    </Modal>
  </>;
}
