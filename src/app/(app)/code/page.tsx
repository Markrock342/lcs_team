"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  Clipboard,
  Code2,
  ExternalLink,
  FileCode2,
  FileText,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
} from "lucide-react";
import { neonRequest } from "@/lib/neon/client";
import { Button, EmptyState, ErrorState, StatusStamp } from "@/components/ui";
import { PageHeader, PageShell } from "@/components/mobile-ui";

type WorkspaceRepository = {
  fullName: string;
  url: string;
  clientId: string | null;
  clientName: string;
  status: string | null;
};

type TreeItem = {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
};

type RepositoryWorkspace = {
  repository: {
    full_name: string;
    description: string | null;
    default_branch: string;
    private: boolean;
    html_url: string;
    language: string | null;
    updated_at: string;
    open_issues_count: number;
    owner: { login: string; avatar_url: string };
  };
  project: WorkspaceRepository;
  branch: string;
  truncated: boolean;
  tree: TreeItem[];
  commits: Array<{
    sha: string;
    html_url: string;
    commit: { message: string; author: { name: string; date: string } | null };
    author: { login: string; avatar_url: string } | null;
  }>;
  pulls: Array<{
    number: number;
    title: string;
    html_url: string;
    draft: boolean;
    updated_at: string;
    user: { login: string; avatar_url: string } | null;
  }>;
  tokenConfigured: boolean;
};

type RepositoryFile = {
  name: string;
  path: string;
  sha: string;
  size: number;
  html_url: string;
  content: string;
  repository: string;
  ref: string | null;
};

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.round(hours / 24)} วันที่แล้ว`;
}

function languageFromPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  const labels: Record<string, string> = {
    ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX", css: "CSS",
    json: "JSON", md: "Markdown", sql: "SQL", py: "Python", go: "Go", rs: "Rust",
    yml: "YAML", yaml: "YAML", sh: "Shell", html: "HTML", prisma: "Prisma",
  };
  return labels[ext ?? ""] ?? "Text";
}

export default function CodeWorkspacePage() {
  const [repositories, setRepositories] = useState<WorkspaceRepository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [workspace, setWorkspace] = useState<RepositoryWorkspace | null>(null);
  const [file, setFile] = useState<RepositoryFile | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [copied, setCopied] = useState(false);
  const [mobilePane, setMobilePane] = useState<"files" | "code" | "activity">("files");

  const loadRepositories = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await neonRequest<{ repositories: WorkspaceRepository[] }>("/api/github/workspace", { cache: "no-store" });
      setRepositories(data.repositories ?? []);
      setSelectedRepo((current) => current || data.repositories?.[0]?.fullName || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดรายการ repository ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorkspace = useCallback(async (repository: string) => {
    if (!repository) return;
    setWorkspaceLoading(true);
    setError("");
    setFile(null);
    setFileError("");
    try {
      const data = await neonRequest<RepositoryWorkspace>(
        `/api/github/workspace?repo=${encodeURIComponent(repository)}`,
        { cache: "no-store" },
      );
      setWorkspace(data);
      const first = data.tree.find((item) => /(^|\/)README\.md$/i.test(item.path))
        ?? data.tree.find((item) => item.type === "blob");
      if (first) {
        setFileLoading(true);
        try {
          const fileData = await neonRequest<{ file: RepositoryFile }>(
            `/api/github/workspace?repo=${encodeURIComponent(repository)}&path=${encodeURIComponent(first.path)}&ref=${encodeURIComponent(data.branch)}`,
            { cache: "no-store" },
          );
          setFile(fileData.file);
        } catch {
          setFile(null);
        } finally {
          setFileLoading(false);
        }
      }
    } catch (loadError) {
      setWorkspace(null);
      setError(loadError instanceof Error ? loadError.message : "โหลด repository ไม่สำเร็จ");
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial client-side data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRepositories();
  }, [loadRepositories]);
  useEffect(() => {
    if (selectedRepo) {
      // Synchronize the selected repository with its remote workspace.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadWorkspace(selectedRepo);
    }
  }, [selectedRepo, loadWorkspace]);

  const files = useMemo(() => {
    const source = workspace?.tree.filter((item) => item.type === "blob") ?? [];
    const term = query.trim().toLowerCase();
    return (term ? source.filter((item) => item.path.toLowerCase().includes(term)) : source).slice(0, 600);
  }, [workspace, query]);

  async function openFile(path: string) {
    if (!workspace) return;
    setFileLoading(true);
    setFileError("");
    setMobilePane("code");
    try {
      const data = await neonRequest<{ file: RepositoryFile }>(
        `/api/github/workspace?repo=${encodeURIComponent(workspace.repository.full_name)}&path=${encodeURIComponent(path)}&ref=${encodeURIComponent(workspace.branch)}`,
        { cache: "no-store" },
      );
      setFile(data.file);
    } catch (loadError) {
      setFile(null);
      setFileError(loadError instanceof Error ? loadError.message : "เปิดไฟล์ไม่สำเร็จ");
    } finally {
      setFileLoading(false);
    }
  }

  async function copyCode() {
    if (!file) return;
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading) {
    return (
      <PageShell width="full">
        <div className="flex min-h-[60dvh] items-center justify-center gap-3 text-muted" role="status">
          <LoaderCircle size={20} className="animate-spin" /> กำลังเปิด Code Workspace...
        </div>
      </PageShell>
    );
  }

  if (error && repositories.length === 0) {
    return <PageShell><ErrorState title="เปิด Code Workspace ไม่สำเร็จ" description={error} onRetry={() => void loadRepositories()} /></PageShell>;
  }

  if (repositories.length === 0) {
    return (
      <PageShell>
        <PageHeader title="Code Workspace" description="อ่าน repository ของทีมและส่งไฟล์ให้ LCS Assistant ช่วยอธิบาย" />
        <EmptyState
          icon={<FolderGit2 size={30} />}
          title="ยังไม่มี repository ที่เชื่อมไว้"
          description="เพิ่ม GitHub URL ในโปรเจกต์ หรือตั้งค่า GITHUB_DEFAULT_REPOSITORIES บน Vercel"
          action={<Link href="/clients"><Button>ไปหน้าโปรเจกต์</Button></Link>}
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="full" className="space-y-4!">
      <PageHeader
        title="Code Workspace"
        description="อ่านโค้ด กิจกรรมล่าสุด และส่งบริบทที่เลือกให้ผู้ช่วย AI"
        action={
          <button
            type="button"
            onClick={() => selectedRepo && void loadWorkspace(selectedRepo)}
            disabled={workspaceLoading}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-muted hover:bg-card-hover hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw size={16} className={workspaceLoading ? "animate-spin" : ""} /> รีเฟรช
          </button>
        }
      />

      <div className="lg:hidden">
        <label htmlFor="repository-select" className="mb-1.5 block text-sm font-medium text-muted">Repository</label>
        <select
          id="repository-select"
          value={selectedRepo}
          onChange={(event) => { setSelectedRepo(event.target.value); setMobilePane("files"); }}
          className="min-h-12 w-full rounded-xl border border-border bg-card px-3 text-base"
        >
          {repositories.map((repository) => <option key={repository.fullName} value={repository.fullName}>{repository.clientName} · {repository.fullName}</option>)}
        </select>
        <div className="mt-3 grid grid-cols-3 rounded-xl bg-surface-soft p-1">
          {([
            ["files", "ไฟล์", FileCode2],
            ["code", "โค้ด", Braces],
            ["activity", "กิจกรรม", GitCommitHorizontal],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => setMobilePane(key)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${mobilePane === key ? "bg-card text-foreground shadow-sm" : "text-muted"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl bg-(--status-red-bg) p-4 text-(--status-red-fg)" role="alert">{error}</div>}

      <section className="code-workspace-grid overflow-hidden rounded-[var(--radius-section)] bg-card shadow-[var(--shadow-card)] lg:min-h-[calc(100dvh-12rem)]">
        <aside className="hidden border-r border-border bg-surface-soft/55 lg:flex lg:min-h-0 lg:flex-col">
          <div className="border-b border-border px-4 py-4">
            <p className="ticket-kicker">REPOSITORIES</p>
            <p className="mt-1 text-sm text-muted">{repositories.length} โปรเจกต์เชื่อม GitHub</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {repositories.map((repository) => {
              const active = repository.fullName === selectedRepo;
              return (
                <button
                  key={repository.fullName}
                  type="button"
                  onClick={() => setSelectedRepo(repository.fullName)}
                  className={`mb-1 flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${active ? "bg-accent/12 text-foreground" : "text-muted hover:bg-card-hover hover:text-foreground"}`}
                >
                  <FolderGit2 size={18} className={active ? "text-accent" : ""} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{repository.clientName}</span>
                    <span className="block truncate text-xs">{repository.fullName}</span>
                  </span>
                  {active && <ChevronRight size={15} className="text-accent" />}
                </button>
              );
            })}
          </div>

          {workspace && (
            <div className="border-t border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm"><GitBranch size={15} className="text-accent" /><span className="truncate">{workspace.branch}</span></div>
                {workspace.repository.private && <LockKeyhole size={14} className="text-muted" aria-label="Private repository" />}
              </div>
              <p className="mt-2 text-xs text-muted">อัปเดต {relativeTime(workspace.repository.updated_at)}</p>
            </div>
          )}
        </aside>

        <aside className={`${mobilePane === "files" ? "flex" : "hidden"} min-h-[62dvh] flex-col border-r border-border lg:flex lg:min-h-0`}>
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อไฟล์" aria-label="ค้นหาชื่อไฟล์" className="min-h-11 w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-base lg:text-sm" />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{files.length} ไฟล์</span>
              {workspace?.truncated && <span>GitHub ตัดรายการบางส่วน</span>}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {workspaceLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted"><LoaderCircle size={17} className="animate-spin" /> กำลังอ่าน tree...</div>
            ) : files.length ? files.map((item) => {
              const active = file?.path === item.path;
              return (
                <button
                  key={item.sha + item.path}
                  type="button"
                  onClick={() => void openFile(item.path)}
                  className={`flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left ${active ? "bg-accent/10 text-foreground" : "text-muted hover:bg-card-hover hover:text-foreground"}`}
                >
                  <FileCode2 size={15} className={`mt-1 shrink-0 ${active ? "text-accent" : ""}`} />
                  <span className="min-w-0 flex-1 truncate text-sm">{item.path}</span>
                </button>
              );
            }) : (
              <p className="px-4 py-10 text-center text-sm text-muted">ไม่พบไฟล์ที่ตรงกับคำค้น</p>
            )}
          </div>
        </aside>

        <main className={`${mobilePane === "code" ? "flex" : "hidden"} min-w-0 flex-col lg:flex`}>
          {fileLoading ? (
            <div className="flex min-h-[62dvh] items-center justify-center gap-2 text-muted"><LoaderCircle size={18} className="animate-spin" /> กำลังเปิดไฟล์...</div>
          ) : fileError ? (
            <div className="p-5"><ErrorState title="เปิดไฟล์ไม่สำเร็จ" description={fileError} /></div>
          ) : file ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:px-4">
                <button type="button" onClick={() => setMobilePane("files")} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover lg:hidden" aria-label="กลับไปรายการไฟล์"><ArrowLeft size={18} /></button>
                <FileText size={17} className="shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{file.path}</p>
                  <p className="text-xs text-muted">{languageFromPath(file.path)} · {(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button type="button" onClick={() => void copyCode()} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-muted hover:bg-card-hover hover:text-foreground" aria-label="คัดลอกโค้ด">
                  {copied ? <Check size={16} className="text-(--status-green-fg)" /> : <Clipboard size={16} />}
                  <span className="hidden sm:inline">{copied ? "คัดลอกแล้ว" : "คัดลอก"}</span>
                </button>
                <a href={file.html_url} target="_blank" rel="noreferrer" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover hover:text-foreground" aria-label="เปิดไฟล์บน GitHub"><ExternalLink size={16} /></a>
                <Link
                  href={`/assistant?repo=${encodeURIComponent(file.repository)}&path=${encodeURIComponent(file.path)}&ref=${encodeURIComponent(file.ref ?? workspace?.branch ?? "")}`}
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-semibold text-on-accent hover:bg-accent-dim"
                >
                  <Bot size={16} /> ถาม AI
                </Link>
              </div>
              <div className="code-reader flex-1 overflow-auto bg-(--code-surface)" tabIndex={0} aria-label={`เนื้อหาไฟล์ ${file.path}`}>
                <pre className="min-w-max py-4 text-[0.8125rem] leading-6 sm:text-sm">
                  {file.content.split("\n").map((line, index) => (
                    <span key={index} className="code-line flex min-h-6">
                      <span className="sticky left-0 w-14 shrink-0 select-none bg-(--code-gutter) pr-3 text-right text-(--code-line-number)">{index + 1}</span>
                      <code className="block whitespace-pre px-4 text-(--code-foreground)">{line || " "}</code>
                    </span>
                  ))}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex min-h-[62dvh] items-center justify-center p-6">
              <EmptyState icon={<Code2 size={28} />} title="เลือกไฟล์เพื่ออ่าน" description="ไฟล์ secret, key และ binary จะไม่แสดงในรายการ" />
            </div>
          )}
        </main>

        <aside className={`${mobilePane === "activity" ? "block" : "hidden"} min-h-[62dvh] overflow-y-auto p-4 lg:hidden`}>
          {workspace && <ActivityPanel workspace={workspace} />}
        </aside>
      </section>

      {workspace && (
        <section className="hidden grid-cols-2 gap-6 lg:grid">
          <ActivityPanel workspace={workspace} />
        </section>
      )}
    </PageShell>
  );
}

function ActivityPanel({ workspace }: { workspace: RepositoryWorkspace }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold"><GitCommitHorizontal size={18} className="text-accent" /> Commit ล่าสุด</h2>
          <a href={`${workspace.repository.html_url}/commits/${workspace.branch}`} target="_blank" rel="noreferrer" className="text-sm text-accent">ดูทั้งหมด</a>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
          {workspace.commits.slice(0, 5).map((commit) => (
            <a key={commit.sha} href={commit.html_url} target="_blank" rel="noreferrer" className="flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-card-hover">
              <GitCommitHorizontal size={16} className="mt-1 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{commit.commit.message.split("\n")[0]}</span>
                <span className="mt-0.5 block text-xs text-muted">{commit.author?.login ?? commit.commit.author?.name ?? "Unknown"} · {commit.commit.author ? relativeTime(commit.commit.author.date) : "ไม่ทราบเวลา"}</span>
              </span>
              <code className="text-xs text-muted">{commit.sha.slice(0, 7)}</code>
            </a>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold"><GitPullRequest size={18} className="text-accent" /> Pull request</h2>
          <StatusStamp label={`${workspace.pulls.length} เปิดอยู่`} tone={workspace.pulls.length ? "blue" : "slate"} />
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
          {workspace.pulls.length ? workspace.pulls.slice(0, 5).map((pull) => (
            <a key={pull.number} href={pull.html_url} target="_blank" rel="noreferrer" className="flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-card-hover">
              <GitPullRequest size={16} className="mt-1 shrink-0 text-(--status-green-fg)" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">#{pull.number} {pull.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{pull.user?.login ?? "Unknown"} · {relativeTime(pull.updated_at)}</span>
              </span>
              {pull.draft && <span className="rounded-lg bg-surface-soft px-2 py-1 text-xs text-muted">Draft</span>}
            </a>
          )) : (
            <div className="flex min-h-28 flex-col items-center justify-center gap-2 px-4 py-6 text-center text-muted">
              <CircleDot size={20} />
              <p className="text-sm">ไม่มี pull request ที่เปิดอยู่</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
