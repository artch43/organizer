import { openFilesDb } from "./rename";
import { supabase } from "./supabase";
import { uid } from "./util";

/** Images and PDFs added to notes. The note text keeps only a reference: ![name](anexo:ID) or [📄 name](anexo:ID). */
export const ATTACH_PREFIX = "anexo:";
export const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "anexos";

export type AttachmentKind = "image" | "pdf";

/** Pictures only (no SVG: it can carry scripts, which would run if the file were opened in a tab). */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"];

const BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

/** The file's type; some browsers and phones leave it blank (or generic), so fall back to the extension. */
export function typeOf(file: { name: string; type: string }) {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return BY_EXT[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? file.type;
}

export function kindOf(type: string): AttachmentKind | null {
  if (IMAGE_TYPES.includes(type)) return "image";
  if (type === "application/pdf") return "pdf";
  return null;
}

/** The Markdown inserted in the note for a saved file. */
export function attachmentMarkdown(a: { id: string; name: string; kind: AttachmentKind }) {
  const name = a.name.replace(/[[\]\n]/g, " ").trim() || (a.kind === "pdf" ? "arquivo.pdf" : "imagem");
  return a.kind === "image" ? `![${name}](${ATTACH_PREFIX}${a.id})` : `[📄 ${name}](${ATTACH_PREFIX}${a.id})`;
}

/* ---------- this browser only (no login) ---------- */
const db = () => openFilesDb("anexos");
async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = run(d.transaction("files", mode).objectStore("files"));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- cloud ---------- */
async function userId() {
  const { data } = await supabase!.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Entre na sua conta para anexar arquivos.");
  return id;
}

/** Stores the file and returns what the note needs to point at it. Throws with a readable message. */
export async function saveAttachment(file: File) {
  const type = typeOf(file);
  const kind = kindOf(type);
  if (!kind) throw new Error("Só dá para anexar fotos (PNG, JPG, WebP, GIF, HEIC) e PDF.");
  if (file.size > MAX_BYTES) throw new Error("O arquivo passa de 10 MB.");
  const id = uid();
  if (supabase) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${await userId()}/${id}`, file, { contentType: type, upsert: false });
    if (error) {
      // The storage space is created by backend/supabase/migrations/005_attachments.sql (or setup.sql).
      if (/bucket not found/i.test(error.message))
        throw new Error("Os anexos ainda não foram ativados no servidor. Rode o arquivo backend/supabase/setup.sql no Supabase.");
      if (/mime|content type|not supported/i.test(error.message))
        throw new Error("O servidor recusou esse tipo de arquivo. Rode o backend/supabase/setup.sql atualizado no Supabase.");
      if (/size|too large|exceed/i.test(error.message)) throw new Error("O arquivo passa do limite de tamanho do servidor.");
      throw new Error("Não foi possível enviar o arquivo. Tente de novo.");
    }
  } else {
    await idb("readwrite", (s) => s.put(file, id));
  }
  return { id, name: file.name, kind };
}

const urls = new Map<string, { url: string; until: number }>();

/** A URL the browser can open for an attachment, or null if it no longer exists. */
export async function attachmentUrl(id: string): Promise<string | null> {
  const hit = urls.get(id);
  if (hit && hit.until > Date.now()) return hit.url;
  let url: string | null = null;
  if (supabase) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(`${await userId()}/${id}`, 3600);
    url = data?.signedUrl ?? null;
    if (url) urls.set(id, { url, until: Date.now() + 50 * 60 * 1000 });
  } else {
    const blob = await idb<Blob | undefined>("readonly", (s) => s.get(id)).catch(() => undefined);
    url = blob ? URL.createObjectURL(blob) : null;
    if (url) urls.set(id, { url, until: Infinity });
  }
  return url;
}
