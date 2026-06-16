"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  MessageCircle,
  LogOut,
  MoreHorizontal,
  Calendar,
  Receipt,
  History,
  LayoutTemplate,
  Settings,
} from "lucide-react";
import { Suspense, useState, useRef, useEffect } from "react";
import { InAppNotificationToasts } from "./InAppNotificationToasts";
import { createClient } from "@/lib/supabase/client";
import { Avatar, ProfileRoleBadges } from "./ui";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { getPageTitle } from "./mobile-ui";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import type { Profile } from "@/lib/types";

const MAIN_NAV = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/clients", label: "ลูกค้า", icon: Users },
  { href: "/tasks", label: "งาน", icon: CheckSquare },
  { href: "/schedule", label: "ตารางงาน", icon: Calendar },
  { href: "/chat", label: "แชททีม", icon: MessageCircle },
];

const EXTRA_NAV = [
  { href: "/invoices", label: "ใบแจ้งหนี้", icon: Receipt },
  { href: "/templates", label: "เทมเพลตงาน", icon: LayoutTemplate },
  { href: "/activity", label: "ประวัติกิจกรรม", icon: History },
  { href: "/settings", label: "ตั้งค่า", icon: Settings },
];

const MOBILE_NAV = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/tasks", label: "งาน", icon: CheckSquare },
  { href: "/clients", label: "ลูกค้า", icon: Users },
  { href: "/chat", label: "แชท", icon: MessageCircle },
  { href: "/more", label: "อื่นๆ", icon: MoreHorizontal },
];

export function AppShell({
  profile,
  children,
}: {
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const isChat = pathname === "/chat" || pathname.startsWith("/chat/");

  usePresenceHeartbeat();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const NavLinks = ({ items }: { items: typeof MAIN_NAV }) => (
    <>
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              active
                ? "bg-accent/15 text-accent"
                : "text-zinc-400 hover:text-foreground hover:bg-card-hover"
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-screen min-h-[100dvh]">
      {profile && (
        <Suspense fallback={null}>
          <InAppNotificationToasts userId={profile.id} />
        </Suspense>
      )}
      <aside className="hidden lg:flex flex-col w-64 bg-sidebar border-r border-brand fixed inset-y-0 left-0 overflow-y-auto">
        <div className="p-5 border-b border-brand">
          <div className="flex flex-col items-center gap-2 py-2">
            <Logo size="md" />
            <p className="text-[10px] text-muted tracking-widest uppercase">Team Workspace</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <NavLinks items={MAIN_NAV} />
          <div className="pt-3 mt-3 border-t border-border">
            <p className="px-3 py-1 text-[10px] text-muted uppercase tracking-wider">เพิ่มเติม</p>
            <NavLinks items={EXTRA_NAV} />
          </div>
        </nav>
        {profile && (
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <Avatar name={profile.display_name} src={profile.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile.display_name}</p>
                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                  <p className="text-xs text-muted truncate">@{profile.username}</p>
                  <ProfileRoleBadges profile={profile} size="xs" />
                </div>
              </div>
              <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-card-hover text-muted" title="ออกจากระบบ">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        )}
      </aside>

      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-sidebar/95 backdrop-blur-md border-b border-brand pt-safe">
        <div className="flex items-center justify-between gap-2 px-3 h-14 max-w-[100vw]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Logo size="xs" />
            <span className="font-semibold text-sm truncate">{getPageTitle(pathname)}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <NotificationBell />
            {profile && (
              <div className="relative" ref={profileRef}>
                <button onClick={() => setProfileOpen(!profileOpen)} className="p-1 rounded-full">
                  <Avatar name={profile.display_name} src={profile.avatar_url} size="sm" />
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-medium truncate">{profile.display_name}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <p className="text-xs text-muted">@{profile.username}</p>
                        <ProfileRoleBadges profile={profile} size="xs" />
                      </div>
                    </div>
                    <Link href="/settings" onClick={() => setProfileOpen(false)} className="block px-4 py-2.5 text-sm hover:bg-card-hover">ตั้งค่า</Link>
                    <button onClick={handleLogout} className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-400 hover:bg-card-hover">
                      <LogOut size={16} /> ออกจากระบบ
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        className={`flex-1 lg:ml-64 w-full min-w-0 ${
          isChat
            ? "flex flex-col h-dvh max-h-dvh overflow-hidden"
            : "overflow-x-hidden"
        }`}
      >
        <div className="hidden lg:flex shrink-0 items-center justify-end gap-2 px-6 py-3 border-b border-border">
          <NotificationBell />
          <Link href="/settings" className="text-sm text-muted hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-card-hover">ตั้งค่า</Link>
        </div>
        <div
          className={
            isChat
              ? "flex-1 min-h-0 overflow-hidden flex flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0"
              : "pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-6"
          }
        >
          <div
            className={`max-w-7xl mx-auto w-full ${
              isChat
                ? "flex-1 min-h-0 flex flex-col px-2 sm:px-6 py-2 lg:py-3"
                : "px-4 sm:px-6 py-4 sm:py-6"
            }`}
          >
            {children}
          </div>
        </div>
      </main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar/95 backdrop-blur-md border-t border-brand pb-safe">
        <div className="flex items-stretch justify-around min-h-16 px-1">
          {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href === "/more" && EXTRA_NAV.some((n) => pathname.startsWith(n.href)));
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[44px] touch-manipulation ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
