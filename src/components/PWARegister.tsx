"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { pushErrorMessage, pushKeysMatch, withPushTimeout } from "@/lib/push-client";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

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
  return withPushTimeout(navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready));
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

    function onMessage(event: MessageEvent) {
      const link = event.data?.link;
      if (typeof link === "string" && link.startsWith("/") && !link.startsWith("//")) router.push(link);
    }
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}

export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function subscribeToPush(): Promise<PushSubscribeResult> {
  if (!VAPID_KEY) return { ok: false, error: "ยังไม่ได้ตั้งค่า Push ของเว็บ กรุณาแจ้งแอดมิน" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { ok: false, error: "เบราว์เซอร์นี้ไม่รองรับ Push บน iPhone ให้เพิ่มเว็บไปยังหน้าจอโฮมแล้วเปิดจากไอคอนแอป" };
  }
  if (!window.isSecureContext) return { ok: false, error: "Push ต้องเปิดผ่านเว็บไซต์ HTTPS" };
  if (!navigator.onLine) return { ok: false, error: "ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาเชื่อมต่อแล้วลองใหม่" };
  try {
    // Request directly from the button gesture, before waiting for a service worker.
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "denied") return { ok: false, error: "การแจ้งเตือนถูกบล็อก กรุณาอนุญาตเว็บนี้ในตั้งค่าเบราว์เซอร์และระบบก่อน" };
    if (permission !== "granted") return { ok: false, error: "ยังไม่ได้อนุญาตการแจ้งเตือน กดเปิดเพื่อลองอีกครั้ง" };
    const reg = await ensureServiceWorker();
    if (!reg) return { ok: false, error: "Push ใช้ได้บนเว็บจริง กรุณาเปิดเว็บผ่าน HTTPS แล้วลองอีกครั้ง" };
    const key = urlBase64ToUint8Array(VAPID_KEY);
    let sub = await withPushTimeout(reg.pushManager.getSubscription());
    if (sub && !pushKeysMatch(sub.options.applicationServerKey, key)) {
      if (!await withPushTimeout(sub.unsubscribe())) throw new DOMException("Stale subscription", "InvalidStateError");
      sub = null;
    }
    if (!sub) sub = await withPushTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: res.status === 401 ? "กรุณาเข้าสู่ระบบใหม่แล้วเปิด Push อีกครั้ง" : "บันทึกการรับ Push ไม่สำเร็จ กรุณาลองอีกครั้ง" };
    return { ok: true };
  } catch (error) { return { ok: false, error: pushErrorMessage(error) }; }
}

export async function hasPushSubscription(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || Notification.permission !== "granted") return false;
    const reg = await withPushTimeout(navigator.serviceWorker.getRegistration());
    return reg ? !!(await withPushTimeout(reg.pushManager.getSubscription())) : false;
  } catch { return false; }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const reg = await withPushTimeout(navigator.serviceWorker?.getRegistration() ?? Promise.resolve(undefined));
  const sub = reg ? await withPushTimeout(reg.pushManager.getSubscription()) : null;
  if (sub) await withPushTimeout(sub.unsubscribe());
  const res = await fetch("/api/push/subscribe", { method: "DELETE", signal: AbortSignal.timeout(15000) });
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
  const res = await fetch("/api/push/test", { method: "POST", signal: AbortSignal.timeout(15000) });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: data.error ?? "ส่งทดสอบไม่สำเร็จ" };
}

export function getPushBlockers(): string[] {
  const blockers: string[] = [];
  if (!VAPID_KEY) blockers.push("VAPID ยังไม่ตั้งบน production (Vercel env)");
  if (typeof window !== "undefined") {
    if (!window.isSecureContext) blockers.push("ต้องเปิดเว็บผ่าน HTTPS");
    if (!("serviceWorker" in navigator)) blockers.push("ไม่มี Service Worker");
    if (!("PushManager" in window)) blockers.push("เบราว์เซอร์ไม่รองรับ Push");
    if (!("Notification" in window)) blockers.push("เบราว์เซอร์นี้ยังใช้การแจ้งเตือนไม่ได้");
    else if (Notification.permission === "denied") {
      blockers.push("การแจ้งเตือนเว็บนี้ถูกบล็อกในเบราว์เซอร์หรือระบบ");
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
