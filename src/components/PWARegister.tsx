"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  if (process.env.NODE_ENV === "development") return null;
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export function PWARegister() {
  const router = useRouter();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "development") {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        });
        caches.keys().then((keys) => {
          keys.forEach((k) => caches.delete(k));
        });
      } else {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    }

    if (process.env.NODE_ENV === "production") {
      fetch("/api/cron/reminders").catch(() => {});
    }

    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.link) router.push(event.data.link);
    });
  }, [router]);

  return null;
}

export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function subscribeToPush(): Promise<PushSubscribeResult> {
  if (!VAPID_KEY) {
    return { ok: false, error: "ยังไม่ได้ตั้งค่า VAPID บนเซิร์ฟเวอร์" };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "เบราว์เซอร์นี้ไม่รองรับ Push" };
  }

  const reg = await ensureServiceWorker();
  if (!reg) {
    return { ok: false, error: "Service Worker ยังไม่พร้อม (ลอง refresh)" };
  }

  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    return {
      ok: false,
      error: "ถูกบล็อก — ไปเปิด Notifications ใน Settings ของเครื่อง",
    };
  }
  if (permission !== "granted") {
    return { ok: false, error: "ยังไม่ได้อนุญาตการแจ้งเตือน" };
  }

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });
    }

    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: data.error ?? "บันทึก subscription ไม่สำเร็จ",
      };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "subscribe failed";
    return { ok: false, error: msg };
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const reg = await navigator.serviceWorker?.ready;
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
  const res = await fetch("/api/push/subscribe", { method: "DELETE" });
  return res.ok;
}

export async function installPWA(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deferred = (window as any).__pwaPrompt;
  if (!deferred) return false;
  deferred.prompt();
  await deferred.userChoice;
  return true;
}

export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/push/test", { method: "POST" });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: data.error ?? "ส่งทดสอบไม่สำเร็จ" };
}

export function getPushBlockers(): string[] {
  const blockers: string[] = [];
  if (!VAPID_KEY) blockers.push("VAPID ยังไม่ตั้งบน production (Vercel env)");
  if (typeof window !== "undefined") {
    if (!("serviceWorker" in navigator)) blockers.push("ไม่มี Service Worker");
    if (!("PushManager" in window)) blockers.push("เบราว์เซอร์ไม่รองรับ Push");
    if (Notification.permission === "denied") {
      blockers.push("Notifications ถูกบล็อกที่ระดับ OS");
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).standalone === true;
    if (isIos && !standalone) {
      blockers.push("iPhone: ต้อง Add to Home Screen ก่อน Push ถึงจะทำงาน");
    }
  }
  return blockers;
}
