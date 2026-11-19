import { ATTACH_PREFIX } from "./attachments";

/**
 * Removing a picture from a note (or deleting the note for good) used to leave the file in Storage
 * forever. With a quota per account (backend/supabase/migrations/012), those leftovers would fill it
 * with no way to free space. So, once a day, files that nothing points to any more are removed.
 *
 * Safe by construction:
 * - notes in the trash still count (they can be restored);
 * - only files older than a week: a note written on another device that hasn't synced yet may
 *   already point to a file uploaded from there;
 * - wallpapers live in the same folder but are handled by the appearance settings, never here.
 */
export const MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const REF = new RegExp(`${ATTACH_PREFIX}([A-Za-z0-9_-]+)`, "g");

/** Every attachment id mentioned anywhere in these texts (e.g. the workspace and the trash as JSON). */
export function referencedIds(texts: string[]): Set<string> {
  const ids = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(REF)) ids.add(m[1]);
  return ids;
}

export type StoredFile = { name: string; created_at?: string | null };

/** The files that can go: not referenced, not a wallpaper, and old enough. */
export function orphanFiles(files: StoredFile[], refs: Set<string>, now: number): string[] {
  return files
    .filter((f) => {
      if (f.name.startsWith("wallpaper-") || refs.has(f.name)) return false;
      const created = f.created_at ? Date.parse(f.created_at) : NaN;
      return Number.isFinite(created) && now - created > MIN_AGE_MS;
    })
    .map((f) => f.name);
}
