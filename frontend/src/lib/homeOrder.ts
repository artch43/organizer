import { dateOf, groupOf } from "./model";
import type { Item, Workspace } from "./types";

export type HomeTaskGroup = "day" | "overdue" | "others" | "remaining";
const orderKey = (day: string, group: HomeTaskGroup) => group === "day" ? day : `${group}:${day}`;

/** Uses each list's configured priority order, just like automatic list sorting. */
export function homeTasks(ws: Workspace, day: string, area = "all", group: HomeTaskGroup = "day"): Item[] {
  const rank = (it: Item) => {
    const options = ws.dbs[it.db].props.find((p) => p.id === "prio")?.options ?? [];
    const index = options.findIndex((o) => o.id === it.props.prio);
    return index < 0 ? Infinity : index;
  };
  const positions = new Map((ws.settings.homeTaskOrder?.[orderKey(day, group)] ?? []).map((id, i) => [id, i]));
  const tasks = Object.values(ws.items).filter((it) => {
    const db = ws.dbs[it.db];
    if (!db || (area !== "all" && it.area !== area) || groupOf(db, it) === "done") return false;
    const date = dateOf(db, it).slice(0, 10);
    return group === "overdue" ? !!date && date < day
      : group === "others" ? !date || date > day
      : group === "remaining" ? date !== day : date === day;
  });
  return tasks.sort(
    (a, b) =>
      (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity) ||
      rank(a) - rank(b) ||
      (dateOf(ws.dbs[a.db], a).slice(0, 10) || "9999").localeCompare(dateOf(ws.dbs[b.db], b).slice(0, 10) || "9999") ||
      (dateOf(ws.dbs[a.db], a).slice(11, 16) || "99").localeCompare(dateOf(ws.dbs[b.db], b).slice(11, 16) || "99") ||
      a.created - b.created ||
      a.id.localeCompare(b.id),
  );
}

/** Whether the visible order differs from the automatic priority ordering. */
export function hasCustomHomeOrder(ws: Workspace, day: string, area = "all", group: HomeTaskGroup = "day"): boolean {
  if (!ws.settings.homeTaskOrder?.[orderKey(day, group)]) return false;
  const current = homeTasks(ws, day, area, group);
  const automatic = homeTasks({ ...ws, settings: { ...ws.settings, homeTaskOrder: undefined } }, day, area, group);
  return current.some((item, index) => item.id !== automatic[index].id);
}

/** Replace only visible slots, so changing order with an area filter keeps hidden tasks in place. */
export function saveHomeOrder(ws: Workspace, day: string, visibleIds: string[], group: HomeTaskGroup = "day") {
  const tasks = homeTasks(ws, day, "all", group);
  const available = new Set(tasks.map((it) => it.id));
  const visible = [...new Set(visibleIds)].filter((id) => available.has(id));
  const moving = new Set(visible);
  let next = 0;
  (ws.settings.homeTaskOrder ??= {})[orderKey(day, group)] = tasks.map((it) => (moving.has(it.id) ? visible[next++] : it.id));
}

export function moveHomeTask(ids: string[], source: string, target: string, after: boolean): string[] {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return ids;
  const result = ids.filter((id) => id !== source);
  result.splice(result.indexOf(target) + Number(after), 0, source);
  return result;
}
