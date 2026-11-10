import { Mascot } from "@/components/brand/Brand";
import { useEffect, useRef, useState } from "react";
import { withMotion } from "@/lib/motion";
import { ChevronLeft, ChevronRight, Mail, MessageCircle, Plus, Repeat, SlidersHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { alarmTimes, CHANNEL, hhmm } from "@/lib/alarms";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/types";
import { eventsByDay, inArea, minutesOf, monthGrid, weekOf } from "@/lib/events";
import { dateOf, groupOf } from "@/lib/model";
import { addDays, pad, parseD, today } from "@/lib/util";
import { go, moveEvent, openEvent, openPeek, setProp, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DRAG_TYPE, EntryChip, MonthView, type Entry } from "./MonthView";
import { areaVar } from "../common";
import { AreaSwitcher } from "../app/Topbar";

type Dropped = { kind: Entry["kind"]; id: string; from?: string };

/** Events (each repeat on its own day), plus dated tasks when shown, for each day between `from` and `to`. */
function collect(ws: Workspace, from: string, to: string, area: string, showTasks: boolean) {
  const areaOf = (id?: string) => ws.settings.areas.find((a) => a.id === id);
  const byDay: Record<string, Entry[]> = {};
  const ev = eventsByDay(ws, from, to, area);
  for (const d in ev)
    byDay[d] = ev[d].map((e) => ({
      key: "e" + e.id + d,
      id: e.id,
      kind: "event",
      title: e.title,
      date: d,
      time: e.allDay ? undefined : e.start,
      end: e.allDay ? undefined : e.end,
      area: areaOf(e.area),
      repeat: !!e.repeat && e.repeat !== "none",
      alerts: e.alerts,
      channel: e.alertChannel,
    }));
  if (showTasks) {
    for (const it of Object.values(ws.items)) {
      const db = ws.dbs[it.db];
      const d = db ? dateOf(db, it) : "";
      const day = d.slice(0, 10);
      if (!d || day < from || day > to || !inArea(it.area, area)) continue;
      const done = groupOf(db, it) === "done";
      (byDay[day] ??= []).push({
        key: "t" + it.id,
        id: it.id,
        kind: "task",
        title: it.title,
        date: day,
        time: d.slice(11, 16) || undefined,
        area: areaOf(it.area),
        done,
        alerts: done ? undefined : it.alerts,
        channel: it.alertChannel,
      });
    }
  }
  // In time order; things without a time (all day) first.
  for (const d in byDay)
    byDay[d].sort(
      (a, b) => (a.time ?? "").localeCompare(b.time ?? "") || Number(b.kind === "event") - Number(a.kind === "event"),
    );
  return byDay;
}

function openEntry(e: Entry) {
  if (e.kind === "event") openEvent(e.id, e.date);
  else if (e.kind === "task") openPeek(e.id);
  else go("home");
}

/** Moves anything dropped on a day to that day (and, for events in the week view, to that time). */
function moveEntry(e: Dropped, date: string, minutes?: number) {
  const { ws, mut } = useStore.getState();
  if (e.kind === "event") {
    moveEvent(e.id, date, e.from);
    if (minutes !== undefined)
      mut((w) => {
        const ev = w.events[e.id];
        if (!ev || ev.allDay) return;
        const length = Math.max(15, minutesOf(ev.end || ev.start) - minutesOf(ev.start));
        const hhmm = (m: number) => pad(Math.floor(m / 60) % 24) + ":" + pad(m % 60);
        ev.start = hhmm(minutes);
        ev.end = hhmm(Math.min(minutes + length, 23 * 60 + 59));
        ev.updated = Date.now();
      });
  } else if (e.kind === "task") {
    const cur = ws.items[e.id]?.props.date;
    // Dropped on an hour of the week view: that hour too. On a day (or the all-day row): keeps its time.
    const time =
      minutes !== undefined
        ? "T" + pad(Math.floor(minutes / 60) % 24) + ":" + pad(minutes % 60)
        : typeof cur === "string"
          ? cur.slice(10)
          : "";
    setProp(e.id, "date", date + time);
  }
}
const parseDrop = (dt: DataTransfer): Dropped | null => {
  try {
    return JSON.parse(dt.getData(DRAG_TYPE));
  } catch {
    return null;
  }
};

const SEG =
  "relative flex h-10 items-center rounded-lg px-3.5 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function CalendarPage() {
  const ws = useStore((s) => s.ws);
  const area = useStore((s) => s.ui.area);
  const cal = useStore((s) => s.ui.calendar);
  const setUi = useStore((s) => s.setUi);
  const set = (p: Partial<typeof cal>) =>
    setUi((u) => {
      Object.assign(u.calendar, p);
    });
  const T = today();
  const anchor = cal.anchor;
  const days = cal.view === "month" ? monthGrid(anchor) : weekOf(anchor);
  const selected = cal.selected && days.includes(cal.selected) ? cal.selected : days.includes(T) ? T : anchor;
  const byDay = collect(ws, days[0], days[days.length - 1], area, cal.showTasks);
  const pickDay = (day: string) => {
    set({ anchor: day, selected: day });
  };
  const shift = (k: number) => {
    pickDay(addDays(selected, k));
  };
  const week = weekOf(anchor);
  const label = parseD(selected).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-5 px-4 pt-5 pb-28 md:px-10 md:pt-7">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-x-5 gap-y-3 lg:basis-auto">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-3xl">{label}</h1>
          <div role="group" aria-label="Navegar entre dias" className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label="Dia anterior"
              title="Dia anterior"
              onClick={() => shift(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button variant="ghost" className="h-11 rounded-lg px-3 text-[15px]" onClick={() => pickDay(T)}>
              Hoje
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label="Próximo dia"
              title="Próximo dia"
              onClick={() => shift(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-3">
          <div role="group" aria-label="Visualização do calendário" className="flex shrink-0 rounded-xl bg-muted/50 p-0.5">
            {(
              [
                ["month", "Mês"],
                ["week", "Semana"],
              ] as const
            ).map(([v, name]) => (
              <button
                key={v}
                type="button"
                aria-pressed={cal.view === v}
                onClick={() => set({ view: v, anchor: selected, selected })}
                className={cn(SEG, cal.view === v ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {cal.view === v && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="cal-view"
                    transition={{ type: "spring", duration: 0.3, bounce: 0.1 }}
                    className="absolute inset-0 rounded-lg bg-muted shadow-card"
                  />
                )}
                <span className="relative">{name}</span>
              </button>
            ))}
          </div>
          <CalendarOptions showTasks={cal.showTasks} onShowTasks={(v) => set({ showTasks: v })} />
        </div>
      </header>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            {cal.view === "month" ? (
              <MonthView
                anchor={anchor}
                byDay={byDay}
                onOpen={openEntry}
                onAdd={(date) => openEvent(null, date)}
                onMove={(e, date) => moveEntry(e, date)}
                selected={selected}
                onSelect={pickDay}
              />
            ) : (
              <WeekView days={week} byDay={byDay} />
            )}
          </div>
          <p className="text-sm text-muted-foreground max-xl:hidden">
            Clique num dia para ver a agenda dele ao lado; clique duas vezes para criar um evento. Arraste para remarcar. Na
            semana, clique duas vezes num horário para criar um evento.
          </p>
        </div>
        <DayPanel day={selected} entries={byDay[selected] ?? []} onPick={pickDay} />
      </div>
    </div>
  );
}

/** Area filter and whether tasks show, in one small menu. */
function CalendarOptions({ showTasks, onShowTasks }: { showTasks: boolean; onShowTasks: (v: boolean) => void }) {
  const area = useStore((s) => s.ui.area);
  const areas = useStore((s) => s.ws.settings.areas);
  const current = areas.find((a) => a.id === area);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-11 max-w-full gap-2 rounded-lg px-3 text-[15px]" aria-label="Filtros do calendário">
          {current ? (
            <span className="size-2.5 rounded-full bg-(--area)" style={areaVar(current)} aria-hidden="true" />
          ) : (
            <SlidersHorizontal data-icon="inline-start" />
          )}
          <span className="max-w-36 truncate">{current ? current.name : "Todas as áreas"}</span>
          {!showTasks && <span className="size-1.5 rounded-full bg-primary-strong" aria-label="Tarefas ocultas" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Área</span>
          <AreaSwitcher className="min-w-0" />
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <Label htmlFor="show-tasks">Mostrar tarefas no calendário</Label>
          <Switch id="show-tasks" checked={showTasks} onCheckedChange={onShowTasks} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The chosen day: its events and tasks in time order, with their alarms, and "Novo evento neste dia". */
function DayPanel({ day, entries, onPick }: { day: string; entries: Entry[]; onPick: (d: string) => void }) {
  const now = Date.now();
  const title = parseD(day)
    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
    .replace("-feira", "")
    .replace(/^./, (c) => c.toUpperCase());
  return (
    <section
      aria-labelledby="day-panel"
      aria-live="polite"
      className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card xl:sticky xl:top-24 md:p-6"
    >
      <div className="flex items-center gap-1">
        <h2 id="day-panel" className="mr-auto text-xl font-bold tracking-tight">
          {title}
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label="Dia anterior" onClick={() => onPick(addDays(day, -1))}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Próximo dia" onClick={() => onPick(addDays(day, 1))}>
          <ChevronRight />
        </Button>
      </div>
      {entries.length ? (
        <ul className="flex flex-col gap-2.5">
          {entries.map((e) => {
            const times = e.alerts?.length ? alarmTimes(day, !e.time, e.time ?? "", e.alerts) : [];
            const next = times.find((t) => t.at >= now - 60_000);
            const last = times.at(-1);
            const Icon = e.channel === "whatsapp" ? MessageCircle : Mail;
            return (
              <li key={e.key}>
                <button
                  type="button"
                  data-del={e.fixed ? undefined : `${e.kind}:${e.id}`}
                  onClick={() => openEntry(e)}
                  style={areaVar(e.area)}
                  className="flex w-full items-start gap-4 rounded-xl border bg-background/40 p-4 text-left transition-colors hover:border-primary-strong/40 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="w-12 shrink-0 pt-0.5 text-[15px] font-semibold tabular-nums">{e.time ?? "Dia"}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span
                      className={cn(
                        "flex items-center gap-2 text-base font-semibold",
                        e.done && "text-muted-foreground line-through",
                      )}
                    >
                      <span className="size-2.5 shrink-0 rounded-full bg-(--area,var(--muted-foreground))" aria-hidden="true" />
                      <span className="truncate">{e.title || "Sem título"}</span>
                    </span>
                    {next ? (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-primary-strong">
                        <Icon className="size-4" aria-hidden="true" />
                        {CHANNEL[e.channel ?? "email"]} às {hhmm(next.at)}
                      </span>
                    ) : last ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Icon className="size-4" aria-hidden="true" />
                        Enviado às {hhmm(last.at)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {e.kind === "event"
                          ? e.end
                            ? `Até ${e.end}`
                            : e.time
                              ? "Evento"
                              : "Dia todo"
                          : e.done
                            ? "Tarefa feita"
                            : "Tarefa"}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Mascot pose="dorme" size={56} />
          <p className="text-sm text-muted-foreground">Nada marcado neste dia.</p>
        </div>
      )}
      <Button variant="outline" className="h-11 rounded-xl text-[15px]" onClick={() => openEvent(null, day)}>
        <Plus data-icon="inline-start" />
        Novo evento neste dia
      </Button>
    </section>
  );
}

const START_H = 6,
  END_H = 24,
  HOUR = 48;

function WeekView({ days, byDay }: { days: string[]; byDay: Record<string, Entry[]> }) {
  const ws = useStore((s) => s.ws);
  const area = useStore((s) => s.ui.area);
  const T = today();
  const [over, setOver] = useState<string | null>(null);
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const occ = eventsByDay(ws, days[0], days[6], area);
  const timed = (day: string) => (occ[day] ?? []).filter((e) => !e.allDay);
  const untimed = (day: string) => (byDay[day] ?? []).filter((x) => x.kind !== "event" || !x.time);
  const minutesAt = (e: React.DragEvent | React.MouseEvent, el: HTMLElement) => {
    const y = e.clientY - el.getBoundingClientRect().top;
    return Math.max(START_H * 60, Math.min((END_H - 1) * 60 + 45, START_H * 60 + Math.round(((y / HOUR) * 60) / 15) * 15));
  };
  const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);
  // On narrow screens only part of the week fits: start with today in view, not Sunday.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const col = el?.querySelector<HTMLElement>("[data-today]");
    if (!el || !col || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, col.offsetLeft - 56 - (el.clientWidth - 56 - col.offsetWidth) / 2);
  }, [days[0]]);
  return (
    <div ref={box} className="overflow-x-auto rounded-2xl border bg-card shadow-card">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b">
          <div />
          {days.map((d) => (
            <div key={d} data-today={d === T || undefined} className="flex flex-col items-center gap-0.5 border-l py-2">
              <span className="text-sm text-muted-foreground capitalize">
                {parseD(d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
              </span>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                  d === T && "bg-primary text-primary-foreground",
                )}
              >
                {parseD(d).getDate()}
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b">
          <div className="px-1 py-1.5 text-right text-xs text-muted-foreground">dia todo</div>
          {days.map((d) => (
            <div
              key={d}
              className={cn("flex min-h-9 min-w-0 flex-col gap-0.5 border-l p-1", over === d + "-all" && "bg-primary/8")}
              onDragOver={(e) => {
                if (accepts(e)) {
                  e.preventDefault();
                  setOver(d + "-all");
                }
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const x = parseDrop(e.dataTransfer);
                if (x) withMotion(() => moveEntry(x, d));
              }}
            >
              {untimed(d).map((x) => (
                <EntryChip key={x.key} e={x} onOpen={openEntry} compact />
              ))}
            </div>
          ))}
        </div>
        <div className="grid max-h-[65vh] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] overflow-y-auto">
          <div>
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: HOUR }}
                className="-translate-y-2 pr-2 text-right text-xs text-muted-foreground tabular-nums"
              >
                {h > START_H ? `${pad(h)}:00` : ""}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d}
              className={cn("relative border-l", over === d && "bg-primary/5")}
              style={{ height: hours.length * HOUR }}
              onDragOver={(e) => {
                if (accepts(e)) {
                  e.preventDefault();
                  setOver(d);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const x = parseDrop(e.dataTransfer);
                if (x) {
                  const m = minutesAt(e, e.currentTarget);
                  withMotion(() => moveEntry(x, d, m));
                }
              }}
              onDoubleClick={(e) => {
                const m = minutesAt(e, e.currentTarget);
                openEvent(null, d, pad(Math.floor(m / 60)) + ":" + pad(m % 60));
              }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  style={{ top: (h - START_H) * HOUR }}
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70 first:border-0"
                />
              ))}
              {timed(d).map((ev) => {
                const s = Math.max(minutesOf(ev.start), START_H * 60),
                  e = Math.max(minutesOf(ev.end || ev.start), s + 30);
                const a = ws.settings.areas.find((x) => x.id === ev.area);
                const repeating = !!ev.repeat && ev.repeat !== "none";
                return (
                  <button
                    key={ev.id}
                    draggable
                    data-del={"event:" + ev.id}
                    title={ev.title}
                    style={{
                      ...areaVar(a),
                      top: ((s - START_H * 60) / 60) * HOUR,
                      height: Math.max(22, ((e - s) / 60) * HOUR - 2),
                    }}
                    onDragStart={(x) => {
                      x.dataTransfer.effectAllowed = "move";
                      x.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: "event", id: ev.id, from: d }));
                    }}
                    onClick={() => openEvent(ev.id)}
                    className="area-soft area-stripe absolute inset-x-1 flex flex-col overflow-hidden rounded-md py-1 pr-1.5 pl-3 text-left text-xs hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="flex items-center gap-1 truncate font-semibold">
                      {ev.title || "Sem título"}
                      {repeating && <Repeat className="size-3 shrink-0" aria-label="Repete" />}
                    </span>
                    <span className="truncate text-muted-foreground tabular-nums">
                      {ev.start}
                      {ev.end ? `–${ev.end}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
