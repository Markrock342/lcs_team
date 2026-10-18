import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";
import { TEAM_ROLES, type Profile, type TeamRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWN_FIELDS = new Set([
  "avatar_url",
  "notify_chat",
  "notify_mentions",
  "notify_tasks",
  "push_enabled",
  "bank_name",
  "bank_account_number",
  "bank_account_name",
  "theme",
  "last_seen_at",
]);
const ADMIN_FIELDS = new Set(["role", "display_roles"]);

function fail(error: unknown) {
  console.error("[neon/profiles]", error);
  return NextResponse.json({ error: "จัดการข้อมูลสมาชิกไม่สำเร็จ" }, { status: 500 });
}

function validRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const url = new URL(request.url);
    const onlyMe = url.searchParams.get("me") === "1";
    const presence = url.searchParams.get("presence") === "1";

    if (onlyMe) {
      return NextResponse.json({ profile: auth.context.profile });
    }

    if (presence) {
      const { rows } = await queryNeon<Pick<Profile, "id" | "display_name" | "last_seen_at">>(
        `SELECT id, display_name, last_seen_at
         FROM public.profiles
         WHERE last_seen_at >= NOW() - INTERVAL '2 minutes'
         ORDER BY display_name`,
      );
      return NextResponse.json({ profiles: rows });
    }

    const { rows } = await queryNeon<Profile>(
      `SELECT * FROM public.profiles ORDER BY display_name, username`,
    );
    return NextResponse.json({ profiles: rows });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { id?: unknown; data?: Record<string, unknown> };
    const targetId = typeof body.id === "string" && UUID_RE.test(body.id)
      ? body.id
      : auth.context.userId;
    const isSelf = targetId === auth.context.userId;
    const isAdmin = auth.context.profile.role === "admin";
    if (!isSelf && !isAdmin) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไขสมาชิกนี้" }, { status: 403 });
    }

    const entries = Object.entries(body.data ?? {}).filter(([key, value]) => {
      if (OWN_FIELDS.has(key)) return isSelf || isAdmin;
      if (!ADMIN_FIELDS.has(key) || !isAdmin) return false;
      if (key === "role" && isSelf) return false;
      if (key === "role") return validRole(value);
      if (key === "display_roles") {
        return Array.isArray(value) && value.length > 0 && value.every(validRole);
      }
      return true;
    });
    if (!entries.length) {
      return NextResponse.json({ error: "ไม่มีข้อมูลที่อนุญาตให้แก้ไข" }, { status: 400 });
    }

    const values: unknown[] = [];
    const setters = entries.map(([key, value]) => {
      values.push(value);
      return `${key} = $${values.length}`;
    });
    values.push(targetId);
    const { rows } = await queryNeon<Profile>(
      `UPDATE public.profiles SET ${setters.join(", ")}
       WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (!rows[0]) return NextResponse.json({ error: "ไม่พบสมาชิก" }, { status: 404 });
    return NextResponse.json({ profile: rows[0] });
  } catch (error) {
    return fail(error);
  }
}
