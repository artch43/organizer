import type { CalendarEvent, Item, Repeat, Workspace } from "./types";
import { addDays, diffDays, parseD, ymd } from "./util";

/** All-day events are announced relative to 9:00 on their day. */
export const ALL_DAY_ALERT_TIME = "09:00";

export const ALERT_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 0, label: "Na hora" },
  { minutes: 10, label: "10 min antes" },
  { minutes: 30, label: "30 min antes" },
  { minutes: 60, label: "1 hora antes" },
  { minutes: 1440, label: "1 dia antes" },
  { minutes: 10080, label: "1 semana antes" },
];

export function alertLabel(minutes: number) {
  const preset = ALERT_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  if (minutes % 1440 === 0) return `${minutes / 1440} dias antes`;
  if (minutes % 60 === 0) return `${minutes / 60} horas antes`;
  return `${minutes} min antes`;
}

export function alertPresets(saved?: number[]) {
  return [...new Set(saved ?? ALERT_PRESETS.map((p) => p.minutes))]
    .filter((m) => Number.isSafeInteger(m) && m >= 0)
    .sort((a, b) => a - b)
    .map((minutes) => ({ minutes, label: alertLabel(minutes) }));
}

export const REPEAT_LABELS: Record<Repeat, string> = {
  none: "Não se repete",
  daily: "Todo dia",
  weekdays: "Dias úteis (seg a sex)",
  weekly: "Toda semana",
  monthly: "Todo mês",
};

/** Anything that can send e-mail alerts: an event, or a task with a date. */
export interface AlertSource {
  id: string;
  title: string;
  date: string;
  allDay: boolean;
  start: string;
  alerts: number[];
  repeat?: Repeat;
  repeatUntil?: string;
}

/** The moment something starts, in this browser's time zone. */
export function startOf(ev: Pick<AlertSource, "date" | "allDay" | "start">): Date {
  const [h, m] = (ev.allDay ? ALL_DAY_ALERT_TIME : ev.start || "00:00").split(":").map(Number);
  const d = parseD(ev.date);
  d.setHours(h, m, 0, 0);
  return d;
}

export function whenLabel(ev: Pick<AlertSource, "date" | "allDay" | "start">) {
  const d = startOf(ev);
  const day = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return ev.allDay ? `${day} (dia inteiro)` : `${day} às ${ev.start}`;
}

/** Days (YYYY-MM-DD) on which an event happens between `from` and `to`, inclusive. */
export function occurrences(ev: Pick<CalendarEvent, "date" | "repeat" | "repeatUntil">, from: string, to: string): string[] {
  const repeat = ev.repeat ?? "none";
  const last = ev.repeatUntil && ev.repeatUntil < to ? ev.repeatUntil : to;
  if (repeat === "none") return ev.date >= from && ev.date <= to ? [ev.date] : [];
  const out: string[] = [];
  if (repeat === "monthly") {
    const first = parseD(ev.date),
      dom = first.getDate();
    for (let k = 0; k < 600; k++) {
      const d = new Date(first.getFullYear(), first.getMonth() + k, dom);
      if (d.getDate() !== dom) continue; // e.g. the 31st in a 30-day month
      const s = ymd(d);
      if (s > last) break;
      if (s >= from) out.push(s);
    }
    return out;
  }
  const step = repeat === "weekly" ? 7 : 1;
  let d = ev.date;
  if (d < from) {
    const gap = diffDays(from, d);
    d = addDays(d, Math.ceil(gap / step) * step);
  }
  for (let i = 0; d <= last && i < 800; i++, d = addDays(d, step)) {
    if (repeat === "weekdays" && [0, 6].includes(parseD(d).getDay())) continue;
    out.push(d);
  }
  return out;
}

export interface ReminderRow {
  event_id: string;
  send_at: string;
  title: string;
  when_label: string;
}

/** How far ahead reminders of repeating events are scheduled (they are refreshed every time the app opens). */
export const REPEAT_WINDOW_DAYS = 30;

/** E-mail reminders still to be sent (past ones are skipped). */
export function remindersFor(src: AlertSource, now = new Date()): ReminderRow[] {
  const days =
    src.repeat && src.repeat !== "none"
      ? occurrences(src, addDays(ymd(now), -1), addDays(ymd(now), REPEAT_WINDOW_DAYS)).slice(0, 40)
      : [src.date];
  const minutes = [...new Set(src.alerts.filter((m) => m >= 0))];
  const out: ReminderRow[] = [];
  for (const date of days) {
    const occ = { ...src, date };
    const start = startOf(occ).getTime();
    for (const m of minutes) {
      const at = start - m * 60_000;
      if (at < now.getTime() - 60_000) continue;
      out.push({
        event_id: src.id,
        send_at: new Date(at).toISOString(),
        title: src.title || "Evento",
        when_label: whenLabel(occ),
      });
    }
  }
  return out.sort((a, b) => a.send_at.localeCompare(b.send_at));
}

/** A task with a date can send alerts too; done tasks never do. */
export function taskAlertSource(it: Item, done: boolean): AlertSource | null {
  const d = typeof it.props.date === "string" ? it.props.date : "";
  if (!d || done || !it.alerts?.length) return null;
  const time = d.slice(11, 16);
  return { id: it.id, title: it.title || "Tarefa", date: d.slice(0, 10), allDay: !time, start: time, alerts: it.alerts };
}

export const inArea = (area: string | undefined, filter: string) => filter === "all" || area === filter;

/** An event placed on one of its days; `date` is that day, `seriesDate` the first one. */
export type Occurrence = CalendarEvent & { seriesDate: string };

export function eventsByDay(ws: Workspace, from: string, to: string, areaFilter = "all") {
  const out: Record<string, Occurrence[]> = {};
  for (const ev of Object.values(ws.events)) {
    if (!inArea(ev.area, areaFilter)) continue;
    for (const d of occurrences(ev, from, to)) (out[d] ??= []).push({ ...ev, date: d, seriesDate: ev.date });
  }
  for (const k in out) out[k].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  return out;
}

/** How many days back to the start of the week (`weekStart`: 0 = Sunday, 1 = Monday). */
const back = (day: string, weekStart: number) => (parseD(day).getDay() - weekStart + 7) % 7;

/** The 7 days of the week that contains `day` (Monday first by default). */
export function weekOf(day: string, weekStart = 1) {
  const start = addDays(day, -back(day, weekStart));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** The 5 or 6 weeks shown in a month grid for the month of `day`. */
export function monthGrid(day: string, weekStart = 1) {
  const d = parseD(day);
  const first = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
  const start = addDays(first, -back(first, weekStart));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return parseD(days[35]).getMonth() !== d.getMonth() ? days.slice(0, 35) : days;
}

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
