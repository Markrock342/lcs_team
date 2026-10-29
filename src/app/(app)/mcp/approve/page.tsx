"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot } from "lucide-react";
import { Button, PageLoader } from "@/components/ui";
import { neonRequest } from "@/lib/neon/client";
type Approval = {
    request_id: string;
    channel_name: string;
    message: string;
    status: string;
    expired: boolean;
    expires_at: string;
};
function Review() {
    const params = useSearchParams();
    const id = params.get("request");
    const kind = params.get("kind") === "client" ? "client" : "message";
    const [item, setItem] = useState<Approval | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => { const controller = new AbortController(); void neonRequest<{
        request: Approval;
    }>(`/api/neon/mcp-approval?request=${encodeURIComponent(id ?? "")}&kind=${kind}`, { signal: controller.signal, cache: "no-store" }).then(data => setItem(data.request)).catch(error => { if (!controller.signal.aborted)
        setError(error.message); }); return () => controller.abort(); }, [id, kind]);
    async function decide(decision: "approve" | "deny") {
        if (!item || busy)
            return;
        setBusy(true);
        setError("");
        try {
            const data = await neonRequest<{
                request: Approval;
            }>("/api/neon/mcp-approval", { method: "PATCH", body: JSON.stringify({ request_id: item.request_id, kind, decision }) });
            setItem(data.request);
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
        }
        finally {
            setBusy(false);
        }
    }
    return <main className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6"><header className="flex items-center gap-3"><Bot className="text-accent"/><h1 className="text-xl font-semibold">{kind === "client" ? "ตรวจคำสั่งจัดการลูกค้า" : "ตรวจข้อความจากเลขาคิม"}</h1></header>
 {error && <p role="alert" className="rounded-xl bg-(--status-red-bg) p-4 text-(--status-red-fg)">{error}</p>}
 {!item && !error && <PageLoader label="กำลังตรวจคำขอ…"/>}
 {item && <section className="ticket-card space-y-4 p-5"><p>{kind === "client" ? "รายการ: " : "ส่งใน: "}<strong>{item.channel_name}</strong></p><p className="text-sm text-muted">{kind === "client" ? "บันทึกโดยบัญชีผู้อนุมัติ" : "ผู้ส่ง: เลขาคิม · AI Assistant"}</p><p className="whitespace-pre-wrap break-words rounded-xl bg-surface-soft p-4 text-base leading-relaxed">{item.message}</p>
 {item.status === "pending" && !item.expired ? <><p className="text-sm leading-relaxed text-muted">ตรวจรายละเอียดก่อนอนุมัติ การอนุมัติใช้ได้กับรายการนี้เท่านั้นและหมดอายุใน 15 นาที</p><div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void decide("approve")}>อนุมัติรายการนี้</Button><Button variant="secondary" disabled={busy} onClick={() => void decide("deny")}>ไม่อนุมัติ</Button></div></> : <p role="status" className="text-sm font-medium">{item.status === "sent" ? "ส่งข้อความนี้แล้ว" : item.status === "completed" ? "บันทึกรายการนี้แล้ว" : item.expired ? "คำขอหมดอายุ กรุณาเริ่มใหม่จาก ChatGPT" : item.status === "approved" ? "อนุมัติแล้ว กลับไป ChatGPT ให้ดำเนินการคำขอเดิมต่อ ระบบจะตรวจสิทธิ์ซ้ำก่อนบันทึกจริง" : "ปฏิเสธคำขอแล้ว"}</p>}
 </section>}</main>;
}
export default function ApprovalPage() { return <Suspense fallback={<PageLoader label="กำลังเปิดคำขอ…"/>}><Review /></Suspense>; }
