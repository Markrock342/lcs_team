"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Shield, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  MetricTile,
  PageLoader,
  ProfileRoleBadges,
  StatusStamp,
} from "@/components/ui";
import { FilterTabs, PageHeader, PageShell } from "@/components/mobile-ui";
import { useRole } from "@/components/RoleProvider";
import { ROLE_ASSIGN_LABELS, ROLE_LABELS } from "@/lib/constants";
import { ASSIGNABLE_ROLES, isAdmin } from "@/lib/permissions";
import { getProfileDisplayRoles } from "@/lib/profile-display";
import { formatPresenceStatus, isOnline } from "@/lib/presence";
import type { Profile, TeamRole } from "@/lib/types";

type FilterKey = "all" | "online" | TeamRole;

export default function TeamPage() {
  const { role } = useRole();
  const canManage = !!role && isAdmin(role);
  const [members, setMembers] = useState<Profile[]>([]);
  const [openByMember, setOpenByMember] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  async function load() {
    setError("");
    const supabase = createClient();
    const [profileRes, taskRes] = await Promise.all([
      supabase.from("profiles").select("*").order("display_name"),
      supabase.from("tasks").select("assigned_to, status").neq("status", "done"),
    ]);

    if (profileRes.error) {
      setError(profileRes.error.message);
      setLoading(false);
      return;
    }

    const counts: Record<string, number> = {};
    for (const task of taskRes.data ?? []) {
      if (!task.assigned_to) continue;
      counts[task.assigned_to] = (counts[task.assigned_to] ?? 0) + 1;
    }

    setMembers(profileRes.data ?? []);
    setOpenByMember(counts);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const onlineCount = members.filter((member) => isOnline(member.last_seen_at)).length;
  const openTaskCount = Object.values(openByMember).reduce((sum, n) => sum + n, 0);

  const presentRoles = useMemo(() => {
    const seen = new Set<TeamRole>();
    for (const member of members) {
      for (const badge of getProfileDisplayRoles(member)) seen.add(badge);
    }
    return ASSIGNABLE_ROLES.filter((r) => seen.has(r));
  }, [members]);

  const visible = useMemo(() => {
    const sorted = [...members].sort((a, b) => {
      const aOn = isOnline(a.last_seen_at) ? 0 : 1;
      const bOn = isOnline(b.last_seen_at) ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return a.display_name.localeCompare(b.display_name, "th");
    });

    if (filter === "all") return sorted;
    if (filter === "online") return sorted.filter((member) => isOnline(member.last_seen_at));
    return sorted.filter((member) => getProfileDisplayRoles(member).includes(filter));
  }, [members, filter]);

  const tabs = [
    { key: "all", label: "ทั้งหมด", count: members.length },
    { key: "online", label: "ออนไลน์", count: onlineCount },
    ...presentRoles.map((r) => ({
      key: r,
      label: ROLE_LABELS[r],
      count: members.filter((m) => getProfileDisplayRoles(m).includes(r)).length,
    })),
  ];

  if (loading) {
    return <PageLoader label="กำลังโหลดสมาชิกทีม..." />;
  }

  return (
    <PageShell width="medium">
      <PageHeader
        title="สมาชิกทีม"
        description="ดูแผนก ป้ายหน้าที่ และว่าใครออนไลน์อยู่"
        action={
          canManage ? (
            <Link href="/settings#team">
              <Button variant="secondary">
                <Shield size={16} /> จัดการสิทธิ์
              </Button>
            </Link>
          ) : undefined
        }
      />

      {error && <ErrorState description={error} onRetry={() => { setLoading(true); void load(); }} />}

      <div className="grid grid-cols-3 gap-3">
        <MetricTile label="สมาชิก" value={`${members.length} คน`} icon={<UsersRound size={18} />} />
        <MetricTile label="ออนไลน์" value={`${onlineCount} คน`} />
        <MetricTile label="งานค้าง" value={`${openTaskCount} งาน`} />
      </div>

      <FilterTabs
        tabs={tabs}
        active={filter}
        onChange={(key) => setFilter(key as FilterKey)}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<UsersRound size={28} />}
          title="ไม่พบสมาชิกในตัวกรองนี้"
          description="ลองเลือกทั้งหมด หรือแผนกอื่น"
        />
      ) : (
        <section className="ticket-card divide-y divide-border overflow-hidden">
          {visible.map((member) => {
            const online = isOnline(member.last_seen_at);
            const openTasks = openByMember[member.id] ?? 0;
            return (
              <article key={member.id} className="flex items-start gap-4 p-5">
                <Avatar name={member.display_name} src={member.avatar_url} size="lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{member.display_name}</h2>
                    <StatusStamp
                      label={online ? "ออนไลน์" : "ออฟไลน์"}
                      tone={online ? "green" : "slate"}
                    />
                  </div>
                  <p className="text-sm text-muted">@{member.username}</p>
                  <ProfileRoleBadges profile={member} />
                  <p className="text-sm leading-relaxed text-muted">
                    สิทธิ์จริง {ROLE_ASSIGN_LABELS[member.role]}
                    {" · "}
                    {openTasks > 0 ? `${openTasks} งานค้าง` : "ไม่มีงานค้าง"}
                    {" · "}
                    {formatPresenceStatus(member.last_seen_at)}
                  </p>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </PageShell>
  );
}
