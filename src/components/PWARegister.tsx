"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

export function PWARegister() {
  const router = useRouter();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "development") {
        // SW ใน dev ทำให้ CSS/JS โหลดไม่ได้ — ล้าง cache แล้ว unregister
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

    // Check due date reminders on app open
    if (process.env.NODE_ENV === "production") {
      fetch("/api/cron/reminders").catch(() => {});
    }

    // Handle notification click from SW
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.link) router.push(event.data.link);
    });
  }, [router]);

  return null;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!VAPID_KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
  });

  const json = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });

  return res.ok;
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
