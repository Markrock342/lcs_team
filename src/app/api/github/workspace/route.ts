import { NextResponse } from "next/server";
import { requireNeonEditor } from "@/lib/neon/auth";
import {
  getRepositoryFile,
  getRepositoryWorkspace,
  GitHubWorkspaceError,
  listWorkspaceRepositories,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: unknown) {
  console.error("[github/workspace]", error);
  if (error instanceof GitHubWorkspaceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "เชื่อม GitHub ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(request.url);
    const repository = url.searchParams.get("repo")?.trim();
    const path = url.searchParams.get("path")?.trim();
    const ref = url.searchParams.get("ref")?.trim();

    if (!repository) {
      return NextResponse.json({ repositories: await listWorkspaceRepositories() });
    }
    if (path) {
      return NextResponse.json({ file: await getRepositoryFile(repository, path, ref) });
    }
    return NextResponse.json(await getRepositoryWorkspace(repository));
  } catch (error) {
    return fail(error);
  }
}
