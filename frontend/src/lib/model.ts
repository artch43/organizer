import type { Database, Filter, Group, Item, Page, PropValue, View, Workspace, Prop, Option } from "./types";
import { INTERVALS, addDays, today } from "./util";

export const statusProp = (db: Database) => db.props.find((p) => p.type === "status");
export const dateProp = (db: Database) => db.props.find((p) => p.type === "date");
export const optOf = (prop: Prop | undefined, id: PropValue | undefined): Option | undefined =>
  prop?.options?.find((o) => o.id === id);
export function groupOf(db: Database, item: Item): Group | null {
  const sp = statusProp(db);
  return (sp && optOf(sp, item.props[sp.id])?.group) || null;
}
export function firstOptInGroup(db: Database, g: Group) {
  return statusProp(db)?.options?.find((o) => o.group === g)?.id ?? null;
}
export const childrenOf = (ws: Workspace, pid: string | null) =>
  ws.pages.filter((p) => (p.parent || null) === pid).sort((a, b) => a.order - b.order);
export function descendants(ws: Workspace, pid: string): string[] {
  const out: string[] = [];
  const walk = (id: string) =>
    childrenOf(ws, id).forEach((c) => {
      out.push(c.id);
      walk(c.id);
    });
  walk(pid);
  return out;
}
export function pagePath(ws: Workspace, id: string): Page[] {
  const out: Page[] = [];
  let p = ws.pages.find((x) => x.id === id);
  while (p) {
    out.unshift(p);
    const parent: string | null = p.parent;
    p = parent ? ws.pages.find((x) => x.id === parent) : undefined;
  }
  return out;
}
export const itemsOf = (ws: Workspace, dbId: string) => Object.values(ws.items).filter((i) => i.db === dbId);
export const dateOf = (db: Database, item: Item) => {
  const dp = dateProp(db);
  const v = dp && item.props[dp.id];
  return typeof v === "string" ? v : "";
};

/** Mutates the item (inside an immer draft): records history and schedules spaced reviews. */
export function applyStatusChange(item: Item, db: Database, oldId: PropValue | undefined, newId: PropValue | undefined) {
  const sp = statusProp(db);
  const g = (id: PropValue | undefined) => optOf(sp, id)?.group;
  item.log = [...(item.log || []), { g: g(newId) || null, t: Date.now() }].slice(-40);
  if (!db.srs || g(newId) !== "done") return;
  let stage = 0;
  if (item.review) stage = g(oldId) === "review" ? item.review.stage + 1 : item.review.stage;
  item.review =
    stage < INTERVALS.length ? { stage, next: addDays(today(), INTERVALS[stage]) } : { stage, next: null, finished: true };
}

/** Moves finished study items back to "review" once their review date arrives. */
export function runReviews(ws: Workspace) {
  const T = today();
  for (const it of Object.values(ws.items)) {
    const db = ws.dbs[it.db];
    if (!db || !db.srs || !it.review?.next || it.review.next > T || groupOf(db, it) !== "done") continue;
    const rv = firstOptInGroup(db, "review");
    const sp = statusProp(db);
    if (!rv || !sp) continue;
    it.props[sp.id] = rv;
    it.updated = Date.now();
    it.log = [...(it.log || []), { g: "review" as Group, t: Date.now() }].slice(-40);
  }
}

export function applyFilters(ws: Workspace, dbId: string, view: View, search: string, area = "all"): Item[] {
  const db = ws.dbs[dbId];
  let list = itemsOf(ws, dbId).filter((i) => area === "all" || i.area === area);
  const q = search.trim().toLowerCase();
  if (q) list = list.filter((i) => (i.title || "").toLowerCase().includes(q));
  const T = today();
  // Filters on the same field add up ("Doing" or "Done"); filters on different fields narrow down.
  const byProp = new Map<string, Filter[]>();
  for (const f of view.filters || []) byProp.set(f.prop, [...(byProp.get(f.prop) ?? []), f]);
  for (const [pid, fs] of byProp) {
    const prop = db.props.find((x) => x.id === pid);
    if (!prop) continue;
    const either = fs.every((f) => f.op !== "isnot");
    list = list.filter((i) => (either ? fs.some((f) => matches(i, f)) : fs.every((f) => matches(i, f))));
  }
  function matches(i: Item, f: Filter) {
    const prop = db.props.find((x) => x.id === f.prop)!;
    const v = i.props[prop.id];
    if (prop.type === "status" || prop.type === "select") return f.op === "isnot" ? v !== f.val : v === f.val;
    if (prop.type === "multi") return Array.isArray(v) && v.includes(f.val);
    if (prop.type === "checkbox") return !!v === (f.val === "true");
    if (prop.type === "date") {
      const d = typeof v === "string" ? v.slice(0, 10) : null;
      if (f.val === "empty") return !d;
      if (!d) return false;
      if (f.val === "today") return d === T;
      if (f.val === "week") return d >= T && d <= addDays(T, 7);
      if (f.val === "overdue") return d < T && groupOf(db, i) !== "done";
      if (f.val === "future") return d >= T;
    }
    return String(v ?? "")
      .toLowerCase()
      .includes(f.val.toLowerCase());
  }
  const s = view.sort;
  // No choice made (or "auto"): nearest deadline first, then higher priority; tasks without a date last.
  // null means the person arranged the cards by hand.
  if (s === undefined || s?.prop === "auto") return autoSort(db, list);
  if (s?.prop) {
    const prop = db.props.find((x) => x.id === s.prop);
    const key = (i: Item): string | number => {
      if (s.prop === "title") return (i.title || "").toLowerCase();
      if (s.prop === "created") return i.created;
      const v = i.props[s.prop];
      if (prop?.options) {
        const k = prop.options.findIndex((o) => o.id === v);
        return k < 0 ? 999 : k;
      }
      return v == null ? "￿" : typeof v === "boolean" ? (v ? 0 : 1) : (v as string | number);
    };
    return [...list].sort((a, b) => {
      const x = key(a),
        y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (s.dir === "desc" ? -1 : 1);
    });
  }
  return [...list].sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** Deadline day (soonest first, overdue on top), then priority (as ordered in the list's options), then time, then manual order. */
export function autoSort(db: Database, list: Item[]) {
  const prio = db.props.find((p) => p.id === "prio")?.options ?? [];
  const date = (i: Item) => (typeof i.props.date === "string" ? i.props.date : "");
  const day = (i: Item) => date(i).slice(0, 10) || "~";
  const time = (i: Item) => date(i).slice(11, 16) || "~";
  const rank = (i: Item) => {
    const k = prio.findIndex((o) => o.id === i.props.prio);
    return k < 0 ? 999 : k;
  };
  // Plain comparison: localeCompare would put "~" (no date) before the digits.
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  // Day first; within a day, priority; then the time (untimed after timed); then the order they were placed.
  return [...list].sort(
    (a, b) => cmp(day(a), day(b)) || rank(a) - rank(b) || cmp(time(a), time(b)) || (a.order || 0) - (b.order || 0),
  );
}

const DATE_FILTERS: Record<string, string> = {
  today: "hoje",
  week: "próximos 7 dias",
  overdue: "atrasados",
  empty: "vazia",
  future: "a partir de hoje",
};
export function filterLabel(db: Database, f: Filter) {
  const prop = db.props.find((x) => x.id === f.prop);
  if (!prop) return "?";
  if (prop.options) return prop.name + (f.op === "isnot" ? " não é " : ": ") + (optOf(prop, f.val)?.name ?? "?");
  if (prop.type === "date") return prop.name + ": " + DATE_FILTERS[f.val];
  if (prop.type === "checkbox") return prop.name + (f.val === "true" ? ": marcado" : ": desmarcado");
  return prop.name + " contém “" + f.val + "”";
}
export function defaultsFromFilters(db: Database, view: View) {
  const out: Record<string, PropValue> = {};
  for (const f of view.filters || []) {
    const pr = db.props.find((x) => x.id === f.prop);
    if (pr && (pr.type === "status" || pr.type === "select") && f.op !== "isnot") out[pr.id] = f.val;
    if (pr?.type === "multi") out[pr.id] = [f.val];
  }
  return out;
}
export const visibleProps = (db: Database, view: View) => db.props.filter((pr) => !(view.hidden || []).includes(pr.id));

/** The first day the habit was ever marked, or null if never. Days before it don't count as missed. */
export function firstDoneOf(log: Record<string, string[]>, hid: string) {
  let first: string | null = null;
  for (const [d, ids] of Object.entries(log)) if (ids.includes(hid) && (!first || d < first)) first = d;
  return first;
}

export function streakOf(log: Record<string, string[]>, hid: string) {
  let d = today(),
    n = 0;
  if (!(log[d] || []).includes(hid)) d = addDays(d, -1);
  while ((log[d] || []).includes(hid)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
