import type { AlertChannel, Workspace } from "./types";
import { alertLabel, eventsByDay, inArea, startOf } from "./events";
import { groupOf } from "./model";
import { addDays, fmtDate, ymd } from "./util";

/** "HH:MM" of a moment, in this browser's time zone. */
export const hhmm = (ms: number) => {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};
/** The local day ("YYYY-MM-DD") of a moment. */
export const dayOfMs = (ms: number) => ymd(new Date(ms));
export const CHANNEL: Record<AlertChannel, string> = { email: "E-mail", whatsapp: "WhatsApp" };

/** When each alarm goes off (ms, soonest first) for something on `date` (at `start`, or 9:00 when all day). */
export function alarmTimes(date: string, allDay: boolean, start: string, alerts: number[] | undefined) {
  if (!alerts?.length) return [];
  const at = startOf({ date, allDay, start }).getTime();
  return [...new Set(alerts.filter((m) => m >= 0))].map((m) => ({ at: at - m * 60_000, minutes: m })).sort((a, b) => a.at - b.at);
}

/** One alarm of a task or an event. */
export interface Alarm {
  at: number;
  minutes: number;
  kind: "task" | "event";
  id: string;
  /** The day of the task/occurrence (YYYY-MM-DD). */
  day: string;
  title: string;
  /** "HH:MM" it starts (9:00 for all-day ones). */
  start: string;
  channel: AlertChannel;
}

/** Every alarm of open tasks and events (in the area) between `from` and `to` (ms), soonest first. */
export function alarmsBetween(ws: Workspace, area: string, from: number, to: number): Alarm[] {
  const out: Alarm[] = [];
  const keep = (a: Alarm) => a.at >= from && a.at <= to && out.push(a);
  for (const it of Object.values(ws.items)) {
    const db = ws.dbs[it.db];
    if (!db || !it.alerts?.length || !inArea(it.area, area) || groupOf(db, it) === "done") continue;
    const d = typeof it.props.date === "string" ? it.props.date : "";
    if (!d) continue;
    const day = d.slice(0, 10),
      time = d.slice(11, 16);
    for (const t of alarmTimes(day, !time, time, it.alerts))
      keep({
        ...t,
        kind: "task",
        id: it.id,
        day,
        title: it.title || "Tarefa",
        start: time || "9:00",
        channel: it.alertChannel ?? "email",
      });
  }
  const span = Math.ceil((to - from) / 864e5) + 8;
  const byDay = eventsByDay(ws, addDays(dayOfMs(from), -1), addDays(dayOfMs(from), span), area);
  for (const [day, list] of Object.entries(byDay))
    for (const ev of list)
      for (const t of alarmTimes(day, ev.allDay, ev.start, ev.alerts))
        keep({
          ...t,
          kind: "event",
          id: ev.id,
          day,
          title: ev.title || "Evento",
          start: ev.allDay ? "9:00" : ev.start,
          channel: ev.alertChannel ?? "email",
        });
  return out.sort((a, b) => a.at - b.at);
}

/** "em 1 h 18 min", "em 5 min", "agora"; further away, the day ("amanhã", "8 nov"). */
export function untilLabel(at: number, now: number) {
  const min = Math.round((at - now) / 60_000);
  if (min <= 0) return "agora";
  if (min < 60) return `em ${min} min`;
  if (min < 12 * 60) {
    const h = Math.floor(min / 60),
      m = min % 60;
    return `em ${h} h${m ? ` ${m} min` : ""}`;
  }
  return fmtDate(dayOfMs(at)).toLowerCase();
}

/** "30 min antes das 17:00" / "na hora". */
export const beforeLabel = (a: Pick<Alarm, "minutes" | "start">) =>
  a.minutes === 0 ? "na hora" : `${alertLabel(a.minutes)} das ${a.start}`;
