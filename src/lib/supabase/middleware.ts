import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

/** ต่ำกว่าเพดาน Vercel middleware — อย่าปล่อย getUser() ค้างจน 504 ทั้งเว็บ */
const AUTH_FETCH_TIMEOUT_MS = 8000;

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/clients",
  "/sales",
  "/tasks",
  "/schedule",
  "/chat",
  "/finance",
  "/invoices",
  "/payouts",
  "/activity",
  "/notifications",
  "/settings",
  "/templates",
  "/more",
];

const PUBLIC_PREFIXES = ["/login", "/portal", "/auth", "/sw.js", "/manifest.json", "/clear-sw.html"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function hasAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("-auth-token") && Boolean(cookie.value));
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  const env = getSupabaseEnv();
  const pathname = request.nextUrl.pathname;

  // หน้า setup ถูกลบแล้ว — redirect เก่าไป login
  if (pathname === "/setup" || pathname.startsWith("/setup/")) {
    return redirectTo(request, "/login");
  }

  // API / หน้า public ไม่ต้องรอ Auth — กัน MIDDLEWARE_INVOCATION_TIMEOUT
  if (pathname.startsWith("/api/") || isPublic(pathname)) {
    return NextResponse.next();
  }

  if (!env || !hasAuthCookie(request)) {
    if (pathname === "/" || isProtected(pathname)) {
      return redirectTo(request, "/login");
    }
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.key, {
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS),
        }),
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth ช้าหรือหลุด — ส่งไป login แทนการค้างจน Vercel ตัด 504
    if (pathname === "/" || isProtected(pathname)) {
      return redirectTo(request, "/login");
    }
    return supabaseResponse;
  }

  if (!user && isProtected(pathname)) {
    return redirectTo(request, "/login");
  }

  if (pathname === "/") {
    return redirectTo(request, user ? "/dashboard" : "/login");
  }

  return supabaseResponse;
}
