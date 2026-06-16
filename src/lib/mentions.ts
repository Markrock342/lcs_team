import type { Profile } from "./types";

export type MentionContext = {
  query: string;
  start: number;
  end: number;
};

export function getMentionContext(
  text: string,
  cursor: number
): MentionContext | null {
  const before = text.slice(0, cursor);
  const match = before.match(/(?:^|[\s])@(\w*)$/);
  if (!match) return null;

  const atIndex = before.lastIndexOf("@");
  return { query: match[1], start: atIndex, end: cursor };
}

export function filterMentionProfiles(
  profiles: Profile[],
  query: string,
  excludeId?: string
): Profile[] {
  const q = query.toLowerCase();
  return profiles
    .filter((p) => p.id !== excludeId)
    .filter(
      (p) =>
        !q ||
        p.username.toLowerCase().startsWith(q) ||
        p.display_name.toLowerCase().includes(q)
    )
    .slice(0, 8);
}

export function applyMention(
  text: string,
  ctx: MentionContext,
  username: string
): { text: string; cursor: number } {
  const before = text.slice(0, ctx.start);
  const after = text.slice(ctx.end);
  const insertion = `@${username} `;
  return {
    text: before + insertion + after,
    cursor: ctx.start + insertion.length,
  };
}
