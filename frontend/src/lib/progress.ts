import type { Workspace } from "./types";
import { groupOf, streakOf } from "./model";
import { addDays, ymd } from "./util";

/** Days (YYYY-MM-DD) from `days - 1` days ago to `end`, oldest first. */
export const lastDays = (end: string, days: number) => Array.from({ length: days }, (_, i) => addDays(end, i - days + 1));

/**
 * Tasks completed per day: each task counts once on each day it was moved to a "done" column
 * (its status log keeps the moment of every change).
 */
export function doneByDay(ws: Workspace): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of Object.values(ws.items)) {
    const days = new Set<string>();
    for (const e of it.log ?? []) if (e.g === "done") days.add(ymd(new Date(e.t)));
    for (const d of days) out.set(d, (out.get(d) ?? 0) + 1);
  }
  return out;
}

/** Consecutive days, up to `today`, with at least one task completed (today counts once it has one). */
export function doneStreak(byDay: Map<string, number>, today: string) {
  let d = (byDay.get(today) ?? 0) > 0 ? today : addDays(today, -1);
  let n = 0;
  while ((byDay.get(d) ?? 0) > 0) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Share (0–1) of habit check-ins done on `days`, counting each habit only from the day it was created. */
export function habitRate(ws: Workspace, days: string[]) {
  let due = 0,
    done = 0;
  for (const d of days)
    for (const h of ws.habits) {
      if (h.created && d < h.created) continue;
      due++;
      if ((ws.habitLog[d] ?? []).includes(h.id)) done++;
    }
  return due ? done / due : 0;
}

/** How many habits were done on each day (for the habits grid). */
export const habitsOn = (ws: Workspace, day: string) =>
  (ws.habitLog[day] ?? []).filter((id) => ws.habits.some((h) => h.id === id)).length;

/** Every habit with its current streak, longest first. */
export const habitStreaks = (ws: Workspace) =>
  ws.habits.map((h) => ({ habit: h, streak: streakOf(ws.habitLog, h.id) })).sort((a, b) => b.streak - a.streak);

/** Open and done tasks per list (archived lists left out), busiest first. */
export function listsBreakdown(ws: Workspace) {
  return ws.pages
    .filter((p) => p.type === "db" && !p.archived)
    .map((p) => {
      const db = ws.dbs[p.id];
      let open = 0,
        done = 0;
      for (const it of Object.values(ws.items))
        if (it.db === p.id && db) {
          if (groupOf(db, it) === "done") done++;
          else open++;
        }
      return { page: p, open, done };
    })
    .filter((r) => r.open + r.done > 0)
    .sort((a, b) => b.open + b.done - (a.open + a.done));
}

/** Notes edited between `from` and `to` (inclusive days). */
export const notesEdited = (ws: Workspace, from: string, to: string) =>
  Object.values(ws.notes).filter((n) => {
    const d = ymd(new Date(n.updated));
    return d >= from && d <= to;
  }).length;
