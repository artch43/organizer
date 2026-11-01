import type { Block, Color, Database, Item, Note, Page, Prop, Workspace } from "./types";
import { FIXED_PROPS } from "./types";
import { DEFAULT_SETTINGS, EXAMPLE_ICONS, GUIDE_ID, GUIDE_NOTE, GUIDE_VERSION, examples } from "./template";
import { today, uid } from "./util";

const FIXED = new Set<string>(FIXED_PROPS);
const DEFAULT_AREA_BY_DB: Record<string, string> = { estudos: "estudos", trabalho: "profissional", compromissos: "pessoal" };

/** Turns old editor blocks into Markdown text. */
export function blocksToMarkdown(blocks: Block[] = []): string {
  let n = 0;
  return blocks
    .map((b) => {
      n = b.type === "ol" ? n + 1 : 0;
      switch (b.type) {
        case "h1":
          return "# " + b.text;
        case "h2":
          return "## " + b.text;
        case "h3":
          return "### " + b.text;
        case "ul":
          return "- " + b.text;
        case "ol":
          return `${n}. ${b.text}`;
        case "todo":
          return `- [${b.checked ? "x" : " "}] ${b.text}`;
        case "quote":
          return "> " + b.text;
        case "callout":
          return "> 💡 " + b.text;
        case "divider":
          return "---";
        default:
          return b.text;
      }
    })
    .join("\n")
    .trim();
}

/** Adds a tag option by name (reusing an existing one) and returns its id. */
function tagId(tags: Prop, name: string, color: Color = "gray") {
  tags.options ??= [];
  let o = tags.options.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!o) {
    o = { id: uid(), name, color };
    tags.options.push(o);
  }
  return o.id;
}

function migrateDb(id: string, db: Database, items: Item[]) {
  let tags = db.props.find((p) => p.id === "tags");
  if (!tags) {
    tags = { id: "tags", name: "Etiquetas", type: "multi", options: [] };
    db.props.push(tags);
  }
  const extra = db.props.filter((p) => !FIXED.has(p.id));
  for (const it of items) {
    const lines: string[] = [];
    for (const p of extra) {
      const v = it.props[p.id];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
      if (p.options) {
        const ids = Array.isArray(v) ? v : [String(v)];
        for (const oid of ids) {
          const o = p.options.find((x) => x.id === oid);
          if (o) it.props.tags = [...new Set([...((it.props.tags as string[]) ?? []), tagId(tags, o.name, o.color)])];
        }
      } else if (p.type === "checkbox") {
        if (v) it.props.tags = [...new Set([...((it.props.tags as string[]) ?? []), tagId(tags, p.name)])];
      } else lines.push(`${p.name}: ${v}`);
      delete it.props[p.id];
    }
    if (lines.length) it.notes = [lines.join("\n"), it.notes].filter(Boolean).join("\n\n");
  }
  db.props = db.props.filter((p) => FIXED.has(p.id));
  db.views = db.views.map((v) => ({
    ...v,
    type: v.type === ("list" as never) ? "table" : v.type,
    hidden: (v.hidden ?? []).filter((h) => FIXED.has(h)),
    // The same filter twice (or two date filters) used to be possible; keep only the first.
    filters: (v.filters ?? []).filter(
      (f, k, all) =>
        FIXED.has(f.prop) &&
        all.findIndex((g) => g.prop === f.prop && g.op === f.op && g.val === f.val) === k &&
        // One date filter at most.
        (f.prop !== "date" || all.findIndex((g) => g.prop === "date") === k),
    ),
  }));
  if (!db.views.some((v) => v.type === "calendar"))
    db.views.push({ id: uid(), name: "Calendário", type: "calendar", filters: [], hidden: [] });
  db.defaultArea ??= DEFAULT_AREA_BY_DB[id];
}

/**
 * Brings any saved workspace up to the current format (version 2) without losing data:
 * block pages become notes, extra properties become tags or task notes, and areas,
 * events and the Calendar page are added. Safe to run on already-migrated data.
 */
export function normalizeWorkspace(input: Workspace): Workspace {
  const w = structuredClone(input) as Workspace & { docs?: Record<string, Block[]> };
  w.notes ??= {};
  w.events ??= {};
  w.todos ??= {};
  w.items ??= {};
  w.habits ??= [];
  w.habitLog ??= {};
  const s = (w.settings ?? {}) as Partial<typeof DEFAULT_SETTINGS> & Record<string, unknown>;
  w.settings = {
    // Keep every saved setting (list folders, their icons, WhatsApp…), then fill in the required ones.
    ...(s as Partial<Workspace["settings"]>),
    theme: s.theme ?? DEFAULT_SETTINGS.theme,
    start: s.start ?? DEFAULT_SETTINGS.start,
    name: s.name ?? "",
    areas: s.areas?.length ? s.areas : DEFAULT_SETTINGS.areas.map((a) => ({ ...a })),
    emailAlerts: s.emailAlerts ?? DEFAULT_SETTINGS.emailAlerts,
    defaultAlerts: s.defaultAlerts ?? DEFAULT_SETTINGS.defaultAlerts,
    noteFolders: s.noteFolders ?? [],
  };

  // Block pages → notes (children of a removed page move up to the top level).
  const docPages = w.pages.filter((p) => (p.type as string) === "doc");
  for (const p of docPages) {
    const blocks = w.docs?.[p.id] ?? [];
    const id = p.id === "guia" ? "guia" : p.id;
    if (!w.notes[id]) {
      const note: Note = {
        id,
        title: p.title || "Sem título",
        folder: "",
        body: blocksToMarkdown(blocks),
        created: Date.now(),
        updated: Date.now(),
      };
      w.notes[id] = note;
    }
  }
  const removed = new Set(docPages.map((p) => p.id));
  w.pages = w.pages
    .filter((p) => !removed.has(p.id))
    .map((p): Page => (p.parent && removed.has(p.parent) ? { ...p, parent: null } : p));
  delete w.docs;

  // The To-do page is gone: quick to-dos now live on Início, as today's tasks.
  w.pages = w.pages.filter((p) => (p.type as string) !== "todo");
  for (const t of Object.values(w.todos)) if (!t.done && !t.date) t.date = today();
  if (!w.pages.some((p) => p.type === "calendar")) {
    for (const p of w.pages) if (p.order >= 1) p.order += 1;
    w.pages.push({
      id: "calendario",
      title: "Calendário",
      icon: EXAMPLE_ICONS.pages.calendario[1],
      type: "calendar",
      parent: null,
      order: 1,
    });
  }

  // Tasks: notes as text, an area, only the fixed fields.
  for (const it of Object.values(w.items)) {
    if (typeof it.notes !== "string") it.notes = blocksToMarkdown(it.blocks);
    delete it.blocks;
  }
  for (const [id, db] of Object.entries(w.dbs))
    migrateDb(
      id,
      db,
      Object.values(w.items).filter((i) => i.db === id),
    );
  const areaIds = new Set(w.settings.areas.map((a) => a.id));
  for (const it of Object.values(w.items)) {
    if (!it.area || !areaIds.has(it.area)) {
      const def = w.dbs[it.db]?.defaultArea;
      it.area = def && areaIds.has(def) ? def : undefined;
    }
  }

  const version = w.settings.guideVersion ?? 1;
  // Version 4: one short guide, no loose tasks, beginner examples (see cleanUpV4).
  if (version < 4) cleanUpV4(w);
  // Version 5: alarms only when chosen. The old "30 min antes" default for new events goes away
  // (a different choice the person made is kept), and so does the example event's alarm.
  if (version < 5) {
    if (w.settings.defaultAlerts.length === 1 && w.settings.defaultAlerts[0] === 30) w.settings.defaultAlerts = [];
    const ex = w.events["ex-aula"];
    if (ex && ex.alerts.length === 1 && ex.alerts[0] === 30) ex.alerts = [];
  }
  if (version < GUIDE_VERSION) w.settings.guideVersion = GUIDE_VERSION;
  dedupeHabits(w);

  // The example's emojis become drawn icons, but only where the person never changed them.
  for (const p of w.pages) {
    const m = EXAMPLE_ICONS.pages[p.id];
    if (m && p.icon === m[0]) p.icon = m[1];
  }
  for (const h of w.habits) {
    const m = EXAMPLE_ICONS.habits[h.name];
    if (m && h.icon === m[0]) h.icon = m[1];
  }

  w.version = 2;
  return w;
}

/** Option `name` of a list's property, added (with `color`) when the list doesn't have it yet. */
function optionNamed(db: Database, propId: string, name: string, color: Color = "gray") {
  const prop = db.props.find((p) => p.id === propId);
  if (!prop) return undefined;
  prop.options ??= [];
  let o = prop.options.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!o) {
    o = { id: uid(), name, color };
    prop.options.push(o);
  }
  return o.id;
}

/**
 * Once per account (guide version 4): the old guides and example note go and the single short guide
 * comes in; the loose quick tasks (no list) go; the old examples are swapped for the beginner ones.
 * What the person made is kept: only items tagged "Exemplo" / titled "(exemplo)" are replaced.
 */
function cleanUpV4(w: Workspace) {
  for (const n of Object.values(w.notes))
    if (/^Guia rápido/i.test(n.title) || (n.title === "Ideias" && /#exemplo/.test(n.body) && n.body.length < 200))
      delete w.notes[n.id];
  if (!w.notes[GUIDE_ID]) w.notes[GUIDE_ID] = GUIDE_NOTE();

  w.todos = {};

  const isExample = (it: Item) => {
    const tags = w.dbs[it.db]?.props.find((p) => p.id === "tags")?.options;
    return (
      Array.isArray(it.props.tags) && (it.props.tags as string[]).some((t) => tags?.find((o) => o.id === t)?.name === "Exemplo")
    );
  };
  for (const it of Object.values(w.items)) if (isExample(it)) delete w.items[it.id];
  for (const e of Object.values(w.events)) if (/\(exemplo\)/i.test(e.title)) delete w.events[e.id];
  // The old example lists, when nothing of the person's is left in them.
  for (const id of ["trabalho", "compromissos"])
    if (w.pages.some((p) => p.id === id && p.type === "db") && !Object.values(w.items).some((i) => i.db === id)) {
      w.pages = w.pages.filter((p) => p.id !== id);
      delete w.dbs[id];
    }

  const ex = examples();
  for (const page of ex.pages)
    if (!w.pages.some((p) => p.id === page.id)) {
      w.pages.push(page);
      w.dbs[page.id] = ex.dbs[page.id];
    }
  for (const it of ex.items) {
    const db = w.dbs[it.db];
    if (!db || w.items[it.id]) continue;
    // The list may be the person's older one: use its own columns, priorities and tags (by name).
    const src = ex.dbs[it.db];
    const nameIn = (pid: string, id: unknown) => src.props.find((p) => p.id === pid)?.options?.find((o) => o.id === id);
    const status = db.props.find((p) => p.id === "status")?.options?.find((o) => (o.group ?? "todo") === "todo")?.id;
    const prio = nameIn("prio", it.props.prio);
    const tags = ((it.props.tags as string[]) ?? []).map((t) => nameIn("tags", t)).filter((o) => !!o);
    const props: Item["props"] = {
      ...it.props,
      tags: tags.map((o) => optionNamed(db, "tags", o!.name, o!.color)).filter(Boolean) as string[],
    };
    delete props.status;
    delete props.prio;
    if (status) props.status = status;
    const prioId = prio && optionNamed(db, "prio", prio.name, prio.color);
    if (prioId) props.prio = prioId;
    w.items[it.id] = { ...it, props };
  }
  for (const e of ex.events) w.events[e.id] ??= e;
}

/** The same habit twice (from two devices setting up together): keep the first, join their marked days. */
function dedupeHabits(w: Workspace) {
  const keep = new Map<string, string>();
  const same = new Map<string, string>();
  for (const h of w.habits) {
    const key = h.name.trim().toLowerCase().replace(/\s+/g, " ");
    const first = keep.get(key);
    if (first) same.set(h.id, first);
    else keep.set(key, h.id);
  }
  if (!same.size) return;
  w.habits = w.habits.filter((h) => !same.has(h.id));
  for (const [day, ids] of Object.entries(w.habitLog)) w.habitLog[day] = [...new Set(ids.map((id) => same.get(id) ?? id))];
}
