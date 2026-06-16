"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Calendar,
  MessageCircle,
  LogOut,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./ui";
import { Logo } from "./Logo";
import { getPageTitle } from "./mobile-ui";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/clients", label: "ลูกค้า", icon: Users },
  { href: "/tasks", label: "งาน", icon: CheckSquare },
  { href: "/schedule", label: "ตาราง", icon: Calendar },
  { href: "/chat", label: "แชท", icon: MessageCircle },
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

  const NavLinks = () => (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
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
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-sidebar border-r border-brand fixed inset-y-0 left-0">
        <div className="p-5 border-b border-brand">
          <div className="flex flex-col items-center gap-2 py-2">
            <Logo size="md" />
            <p className="text-[10px] text-muted tracking-widest uppercase">
              Team Workspace
            </p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <NavLinks />
        </nav>

        {profile && (
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <Avatar name={profile.display_name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile.display_name}</p>
                <p className="text-xs text-muted truncate">@{profile.username}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-card-hover text-muted hover:text-foreground transition-colors"
                title="ออกจากระบบ"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile header — ไม่มี hamburger ซ้ำกับ bottom nav */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-sidebar/95 backdrop-blur-md border-b border-brand pt-safe">
        <div className="flex items-center justify-between gap-3 px-4 h-14 max-w-[100vw]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Logo size="xs" />
            <span className="font-semibold text-sm truncate">
              {getPageTitle(pathname)}
            </span>
          </div>

          {profile && (
            <div className="relative shrink-0" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-card-hover active:bg-card-hover"
                aria-label="เมนูโปรไฟล์"
              >
                <Avatar name={profile.display_name} size="sm" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-medium truncate">{profile.display_name}</p>
                    <p className="text-xs text-muted">@{profile.username}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-400 hover:bg-card-hover active:bg-card-hover"
                  >
                    <LogOut size={16} />
                    ออกจากระบบ
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 lg:ml-64 w-full min-w-0 overflow-x-hidden">
        <div className="pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">{children}</div>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar/95 backdrop-blur-md border-t border-brand pb-safe">
        <div className="flex items-stretch justify-around min-h-16 px-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-w-0 min-h-[44px] transition-colors touch-manipulation ${
                  active ? "text-accent" : "text-muted active:text-foreground"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium leading-none truncate max-w-full px-0.5">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
