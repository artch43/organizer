import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { applyRecords, diffEntities, fromRecords, keyOf, toEntities, type Ent, type Kind, type Rec } from "./records";
import { normalizeWorkspace } from "./backup";
import { GUIDE_SEEN_KEY, template } from "./template";
import type { AlertChannel, CalendarEvent, Item, Workspace } from "./types";
import { remindersFor, taskAlertSource, type ReminderRow } from "./events";
import { groupOf } from "./model";
import { STORAGE_KEY } from "./storage";
import { eraseFilesDbs } from "./rename";
import { useStore } from "../store";

/**
 * Cloud sync. The Zustand store stays the source of truth for the UI (and is cached
 * per user in localStorage). Every change is diffed into per-entity rows and pushed to
 * Supabase in small batches; changes from other devices are pulled on focus and every minute.
 */

export type SyncStatus = "idle" | "saving" | "saved" | "offline" | "error";
export type Phase = "auth" | "loading" | "choose" | "ready";

interface SyncState {
  phase: Phase;
  status: SyncStatus;
  user: { id: string; email: string } | null;
  /** Data found in this browser from before the account existed, offered on first login. */
  candidate: Workspace | null;
  recovery: boolean;
}
export const useSync = create<SyncState>(() => ({ phase: "auth", status: "idle", user: null, candidate: null, recovery: false }));
const setStatus = (status: SyncStatus) => useSync.setState({ status });

const TABLE = "records";
const EPOCH = "1970-01-01T00:00:00Z";
const PURGE_DAYS = 30;

let uid = "";
let prev = new Map<string, Ent>();
let applying = false;
let pending = new Map<string, Rec>();
let lastSync = EPOCH;
let flushTimer: number | undefined;
let flushing = false;
/** Keys of the batch being sent right now: a pull that lands meanwhile must not put the older server copy back. */
let sending = new Set<string>();
let unsubscribe: (() => void) | null = null;
let pollTimer: number | undefined;
/** Reminders last written for each event/task, so only real changes reach the database. */
let reminderSigs: Record<string, string> = {};

const cacheKey = () => STORAGE_KEY + ":" + uid;
const metaKey = () => STORAGE_KEY + ":sync:" + uid;
function saveMeta() {
  try {
    localStorage.setItem(metaKey(), JSON.stringify({ lastSync, pending: [...pending.values()], reminderSigs }));
  } catch {
    /* storage full or blocked */
  }
}
function loadMeta(): { lastSync: string; pending: Rec[]; reminderSigs?: Record<string, string> } {
  try {
    return JSON.parse(localStorage.getItem(metaKey()) || "null") ?? { lastSync: EPOCH, pending: [] };
  } catch {
    return { lastSync: EPOCH, pending: [] };
  }
}

/** Replace the workspace without pushing it back (it came from the server). */
function applyQuietly(fn: (ws: Workspace) => void) {
  applying = true;
  try {
    useStore.getState().mut(fn);
  } finally {
    applying = false;
    prev = toEntities(useStore.getState().ws);
  }
}

function onStoreChange(ws: Workspace) {
  const next = toEntities(ws);
  if (applying) {
    prev = next;
    return;
  }
  const { changed, removed } = diffEntities(prev, next);
  if (!changed.length && !removed.length) return;
  const now = new Date().toISOString();
  for (const k of changed) {
    const e = next.get(k)!;
    pending.set(k, { kind: e.kind, id: e.id, data: e.data, deleted_at: null });
  }
  for (const k of removed) {
    const e = prev.get(k)!;
    pending.set(k, { kind: e.kind, id: e.id, data: e.data, deleted_at: now });
  }
  // Turning e-mail alerts on or off rewrites the reminders of every event and task.
  // So does changing the WhatsApp number.
  const alerts = alertsKey(ws);
  if (lastAlerts !== null && alerts !== lastAlerts) setTimeout(refreshAllReminders, 1000);
  lastAlerts = alerts;
  prev = next;
  saveMeta();
  setStatus("saving");
  clearTimeout(flushTimer);
  flushTimer = window.setTimeout(flush, 800);
}

let lastAlerts: string | null = null;
const alertsKey = (ws: Workspace) => `${ws.settings.emailAlerts}|${ws.settings.whatsapp ?? ""}`;

type OutRow = ReminderRow & { channel?: "whatsapp"; phone?: string };

function wantedReminders(r: Rec): OutRow[] {
  const ws = useStore.getState().ws;
  if (r.deleted_at || !ws.settings.emailAlerts) return [];
  let rows: ReminderRow[] = [];
  let channel: AlertChannel | undefined;
  if (r.kind === "event") {
    const ev = r.data as CalendarEvent;
    rows = remindersFor(ev);
    channel = ev.alertChannel;
  } else if (r.kind === "item") {
    const it = r.data as Item;
    const db = ws.dbs[it.db];
    const src = taskAlertSource(it, !!db && groupOf(db, it) === "done");
    rows = src ? remindersFor(src) : [];
    channel = it.alertChannel;
  }
  // WhatsApp only when there is a number to send to; otherwise the alert still arrives by e-mail.
  // E-mail rows leave both columns out, so they keep working before migration 006 is applied.
  // Kept within the limits the database checks (migration 007), so a long title can't block the insert.
  rows = rows.map((x) => ({ ...x, title: x.title.slice(0, 300), when_label: x.when_label.slice(0, 200) }));
  const phone = ws.settings.whatsapp;
  return channel === "whatsapp" && phone ? rows.map((x) => ({ ...x, channel: "whatsapp", phone })) : rows;
}

/** Rewrites the pending e-mail reminders of these events/tasks when they changed (sent ones stay as history). */
async function syncReminders(rows: Rec[]) {
  for (const r of rows) {
    if (r.kind !== "event" && r.kind !== "item") continue;
    const list = wantedReminders(r);
    const key = keyOf(r.kind, r.id);
    const sig = JSON.stringify(list.map((x) => [x.send_at, x.title, x.when_label, x.channel ?? "", x.phone ?? ""]));
    if ((reminderSigs[key] ?? "[]") === sig) continue;
    const del = await supabase!.from("reminders").delete().eq("event_id", r.id).is("sent_at", null);
    if (del.error) throw del.error;
    if (list.length) {
      const ins = await supabase!.from("reminders").insert(list.map((x) => ({ ...x, user_id: uid })));
      if (ins.error) throw ins.error;
    }
    if (list.length) reminderSigs[key] = sig;
    else delete reminderSigs[key];
  }
  saveMeta();
}

/** Re-checks every event and task: after turning alerts on/off, and on each start (repeating events roll forward). */
async function refreshAllReminders() {
  const ws = useStore.getState().ws;
  const rows: Rec[] = [
    ...Object.values(ws.events).map((e) => ({ kind: "event" as const, id: e.id, data: e })),
    ...Object.values(ws.items).map((i) => ({ kind: "item" as const, id: i.id, data: i })),
  ];
  try {
    // The settings (e.g. a new WhatsApp number) reach the server first: the database only accepts
    // WhatsApp reminders for the number saved there.
    await flushAll();
    await syncReminders(rows);
  } catch {
    /* retried on the next start or edit */
  }
}

export async function flush() {
  if (!supabase || !uid || flushing || !pending.size) return;
  flushing = true;
  const batch = [...pending.entries()];
  pending = new Map();
  sending = new Set(batch.map(([k]) => k));
  try {
    for (let i = 0; i < batch.length; i += 500) {
      const rows = batch
        .slice(i, i + 500)
        .map(([, r]) => ({ user_id: uid, kind: r.kind, id: r.id, data: r.data, deleted_at: r.deleted_at ?? null }));
      const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "user_id,kind,id" });
      if (error) throw error;
    }
    // Reminders are best-effort: a failure here must not hold back saving the data itself.
    // Their signatures stay unchanged, so they are retried on the next edit or app start.
    await syncReminders(batch.map(([, r]) => r)).catch(() => undefined);
    setStatus(pending.size ? "saving" : "saved");
  } catch {
    // Keep anything that failed, unless a newer change for the same entity arrived meanwhile.
    for (const [k, r] of batch) if (!pending.has(k)) pending.set(k, r);
    setStatus(navigator.onLine ? "error" : "offline");
    clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flush, 10_000);
  } finally {
    flushing = false;
    sending = new Set();
    saveMeta();
    if (pending.size && useSync.getState().status === "saving") {
      clearTimeout(flushTimer);
      flushTimer = window.setTimeout(flush, 800);
    }
  }
}

async function fetchSince(since: string): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!
      .from(TABLE)
      .select("kind,id,data,updated_at,deleted_at")
      .gte("updated_at", since)
      .order("updated_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data as Rec[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function pull() {
  if (!supabase || !uid || useSync.getState().phase !== "ready") return;
  try {
    // Rows left out here don't move `lastSync`, so they are fetched again on the next pull.
    const rows = (await fetchSince(lastSync)).filter((r) => {
      const k = keyOf(r.kind, r.id);
      return !pending.has(k) && !sending.has(k);
    });
    if (rows.length) applyQuietly((ws) => applyRecords(ws, rows));
    advance(rows);
  } catch {
    setStatus(navigator.onLine ? "error" : "offline");
  }
}
function advance(rows: Rec[]) {
  for (const r of rows) if (r.updated_at && r.updated_at > lastSync) lastSync = r.updated_at;
  saveMeta();
}

/** Called once a session exists. Loads the person's workspace and starts syncing. */
export async function startCloud(user: User) {
  if (!supabase) return;
  if (uid === user.id && useSync.getState().phase === "ready") return;
  uid = user.id;
  useSync.setState({ user: { id: user.id, email: user.email ?? "" }, phase: "loading" });

  // Point the local cache at this person's own key.
  const legacy = localStorage.getItem(STORAGE_KEY);
  const hadCache = !!localStorage.getItem(cacheKey());
  useStore.persist.setOptions({ name: cacheKey() });
  // The copy as it was saved, before the load-time upgrades run on it (see migrateIfNeeded).
  baseline = hadCache ? parseCached(localStorage.getItem(cacheKey())) : null;
  if (hadCache) await useStore.persist.rehydrate();

  const meta = hadCache ? loadMeta() : { lastSync: EPOCH, pending: [] };
  lastSync = meta.lastSync;
  pending = new Map(meta.pending.map((r) => [keyOf(r.kind, r.id), r]));
  reminderSigs = meta.reminderSigs ?? {};

  let rows: Rec[];
  try {
    rows = await fetchSince(lastSync);
  } catch {
    if (!hadCache) {
      useSync.setState({ phase: "auth", user: null });
      throw new Error("Não foi possível carregar seus dados. Verifique a conexão e tente de novo.");
    }
    rows = [];
    setStatus("offline");
  }

  if (!hadCache) {
    if (rows.length === 0) {
      // Brand-new account: offer the data this browser already has, if any.
      const candidate = parseLegacy(legacy);
      if (candidate) {
        useSync.setState({ phase: "choose", candidate });
        return;
      }
      seedAccount(template());
      return;
    }
    applyQuietly((ws) => {
      Object.assign(ws, fromRecords(rows, ws.settings));
    });
    // A new device gets the same load-time upgrades as a cached one (see migrateIfNeeded).
  } else {
    const fresh = rows.filter((r) => !pending.has(keyOf(r.kind, r.id)));
    if (fresh.length) applyQuietly((ws) => applyRecords(ws, fresh));
    // What just came from the cloud differs from the saved copy for a good reason: don't send it back.
    fromServer = new Set(rows.map((r) => keyOf(r.kind, r.id)));
  }
  advance(rows);
  begin();
}

let baseline: Workspace | null = null;
let fromServer = new Set<string>();
function parseCached(raw: string | null): Workspace | null {
  try {
    const ws = JSON.parse(raw || "null")?.state?.ws as Workspace | undefined;
    return ws && Array.isArray(ws.pages) ? ws : null;
  } catch {
    return null;
  }
}

function parseLegacy(raw: string | null): Workspace | null {
  try {
    const ws = JSON.parse(raw || "null")?.state?.ws as Workspace | undefined;
    return ws && Array.isArray(ws.pages) ? normalizeWorkspace(ws) : null;
  } catch {
    return null;
  }
}

/** First login: upload either the browser's existing data or a fresh starter workspace. */
export function seedAccount(ws: Workspace) {
  prev = new Map();
  applying = true;
  useStore.getState().mut((w) => {
    Object.assign(w, ws);
  });
  applying = false;
  useStore.getState().setUi((u) => {
    u.route = "home";
    u.peek = null;
  });
  // Treat everything as new so it all gets uploaded.
  onStoreChange(useStore.getState().ws);
  useSync.setState({ candidate: null });
  // The copy from before the account is decided on (taken into the account or not): it leaves this
  // browser, so it isn't offered again to whoever signs in here next.
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  begin();
}

/**
 * Brings the workspace up to date (old formats, the new quick guide, settings…) and uploads what
 * differs from the saved copy, like any edit. Runs on every start, so a device that loads straight
 * from the cloud ends up the same as one with a local copy (which was upgraded while loading).
 */
function migrateIfNeeded() {
  const cur = useStore.getState().ws as Workspace & { docs?: unknown };
  const next = normalizeWorkspace(cur);
  const now = toEntities(cur),
    after = toEntities(next),
    base = baseline ? toEntities(baseline) : now;
  const skip = fromServer;
  baseline = null;
  fromServer = new Set();
  const json = (e?: Ent) => JSON.stringify(e?.data);
  // Bring the screen up to date (this edit is pushed by the normal store subscription)…
  const changed = [...after.keys()].filter((k) => json(now.get(k)) !== json(after.get(k)));
  const removed = [...now.keys()].filter((k) => !after.has(k));
  if (changed.length || removed.length || cur.docs)
    useStore.getState().mut((w) => {
      applyRecords(w, [
        ...changed.map((k) => ({ kind: after.get(k)!.kind, id: after.get(k)!.id, data: after.get(k)!.data })),
        ...removed.map((k) => ({ kind: now.get(k)!.kind, id: now.get(k)!.id, data: null, deleted_at: "now" })),
      ]);
      w.version = 2;
      delete (w as { docs?: unknown }).docs;
    });
  // …and also send what was already upgraded while loading the local copy, which the cloud doesn't have yet.
  const stamp = new Date().toISOString();
  let queued = false;
  for (const [k, e] of after)
    if (!pending.has(k) && !skip.has(k) && json(base.get(k)) !== json(e) && json(now.get(k)) === json(e)) {
      pending.set(k, { kind: e.kind, id: e.id, data: e.data, deleted_at: null });
      queued = true;
    }
  for (const [k, e] of base)
    if (!after.has(k) && !now.has(k) && !pending.has(k) && !skip.has(k)) {
      pending.set(k, { kind: e.kind, id: e.id, data: e.data, deleted_at: stamp });
      queued = true;
    }
  if (queued) saveMeta();
}

function begin() {
  prev = toEntities(useStore.getState().ws);
  lastAlerts = alertsKey(useStore.getState().ws);
  unsubscribe?.();
  unsubscribe = useStore.subscribe((s, old) => {
    if (s.ws !== old.ws) onStoreChange(s.ws);
  });
  migrateIfNeeded();
  useSync.setState({ phase: "ready", status: pending.size ? "saving" : "saved" });
  flush();
  purgeOld();
  setTimeout(refreshAllReminders, 3000);
  clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    if (!document.hidden) pull();
  }, 60_000);
}

/** Sends what is still waiting; true when nothing is left (waits for a send already under way). */
async function flushAll() {
  for (let i = 0; i < 50 && flushing; i++) await new Promise((r) => setTimeout(r, 100));
  await flush();
  return pending.size === 0;
}

/** Kept on sign-out: they hold nothing personal (the guide was seen; the wrong-password pause). */
const KEEP_ON_SIGN_OUT = new Set([GUIDE_SEEN_KEY, "organizer:login-tries"]);
/** Shown once after the reload that follows signing out (e.g. what could not be done). */
export const NOTICE_KEY = "organizer:notice";

/**
 * Erases everything of the person kept on this device: the copy of the workspace, what was waiting to
 * be sent, the copy from before the account, the local trash, remembered folder and list names, the
 * wallpaper picture and this tab's session data. On a shared computer the next person finds nothing.
 */
async function clearDevice() {
  try {
    for (const k of Object.keys(localStorage))
      if (
        ((k === STORAGE_KEY || k.startsWith(STORAGE_KEY + ":")) && !KEEP_ON_SIGN_OUT.has(k)) ||
        k === "board-folders-open" ||
        k.startsWith("habit-history-")
      )
        localStorage.removeItem(k);
    sessionStorage.clear();
  } catch {
    /* storage blocked: nothing kept there either */
  }
  await eraseFilesDbs(["aparencia", "anexos"]);
}

/**
 * Signs out and clears this browser's copy. Refuses while changes still can't reach the cloud
 * (offline, server error), since clearing then would lose them; `force` signs out anyway.
 */
export async function signOut(force = false, notice?: string) {
  if (!(await flushAll()) && !force)
    throw new Error("Algumas alterações ainda não foram salvas na nuvem. Conecte-se à internet e tente sair de novo.");
  // Nothing may be saved again after this point (the page reloads right after).
  unsubscribe?.();
  unsubscribe = null;
  clearTimeout(flushTimer);
  clearInterval(pollTimer);
  useStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
  await supabase?.auth.signOut();
  await clearDevice();
  if (notice)
    try {
      sessionStorage.setItem(NOTICE_KEY, notice);
    } catch {
      /* ignore */
    }
  location.hash = "";
  location.reload();
}

/**
 * Deletes everything this person has in the cloud and the account itself (LGPD: right to erasure),
 * then signs out. The account is removed by the `delete-account` function (the browser can't); its
 * rows go with it. Without that function deployed, the data is still erased and the person is told
 * the e-mail stays registered.
 */
export async function deleteAllMyData() {
  if (!supabase || !uid) return;
  clearTimeout(flushTimer);
  pending = new Map();
  // Attached images and PDFs first: they live in Storage, under a folder named after the user id,
  // and can only be reached while the account exists.
  const bucket = supabase.storage.from("anexos");
  for (;;) {
    const { data, error: listErr } = await bucket.list(uid, { limit: 1000 });
    if (listErr) throw new Error("Não foi possível apagar seus anexos. Nada foi apagado; tente de novo.");
    if (!data?.length) break;
    const { error: rmErr } = await bucket.remove(data.map((f) => `${uid}/${f.name}`));
    if (rmErr) throw new Error("Não foi possível apagar seus anexos. Tente de novo.");
    if (data.length < 1000) break;
  }
  const account = await supabase.functions.invoke("delete-account", { method: "POST" });
  let notice: string | undefined;
  if (account.error) {
    const { error } = await supabase.from(TABLE).delete().eq("user_id", uid);
    const rem = await supabase.from("reminders").delete().eq("user_id", uid);
    if (error || rem.error) throw new Error("Não foi possível apagar seus dados. Tente de novo.");
    notice =
      "Seus dados foram apagados, mas o cadastro do e-mail continua. Para excluí-lo também, fale com o contato da página de privacidade.";
  } else notice = "Sua conta e todos os seus dados foram apagados.";
  reminderSigs = {};
  // A clean start: the guide opens again on the next sign-in, as on a first visit.
  try {
    localStorage.removeItem(GUIDE_SEEN_KEY);
  } catch {
    /* ignore */
  }
  await signOut(true, notice);
}

if (typeof window !== "undefined") {
  addEventListener("online", () => {
    flush();
    pull();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pull();
    else flush();
  });
  addEventListener("beforeunload", () => saveMeta());
}

/* ---------- trash ---------- */
export interface TrashRow extends Rec {
  deleted_at: string;
}

async function purgeOld() {
  const cutoff = new Date(Date.now() - PURGE_DAYS * 864e5).toISOString();
  await supabase?.from(TABLE).delete().lt("deleted_at", cutoff);
}

/* ---------- local trash (no account, or no connection) ---------- */
export const LOCAL_TRASH_KEY = "organizer:trash";
/** Kinds that show up in the trash, plus the board that goes with a list (restored together). */
const TRASH_KINDS = new Set<Kind>(["page", "db", "item", "note", "event", "todo"]);
const LOCAL_TRASH_MAX = 500;

/** Rows deleted on this device in the last 30 days (older ones are dropped as they're read). */
export function readLocalTrash(): TrashRow[] {
  try {
    const cutoff = Date.now() - PURGE_DAYS * 864e5;
    const rows = JSON.parse(localStorage.getItem(LOCAL_TRASH_KEY) || "[]") as TrashRow[];
    return Array.isArray(rows) ? rows.filter((r) => r && r.deleted_at && new Date(r.deleted_at).getTime() >= cutoff) : [];
  } catch {
    return [];
  }
}
function writeLocalTrash(rows: TrashRow[]) {
  try {
    localStorage.setItem(LOCAL_TRASH_KEY, JSON.stringify(rows.slice(0, LOCAL_TRASH_MAX)));
  } catch {
    /* storage full: keep what we had */
  }
}

/**
 * Without an account, deletions are kept on this device so the trash still works: anything that
 * leaves the workspace goes in, and anything that comes back (Desfazer, Restaurar) comes out.
 * Call once after the saved data is loaded; returns the cleanup function.
 */
export function installLocalTrash() {
  let before = toEntities(useStore.getState().ws);
  writeLocalTrash(readLocalTrash()); // drops what is over 30 days old
  return useStore.subscribe((s, old) => {
    if (s.ws === old.ws) return;
    const next = toEntities(s.ws);
    const { removed } = diffEntities(before, next);
    let rows = readLocalTrash();
    const size = rows.length;
    rows = rows.filter((r) => !next.has(keyOf(r.kind, r.id)));
    const now = new Date().toISOString();
    for (const k of removed) {
      const e = before.get(k)!;
      if (TRASH_KINDS.has(e.kind)) rows.unshift({ kind: e.kind, id: e.id, data: e.data, deleted_at: now });
    }
    before = next;
    if (removed.length || rows.length !== size) writeLocalTrash(rows);
  });
}

/**
 * The trash: from the cloud when signed in and online; otherwise from this device
 * (with an account but offline: what was deleted here and hasn't reached the server yet).
 */
export async function loadTrash(): Promise<{ rows: TrashRow[]; local: boolean }> {
  if (!supabase || !uid) return { rows: readLocalTrash(), local: true };
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("kind,id,data,updated_at,deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return { rows: data as TrashRow[], local: false };
  } catch {
    const waiting = [...pending.values()].filter((r): r is TrashRow => !!r.deleted_at);
    return { rows: waiting.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)), local: true };
  }
}
/** Restores rows by putting them back into the workspace; the normal sync then uploads them. */
export function restoreRows(rows: Rec[]) {
  useStore.getState().mut((ws) =>
    applyRecords(
      ws,
      rows.map((r) => ({ ...r, deleted_at: null })),
    ),
  );
}
export async function deleteForever(rows: { kind: Kind; id: string }[]) {
  const gone = new Set(rows.map((r) => keyOf(r.kind, r.id)));
  writeLocalTrash(readLocalTrash().filter((r) => !gone.has(keyOf(r.kind, r.id))));
  if (!supabase || !uid) return;
  for (const r of rows) await supabase.from(TABLE).delete().eq("kind", r.kind).eq("id", r.id).not("deleted_at", "is", null);
}
