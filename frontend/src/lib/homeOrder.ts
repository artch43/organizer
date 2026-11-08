import { dateOf, groupOf } from "./model";
import type { Item, Workspace } from "./types";

/** Uses each list's configured priority order, just like automatic list sorting. */
export function homeTasks(ws: Workspace, day: string, area = "all"): Item[] {
  const rank = (it: Item) => {
    const options = ws.dbs[it.db].props.find((p) => p.id === "prio")?.options ?? [];
    const index = options.findIndex((o) => o.id === it.props.prio);
    return index < 0 ? Infinity : index;
  };
  const positions = new Map((ws.settings.homeTaskOrder?.[day] ?? []).map((id, i) => [id, i]));
  const tasks = Object.values(ws.items).filter((it) => {
    const db = ws.dbs[it.db];
    return db && (area === "all" || it.area === area) && dateOf(db, it).slice(0, 10) === day && groupOf(db, it) !== "done";
  });
  return tasks.sort(
    (a, b) =>
      (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity) ||
      rank(a) - rank(b) ||
      (dateOf(ws.dbs[a.db], a).slice(11, 16) || "99").localeCompare(dateOf(ws.dbs[b.db], b).slice(11, 16) || "99") ||
      a.created - b.created ||
      a.id.localeCompare(b.id),
  );
}

/** Replace only visible slots, so changing order with an area filter keeps hidden tasks in place. */
export function saveHomeOrder(ws: Workspace, day: string, visibleIds: string[]) {
  const tasks = homeTasks(ws, day);
  const available = new Set(tasks.map((it) => it.id));
  const visible = [...new Set(visibleIds)].filter((id) => available.has(id));
  const moving = new Set(visible);
  let next = 0;
  (ws.settings.homeTaskOrder ??= {})[day] = tasks.map((it) => (moving.has(it.id) ? visible[next++] : it.id));
}

export function moveHomeTask(ids: string[], source: string, target: string, after: boolean): string[] {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return ids;
  const result = ids.filter((id) => id !== source);
  result.splice(result.indexOf(target) + Number(after), 0, source);
  return result;
}
