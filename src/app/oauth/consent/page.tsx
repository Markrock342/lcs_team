"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Code2, FolderKanban, MessageSquareText, ShieldCheck, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
};

const SCOPE_LABELS: Record<string, string> = {
  openid: "ยืนยันตัวตนบัญชี LCS",
  profile: "อ่านชื่อและบทบาทในทีม",
  email: "อ่านอีเมลสำหรับระบุบัญชี",
};

export default function OAuthConsentPage() {
  const router = useRouter();
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    async function load() {
      const authorizationId = new URLSearchParams(window.location.search).get("authorization_id");
      if (!authorizationId) {
        setError("ไม่พบรหัสคำขอเชื่อมต่อ กรุณาเริ่มเชื่อมจาก ChatGPT อีกครั้ง");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace(`/login?authorization_id=${encodeURIComponent(authorizationId)}`);
        return;
      }

      const { data, error: authError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (authError || !data) {
        setError(authError?.message || "โหลดรายละเอียดการเชื่อมต่อไม่สำเร็จ");
        setLoading(false);
        return;
      }
      if ("redirect_url" in data) {
        window.location.assign(data.redirect_url);
        return;
      }
      setDetails(data as AuthorizationDetails);
      setLoading(false);
    }
    void load();
  }, [router]);

  async function decide(action: "approve" | "deny") {
    if (!details) return;
    setSubmitting(action);
    setError("");
    const supabase = createClient();
    const result = action === "approve"
      ? await supabase.auth.oauth.approveAuthorization(details.authorization_id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(details.authorization_id, { skipBrowserRedirect: true });
    if (result.error || !result.data?.redirect_url) {
      setError(result.error?.message || "บันทึกการอนุญาตไม่สำเร็จ กรุณาลองใหม่");
      setSubmitting(null);
      return;
    }
    window.location.assign(result.data.redirect_url);
  }

  return (
    <main className="min-h-dvh bg-brand-mesh px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-[34rem] animate-fade-in">
        <div className="mb-8 flex items-center justify-center gap-3">
          <Logo size="sm" />
          <div>
            <p className="ticket-kicker">LCS CONNECT</p>
            <h1 className="text-lg font-semibold">เชื่อมพื้นที่ทำงานกับ ChatGPT</h1>
          </div>
        </div>

        <section className="ticket-card overflow-hidden">
          <div className="border-b border-border px-6 py-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                <Bot size={24} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted">แอปที่ขอเชื่อมต่อ</p>
                <h2 className="mt-0.5 text-xl font-semibold">{details?.client.name || "ChatGPT"}</h2>
                {details?.user.email && <p className="mt-1 truncate text-sm text-muted">บัญชี {details.user.email}</p>}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-muted" role="status">กำลังตรวจคำขอเชื่อมต่อ...</div>
          ) : error ? (
            <div className="space-y-4 px-6 py-8">
              <div className="rounded-xl bg-(--status-red-bg) p-4 text-(--status-red-fg)" role="alert">{error}</div>
              <Button variant="secondary" onClick={() => window.location.reload()}>ลองใหม่</Button>
            </div>
          ) : details ? (
            <div className="space-y-6 px-6 py-6">
              <div>
                <h3 className="font-semibold">ChatGPT จะทำอะไรได้</h3>
                <div className="mt-3 divide-y divide-border rounded-2xl bg-surface-soft px-4">
                  {[
                    { icon: FolderKanban, text: "อ่านโปรเจกต์และงานที่เกี่ยวข้องกับบัญชีคุณ" },
                    { icon: MessageSquareText, text: "อ่านข้อความในช่องทีมที่คุณมีสิทธิ์เข้าถึง" },
                    { icon: Code2, text: "อ่าน source code จาก repository ที่ LCS อนุญาต" },
                    { icon: ShieldCheck, text: "Admin/PM สร้างงานได้หลังยืนยันงานนั้นโดยชัดเจน พร้อมบันทึก audit log" },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex min-h-14 items-center gap-3 py-3">
                      <Icon size={18} className="shrink-0 text-accent" />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold">สิทธิ์บัญชีที่ร้องขอ</p>
                <ul className="mt-2 space-y-2 text-sm text-muted">
                  {details.scope.split(/\s+/).filter(Boolean).map((scope) => (
                    <li key={scope} className="flex items-center gap-2">
                      <Check size={15} className="text-(--status-green-fg)" />
                      {SCOPE_LABELS[scope] ?? scope}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-(--status-amber-bg) p-4 text-sm leading-relaxed text-(--status-amber-fg)">
                Connector นี้ไม่มีเครื่องมือแก้หรือลบงาน ส่งข้อความ แก้โค้ด merge หรือ deploy คุณยกเลิกสิทธิ์ภายหลังได้จาก Supabase Auth grants
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button loading={submitting === "approve"} onClick={() => void decide("approve")}>
                  <Check size={17} /> อนุญาตให้เชื่อม
                </Button>
                <Button variant="secondary" disabled={Boolean(submitting)} onClick={() => void decide("deny")}>
                  <X size={17} /> ไม่อนุญาต
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-muted">
          LCS จะส่งเฉพาะข้อมูลที่ ChatGPT เรียกผ่านเครื่องมือและอยู่ในสิทธิ์ของบัญชีนี้
        </p>
      </div>
    </main>
  );
}
