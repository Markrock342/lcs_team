"use client";
import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui";
import { neonRequest } from "@/lib/neon/client";
type Configuration = {
    configured: boolean;
    bot?: {
        display_name: string;
        enabled: boolean;
    };
    channels?: {
        id: string;
        name: string;
        kind: string;
        allowed: boolean;
    }[];
};
export function WorkspaceBotSettings() {
    const [config, setConfig] = useState<Configuration | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    async function load() { const data = await neonRequest<Configuration>("/api/neon/workspace-bot", { cache: "no-store" }); setConfig(data); }
    useEffect(() => { const controller = new AbortController(); void neonRequest<Configuration>("/api/neon/workspace-bot", { cache: "no-store", signal: controller.signal }).then(data => { if (!controller.signal.aborted)
        setConfig(data); }).catch(() => { if (!controller.signal.aborted)
        setError("โหลดการตั้งค่าเลขาคิมไม่สำเร็จ"); }); return () => controller.abort(); }, []);
    async function save(input: object) { if (busy)
        return; setBusy(true); setError(""); try {
        await neonRequest("/api/neon/workspace-bot", { method: "PATCH", body: JSON.stringify(input) });
        await load();
    }
    catch (error) {
        setError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    }
    finally {
        setBusy(false);
    } }
    return <section className="ticket-card space-y-4 p-5"><h2 className="flex items-center gap-2 font-semibold"><Bot size={20} className="text-accent"/>เลขาคิม · AI Assistant</h2>
 {busy && <p role="status" className="text-sm text-muted">กำลังบันทึกสิทธิ์…</p>}
 {error && <p role="alert" className="text-sm text-(--status-red-fg)">{error}</p>}
 {!config && !error && <p role="status" className="text-sm text-muted">กำลังโหลด…</p>}
 {config && !config.configured && <p className="text-sm text-muted">ยังไม่ได้เปิดใช้งานเลขาคิมบนเซิร์ฟเวอร์</p>}
 {config?.configured && config.bot && <><p className="text-sm leading-relaxed text-muted">อนุญาตห้องครั้งเดียวแล้วเรียก <strong>@เลขาคิม</strong> เพื่อให้ AI ตอบในห้องนั้นได้ทันที ไม่ต้องอนุมัติทุกคำตอบ ส่วนการสั่งส่งข้อความผ่าน ChatGPT Connector ยังใช้หน้าตรวจสอบก่อนส่งเพื่อป้องกันการส่งผิดห้อง</p>
 <Button variant="secondary" disabled={busy} onClick={() => void save({ enabled: !config.bot!.enabled })}>{config.bot.enabled ? "ระงับการส่งของเลขาคิม" : "เปิดใช้เลขาคิม"}</Button>
 <div className="divide-y divide-border">{config.channels?.map(channel => <label key={channel.id} className="flex min-h-14 items-center justify-between gap-3 py-3"><span className="min-w-0 break-words text-sm">{channel.kind === "dm" ? "DM · " : "#"}{channel.name}</span><input type="checkbox" aria-label={`อนุญาตเลขาคิมใน ${channel.name}`} checked={channel.allowed} disabled={busy} onChange={event => void save({ channel_id: channel.id, allowed: event.target.checked })} className="h-5 w-5 shrink-0 accent-accent"/></label>)}</div></>}
 </section>;
}
