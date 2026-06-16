import { ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function SetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-brand-mesh">
      <div className="max-w-lg w-full animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Logo size="lg" />
          </div>
          <h1 className="text-2xl font-bold">ตั้งค่า Supabase ก่อนใช้งาน</h1>
          <p className="text-muted mt-2 text-sm">
            ยังไม่พบ API Key ของ Supabase ในไฟล์ <code className="text-accent">.env.local</code>
          </p>
        </div>

        <div className="bg-card border border-brand rounded-2xl p-6 space-y-5 shadow-brand">
          <div className="space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold">
                1
              </span>
              สร้างโปรเจกต์ Supabase
            </h2>
            <p className="text-sm text-muted pl-8">
              ไปที่{" "}
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                supabase.com/dashboard <ExternalLink size={12} />
              </a>{" "}
              แล้วสร้างโปรเจกต์ใหม่
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold">
                2
              </span>
              คัดลอก API Keys
            </h2>
            <p className="text-sm text-muted pl-8">
              ไปที่ <strong>Project Settings → API</strong> แล้วคัดลอก{" "}
              <strong>Project URL</strong> และ <strong>anon public key</strong>
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold">
                3
              </span>
              สร้างไฟล์ .env.local
            </h2>
            <pre className="text-xs bg-background border border-border rounded-xl p-4 overflow-x-auto text-zinc-300">
{`# ในโฟลเดอร์ lcs_team
cp .env.local.example .env.local

# แล้วแก้ไขใส่ค่าจริง:
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...`}
            </pre>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold">
                4
              </span>
              รัน SQL Schema
            </h2>
            <p className="text-sm text-muted pl-8 flex items-start gap-2">
              <FileText size={16} className="shrink-0 mt-0.5" />
              เปิดไฟล์ <code className="text-accent">supabase/schema.sql</code>{" "}
              แล้วรันใน Supabase SQL Editor + สร้าง Storage bucket ชื่อ{" "}
              <code className="text-accent">uploads</code>
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold">
                5
              </span>
              Restart dev server
            </h2>
            <pre className="text-xs bg-background border border-border rounded-xl p-4 text-zinc-300">
              npm run dev
            </pre>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted text-center">
              ตั้งค่าเสร็จแล้ว?{" "}
              <Link href="/login" className="text-accent hover:underline">
                ไปหน้า Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
