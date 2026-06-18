"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Avatar } from "@/components/ui";
import { PageHeader } from "@/components/mobile-ui";
import { mergeProfileBank, hasBankInfo } from "@/lib/team-banks";
import type { TeamPayout } from "@/lib/extras-types";
import type { Profile } from "@/lib/types";
import { format } from "date-fns";
import { th } from "date-fns/locale";

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<TeamPayout[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const [payRes, memRes] = await Promise.all([
      supabase
        .from("team_payouts")
        .select(
          "*, payer:profiles!team_payouts_payer_id_fkey(*), payee:profiles!team_payouts_payee_id_fkey(*)"
        )
        .order("paid_at", { ascending: false })
        .limit(5),
      supabase.from("profiles").select("*").order("display_name"),
    ]);
    setPayouts(payRes.data ?? []);
    setMembers((memRes.data ?? []).map(mergeProfileBank));
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-lg mx-auto">
      <PageHeader
        title="บัญชีทีม"
        description="ดูเลขบัญชีเพื่อน — บันทึกการโอนที่หน้าการเงิน"
        action={
          <Link href="/finance?pay=1">
            <Button>
              <Plus size={18} /> จ่ายเพื่อน
            </Button>
          </Link>
        }
      />

      <div className="grid gap-3">
        {members.map((m) => (
          <div
            key={m.id}
            className="bg-card border border-border rounded-2xl p-4"
          >
            <div className="flex items-center gap-3 mb-2">
              <Avatar name={m.display_name} src={m.avatar_url} />
              <div>
                <p className="font-medium">{m.display_name}</p>
                <p className="text-xs text-muted">@{m.username}</p>
              </div>
            </div>
            {hasBankInfo(m) ? (
              <div className="bg-background/60 rounded-xl p-3 border border-border">
                <p className="font-mono text-lg tracking-wide">
                  {m.bank_account_number}
                </p>
                <p className="text-xs text-muted mt-1">
                  {m.bank_name} · {m.bank_account_name}
                </p>
              </div>
            ) : (
              <p className="text-xs text-amber-400">ยังไม่ได้ตั้งบัญชี</p>
            )}
          </div>
        ))}
      </div>

      {payouts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">โอนล่าสุด</p>
            <Link href="/finance" className="text-xs text-accent hover:underline">
              ดูทั้งหมด →
            </Link>
          </div>
          <div className="space-y-2">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border text-sm"
              >
                <span className="truncate">{p.payer?.display_name}</span>
                <ArrowRight size={12} className="text-muted shrink-0" />
                <span className="truncate text-accent">{p.payee?.display_name}</span>
                <span className="ml-auto font-semibold text-rose-300 shrink-0">
                  ฿{p.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link
        href="/finance"
        className="flex items-center justify-between p-4 rounded-2xl border border-accent/30 bg-accent/5 touch-manipulation"
      >
        <span className="font-medium text-sm">ไปหน้าการเงิน — สรุปรายรับ-รายจ่าย</span>
        <ChevronRight size={18} className="text-accent" />
      </Link>
    </div>
  );
}
