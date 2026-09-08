"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { Suspense, useState, useRef, useEffect } from "react";
import { InAppNotificationToasts } from "./InAppNotificationToasts";
import { CommandPalette } from "./CommandPalette";
import { ActionFeedbackProvider } from "./workspace/ActionFeedback";
import { createClient } from "@/lib/supabase/client";
import { Avatar, ProfileRoleBadges } from "./ui";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { getPageTitle } from "./mobile-ui";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { useChatUnreadTotal } from "@/hooks/useChatUnread";
import { MAIN_NAV, EXTRA_NAV, MOBILE_NAV, isNavActive, filterNavByAccess } from "@/lib/nav";
import { RoleProvider } from "./RoleProvider";
import { canViewFinance } from "@/lib/permissions";
import type { Profile } from "@/lib/types";

function NavLinks({
  items,
  pathname,
  chatUnread = 0,
}: {
  items: typeof MAIN_NAV;
  pathname: string;
  chatUnread?: number;
}) {
  return (
    <>
      {items.map(({ href, label, icon: Icon }) => {
        const active = isNavActive(pathname, href);
        const showUnread = href === "/chat" && chatUnread > 0 && !active;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              active
                ? "bg-accent/15 text-foreground"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            <span className="flex-1 truncate">{label}</span>
            {showUnread && (
              <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[10px] font-semibold text-white">
                {chatUnread > 99 ? "99+" : chatUnread}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}

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
  const [searchOpen, setSearchOpen] = useState(false);
  const isChat = pathname === "/chat" || pathname.startsWith("/chat/");

  const financeAccess = canViewFinance(profile);
  const mainNav = filterNavByAccess(MAIN_NAV, { canViewFinance: financeAccess });
  const extraNav = filterNavByAccess(EXTRA_NAV, { canViewFinance: financeAccess });
  const mobileNav = filterNavByAccess(MOBILE_NAV, { canViewFinance: financeAccess });
  const chatUnread = useChatUnreadTotal();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

  useEffect(() => {
    if (!profileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [profileOpen]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <RoleProvider profile={profile}>
    <ActionFeedbackProvider>
    <div className="flex min-h-dvh">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-xl bg-accent px-4 py-2 font-semibold text-white transition-transform focus-visible:translate-y-0"
      >
        ข้ามไปเนื้อหา
      </a>
      {profile && (
        <Suspense fallback={null}>
          <InAppNotificationToasts userId={profile.id} />
        </Suspense>
      )}
      <aside className="hidden lg:flex flex-col w-64 bg-sidebar border-r border-brand fixed inset-y-0 left-0 overflow-y-auto">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                LCS Studio
              </p>
              <p className="text-sm font-semibold tracking-tight">พื้นที่ทำงานทีม</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <NavLinks items={mainNav} pathname={pathname} chatUnread={chatUnread} />
          <div className="pt-3 mt-3 border-t border-border">
            <p className="px-3 py-1 text-[10px] text-muted font-semibold">เพิ่มเติม</p>
            <NavLinks items={extraNav} pathname={pathname} chatUnread={chatUnread} />
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
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-card-hover text-muted"
                aria-label="ออกจากระบบ"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        )}
      </aside>

      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-sidebar border-b border-border pt-safe">
        <div className="flex items-center justify-between gap-2 px-3 h-14 max-w-[100vw]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Logo size="xs" />
            <span className="font-semibold text-sm truncate">{getPageTitle(pathname)}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:text-accent touch-manipulation"
              aria-label="ค้นหา"
            >
              <Search size={18} />
            </button>
            <Suspense fallback={null}>
              <NotificationBell />
            </Suspense>
            {profile && (
              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full"
                  aria-label="เมนูโปรไฟล์"
                  aria-expanded={profileOpen}
                >
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
        id="main-content"
        tabIndex={-1}
        className={`flex-1 lg:ml-64 w-full min-w-0 ${
          isChat
            ? "flex flex-col h-dvh max-h-dvh overflow-hidden"
            : "overflow-x-hidden"
        }`}
      >
        <div className="hidden lg:flex shrink-0 items-center justify-end gap-2 px-6 py-3 border-b border-border bg-sidebar/40">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-muted hover:text-foreground hover:border-accent/30"
          >
            <Search size={14} /> ค้นหา
            <kbd className="text-[10px] px-1 rounded bg-background border border-border">⌘K</kbd>
          </button>
          <Suspense fallback={null}>
            <NotificationBell />
          </Suspense>
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

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-border pb-safe">
        <div className="flex items-stretch justify-around min-h-16 px-1">
          {mobileNav.map(({ href, label, icon: Icon }) => {
            const active = isNavActive(pathname, href);
            const showUnread = href === "/chat" && chatUnread > 0 && !active;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={showUnread ? `${label} ${chatUnread} ข้อความยังไม่อ่าน` : label}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-11 touch-manipulation ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                  {showUnread && (
                    <span className="absolute -right-2.5 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[9px] font-semibold leading-4 text-white">
                      {chatUnread > 99 ? "99+" : chatUnread}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
    </ActionFeedbackProvider>
    </RoleProvider>
  );
}
