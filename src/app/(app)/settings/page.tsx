"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun, Bell, Download, Smartphone, Shield, User, Camera, Wallet } from "lucide-react";
import { PageHeader } from "@/components/mobile-ui";
import { Button, Select, Avatar, ProfileRoleBadges } from "@/components/ui";
import { useTheme } from "@/components/ThemeProvider";
import { subscribeToPush, unsubscribeFromPush, sendTestPush, getPushBlockers } from "@/components/PWARegister";
import { createClient } from "@/lib/supabase/client";
import { uploadFile, isImageFile } from "@/lib/upload";
import { exportToCSV } from "@/lib/activity";
import { ROLE_LABELS } from "@/lib/constants";
import {
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTIONS,
  hasPermission,
  isAdmin,
} from "@/lib/permissions";
import { getProfileDisplayRoles } from "@/lib/profile-display";
import { sendNotification } from "@/lib/notifications";
import type { NotificationPrefs } from "@/lib/notifications";
import type { Profile, TeamRole } from "@/lib/types";

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const [pushOn, setPushOn] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushTesting, setPushTesting] = useState(false);
  const [pushBlockers, setPushBlockers] = useState<string[]>([]);
  const [installable, setInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Profile[]>([]);
  const [roleSaving, setRoleSaving] = useState<string | null>(null);
  const [displaySaving, setDisplaySaving] = useState<string | null>(null);
  const [roleError, setRoleError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [notifyPrefs, setNotifyPrefs] = useState<NotificationPrefs>({
    notify_chat: true,
    notify_mentions: true,
    notify_tasks: true,
  });
  const [notifySaving, setNotifySaving] = useState(false);
  const [bankForm, setBankForm] = useState({
    bank_name: "",
    bank_account_number: "",
    bank_account_name: "",
  });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankSaved, setBankSaved] = useState(false);

  useEffect(() => {
    checkPush();
    loadProfile();
    setPushBlockers(getPushBlockers());
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
    if (data) {
      setNotifyPrefs({
        notify_chat: data.notify_chat !== false,
        notify_mentions: data.notify_mentions !== false,
        notify_tasks: data.notify_tasks !== false,
      });
      setBankForm({
        bank_name: data.bank_name ?? "",
        bank_account_number: data.bank_account_number ?? "",
        bank_account_name: data.bank_account_name ?? "",
      });
    }

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

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (!isImageFile(file.type)) {
      setRoleError("อัปโหลดได้เฉพาะไฟล์รูป");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setRoleError("รูปต้องไม่เกิน 5 MB");
      return;
    }

    setAvatarUploading(true);
    setRoleError("");

    const uploaded = await uploadFile(file, "avatars");
    if (!uploaded) {
      setRoleError("อัปโหลดรูปไม่สำเร็จ");
      setAvatarUploading(false);
      e.target.value = "";
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({ avatar_url: uploaded.url })
      .eq("id", profile.id)
      .select()
      .single();

    if (error) {
      setRoleError(error.message);
    } else if (data) {
      setProfile(data);
    }

    setAvatarUploading(false);
    e.target.value = "";
  }

  async function saveNotifyPref(key: keyof NotificationPrefs, value: boolean) {
    if (!profile) return;
    setNotifySaving(true);
    const next = { ...notifyPrefs, [key]: value };
    setNotifyPrefs(next);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ [key]: value })
      .eq("id", profile.id);

    setNotifySaving(false);
    if (error) {
      setNotifyPrefs(notifyPrefs);
    }
  }

  async function checkPush() {
    if (!("serviceWorker" in navigator)) return;
    try {
      if (process.env.NODE_ENV === "production") {
        await navigator.serviceWorker.register("/sw.js");
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPushOn(!!sub);
    } catch {
      setPushOn(false);
    }
  }

  async function togglePush() {
    setPushLoading(true);
    setPushError("");
    if (pushOn) {
      const ok = await unsubscribeFromPush();
      if (ok) setPushOn(false);
      else setPushError("ปิด Push ไม่สำเร็จ");
    } else {
      const result = await subscribeToPush();
      if (result.ok) setPushOn(true);
      else setPushError(result.error);
    }
    setPushLoading(false);
    setPushBlockers(getPushBlockers());
  }

  async function testPush() {
    setPushTesting(true);
    setPushError("");
    const result = await sendTestPush();
    if (!result.ok) setPushError(result.error ?? "ทดสอบไม่สำเร็จ");
    setPushTesting(false);
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

  async function saveBankInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBankSaving(true);
    setBankSaved(false);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        bank_name: bankForm.bank_name.trim() || null,
        bank_account_number: bankForm.bank_account_number.trim() || null,
        bank_account_name: bankForm.bank_account_name.trim() || null,
      })
      .eq("id", profile.id);
    setBankSaving(false);
    if (!error) {
      setBankSaved(true);
      setProfile({ ...profile, ...bankForm });
    }
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
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <Avatar
                  name={profile.display_name}
                  src={profile.avatar_url}
                  size="lg"
                />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 hover:opacity-100 transition-opacity">
                  {avatarUploading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera size={18} className="text-white" />
                  )}
                </span>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <div>
                <p className="font-medium text-sm">{profile.display_name}</p>
                <p className="text-xs text-muted">@{profile.username}</p>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="mt-1 text-xs text-accent hover:underline disabled:opacity-50"
                >
                  {avatarUploading ? "กำลังอัปโหลด..." : "เปลี่ยนรูปโปรไฟล์"}
                </button>
                <div className="mt-1">
                  <ProfileRoleBadges profile={profile} size="xs" />
                </div>
              </div>
            </div>
            <p className="text-xs text-muted">
              สิทธิ์จริง: <strong>{ROLE_LABELS[profile.role]}</strong>
              {!isAdmin(profile.role) && " — badge ถูกกำหนดโดย admin"}
            </p>
            {!isAdmin(profile.role) &&
              getProfileDisplayRoles(profile).includes("admin") && (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  มี badge Admin แต่สิทธิ์จริงยังเป็น PM — เลื่อนลงจะไม่เห็น{" "}
                  <strong>จัดการทีม & สิทธิ์</strong> จนกว่าจะตั้ง role เป็น admin ใน
                  Supabase (รัน <code className="text-accent">fix-restore-admin.sql</code>)
                </p>
              )}
          </div>
        </section>
      )}

      {profile && (
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <Wallet size={20} className="text-emerald-400" />
            <div>
              <p className="font-medium text-sm">บัญชีรับเงิน</p>
              <p className="text-xs text-muted">
                ให้เพื่อนในทีมเห็นตอนโอนจ้าง — หน้า「จ่ายทีม」
              </p>
            </div>
          </div>
          <form onSubmit={saveBankInfo} className="p-4 space-y-3">
            <input
              className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm"
              placeholder="ธนาคาร เช่น กรุงไทย"
              value={bankForm.bank_name}
              onChange={(e) =>
                setBankForm({ ...bankForm, bank_name: e.target.value })
              }
            />
            <input
              className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm font-mono"
              placeholder="เลขบัญชี"
              value={bankForm.bank_account_number}
              onChange={(e) =>
                setBankForm({ ...bankForm, bank_account_number: e.target.value })
              }
            />
            <input
              className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm"
              placeholder="ชื่อบัญชี"
              value={bankForm.bank_account_name}
              onChange={(e) =>
                setBankForm({ ...bankForm, bank_account_name: e.target.value })
              }
            />
            <Button type="submit" loading={bankSaving} className="w-full">
              บันทึกบัญชี
            </Button>
            {bankSaved && (
              <p className="text-xs text-emerald-400 text-center">บันทึกแล้ว ✓</p>
            )}
          </form>
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

        <div className="p-4 space-y-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Bell size={20} className="text-accent" />
              <div>
                <p className="font-medium text-sm">Push Notifications</p>
                <p className="text-xs text-muted">
                  {pushOn ? "เปิดอยู่" : "ปิดอยู่"} — แจ้งเตือนแม้ออกจากแอพ
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pushOn && (
                <Button
                  variant="secondary"
                  loading={pushTesting}
                  onClick={testPush}
                  className="text-xs px-3 py-1.5"
                >
                  ทดสอบ
                </Button>
              )}
              <Button variant={pushOn ? "secondary" : "primary"} loading={pushLoading} onClick={togglePush}>
                {pushOn ? "ปิด" : "เปิด"}
              </Button>
            </div>
          </div>
          {pushBlockers.length > 0 && (
            <ul className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-1 list-disc pl-5">
              {pushBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {pushError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {pushError}
            </p>
          )}
        </div>

        <div className="p-4 space-y-3">
          <div>
            <p className="font-medium text-sm">การแจ้งเตือนในแอพ</p>
            <p className="text-xs text-muted mt-0.5">
              ควบคุมประเภทที่อยากได้ — Push ยังใช้สวิตช์ด้านบน
            </p>
          </div>
          {(
            [
              {
                key: "notify_chat" as const,
                label: "ข้อความแชท",
                desc: "แจ้งเมื่อมีข้อความใน channel",
              },
              {
                key: "notify_mentions" as const,
                label: "@mention",
                desc: "แจ้งเมื่อถูก mention (แนะนำเปิด)",
              },
              {
                key: "notify_tasks" as const,
                label: "งานที่มอบหมาย",
                desc: "งานใหม่ + เตือนก่อนครบ 3 วัน / 1 วัน / วันครบ / เลยกำหนด",
              },
            ] as const
          ).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted">{desc}</p>
              </div>
              <button
                type="button"
                disabled={notifySaving}
                onClick={() => saveNotifyPref(key, !notifyPrefs[key])}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  notifyPrefs[key] ? "bg-accent" : "bg-zinc-600"
                }`}
                aria-pressed={notifyPrefs[key]}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    notifyPrefs[key] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          ))}
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
