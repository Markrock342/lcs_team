"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, ChevronRight, Plus, ReceiptText, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ListRow,
  MetricTile,
  PageLoader,
  StatusStamp,
} from "@/components/ui";
import { PageHeader, PageShell } from "@/components/mobile-ui";
import { mergeProfileBank, hasBankInfo } from "@/lib/team-banks";
import { formatBaht } from "@/lib/money";
import { AccessDenied } from "@/components/AccessDenied";
import { useRole } from "@/components/RoleProvider";
import type { TeamPayout } from "@/lib/extras-types";
import type { Profile } from "@/lib/types";
import { format } from "date-fns";
import { th } from "date-fns/locale";

export default function PayoutsPage() {
  const { canViewFinance } = useRole();
  const [payouts, setPayouts] = useState<TeamPayout[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoadError("");
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
    if (payRes.error || memRes.error) {
      setLoadError(payRes.error?.message ?? memRes.error?.message ?? "โหลดข้อมูลไม่สำเร็จ");
    }
    setPayouts(payRes.data ?? []);
    setMembers((memRes.data ?? []).map(mergeProfileBank));
    setLoading(false);
  }

  if (!canViewFinance) {
    return <AccessDenied />;
  }

  if (loading) {
    return <PageLoader label="กำลังโหลดบัญชีรับโอน..." />;
  }

  return (
    <PageShell width="medium">
      <PageHeader
        title="บัญชีรับโอน"
        description="ข้อมูลธนาคารของทีมและรายการโอนล่าสุด"
        action={
          <Link href="/finance?pay=1">
            <Button>
              <Plus size={18} /> จ่ายเพื่อน
            </Button>
          </Link>
        }
      />

      {loadError && <ErrorState description={loadError} onRetry={load} />}

      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="สมาชิก" value={`${members.length} คน`} icon={<Users size={18} />} />
        <MetricTile label="พร้อมรับโอน" value={`${members.filter(hasBankInfo).length} คน`} icon={<Building2 size={18} />} />
      </div>

      <Card>
        <CardHeader title="บัญชีสมาชิก" description="ใช้ข้อมูลนี้ก่อนบันทึกการโอน" />
        <div className="divide-y divide-border">
          {members.map((member) => (
            <ListRow
              key={member.id}
              leading={<Avatar name={member.display_name} src={member.avatar_url} />}
              title={
                <div className="flex items-center gap-2">
                  <span className="truncate">{member.display_name}</span>
                  <StatusStamp label={hasBankInfo(member) ? "พร้อมรับโอน" : "ยังไม่ตั้งบัญชี"} tone={hasBankInfo(member) ? "green" : "amber"} />
                </div>
              }
              description={`@${member.username}`}
              trailing={
                hasBankInfo(member) ? (
                  <div className="max-w-52 text-right">
                    <p className="font-mono font-semibold tracking-wide tabular-nums">{member.bank_account_number}</p>
                    <p className="truncate text-xs text-muted">{member.bank_name} · {member.bank_account_name}</p>
                  </div>
                ) : undefined
              }
            />
          ))}
          {members.length === 0 && (
            <EmptyState icon={<Users size={24} />} title="ยังไม่มีสมาชิก" description="ไม่พบข้อมูลบัญชีสมาชิกในทีม" />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="โอนล่าสุด"
          description="5 รายการล่าสุด"
          action={<Link href="/finance" className="inline-flex min-h-10 items-center gap-1 px-2 text-sm font-medium text-accent hover:underline">ดูทั้งหมด <ChevronRight size={15} /></Link>}
        />
        <div className="divide-y divide-border">
          {payouts.map((payout) => (
            <ListRow
              key={payout.id}
              leading={<span className="flex size-9 items-center justify-center rounded-xl bg-surface-soft text-muted"><ReceiptText size={18} /></span>}
              title={
                <span className="flex items-center gap-2">
                  <span className="truncate">{payout.payer?.display_name}</span>
                  <ArrowRight size={13} className="shrink-0 text-muted" />
                  <span className="truncate">{payout.payee?.display_name}</span>
                </span>
              }
              description={format(new Date(payout.paid_at), "d MMM yyyy", { locale: th })}
              trailing={<span className="text-right font-semibold tabular-nums text-(--status-red-fg)">{formatBaht(payout.amount)}</span>}
            />
          ))}
          {payouts.length === 0 && (
            <EmptyState icon={<ReceiptText size={24} />} title="ยังไม่มีรายการโอน" description="บันทึกการโอนได้จากหน้าการเงิน" />
          )}
        </div>
      </Card>

      <Card interactive>
        <Link href="/finance" className="block">
          <ListRow
            title="ไปหน้าการเงิน"
            description="ดูสรุปรายรับและรายจ่าย"
            trailing={<ChevronRight size={18} className="text-accent" />}
          />
        </Link>
      </Card>
    </PageShell>
  );
}
