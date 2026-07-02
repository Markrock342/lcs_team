"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

export function AccessDenied({
  title = "ไม่มีสิทธิ์เข้าถึง",
  message = "หน้านี้จำกัดเฉพาะสมาชิกทีม — บัญชี Guest ดูได้เฉพาะงานและแชท",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mb-4">
        <Lock size={28} className="text-muted" />
      </div>
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-sm text-muted max-w-sm">{message}</p>
      <Link
        href="/dashboard"
        className="mt-6 px-4 py-2 rounded-xl bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
      >
        กลับหน้าภาพรวม
      </Link>
    </div>
  );
}
