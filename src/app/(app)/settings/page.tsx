"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Bell, Download, Smartphone, Shield, User } from "lucide-react";
import { PageHeader } from "@/components/mobile-ui";
import { Button, Select, Avatar, ProfileRoleBadges } from "@/components/ui";
import { useTheme } from "@/components/ThemeProvider";
import { subscribeToPush, unsubscribeFromPush } from "@/components/PWARegister";
import { createClient } from "@/lib/supabase/client";
import { exportToCSV } from "@/lib/activity";
import { ROLE_LABELS } from "@/lib/constants";
import {
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTIONS,
  hasPermission,
  isAdmin,
} from "@/lib/permissions";
import { getProfileDisplayRoles } from "@/lib/profile-display";
import type { Profile, TeamRole } from "@/lib/types";

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const [pushOn, setPushOn] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Profile[]>([]);
  const [roleSaving, setRoleSaving] = useState<string | null>(null);
  const [displaySaving, setDisplaySaving] = useState<string | null>(null);
  const [roleError, setRoleError] = useState("");

  useEffect(() => {
    checkPush();
    loadProfile();
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).standalone === true
    );
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      (window as any).__pwaPrompt = e;
      setInstallable(true);
    });
  }, []);

  async function loadProfile() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    setProfile(data);

    if (data && hasPermission(data.role, "manage_team")) {
      const { data: members } = await supabase
        .from("profiles")
        .select("*")
        .order("display_name");
      setTeam(members ?? []);
    }
  }

  async function updateMemberRole(memberId: string, role: TeamRole) {
    setRoleSaving(memberId);
    setRoleError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id === memberId) {
      setRoleError("เปลี่ยน role ตัวเองไม่ได้ — ให้ admin คนอื่นจัดการ (admin มีสิทธิ์ PM ครบอยู่แล้ว)");
      setRoleSaving(null);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", memberId);

    if (error) {
      setRoleError(error.message);
    } else {
      setTeam((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role } : m))
      );
    }
    setRoleSaving(null);
  }

  async function updateMemberDisplayRole(memberId: string, role: TeamRole) {
    const member = team.find((m) => m.id === memberId);
    if (!member || !profile || !isAdmin(profile.role)) return;

    setDisplaySaving(memberId);
    setRoleError("");

    const current = getProfileDisplayRoles(member);
    let next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    if (next.length === 0) next = [member.role];

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_roles: next })
      .eq("id", memberId);

    if (error) {
      setRoleError(error.message);
    } else {
      setTeam((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, display_roles: next } : m))
      );
      if (memberId === profile.id) {
        setProfile({ ...profile, display_roles: next });
      }
    }
    setDisplaySaving(null);
  }

  async function checkPush() {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    setPushOn(!!sub);
  }

  async function togglePush() {
    setPushLoading(true);
    if (pushOn) {
      await unsubscribeFromPush();
      setPushOn(false);
    } else {
      const ok = await subscribeToPush();
      setPushOn(ok);
    }
    setPushLoading(false);
  }

  async function exportAll() {
    const supabase = createClient();
    const [clients, tasks] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("tasks").select("*, client:clients(name)"),
    ]);
    exportToCSV(
      "clients.csv",
      ["ชื่อ", "บริษัท", "สถานะ", "ประเภท"],
      (clients.data ?? []).map((c) => [c.name, c.company ?? "", c.status, c.project_type])
    );
    setTimeout(() => {
      exportToCSV(
        "tasks.csv",
        ["งาน", "ลูกค้า", "สถานะ", "เริ่ม", "ครบ"],
        (tasks.data ?? []).map((t) => [
          t.title,
          t.client?.name ?? "",
          t.status,
          t.start_date ?? "",
          t.due_date ?? "",
        ])
      );
    }, 500);
  }

  async function installApp() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prompt = (window as any).__pwaPrompt;
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice;
      setInstallable(false);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-lg">
      <PageHeader title="ตั้งค่า" description="PWA, Push, Theme และ Export" />

      {profile && (
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <User size={20} className="text-accent" />
            <div>
              <p className="font-medium text-sm">โปรไฟล์ของฉัน</p>
              <p className="text-xs text-muted">badge ที่ทีมเห็นใน sidebar / แชท</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar name={profile.display_name} />
              <div>
                <p className="font-medium text-sm">{profile.display_name}</p>
                <p className="text-xs text-muted">@{profile.username}</p>
                <div className="mt-1">
                  <ProfileRoleBadges profile={profile} size="xs" />
                </div>
              </div>
            </div>
            <p className="text-xs text-muted">
              สิทธิ์จริง: <strong>{ROLE_LABELS[profile.role]}</strong>
              {!isAdmin(profile.role) && " — badge ถูกกำหนดโดย admin"}
            </p>
          </div>
        </section>
      )}

      {profile && hasPermission(profile.role, "manage_team") && (
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <Shield size={20} className="text-red-400" />
            <div>
              <p className="font-medium text-sm">จัดการทีม & สิทธิ์</p>
              <p className="text-xs text-muted">มอบหมาย role และ badge ให้สมาชิก (เฉพาะ admin)</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {team.map((member) => (
              <div key={member.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{member.display_name}</p>
                    <p className="text-xs text-muted">@{member.username}</p>
                  </div>
                  <ProfileRoleBadges profile={member} size="xs" />
                </div>
                <Select
                  label="หน้าที่ (สิทธิ์จริง)"
                  value={member.role}
                  disabled={roleSaving === member.id || member.id === profile?.id}
                  onChange={(e) =>
                    updateMemberRole(member.id, e.target.value as TeamRole)
                  }
                >
                  {ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
                <div>
                  <p className="text-xs text-muted mb-2">Badge ที่ทีมเห็น</p>
                  <div className="flex flex-wrap gap-2">
                    {ASSIGNABLE_ROLES.map((role) => {
                      const on = getProfileDisplayRoles(member).includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          disabled={displaySaving === member.id}
                          onClick={() => updateMemberDisplayRole(member.id, role)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            on
                              ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                              : "bg-background border border-border text-muted hover:text-foreground"
                          }`}
                        >
                          {ROLE_LABELS[role]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[11px] text-muted">{ROLE_DESCRIPTIONS[member.role]}</p>
                {member.id === profile?.id && (
                  <p className="text-[11px] text-amber-400">
                    เปลี่ยน role ตัวเองไม่ได้ — ใช้ admin ถ้าต้องการสิทธิ์ PM + จัดการทีม
                  </p>
                )}
              </div>
            ))}
          </div>
          {roleError && (
            <p className="px-4 pb-4 text-xs text-red-400">{roleError}</p>
          )}
        </section>
      )}

      <section className="bg-card border border-border rounded-2xl divide-y divide-border">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            {theme === "dark" ? <Moon size={20} className="text-accent" /> : <Sun size={20} className="text-amber-400" />}
            <div>
              <p className="font-medium text-sm">ธีม</p>
              <p className="text-xs text-muted">{theme === "dark" ? "Dark Mode" : "Light Mode"}</p>
            </div>
          </div>
          <Button variant="secondary" onClick={toggle}>สลับ</Button>
        </div>

        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Bell size={20} className="text-accent" />
            <div>
              <p className="font-medium text-sm">Push Notifications</p>
              <p className="text-xs text-muted">แจ้งเตือนแม้ออกจากแอพ</p>
            </div>
          </div>
          <Button variant={pushOn ? "secondary" : "primary"} loading={pushLoading} onClick={togglePush}>
            {pushOn ? "ปิด" : "เปิด"}
          </Button>
        </div>

        {!isStandalone && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Smartphone size={20} className="text-accent shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm">ติดตั้งแอพ (PWA)</p>
                <p className="text-xs text-muted">เพิ่มไปหน้าจอ Home</p>
              </div>
              {installable && (
                <Button onClick={installApp} className="shrink-0 ml-auto">
                  ติดตั้ง
                </Button>
              )}
            </div>
            {!installable && isIos && (
              <p className="text-xs text-muted pl-8">
                iPhone/iPad: Safari → ปุ่ม <strong>แชร์</strong> → <strong>Add to Home Screen</strong>
              </p>
            )}
            {!installable && !isIos && (
              <p className="text-xs text-muted pl-8">
                Chrome/Edge: เมนู ⋮ → <strong>Install app</strong> / <strong>ติดตั้งแอป</strong>
              </p>
            )}
          </div>
        )}

        {isStandalone && (
          <div className="flex items-center gap-3 p-4">
            <Smartphone size={20} className="text-emerald-400" />
            <p className="text-sm text-emerald-400">ติดตั้งเป็นแอพแล้ว ✓</p>
          </div>
        )}

        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Download size={20} className="text-accent" />
            <div>
              <p className="font-medium text-sm">Export ข้อมูล</p>
              <p className="text-xs text-muted">CSV ลูกค้า + งาน</p>
            </div>
          </div>
          {(!profile || hasPermission(profile.role, "export_data")) && (
            <Button variant="secondary" onClick={exportAll}>Export</Button>
          )}
        </div>
      </section>

      {!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1">
          <p>
            <strong>Push Notifications (ไม่บังคับ)</strong> — แอพใช้ได้ปกติแม้ไม่เปิด
          </p>
          <p>
            ถ้าอยากได้ push: รัน <code>node scripts/generate-vapid.js</code> แล้วใส่ 3 ค่าใน{" "}
            <code>.env.local</code> (local) และ <strong>Vercel Environment Variables</strong> (production) แล้ว redeploy
          </p>
        </p>
      )}
    </div>
  );
}
