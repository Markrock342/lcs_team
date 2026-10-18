import { queryNeon } from "@/lib/neon/server";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const MAX_SOURCE_BYTES = 320_000;

const BLOCKED_PATH_PATTERNS = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)(?:secrets?|credentials?)(?:\.|\/|$)/i,
  /(^|\/)id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
];

const BINARY_EXTENSIONS = new Set([
  "7z", "avi", "bin", "bmp", "class", "dmg", "doc", "docx", "eot", "exe",
  "gif", "gz", "ico", "jpeg", "jpg", "mov", "mp3", "mp4", "otf", "pdf",
  "png", "ppt", "pptx", "rar", "so", "tar", "ttf", "wav", "webm", "webp",
  "woff", "woff2", "xls", "xlsx", "zip",
]);

export type WorkspaceRepository = {
  fullName: string;
  url: string;
  clientId: string | null;
  clientName: string;
  status: string | null;
};

export type GitHubTreeItem = {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
};

type GitHubErrorPayload = { message?: string };

function githubToken() {
  return process.env.GITHUB_READ_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || "";
}

export function parseGitHubRepository(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim().replace(/\.git$/i, "");

  const shorthand = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shorthand) return `${shorthand[1]}/${shorthand[2]}`;

  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    if (!/^[A-Za-z0-9_.-]+$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(parts[1])) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

export function isProtectedRepositoryPath(path: string) {
  const normalized = path.replace(/^\/+/, "");
  return !normalized || normalized.includes("..") || BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isReadableSourcePath(path: string) {
  if (isProtectedRepositoryPath(path)) return false;
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return !BINARY_EXTENSIONS.has(extension);
}

function repositoryFromEnv(): WorkspaceRepository[] {
  return (process.env.GITHUB_DEFAULT_REPOSITORIES ?? "")
    .split(",")
    .map((entry) => parseGitHubRepository(entry))
    .filter((entry): entry is string => Boolean(entry))
    .map((fullName) => ({
      fullName,
      url: `https://github.com/${fullName}`,
      clientId: null,
      clientName: fullName,
      status: "internal",
    }));
}

export async function listWorkspaceRepositories(): Promise<WorkspaceRepository[]> {
  const { rows } = await queryNeon<{
    id: string;
    name: string;
    repo_url: string;
    status: string | null;
  }>(`
    SELECT id, name, repo_url, status
    FROM public.clients
    WHERE repo_url IS NOT NULL AND btrim(repo_url) <> ''
    ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, name
  `);

  const all = [
    ...repositoryFromEnv(),
    ...rows.flatMap((row) => {
      const fullName = parseGitHubRepository(row.repo_url);
      return fullName
        ? [{ fullName, url: `https://github.com/${fullName}`, clientId: row.id, clientName: row.name, status: row.status }]
        : [];
    }),
  ];

  return [...new Map(all.map((repository) => [repository.fullName.toLowerCase(), repository])).values()];
}

export async function requireWorkspaceRepository(fullName: string) {
  const normalized = parseGitHubRepository(fullName);
  if (!normalized) throw new GitHubWorkspaceError("Repository ไม่ถูกต้อง", 400);
  const repositories = await listWorkspaceRepositories();
  const repository = repositories.find((item) => item.fullName.toLowerCase() === normalized.toLowerCase());
  if (!repository) throw new GitHubWorkspaceError("Repository นี้ยังไม่ได้ผูกกับโปรเจกต์ใน LCS", 403);
  return repository;
}

export class GitHubWorkspaceError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

async function githubRequest<T>(path: string) {
  const token = githubToken();
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as GitHubErrorPayload;
    if (response.status === 404) {
      throw new GitHubWorkspaceError(
        token
          ? "ไม่พบ repository หรือ token ไม่มีสิทธิ์ Contents: read"
          : "Repository เป็น private กรุณาตั้งค่า GITHUB_READ_TOKEN",
        404,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new GitHubWorkspaceError("GitHub ปฏิเสธสิทธิ์ กรุณาตรวจ token แบบ read-only", response.status);
    }
    throw new GitHubWorkspaceError(payload.message || "เชื่อม GitHub ไม่สำเร็จ", response.status);
  }
  return (await response.json()) as T;
}

export async function getRepositoryWorkspace(fullName: string) {
  const allowed = await requireWorkspaceRepository(fullName);
  const encodedRepo = allowed.fullName.split("/").map(encodeURIComponent).join("/");
  const repository = await githubRequest<{
    full_name: string;
    description: string | null;
    default_branch: string;
    private: boolean;
    html_url: string;
    language: string | null;
    updated_at: string;
    open_issues_count: number;
    owner: { login: string; avatar_url: string };
  }>(`/repos/${encodedRepo}`);

  const branch = repository.default_branch;
  const [treeResult, commits, pulls] = await Promise.all([
    githubRequest<{ sha: string; truncated: boolean; tree: GitHubTreeItem[] }>(
      `/repos/${encodedRepo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    ),
    githubRequest<Array<{
      sha: string;
      html_url: string;
      commit: { message: string; author: { name: string; date: string } | null };
      author: { login: string; avatar_url: string } | null;
    }>>(`/repos/${encodedRepo}/commits?sha=${encodeURIComponent(branch)}&per_page=10`),
    githubRequest<Array<{
      number: number;
      title: string;
      html_url: string;
      draft: boolean;
      updated_at: string;
      user: { login: string; avatar_url: string } | null;
    }>>(`/repos/${encodedRepo}/pulls?state=open&sort=updated&direction=desc&per_page=8`),
  ]);

  return {
    repository,
    project: allowed,
    branch,
    truncated: treeResult.truncated,
    tree: treeResult.tree.filter(
      (item) => item.type === "tree" || (item.type === "blob" && isReadableSourcePath(item.path)),
    ),
    commits,
    pulls,
    tokenConfigured: Boolean(githubToken()),
  };
}

export async function getRepositoryFile(fullName: string, path: string, ref?: string | null) {
  const allowed = await requireWorkspaceRepository(fullName);
  const normalizedPath = path.replace(/^\/+/, "");
  if (!isReadableSourcePath(normalizedPath)) {
    throw new GitHubWorkspaceError("ไฟล์นี้ถูกซ่อนเพื่อป้องกัน secret หรือไม่ใช่ไฟล์ข้อความ", 403);
  }

  const encodedRepo = allowed.fullName.split("/").map(encodeURIComponent).join("/");
  const encodedPath = normalizedPath.split("/").map(encodeURIComponent).join("/");
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const file = await githubRequest<{
    type: string;
    name: string;
    path: string;
    sha: string;
    size: number;
    encoding: string;
    content: string;
    html_url: string;
  }>(`/repos/${encodedRepo}/contents/${encodedPath}${query}`);

  if (file.type !== "file") throw new GitHubWorkspaceError("รายการนี้ไม่ใช่ไฟล์", 400);
  if (file.size > MAX_SOURCE_BYTES) {
    throw new GitHubWorkspaceError("ไฟล์ใหญ่เกิน 320 KB กรุณาเปิดบน GitHub", 413);
  }
  if (file.encoding !== "base64") throw new GitHubWorkspaceError("GitHub ไม่ได้ส่งไฟล์ข้อความกลับมา", 422);

  const content = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
  if (content.includes("\u0000")) throw new GitHubWorkspaceError("ไฟล์นี้เป็น binary และไม่สามารถแสดงได้", 415);

  return { ...file, content, repository: allowed.fullName, ref: ref || null };
}
