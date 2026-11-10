import type { Note, Workspace } from "./types";
import { dateOf, groupOf } from "./model";
import { emojiOf, today } from "./util";

/** Splits a [[target#heading|alias]] link body into its parts. */
export function parseWiki(inner: string) {
  const [left, alias] = inner.split("|");
  const [target, heading] = left.split("#");
  return { target: target.trim(), heading: heading?.trim(), alias: alias?.trim() };
}

/** Removes fenced and inline code so links and tags inside code are ignored. */
export function stripCode(body: string) {
  return body.replace(/```[\s\S]*?(```|$)/g, "").replace(/`[^`\n]*`/g, "");
}

export const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
export function extractTags(body: string): string[] {
  const out = new Set<string>();
  for (const m of stripCode(body).matchAll(TAG_RE)) out.add(m[2].toLowerCase());
  return [...out];
}

export function headings(body: string): { level: number; text: string; line: number }[] {
  const out: { level: number; text: string; line: number }[] = [];
  let inCode = false;
  body.split("\n").forEach((l, i) => {
    if (/^```/.test(l)) inCode = !inCode;
    const m = !inCode && /^(#{1,6})\s+(.+)$/.exec(l);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i });
  });
  return out;
}

const norm = (s: string) => s.trim().toLowerCase();
export const findByTitle = (notes: Record<string, Note>, title: string) =>
  Object.values(notes).find((n) => norm(n.title) === norm(title));

export function uniqueTitle(notes: Record<string, Note>, base: string) {
  if (!findByTitle(notes, base)) return base;
  for (let i = 2; ; i++) if (!findByTitle(notes, `${base} ${i}`)) return `${base} ${i}`;
}

/** Every folder path in the list plus all of their parents, sorted. */
export function pathsWithParents(list: (string | undefined)[]) {
  const out = new Set<string>();
  for (const f of list) {
    const parts = (f || "").split("/").filter(Boolean);
    parts.forEach((_, i) => out.add(parts.slice(0, i + 1).join("/")));
  }
  return [...out].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Folder paths (with every parent), from notes plus explicitly created empty folders. */
export function folderList(notes: Record<string, Note>, extra: string[] = []) {
  return pathsWithParents([...Object.values(notes).map((n) => n.folder), ...extra]);
}

/** Sidebar folders for task lists: the ones lists are in plus the empty ones created by the person. */
export function boardFolderList(ws: Workspace) {
  return pathsWithParents([...ws.pages.map((p) => p.folder), ...(ws.settings.boardFolders ?? [])]);
}

/** Starting text for today's journal note: what's due, reviews and habits. */
export function dailyBody(ws: Workspace, date = today()) {
  const d = new Date(date + "T12:00:00");
  const head = d
    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
    .replace(/^./, (c) => c.toUpperCase());
  const lines: string[] = [];
  for (const it of Object.values(ws.items)) {
    const db = ws.dbs[it.db];
    if (!db) continue;
    const g = groupOf(db, it);
    const page = ws.pages.find((p) => p.id === it.db);
    const due = dateOf(db, it).slice(0, 10) === date && g !== "done";
    if (due || g === "review" || g === "doing")
      lines.push(`- [ ] ${it.title || "Sem título"}${g === "review" ? " (revisar)" : ""} · ${page?.title ?? ""}`);
  }
  const habits = ws.habits.map((h) => `- [ ] ${emojiOf(h.icon)} ${h.name}`.replace("  ", " "));
  return [
    `# ${head}`,
    "",
    "## Para hoje",
    ...(lines.length ? lines : ["- Nada marcado para hoje"]),
    "",
    "## Hábitos",
    ...habits,
    "",
    "## Anotações",
    "",
    "",
  ].join("\n");
}

export function safeFileName(s: string) {
  return (
    (s || "Sem título")
      .replace(/[\\/:*?"<>|#^[\]]/g, "-")
      .trim()
      .slice(0, 120) || "Sem título"
  );
}

/** A short plain-text preview of a note (Markdown marks and link brackets removed). */
export function plainSnippet(body: string, max = 160) {
  return stripCode(body)
    .replace(/\[\[([^\]\n]+?)\]\]/g, (_, inner: string) => {
      const p = parseWiki(inner);
      return p.alias || p.target;
    })
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}\s+|[-*]\s+\[[ x]\]\s+|[-*]\s+|\d+\.\s+|>\s+)/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", or the date. */
export function ago(ts: number, now = Date.now()) {
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return new Date(ts).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replaceAll(".", "");
}
