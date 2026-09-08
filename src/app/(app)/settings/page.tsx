"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Moon, Sun, Bell, Download, Smartphone, Shield, User, Camera, Wallet, PenLine } from "lucide-react";
import { PageHeader, PageShell } from "@/components/mobile-ui";
import { Button, Input, Select, Avatar, ProfileRoleBadges, PageLoader, ErrorState } from "@/components/ui";
import { SystemHealthPanel } from "@/components/workspace/SystemHealthPanel";
import { useTheme } from "@/components/ThemeProvider";
import { subscribeToPush, unsubscribeFromPush, sendTestPush, getPushBlockers } from "@/components/PWARegister";
import { createClient } from "@/lib/supabase/client";
import { uploadFile, isImageFile } from "@/lib/upload";
import { exportToCSV } from "@/lib/activity";
import { ROLE_ASSIGN_LABELS, ROLE_LABELS } from "@/lib/constants";
import {
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTIONS,
  hasPermission,
  isAdmin,
} from "@/lib/permissions";
import { getProfileDisplayRoles } from "@/lib/profile-display";
import { DEFAULT_TEAM_BANKS } from "@/lib/team-banks";
import type { NotificationPrefs } from "@/lib/notifications";
import type { Profile, TeamRole } from "@/lib/types";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<unknown>;
}

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
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
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
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    async function initializeClientState() {
      await Promise.resolve();
      setPushBlockers(getPushBlockers());
      setIsStandalone(
        window.matchMedia("(display-mode: standalone)").matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true
      );
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    }

    function handleBeforeInstallPrompt(event: Event) {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      installPromptRef.current = promptEvent;
      setInstallable(true);
    }

    void checkPush();
    void loadProfile();
    void initializeClientState();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  async function loadProfile() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setProfileError("ไม่พบข้อมูลผู้ใช้ เข้าสู่ระบบอีกครั้ง");
      setProfileLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (error) {
      setProfileError(error.message);
      setProfileLoading(false);
      return;
    }
    setProfile(data);
    if (data) {
      setNotifyPrefs({
        notify_chat: data.notify_chat !== false,
        notify_mentions: data.notify_mentions !== false,
        notify_tasks: data.notify_tasks !== false,
      });
      setBankForm({
        bank_name:
          data.bank_name ??
          DEFAULT_TEAM_BANKS[data.username.toLowerCase().replace(/_.*$/, "")]
            ?.bank_name ??
          "",
        bank_account_number:
          data.bank_account_number ??
          DEFAULT_TEAM_BANKS[data.username.toLowerCase().replace(/_.*$/, "")]
            ?.bank_account_number ??
          "",
        bank_account_name:
          data.bank_account_name ??
          DEFAULT_TEAM_BANKS[data.username.toLowerCase().replace(/_.*$/, "")]
            ?.bank_account_name ??
          "",
      });
    }

    if (data && hasPermission(data.role, "manage_team")) {
      const { data: members } = await supabase
        .from("profiles")
        .select("*")
        .order("display_name");
      setTeam(members ?? []);
    }
    setProfileLoading(false);
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
    if (!uploaded.ok) {
      setRoleError(uploaded.error);
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
    const prompt = installPromptRef.current;
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      setInstallable(false);
    }
  }

  return (
    <PageShell width="compact">
      <PageHeader title="ตั้งค่า" description="จัดการโปรไฟล์ การแจ้งเตือน แอป และสุขภาพระบบ" />

      <SystemHealthPanel />

      <section className="ticket-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <PenLine size={20} className="text-accent" />
          <div>
            <h2 className="font-semibold">ผู้ช่วยร่างข้อความ</h2>
            <p className="text-sm text-muted">ร่างข้อความขาย ไม่ส่งแทน และไม่เปลี่ยนสถานะเอง</p>
          </div>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-sm text-muted">
            ไปที่แผนกขาย แล้วเปิดการ์ดรายชื่อเป้าหมาย จะมีปุ่มร่างอีเมล สคริปต์โทร สรุปการคุย และงานถัดไป
          </p>
          <p className="text-sm text-muted">
            ต้องใส่ <span className="font-medium text-foreground">GEMINI_API_KEY</span> ใน environment ของเซิร์ฟเวอร์ (คีย์ Google AI Studio ที่ขึ้นต้น AIza) อย่าใส่ใน NEXT_PUBLIC_
          </p>
          <Link href="/sales?view=prospects">
            <Button>ไปแผนกขาย</Button>
          </Link>
        </div>
      </section>

      {profileLoading && <PageLoader label="กำลังโหลดการตั้งค่า..." />}
      {!profileLoading && profileError && (
        <ErrorState
          title="โหลดโปรไฟล์ไม่สำเร็จ"
          description={profileError}
          onRetry={() => {
            setProfileError("");
            setProfileLoading(true);
            void loadProfile();
          }}
        />
      )}

      {!profileLoading && profile && (
        <section className="ticket-card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <User size={20} className="text-accent" />
            <div>
              <h2 className="font-semibold">โปรไฟล์ของฉัน</h2>
              <p className="text-sm text-muted">รูปและป้ายหน้าที่ที่ทีมเห็น</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-accent/40 min-h-12 min-w-12"
                aria-label="เปลี่ยนรูปโปรไฟล์"
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
                  className="mt-1 min-h-11 text-sm font-medium text-accent hover:underline disabled:opacity-50"
                >
                  {avatarUploading ? "กำลังอัปโหลด..." : "เปลี่ยนรูปโปรไฟล์"}
                </button>
                <div className="mt-1">
                  <ProfileRoleBadges profile={profile} size="xs" />
                </div>
              </div>
            </div>
            <p className="text-sm text-muted">
              สิทธิ์จริง: <strong>{ROLE_ASSIGN_LABELS[profile.role]}</strong>
              {!isAdmin(profile.role) && " — badge ถูกกำหนดโดย admin"}
            </p>
            {!isAdmin(profile.role) &&
              getProfileDisplayRoles(profile).includes("admin") && (
                <p className="rounded-xl bg-(--status-amber-bg) p-4 text-sm text-(--status-amber-fg)" role="status">
                  มีป้าย Admin แต่สิทธิ์จริงยังเป็น PM จึงยังจัดการทีมไม่ได้{" "}
                  <strong>จัดการทีม & สิทธิ์</strong> จนกว่าจะตั้ง role เป็น admin ใน
                  Supabase (รัน <code className="text-accent">fix-restore-admin.sql</code>)
                </p>
              )}
          </div>
        </section>
      )}

      {roleError && (
        <div className="rounded-xl bg-(--status-red-bg) p-4 text-sm text-(--status-red-fg)" role="alert">
          {roleError}
        </div>
      )}

      {!profileLoading && profile && (
        <section className="ticket-card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <Wallet size={20} className="text-accent" />
            <div>
              <h2 className="font-semibold">บัญชีรับเงิน</h2>
              <p className="text-sm text-muted">
                แสดงให้ทีมเห็นเมื่อโอนเงินในหน้าจ่ายทีม
              </p>
            </div>
          </div>
          <form onSubmit={saveBankInfo} className="p-5 space-y-4">
            <Input
              label="ธนาคาร"
              placeholder="เช่น กรุงไทย"
              value={bankForm.bank_name}
              onChange={(e) =>
                setBankForm({ ...bankForm, bank_name: e.target.value })
              }
            />
            <Input
              label="เลขบัญชี"
              placeholder="xxx-x-xxxxx-x"
              className="font-mono"
              value={bankForm.bank_account_number}
              onChange={(e) =>
                setBankForm({ ...bankForm, bank_account_number: e.target.value })
              }
            />
            <Input
              label="ชื่อบัญชี"
              placeholder="ชื่อที่โอนเข้า"
              value={bankForm.bank_account_name}
              onChange={(e) =>
                setBankForm({ ...bankForm, bank_account_name: e.target.value })
              }
            />
            <Button type="submit" loading={bankSaving} className="w-full">
              บันทึกบัญชี
            </Button>
            {bankSaved && (
              <p className="rounded-xl bg-(--status-green-bg) p-3 text-center text-sm font-medium text-(--status-green-fg)" role="status">บันทึกบัญชีแล้ว</p>
            )}
          </form>
        </section>
      )}

      {profile && hasPermission(profile.role, "manage_team") && (
        <section className="ticket-card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <Shield size={20} className="text-accent" />
            <div>
              <h2 className="font-semibold">จัดการทีมและสิทธิ์</h2>
              <p className="text-sm text-muted">กำหนดสิทธิ์จริงและป้าย BE / FN / UI ของสมาชิก</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {team.map((member) => (
              <div key={member.id} className="p-5 space-y-3">
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
                      {ROLE_ASSIGN_LABELS[role]}
                    </option>
                  ))}
                </Select>
                <div>
                  <p className="text-sm text-muted mb-2">ป้ายที่ทีมเห็น — BE / FN / UI</p>
                  <div className="flex flex-wrap gap-2">
                    {ASSIGNABLE_ROLES.map((role) => {
                      const on = getProfileDisplayRoles(member).includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          disabled={displaySaving === member.id}
                          onClick={() => updateMemberDisplayRole(member.id, role)}
                          className={`min-h-11 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                            on
                              ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                              : "bg-surface-soft border border-border text-muted hover:text-foreground"
                          }`}
                        >
                          {ROLE_LABELS[role]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    ป้าย FN หรือสิทธิ์บัญชี/แอดมิน ถึงจะเข้าหน้าการเงิน สลิป และยอดเงินได้
                  </p>
                </div>
                <p className="text-sm text-muted">{ROLE_DESCRIPTIONS[member.role]}</p>
                {member.id === profile?.id && (
                  <p className="text-sm text-(--status-amber-fg)">
                    เปลี่ยนสิทธิ์ตัวเองไม่ได้ ต้องให้แอดมินคนอื่นทำแทน
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="ticket-card divide-y divide-border overflow-hidden">
        <div className="flex min-h-20 items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            {theme === "dark" ? <Moon size={20} className="text-accent" /> : <Sun size={20} className="text-(--status-amber-fg)" />}
            <div>
              <p className="font-medium">ธีม</p>
              <p className="text-sm text-muted">{theme === "dark" ? "โหมดมืด" : "โหมดสว่าง"}</p>
            </div>
          </div>
          <Button variant="secondary" onClick={toggle}>สลับ</Button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Bell size={20} className="text-accent" />
              <div>
                <p className="font-medium">การแจ้งเตือนแบบ Push</p>
                <p className="text-sm text-muted">
                  {pushOn ? "เปิดอยู่" : "ปิดอยู่"} · แจ้งได้แม้ปิดแอป
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pushOn && (
                <Button
                  variant="secondary"
                  loading={pushTesting}
                  onClick={testPush}
                  className="px-3"
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
            <ul className="rounded-xl bg-(--status-amber-bg) p-4 pl-8 text-sm text-(--status-amber-fg) space-y-1 list-disc">
              {pushBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {pushError && (
            <p className="rounded-xl bg-(--status-red-bg) p-4 text-sm text-(--status-red-fg)" role="alert">
              {pushError}
            </p>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="font-medium">การแจ้งเตือนในแอป</p>
            <p className="text-sm text-muted mt-0.5">
              เลือกเฉพาะเรื่องที่ต้องการรับ
            </p>
          </div>
          {(
            [
              {
                key: "notify_chat" as const,
                label: "ข้อความแชท",
                desc: "แจ้งเมื่อมีข้อความใหม่ในช่อง",
              },
              {
                key: "notify_mentions" as const,
                label: "การกล่าวถึง",
                desc: "แจ้งเมื่อมีคนกล่าวถึงคุณ",
              },
              {
                key: "notify_tasks" as const,
                label: "งานที่มอบหมาย",
                desc: "งานใหม่และกำหนดส่งที่ใกล้เข้ามา",
              },
            ] as const
          ).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{label}</p>
                <p className="text-sm text-muted">{desc}</p>
              </div>
              <button
                type="button"
                disabled={notifySaving}
                onClick={() => saveNotifyPref(key, !notifyPrefs[key])}
                className="relative h-11 w-12 shrink-0"
                aria-pressed={notifyPrefs[key]}
                aria-label={`${label}: ${notifyPrefs[key] ? "เปิด" : "ปิด"}`}
              >
                <span
                  className={`absolute inset-x-0 top-2 h-7 rounded-full transition-colors ${
                    notifyPrefs[key] ? "bg-accent" : "bg-surface-raised"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-foreground transition-transform ${
                      notifyPrefs[key] ? "translate-x-5" : ""
                    }`}
                  />
                </span>
              </button>
            </div>
          ))}
        </div>

        {!isStandalone && (
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Smartphone size={20} className="text-accent shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">ติดตั้งแอป</p>
                <p className="text-sm text-muted">เพิ่มไว้บนหน้าจอโฮม</p>
              </div>
              {installable && (
                <Button onClick={installApp} className="shrink-0 ml-auto">
                  ติดตั้ง
                </Button>
              )}
            </div>
            {!installable && isIos && (
              <p className="text-sm text-muted pl-8">
                iPhone/iPad: Safari → ปุ่ม <strong>แชร์</strong> → <strong>Add to Home Screen</strong>
              </p>
            )}
            {!installable && !isIos && (
              <p className="text-sm text-muted pl-8">
                Chrome/Edge: เมนู ⋮ → <strong>Install app</strong> / <strong>ติดตั้งแอป</strong>
              </p>
            )}
          </div>
        )}

        {isStandalone && (
          <div className="flex items-center gap-3 p-5 text-(--status-green-fg)">
            <Smartphone size={20} />
            <p className="font-medium">ติดตั้งเป็นแอปแล้ว</p>
          </div>
        )}

        <div className="flex min-h-20 items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <Download size={20} className="text-accent" />
            <div>
              <p className="font-medium">ส่งออกข้อมูล</p>
              <p className="text-sm text-muted">ดาวน์โหลดลูกค้าและงานเป็น CSV</p>
            </div>
          </div>
          {(!profile || hasPermission(profile.role, "export_data")) && (
            <Button variant="secondary" onClick={exportAll}>ส่งออก</Button>
          )}
        </div>
      </section>

      {!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
        <div className="rounded-2xl bg-(--status-amber-bg) p-4 text-sm text-(--status-amber-fg) space-y-1" role="status">
          <p><strong>ยังไม่ได้ตั้งค่า Push</strong> แอปยังใช้งานได้ตามปกติ</p>
          <p>
            ถ้าอยากได้ push: รัน <code>node scripts/generate-vapid.js</code> แล้วใส่ 3 ค่าใน{" "}
            <code>.env.local</code> (local) และ <strong>Vercel Environment Variables</strong> (production) แล้ว redeploy
          </p>
        </div>
      )}
    </PageShell>
  );
}
