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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden bg-brand-mesh">
      <div className="relative w-full max-w-[26rem] animate-fade-in">
        <div className="mb-7">
          <Logo size="lg" />
          <p className="ticket-kicker mt-5">Limit Code Studio</p>
          <h1 className="text-[1.7rem] font-semibold tracking-tight mt-2">
            {mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </h1>
          <p className="text-muted text-sm mt-1.5">{TEAM.tagline}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="ticket-card p-6 space-y-4"
        >
          {!supabaseConfigured && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm space-y-1">
              <p>
                <strong>.env.local ใช้ได้แค่ localhost</strong> — ไม่ถูก push ขึ้น Vercel
              </p>
              <p>
                ไปที่ Vercel → Project → Settings → Environment Variables แล้วใส่{" "}
                <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> +{" "}
                <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
                (copy จาก .env.local) → กด <strong>Redeploy</strong>
              </p>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
              {success}
            </div>
          )}

          <Input
            label="อีเมล"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
          />

          <div className="relative">
            <Input
              label="รหัสผ่าน"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[34px] text-muted hover:text-foreground"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <Button type="submit" loading={loading} className="w-full">
            {mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </Button>

          <p className="text-center text-sm text-muted">
            {mode === "login" ? "ยังไม่มีบัญชี?" : "มีบัญชีแล้ว?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setSuccess("");
              }}
              className="text-accent hover:underline"
            >
              {mode === "login" ? "สมัครเลย" : "เข้าสู่ระบบ"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
