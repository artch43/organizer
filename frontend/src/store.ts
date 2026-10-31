import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createElement } from "react";
import { toast as sonner } from "sonner";
import type { Area, CalendarEvent, Color, Group, Item, Note, PropValue, Todo, Workspace } from "./lib/types";
import { template, mkDb, DEFAULT_STATUS } from "./lib/template";
import { applyStatusChange, childrenOf, runReviews, statusProp, streakOf } from "./lib/model";
import { DEFAULT_LIST_ICON, addDays, diffDays, emojiOf, fmtDate, parseD, today, uid } from "./lib/util";
import { dailyBody, uniqueTitle } from "./lib/notes";
import { STORAGE_KEY, workspaceStorage } from "./lib/storage";
import { normalizeWorkspace } from "./lib/migrate";
import { pushRoute } from "./lib/backClose";

export type Modal = "search" | "settings" | "trash" | "newBoard" | null;
export interface UI {
  route: string;
  peek: string | null;
  peekFocus: boolean;
  viewByDb: Record<string, string>;
  calMonth: Record<string, string>;
  search: Record<string, string>;
  modal: Modal;
  /** "all" or an area id: filters tasks and events everywhere. */
  area: string;
  /** Open event dialog: an event id, or a new event on a day. */
  eventDialog: { id: string | null; date?: string; start?: string } | null;
  statusDialog: string | null;
  calendar: { view: "month" | "week"; anchor: string; showTasks: boolean };
  noteId: string | null;
  noteMode: "edit" | "read";
  noteTag: string | null;
  notesTab: "list" | "note" | "side";
  /** Notes: show the list of notes / the side panel (outline and links). */
  notesList: boolean;
  notesSide: boolean;
}
interface Store {
  ws: Workspace;
  ui: UI;
  mut: (fn: (ws: Workspace) => void) => void;
  setUi: (fn: (ui: UI) => void) => void;
}

const defaultUi: UI = {
  route: "home",
  peek: null,
  peekFocus: false,
  viewByDb: {},
  calMonth: {},
  search: {},
  modal: null,
  area: "all",
  eventDialog: null,
  statusDialog: null,
  calendar: { view: "month", anchor: today(), showTasks: true },
  noteId: null,
  noteMode: "edit",
  noteTag: null,
  notesTab: "list",
  notesList: true,
  notesSide: false,
};

export const useStore = create<Store>()(
  persist(
    immer((set) => ({
      ws: template(),
      ui: defaultUi,
      mut: (fn) =>
        set((s) => {
          fn(s.ws);
        }),
      setUi: (fn) =>
        set((s) => {
          fn(s.ui);
        }),
    })),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: workspaceStorage,
      // Older saves are kept as they are here; `merge` below upgrades them with normalizeWorkspace.
      migrate: (persisted) => persisted as Store,
      partialize: (s) =>
        ({
          ws: s.ws,
          ui: {
            viewByDb: s.ui.viewByDb,
            noteMode: s.ui.noteMode,
            notesList: s.ui.notesList,
            notesSide: s.ui.notesSide,
            area: s.ui.area,
            calendar: { view: s.ui.calendar.view, showTasks: s.ui.calendar.showTasks },
          },
        }) as unknown as Store,
      merge: (persisted, current) => {
        const p = persisted as Partial<Store> | undefined;
        const ui = { ...current.ui, ...(p?.ui ?? {}) } as UI;
        ui.calendar = { ...current.ui.calendar, ...(p?.ui?.calendar ?? {}), anchor: today() };
        return { ...current, ws: p?.ws ? normalizeWorkspace(p.ws) : current.ws, ui };
      },
    },
  ),
);

/* ---------- actions ---------- */
const mut = (fn: (ws: Workspace) => void) => useStore.getState().mut(fn);
const setUi = (fn: (ui: UI) => void) => useStore.getState().setUi(fn);
const ws = () => useStore.getState().ws;

/** Short confirmation, with an optional "Desfazer". */
export function toast(msg: string, undo?: () => void) {
  if (undo) sonner(msg, { action: { label: "Desfazer", onClick: undo }, duration: 6000 });
  else sonner(msg);
}
/** A friendly confirmation after creating something: emoji badge, title and an optional detail line. */
export function celebrate(title: string, description?: string, emoji = "✨") {
  sonner.success(title, {
    description,
    icon: createElement("span", { className: "toast-emoji", "aria-hidden": true }, emoji),
    duration: 3500,
  });
}
/** Confirmation with a custom action button (e.g. "Ver no calendário"). */
export function notify(msg: string, action?: { label: string; onClick: () => void }, description?: string, id?: string) {
  sonner(msg, { id, action, description, duration: action ? 6000 : 4000 });
}

/** Tells the person a task landed on the calendar, with a shortcut to see it there. */
function announceDate(itemId: string, title: string, date: string, moved: boolean) {
  const day = parseD(date.slice(0, 10))
    .toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })
    .replaceAll(".", "");
  const time = date.slice(11, 16);
  notify(
    `${moved ? "Remarcada para" : "Adicionada ao calendário:"} ${day}${time ? " às " + time : ""}`,
    {
      label: "Ver no calendário",
      onClick: () => {
        const cal = ws().pages.find((p) => p.type === "calendar");
        if (!cal) return;
        setUi((u) => {
          u.calendar.anchor = date.slice(0, 10);
          u.peek = null;
        });
        go(cal.id);
      },
    },
    title || undefined,
    "date-" + itemId, // a newer change replaces the previous message instead of stacking
  );
}

export function replaceWorkspace(next: Workspace) {
  mut((w) => {
    Object.assign(w, next);
  });
  setUi((u) => {
    u.route = "home";
    u.peek = null;
  });
}

export function go(id: string) {
  announceFresh();
  setUi((u) => {
    u.route = id;
    u.peek = null;
  });
  pushRoute("#/" + id);
}
/**
 * Back to the top of the page. The window is what scrolls (the layout grows with its content);
 * the inner containers are reset too, for the pages that scroll inside themselves (Notes).
 */
export function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  for (const el of document.querySelectorAll<HTMLElement>("[data-scroll]")) el.scrollTop = 0;
}
/** Tasks the person just created (when), so their card can pop in once. */
const created = new Map<string, number>();
export const isJustCreated = (id: string) => Date.now() - (created.get(id) ?? 0) < 3000;
/** Tasks just made with "Nova tarefa" and still being filled in: they're announced once the panel closes with a name. */
const fresh = new Set<string>();
function announceFresh() {
  const id = useStore.getState().ui.peek;
  if (!id || !fresh.delete(id)) return;
  const it = ws().items[id];
  if (!it) return;
  // Made with "Nova tarefa" and closed without a name or notes: nothing to keep, so no "Sem título" task is left behind.
  // (One that already got its own note stays, so the note isn't left without its task.)
  if (!it.title.trim()) {
    if (!it.notes.trim() && !taskNoteOf(ws().notes, id))
      mut((w) => {
        delete w.items[id];
      });
    return;
  }
  const page = ws().pages.find((p) => p.id === it.db);
  const d = typeof it.props.date === "string" ? it.props.date : "";
  const when = d ? fmtDate(d.slice(0, 10)).toLowerCase() + (d.slice(11, 16) ? " às " + d.slice(11, 16) : "") : "";
  celebrate(
    `Tarefa “${it.title.trim()}” criada`,
    [page && `${emojiOf(page.icon)} ${page.title}`.trim(), when && `para ${when}`].filter(Boolean).join(" · "),
    "✅",
  );
}
export function openPeek(id: string, focus = false) {
  if (useStore.getState().ui.peek !== id) announceFresh();
  setUi((u) => {
    u.peek = id;
    u.peekFocus = focus;
  });
}
export const closePeek = () => {
  announceFresh();
  setUi((u) => {
    u.peek = null;
  });
};
export const openModal = (m: Modal) =>
  setUi((u) => {
    u.modal = m;
  });

/* ---------- tasks ---------- */
export function setProp(itemId: string, propId: string, value: PropValue | null, opts: { quiet?: boolean } = {}) {
  const prevDate = ws().items[itemId]?.props.date;
  mut((w) => {
    const item = w.items[itemId];
    if (!item) return;
    const db = w.dbs[item.db];
    const prop = db.props.find((p) => p.id === propId);
    if (!prop) return;
    const old = item.props[propId];
    if (value === "" || value == null || (Array.isArray(value) && !value.length)) delete item.props[propId];
    else item.props[propId] = value;
    if (prop.type === "status" && old !== value) applyStatusChange(item, db, old, value ?? undefined);
    item.updated = Date.now();
  });
  // A task that gets a (new) day shows up on the calendar: say so.
  if (
    propId === "date" &&
    typeof value === "string" &&
    value &&
    !opts.quiet &&
    String(prevDate ?? "").slice(0, 10) !== value.slice(0, 10)
  )
    announceDate(itemId, ws().items[itemId]?.title ?? "", value, !!prevDate);
}
export function patchItem(itemId: string, fn: (it: Item) => void) {
  mut((w) => {
    const it = w.items[itemId];
    if (it) {
      fn(it);
      it.updated = Date.now();
    }
  });
}
/** New task: gets the area chosen at the top, or the database's default area. */
export function newItem(dbId: string, props: Record<string, PropValue> = {}, title = "") {
  const id = uid();
  const area = useStore.getState().ui.area;
  mut((w) => {
    const db = w.dbs[dbId];
    const sp = statusProp(db);
    const it: Item = {
      id,
      db: dbId,
      title,
      props: {},
      notes: "",
      created: Date.now(),
      updated: Date.now(),
      order: Date.now(),
      log: [],
      area: area !== "all" ? area : db.defaultArea,
    };
    if (sp?.options?.[0]) it.props[sp.id] = sp.options[0].id;
    Object.assign(it.props, props);
    w.items[id] = it;
  });
  created.set(id, Date.now());
  if (!title) fresh.add(id);
  if (typeof props.date === "string" && props.date && title) announceDate(id, title, props.date, false);
  return id;
}
/** Moves a task to another list, keeping its status group (to do, doing, done) when that list has it. */
export function moveItemTo(id: string, dbId: string) {
  const before = ws().items[id];
  if (!before || !ws().dbs[dbId] || before.db === dbId) return;
  const from = ws().dbs[before.db];
  mut((w) => {
    const it = w.items[id];
    const db = w.dbs[dbId];
    const sp = statusProp(db);
    const group = from && statusProp(from)?.options?.find((o) => o.id === it.props.status)?.group;
    const opts = (prop: string) => db.props.find((p) => p.id === prop)?.options ?? [];
    const props: Record<string, PropValue> = {};
    if (it.props.date) props.date = it.props.date;
    // Priority and tags only carry over when the other list has the same option.
    if (opts("prio").some((o) => o.id === it.props.prio)) props.prio = it.props.prio;
    if (Array.isArray(it.props.tags)) props.tags = it.props.tags.filter((t) => opts("tags").some((o) => o.id === t));
    const status = sp?.options?.find((o) => o.group === group) ?? sp?.options?.[0];
    if (sp && status) props[sp.id] = status.id;
    it.props = props;
    it.db = dbId;
    it.order = Date.now();
    it.updated = Date.now();
    delete it.review;
  });
  setUi((u) => {
    if (u.peek === id) u.peek = null;
  });
  const page = ws().pages.find((p) => p.id === dbId);
  toast(`“${before.title || "Sem título"}” movida para ${page?.title ?? "outra lista"}`, () =>
    mut((w) => {
      w.items[id] = before;
    }),
  );
}
/** Notes linked to these tasks (made with "Criar anotação"): they are deleted along with the task. */
const linkedNotes = (w: Workspace, itemIds: Set<string>) => Object.values(w.notes).filter((n) => n.task && itemIds.has(n.task));
function dropNotes(w: Workspace, notes: Note[]) {
  for (const n of notes) delete w.notes[n.id];
}
function closeDroppedNotes(notes: Note[]) {
  if (!notes.length) return;
  setUi((u) => {
    if (u.noteId && notes.some((n) => n.id === u.noteId)) u.noteId = null;
  });
}

export function deleteItem(id: string) {
  const snap = ws().items[id];
  const notes = linkedNotes(ws(), new Set([id]));
  mut((w) => {
    delete w.items[id];
    dropNotes(w, notes);
  });
  setUi((u) => {
    if (u.peek === id) u.peek = null;
  });
  closeDroppedNotes(notes);
  toast(
    notes.length ? "Tarefa e anotação excluídas" : "Tarefa excluída",
    snap &&
      (() =>
        mut((w) => {
          w.items[id] = snap;
          for (const n of notes) w.notes[n.id] = n;
        })),
  );
}

/* ---------- status columns ---------- */
function statusOf(w: Workspace, dbId: string) {
  return statusProp(w.dbs[dbId])!;
}
export function renameStatus(dbId: string, optId: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  mut((w) => {
    const o = statusOf(w, dbId).options!.find((x) => x.id === optId);
    if (o) o.name = clean;
  });
}
export function setStatusColor(dbId: string, optId: string, color: Color) {
  mut((w) => {
    const o = statusOf(w, dbId).options!.find((x) => x.id === optId);
    if (o) o.color = color;
  });
}
export function setStatusGroup(dbId: string, optId: string, group: Group) {
  mut((w) => {
    const o = statusOf(w, dbId).options!.find((x) => x.id === optId);
    if (o) o.group = group;
  });
}
export function moveStatus(dbId: string, optId: string, dir: -1 | 1) {
  mut((w) => {
    const list = statusOf(w, dbId).options!;
    const i = list.findIndex((x) => x.id === optId),
      j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  });
}
export function addStatus(dbId: string, name = "Nova coluna") {
  const id = uid();
  mut((w) => {
    statusOf(w, dbId).options!.push({ id, name, color: "gray", group: "todo" });
  });
  return id;
}
/** Removes a column; its tasks move to the first remaining column. */
export function deleteStatus(dbId: string, optId: string) {
  const before = ws();
  const sp = statusProp(before.dbs[dbId])!;
  if (sp.options!.length <= 1) return;
  const opt = sp.options!.find((o) => o.id === optId)!;
  const index = sp.options!.indexOf(opt);
  const moved = Object.values(before.items)
    .filter((i) => i.db === dbId && i.props[sp.id] === optId)
    .map((i) => i.id);
  mut((w) => {
    const s = statusOf(w, dbId);
    s.options = s.options!.filter((o) => o.id !== optId);
    for (const id of moved) w.items[id].props[s.id] = s.options[0].id;
  });
  toast(`Coluna “${opt.name}” excluída`, () =>
    mut((w) => {
      const s = statusOf(w, dbId);
      s.options!.splice(index, 0, opt);
      for (const id of moved) if (w.items[id]) w.items[id].props[s.id] = optId;
    }),
  );
}

/* ---------- boards (databases) ---------- */
export function addBoard(title: string, icon: string, defaultArea?: string, folder = "") {
  const id = uid();
  mut((w) => {
    const top = childrenOf(w, null);
    w.pages.push({
      id,
      title: title.trim() || "Nova lista",
      icon: icon || DEFAULT_LIST_ICON,
      type: "db",
      parent: null,
      order: (top.at(-1)?.order ?? 0) + 1,
      ...(folder ? { folder } : {}),
    });
    w.dbs[id] = mkDb(DEFAULT_STATUS, defaultArea);
  });
  go(id);
  const name = title.trim() || "Nova lista";
  celebrate(
    `Lista “${name}” criada`,
    folder ? `Na pasta ${folder.split("/").join(" › ")}` : "Adicione a primeira tarefa no quadro.",
    emojiOf(icon, "🗂️"),
  );
  return id;
}
export function renamePage(id: string, title: string, icon?: string) {
  mut((w) => {
    const p = w.pages.find((x) => x.id === id);
    if (!p) return;
    if (title.trim()) p.title = title.trim();
    if (icon) p.icon = icon;
  });
}
/** Moves a task list up or down among the lists in the same folder. */
export function movePage(id: string, dir: -1 | 1) {
  mut((w) => {
    const all = childrenOf(w, null);
    const folder = all.find((p) => p.id === id)?.folder ?? "";
    const list = all.filter((p) => p.type === "db" && (p.folder ?? "") === folder);
    const i = list.findIndex((p) => p.id === id),
      j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i].order, list[j].order] = [list[j].order, list[i].order];
    if (list[i].order === list[j].order) list[j].order += dir;
  });
}
/** Archives a list (out of the sidebar, nothing deleted) or brings it back. */
export function archivePage(id: string, on: boolean) {
  const page = ws().pages.find((p) => p.id === id);
  if (!page) return;
  const set = (v: boolean) =>
    mut((w) => {
      const p = w.pages.find((x) => x.id === id);
      if (!p) return;
      if (v) p.archived = true;
      else delete p.archived;
    });
  set(on);
  if (on && useStore.getState().ui.route === id) go("home");
  toast(on ? `“${page.title}” arquivada. Ela fica em Arquivadas, no fim das listas.` : `“${page.title}” de volta às listas`, () =>
    set(!on),
  );
}
export function setPageFolder(id: string, folder: string, announce = false) {
  const before = ws().pages.find((x) => x.id === id);
  if (!before || (before.folder ?? "") === folder) return;
  mut((w) => {
    const p = w.pages.find((x) => x.id === id);
    if (!p) return;
    if (folder) p.folder = folder;
    else delete p.folder;
  });
  if (announce)
    celebrate(
      `“${before.title}” movida`,
      folder ? `Para ${folder.split("/").join(" › ")}` : "Para fora das pastas",
      emojiOf(before.icon, "🗂️"),
    );
}

/* ---------- task-list folders (sidebar) ---------- */
export function addBoardFolder(path: string) {
  const clean = cleanPath(path);
  if (!clean) return;
  mut((w) => {
    const list = w.settings.boardFolders ?? [];
    if (!list.includes(clean)) w.settings.boardFolders = [...list, clean];
  });
  const at = clean.includes("/") ? clean.slice(0, clean.lastIndexOf("/")) : "";
  celebrate(
    `Pasta “${clean.split("/").pop()}” criada`,
    at ? `Dentro de ${at.split("/").join(" › ")}` : "Arraste listas para dentro dela.",
    "📁",
  );
  return clean;
}
export function renameBoardFolder(from: string, to: string) {
  const dest = cleanPath(to);
  if (!dest || dest === from) return;
  const swap = (f: string) => (f === from ? dest : f.startsWith(from + "/") ? dest + f.slice(from.length) : f);
  mut((w) => {
    for (const p of w.pages) if (p.folder) p.folder = swap(p.folder);
    w.settings.boardFolders = [...new Set((w.settings.boardFolders ?? []).map(swap))];
    const icons = w.settings.boardFolderIcons;
    if (icons) w.settings.boardFolderIcons = Object.fromEntries(Object.entries(icons).map(([k, v]) => [swap(k), v]));
  });
}
export function setBoardFolderIcon(path: string, icon: string) {
  mut((w) => {
    w.settings.boardFolderIcons = { ...(w.settings.boardFolderIcons ?? {}), [path]: icon };
  });
}
/** Moves a folder (with everything inside) into another folder, or to the top level when `into` is "". */
export function moveBoardFolder(path: string, into: string) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dest = (into ? into + "/" : "") + name;
  if (dest === path || into === path || into.startsWith(path + "/")) return false;
  renameBoardFolder(path, dest);
  celebrate(`Pasta “${name}” movida`, into ? `Agora dentro de ${into.split("/").join(" › ")}` : "Agora no topo das listas", "📂");
  return true;
}
/** Removes a folder with everything in it: subfolders, the lists inside and all their tasks (with undo). */
export function deleteBoardFolderWithLists(path: string) {
  const inside = (f = "") => f === path || f.startsWith(path + "/");
  const before = ws();
  const pages = before.pages.filter((p) => p.type === "db" && inside(p.folder));
  const ids = new Set(pages.map((p) => p.id));
  const snap = {
    pages,
    dbs: pages.map((p) => [p.id, before.dbs[p.id]] as const),
    items: Object.values(before.items).filter((i) => ids.has(i.db)),
    folders: before.settings.boardFolders ?? [],
    icons: before.settings.boardFolderIcons,
  };
  const notes = linkedNotes(before, new Set(snap.items.map((it) => it.id)));
  mut((w) => {
    for (const it of Object.values(w.items)) if (ids.has(it.db)) delete w.items[it.id];
    dropNotes(w, notes);
    for (const id of ids) delete w.dbs[id];
    w.pages = w.pages.filter((p) => !ids.has(p.id));
    w.settings.boardFolders = snap.folders.filter((f) => !inside(f));
    if (w.settings.boardFolderIcons)
      w.settings.boardFolderIcons = Object.fromEntries(Object.entries(w.settings.boardFolderIcons).filter(([k]) => !inside(k)));
  });
  if (ids.has(useStore.getState().ui.route)) go("home");
  closeDroppedNotes(notes);
  toast(
    `Pasta excluída com ${pages.length} ${pages.length === 1 ? "lista" : "listas"} e ${snap.items.length} ${snap.items.length === 1 ? "tarefa" : "tarefas"}`,
    () =>
      mut((w) => {
        w.pages.push(...snap.pages);
        for (const [id, db] of snap.dbs) if (db) w.dbs[id] = db;
        for (const it of snap.items) w.items[it.id] = it;
        for (const n of notes) w.notes[n.id] = n;
        w.settings.boardFolders = snap.folders;
        w.settings.boardFolderIcons = snap.icons;
      }),
  );
}
/** Removes a folder and its subfolders. The lists inside are kept and move up to the parent folder. */
export function deleteBoardFolder(path: string) {
  const inside = (f = "") => f === path || f.startsWith(path + "/");
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const before = ws();
  const moved = before.pages.filter((p) => inside(p.folder)).map((p) => ({ id: p.id, folder: p.folder }));
  const folders = before.settings.boardFolders ?? [];
  const icons = before.settings.boardFolderIcons;
  mut((w) => {
    if (w.settings.boardFolderIcons)
      w.settings.boardFolderIcons = Object.fromEntries(Object.entries(w.settings.boardFolderIcons).filter(([k]) => !inside(k)));
    for (const p of w.pages)
      if (inside(p.folder)) {
        if (parent) p.folder = parent;
        else delete p.folder;
      }
    w.settings.boardFolders = folders.filter((f) => !inside(f));
  });
  toast(moved.length ? `Pasta excluída. As listas foram para ${parent || "fora das pastas"}.` : "Pasta excluída", () =>
    mut((w) => {
      for (const m of moved) {
        const p = w.pages.find((x) => x.id === m.id);
        if (p) p.folder = m.folder;
      }
      w.settings.boardFolders = folders;
      w.settings.boardFolderIcons = icons;
    }),
  );
}
export function deletePage(id: string) {
  const before = ws();
  const snap = {
    page: before.pages.find((p) => p.id === id)!,
    db: before.dbs[id],
    items: Object.values(before.items).filter((it) => it.db === id),
  };
  const notes = linkedNotes(before, new Set(snap.items.map((it) => it.id)));
  mut((w) => {
    for (const it of Object.values(w.items)) if (it.db === id) delete w.items[it.id];
    dropNotes(w, notes);
    delete w.dbs[id];
    w.pages = w.pages.filter((p) => p.id !== id);
  });
  closeDroppedNotes(notes);
  if (useStore.getState().ui.route === id) go("home");
  const n = snap.items.length;
  toast(`“${snap.page.title}” excluída${n ? ` com ${n} ${n === 1 ? "tarefa" : "tarefas"}` : ""}`, () =>
    mut((w) => {
      w.pages.push(snap.page);
      if (snap.db) w.dbs[id] = snap.db;
      for (const it of snap.items) w.items[it.id] = it;
      for (const n of notes) w.notes[n.id] = n;
    }),
  );
}

/* ---------- example data ---------- */
/**
 * What came with the starter workspace and is still marked as an example: tasks tagged
 * "Exemplo", events and quick tasks named "(exemplo)", and the "Ideias" note if never edited.
 * The quick guide stays.
 */
export function exampleData(w: Workspace = ws()) {
  const isExampleTag = (dbId: string, tagId: string) =>
    w.dbs[dbId]?.props.find((p) => p.id === "tags")?.options?.find((o) => o.id === tagId)?.name === "Exemplo";
  return {
    items: Object.values(w.items).filter((i) => Array.isArray(i.props.tags) && i.props.tags.some((t) => isExampleTag(i.db, t))),
    events: Object.values(w.events).filter((e) => /\(exemplo\)/i.test(e.title)),
  };
}
/** Removes the example data (after the person confirms), with undo. Nothing the person made is touched. */
export function removeExamples() {
  const ex = exampleData();
  const total = ex.items.length + ex.events.length;
  if (!total) return 0;
  const notes = linkedNotes(ws(), new Set(ex.items.map((i) => i.id)));
  mut((w) => {
    for (const i of ex.items) delete w.items[i.id];
    for (const e of ex.events) delete w.events[e.id];
    dropNotes(w, notes);
  });
  closeDroppedNotes(notes);
  toast(`${total} ${total === 1 ? "exemplo removido" : "exemplos removidos"}`, () =>
    mut((w) => {
      for (const i of ex.items) w.items[i.id] = i;
      for (const e of ex.events) w.events[e.id] = e;
      for (const n of notes) w.notes[n.id] = n;
    }),
  );
  return total;
}

/* ---------- areas ---------- */
export function addArea(name: string, color: Area["color"]) {
  const id = uid();
  mut((w) => {
    w.settings.areas.push({ id, name: name.trim() || "Nova área", color });
  });
  celebrate(`Área “${name.trim() || "Nova área"}” criada`, "Use-a para separar tarefas e eventos.", "🎨");
  return id;
}
export function updateArea(id: string, patch: Partial<Omit<Area, "id">>) {
  mut((w) => {
    const a = w.settings.areas.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
  });
}
/** Deletes an area; its tasks and events become "Sem área". */
export function deleteArea(id: string) {
  mut((w) => {
    w.settings.areas = w.settings.areas.filter((a) => a.id !== id);
    for (const it of Object.values(w.items)) if (it.area === id) delete it.area;
    for (const ev of Object.values(w.events)) if (ev.area === id) delete ev.area;
    for (const db of Object.values(w.dbs)) if (db.defaultArea === id) delete db.defaultArea;
  });
  setUi((u) => {
    if (u.area === id) u.area = "all";
  });
}

/* ---------- events ---------- */
export function saveEvent(data: Omit<CalendarEvent, "id" | "created" | "updated">, id?: string | null) {
  const eid = id || uid();
  const day = parseD(data.date).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  celebrate(
    id ? "Evento atualizado" : `Evento “${data.title || "Sem título"}” criado`,
    day + (data.allDay ? ", dia inteiro" : `, às ${data.start}`),
    "📅",
  );
  mut((w) => {
    const prev = w.events[eid];
    w.events[eid] = { ...data, id: eid, created: prev?.created ?? Date.now(), updated: Date.now() };
  });
  return eid;
}
/** Moves an event; for a repeating event, dragging one day moves the whole series by the same number of days. */
export function moveEvent(id: string, date: string, fromDay?: string) {
  mut((w) => {
    const e = w.events[id];
    if (!e) return;
    const repeating = e.repeat && e.repeat !== "none";
    const next = repeating && fromDay ? addDays(e.date, diffDays(date, fromDay)) : date;
    if (next === e.date) return;
    if (e.repeatUntil) e.repeatUntil = addDays(e.repeatUntil, diffDays(next, e.date));
    e.date = next;
    e.updated = Date.now();
  });
}
export function deleteEvent(id: string) {
  const snap = ws().events[id];
  if (!snap) return;
  mut((w) => {
    delete w.events[id];
  });
  toast(snap.repeat && snap.repeat !== "none" ? "Evento excluído (todas as datas)" : "Evento excluído", () =>
    mut((w) => {
      w.events[id] = snap;
    }),
  );
}
export const openEvent = (id: string | null, date?: string, start?: string) =>
  setUi((u) => {
    u.eventDialog = { id, date, start };
  });

/* ---------- to-do ---------- */
export function addTodo(text: string, extra: Partial<Todo> = {}) {
  const clean = text.trim();
  if (!clean) return null;
  const id = uid();
  const area = useStore.getState().ui.area;
  mut((w) => {
    const top = Math.min(0, ...Object.values(w.todos).map((t) => t.order));
    w.todos[id] = {
      id,
      text: clean,
      done: false,
      order: top - 1,
      created: Date.now(),
      ...(area !== "all" ? { area } : {}),
      ...extra,
    };
  });
  return id;
}
export function updateTodo(id: string, patch: Partial<Todo>) {
  mut((w) => {
    const t = w.todos[id];
    if (t) Object.assign(t, patch);
  });
}
export function toggleTodo(id: string) {
  mut((w) => {
    const t = w.todos[id];
    if (t) {
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : undefined;
    }
  });
}
export function deleteTodo(id: string) {
  const snap = ws().todos[id];
  if (!snap) return;
  mut((w) => {
    delete w.todos[id];
  });
  toast("Tarefa excluída", () =>
    mut((w) => {
      w.todos[id] = snap;
    }),
  );
}
export function clearDoneTodos() {
  const done = Object.values(ws().todos).filter((t) => t.done);
  if (!done.length) return;
  mut((w) => {
    for (const t of done) delete w.todos[t.id];
  });
  toast(`${done.length} ${done.length === 1 ? "concluído apagado" : "concluídos apagados"}`, () =>
    mut((w) => {
      for (const t of done) w.todos[t.id] = t;
    }),
  );
}

/* ---------- habits ---------- */
export function deleteHabit(id: string) {
  const list = ws().habits;
  const index = list.findIndex((h) => h.id === id);
  if (index < 0) return;
  const snap = list[index];
  mut((w) => {
    w.habits = w.habits.filter((h) => h.id !== id);
  });
  toast(`Hábito “${snap.name}” excluído`, () =>
    mut((w) => {
      w.habits.splice(index, 0, snap);
    }),
  );
}
export function toggleHabit(hid: string, day: string) {
  const wasOn = (ws().habitLog[day] || []).includes(hid);
  mut((w) => {
    const cur = w.habitLog[day] || [];
    const next = cur.includes(hid) ? cur.filter((x) => x !== hid) : [...cur, hid];
    if (next.length) w.habitLog[day] = next;
    else delete w.habitLog[day];
  });
  const h = ws().habits.find((x) => x.id === hid);
  if (!wasOn && h && day === today()) {
    const n = streakOf(ws().habitLog, hid);
    celebrate(
      `${h.name}: feito hoje!`,
      n > 1 ? `${n} dias seguidos. Continue assim!` : "Primeiro dia da sequência.",
      n > 1 ? "🔥" : emojiOf(h.icon, "✅"),
    );
  }
}
export const checkReviews = () => mut(runReviews);

/* ---------- notes ---------- */
export function openNotes(noteId?: string | null) {
  setUi((u) => {
    u.route = "notes";
    u.peek = null;
    if (noteId !== undefined) u.noteId = noteId;
    u.notesTab = noteId ? "note" : "list";
  });
  const id = useStore.getState().ui.noteId;
  const hash = "#/notas" + (id ? "/" + id : "");
  pushRoute(hash);
}

export function createNote(init: Partial<Note> = {}) {
  const id = uid();
  const now = Date.now();
  mut((w) => {
    w.notes[id] = {
      id,
      title: uniqueTitle(w.notes, init.title?.trim() || "Sem título"),
      folder: init.folder ?? "",
      body: init.body ?? "",
      created: now,
      updated: now,
    };
  });
  openNotes(id);
  if (!init.body) celebrate("Nota criada", init.folder ? `Em ${init.folder}` : "Comece pelo título.", "📝");
  return id;
}

/** The note linked to a task, if any. */
export const taskNoteOf = (notes: Record<string, Note>, itemId: string) => Object.values(notes).find((n) => n.task === itemId);

/**
 * Opens the task's note in Anotações, creating it the first time (titled after the task, in the
 * "Tarefas" folder). Text written in the task's old notes box goes into it, so nothing is lost.
 */
export function openTaskNote(itemId: string) {
  const it = ws().items[itemId];
  if (!it) return;
  const found = taskNoteOf(ws().notes, itemId);
  if (found) return openNotes(found.id);
  const id = createNote({ title: it.title.trim() || "Tarefa", folder: "Tarefas", body: it.notes.trim() });
  mut((w) => {
    const n = w.notes[id];
    if (n) n.task = itemId;
    const item = w.items[itemId];
    if (item) item.notes = "";
  });
  if (it.notes.trim()) celebrate("Anotação criada", "O texto que estava na tarefa veio junto.", "📝");
  return id;
}

export function updateNote(id: string, patch: Partial<Note>) {
  mut((w) => {
    const n = w.notes[id];
    if (n) Object.assign(n, patch, { updated: Date.now() });
  });
}

export function renameNote(id: string, title: string) {
  const n = ws().notes[id];
  const next = title.trim() || "Sem título";
  if (!n || n.title === next) return;
  mut((w) => {
    w.notes[id].title = next;
    w.notes[id].updated = Date.now();
  });
}

export function deleteNote(id: string) {
  const snap = ws().notes[id];
  if (!snap) return;
  mut((w) => {
    delete w.notes[id];
  });
  setUi((u) => {
    if (u.noteId === id) u.noteId = null;
  });
  toast("Anotação excluída", () => {
    mut((w) => {
      w.notes[id] = snap;
    });
    openNotes(id);
  });
}

const cleanPath = (p: string) =>
  p
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .join("/");
export function addFolder(path: string) {
  const clean = cleanPath(path);
  if (!clean) return;
  mut((w) => {
    const list = w.settings.noteFolders ?? [];
    if (!list.includes(clean)) w.settings.noteFolders = [...list, clean];
  });
}
export function renameFolder(from: string, to: string) {
  const dest = cleanPath(to);
  if (!dest || dest === from) return;
  const swap = (f: string) => (f === from ? dest : f.startsWith(from + "/") ? dest + f.slice(from.length) : f);
  mut((w) => {
    for (const n of Object.values(w.notes)) {
      const f = swap(n.folder);
      if (f !== n.folder) {
        n.folder = f;
        n.updated = Date.now();
      }
    }
    w.settings.noteFolders = (w.settings.noteFolders ?? []).map(swap);
  });
}
export function deleteFolder(path: string) {
  const inside = (f: string) => f === path || f.startsWith(path + "/");
  const before = ws();
  const notes = Object.values(before.notes).filter((n) => inside(n.folder));
  const folders = before.settings.noteFolders ?? [];
  mut((w) => {
    for (const n of notes) delete w.notes[n.id];
    w.settings.noteFolders = folders.filter((f) => !inside(f));
  });
  toast(notes.length ? `Pasta excluída com ${notes.length} ${notes.length === 1 ? "nota" : "notas"}` : "Pasta excluída", () =>
    mut((w) => {
      for (const n of notes) w.notes[n.id] = n;
      w.settings.noteFolders = folders;
    }),
  );
}
export function openDailyNote() {
  const t = today();
  const found = Object.values(ws().notes).find((n) => n.folder === "Diário" && n.title === t);
  if (found) openNotes(found.id);
  else createNote({ title: t, folder: "Diário", body: dailyBody(ws(), t) });
}
