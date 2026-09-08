"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAuthErrorMessage } from "@/lib/auth-errors";
import { Eye, EyeOff } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { TEAM } from "@/lib/constants";
import { getAuthCallbackUrl } from "@/lib/env";

const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project") &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "your-anon-key";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    let supabase;
    try {
      supabase = createClient();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "ยังไม่ได้ตั้งค่า Supabase"
      );
      setLoading(false);
      return;
    }

    try {
      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) {
          setError(getAuthErrorMessage(authError));
          setLoading(false);
          return;
        }
      } else {
        const username = email.split("@")[0].toLowerCase();
        const teamMember = TEAM.members.find((m) => m.username === username);
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthCallbackUrl(),
            data: {
              username,
              display_name: teamMember?.displayName ?? username,
              ...(teamMember ? { role: teamMember.role } : {}),
            },
          },
        });

        if (authError) {
          setError(getAuthErrorMessage(authError));
          setLoading(false);
          return;
        }

        // ต้องยืนยันอีเมลก่อน (Supabase เปิด email confirm)
        if (data.user && !data.session) {
          setSuccess(
            "สมัครสำเร็จ! กรุณาเช็คอีเมลเพื่อยืนยันบัญชี แล้วค่อยเข้าสู่ระบบ"
          );
          setLoading(false);
          return;
        }
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch";
      setError(
        getAuthErrorMessage({
          name: "AuthRetryableFetchError",
          message,
        })
      );
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-12 animate-fade-in lg:grid-cols-[1fr_26rem]">
        <header className="max-w-xl lg:self-center">
          <Logo size="lg" />
          <p className="ticket-kicker mt-8">Limit Code Studio · Workspace</p>
          <div className="ticket-rule mt-3 mb-5 max-w-sm" />
          <h1 className="max-w-lg text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            จัดการทุกขั้นตอนการผลิตงานในที่เดียว
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted">{TEAM.tagline}</p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="ticket-card w-full p-5 sm:p-7"
        >
          <div className="mb-6 space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">
              {mode === "login" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
            </h2>
            <p className="text-sm text-muted">
              {mode === "login" ? "กลับเข้าสู่พื้นที่ทำงานของทีม" : "ใช้อีเมลของทีมเพื่อเริ่มต้น"}
            </p>
          </div>

          <div className="space-y-4">
          {!supabaseConfigured && (
            <div className="rounded-xl bg-(--status-amber-bg) p-4 text-sm text-(--status-amber-fg) space-y-1" role="status">
              <p><strong>ยังไม่ได้ตั้งค่า Supabase สำหรับสภาพแวดล้อมนี้</strong></p>
              <p>
                เพิ่ม{" "}
                <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> +{" "}
                <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
                ใน Vercel Environment Variables แล้ว Redeploy
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-(--status-red-bg) p-4 text-sm text-(--status-red-fg)" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl bg-(--status-green-bg) p-4 text-sm text-(--status-green-fg)" role="status" aria-live="polite">
              {success}
            </div>
          )}

          <Input
            label="อีเมล"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
          />

          <div className="relative">
            <Input
              label="รหัสผ่าน"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 top-6.75 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover hover:text-foreground"
              aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <Button type="submit" loading={loading} className="w-full">
            {mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </Button>

          <p className="text-center text-sm text-muted pt-1">
            {mode === "login" ? "ยังไม่มีบัญชี?" : "มีบัญชีแล้ว?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setSuccess("");
              }}
              className="min-h-11 px-1 font-semibold text-accent hover:underline"
            >
              {mode === "login" ? "สร้างบัญชี" : "เข้าสู่ระบบ"}
            </button>
          </p>
          </div>
        </form>
      </div>
    </main>
  );
}
