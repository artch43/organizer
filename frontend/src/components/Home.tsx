import {
  AlertCircle,
  BellOff,
  BellRing,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flame,
  Mail,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AlertChannel, Area, Option } from "@/lib/types";
import { eventsByDay, inArea } from "@/lib/events";
import { dateOf, firstOptInGroup, groupOf, optOf, statusProp, streakOf } from "@/lib/model";
import { addDays, fmtDate, parseD, today } from "@/lib/util";
import { alarmTimes, alarmsBetween, beforeLabel, CHANNEL, dayOfMs, hhmm, untilLabel, type Alarm } from "@/lib/alarms";
import { boardFolderList } from "@/lib/notes";
import { cloudEnabled } from "@/lib/supabase";
import {
  celebrate,
  exampleData,
  go,
  openEvent,
  openModal,
  openPeek,
  removeExamples,
  setProp,
  toast,
  toggleHabit,
  useStore,
} from "@/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mascot, UiIcon } from "./brand/Brand";
import { EmptyState } from "./EmptyState";
import { OptionBadge, areaVar, greeting, useAreas, useToday } from "./common";
import { Glyph } from "./icons";
import { AreaSwitcher } from "./app/Topbar";
import { useNow } from "./app/AppHeader";
import { FolderGlyph } from "./app/folderIcons";
import { FolderDialog } from "./lists/FolderDialog";
import { openLists } from "./lists/state";
import { vtName, withMotion } from "@/lib/motion";
import { focusPoint, pixelBurst } from "@/lib/pixelBurst";

/** An alarm of a task: when it goes off (ms) and where it arrives. */
interface RowAlarm {
  at: number;
  channel: AlertChannel;
}

interface Entry {
  key: string;
  time: string;
  title: string;
  /** The task's list name. */
  list?: string;
  /** The task's priority (from the list's "Prioridade" column), when it has one. */
  priority?: Option;
  /** The folder the list is in (top level name, full path and its icon), when it is in one. */
  folder?: { name: string; path: string; icon?: string };
  area?: Area;
  done: boolean;
  order: number;
  /** The task's day (YYYY-MM-DD): today, or earlier for overdue ones; "" when it has no date. */
  day: string;
  /** Say the day, not just the time (the list of all tasks mixes days). */
  showDay?: boolean;
  /** The task's next alarm (or its last one, already sent). */
  alarm?: RowAlarm;
  onOpen?: () => void;
  /** Mark done / not done (absent when the list has no "done" column). */
  onToggle?: () => void;
  /** Move to another day (null = no date). */
  onMove: (day: string | null) => void;
}

const byTime = (a: Entry, b: Entry) => (a.time || "99").localeCompare(b.time || "99") || a.order - b.order;
const SHOW_ALL_KEY = "organizer:home-show-all";
const UPCOMING_DAYS = 7;
/** How far ahead "Próximo alarme" looks. */
const ALARM_DAYS = 7;
const CARD = "rounded-2xl border bg-card shadow-card";

/**
 * Início, in blocks: today's tasks (the biggest block), the next alarm and the agenda beside them,
 * and the habits and lists below. Done and "remarcar" in one tap; a click on a task opens its list.
 * Another day can be picked in the header to see that day's tasks and events.
 */
export function Home() {
  const ws = useStore((s) => s.ws);
  const area = useStore((s) => s.ui.area);
  const areas = useAreas();
  const T = useToday();
  const now = useNow();
  // The day being looked at; null follows today (also past midnight).
  const [picked, setPicked] = useState<string | null>(null);
  const D = picked ?? T;
  const isToday = D === T;
  // Which way the last day change went: the day's content slides in from that side.
  const [dir, setDir] = useState<"next" | "prev" | null>(null);
  const pick = (d: string) => {
    if (d !== D) setDir(d > D ? "next" : "prev");
    setPicked(d === T ? null : d);
  };
  const areaOf = (id?: string) => areas.find((a) => a.id === id);
  // "Ver todas": every other open task (any day, or none) under the day's. Stays open until hidden.
  const [showAll, setShowAllState] = useState(() => {
    try {
      return localStorage.getItem(SHOW_ALL_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setShowAll = (on: boolean) => {
    setShowAllState(on);
    try {
      if (on) localStorage.setItem(SHOW_ALL_KEY, "1");
      else localStorage.removeItem(SHOW_ALL_KEY);
    } catch {
      /* private mode */
    }
  };

  const entries: Entry[] = [];
  const allOpen: Entry[] = [];
  for (const it of Object.values(ws.items)) {
    const db = ws.dbs[it.db];
    if (!db || !inArea(it.area, area)) continue;
    const d = dateOf(db, it);
    const day = d.slice(0, 10);
    const isDone = groupOf(db, it) === "done";
    // Today's tasks, plus earlier ones still open (overdue). Another day: just that day's.
    const shown = !!d && !(isToday ? day > T || (day < T && isDone) : day !== D);
    if (!shown && isDone) continue;
    const page = ws.pages.find((p) => p.id === it.db);
    const time = d.slice(11, 16);
    const times = day ? alarmTimes(day, !time, time, it.alerts) : [];
    const alarmAt = times.find((t) => t.at >= now - 60_000) ?? times.at(-1);
    const entry: Entry = {
      key: "t" + it.id,
      time,
      title: it.title || "Sem título",
      list: page?.title,
      priority: optOf(
        db.props.find((p) => p.id === "prio"),
        it.props.prio,
      ),
      folder: page?.folder
        ? {
            name: page.folder.split("/")[0],
            path: page.folder.split("/").join(" › "),
            icon: ws.settings.boardFolderIcons?.[page.folder] ?? ws.settings.boardFolderIcons?.[page.folder.split("/")[0]],
          }
        : undefined,
      area: areaOf(it.area),
      done: isDone,
      order: it.created,
      day,
      alarm: alarmAt ? { at: alarmAt.at, channel: it.alertChannel ?? "email" } : undefined,
      onOpen: page ? () => go(page.id) : undefined,
      onToggle: firstOptInGroup(db, "done") ? () => toggleItemDone(it.id) : undefined,
      onMove: (to) => moveItemDay(it.id, to),
    };
    if (shown) entries.push(entry);
    if (!isDone) allOpen.push({ ...entry, showDay: true });
  }
  // Dated ones first, soonest first; then those without a date.
  allOpen.sort((a, b) => (a.day || "9").localeCompare(b.day || "9") || byTime(a, b));
  const shownKeys = new Set(entries.map((e) => e.key));
  const others = allOpen.filter((e) => !shownKeys.has(e.key));
  const overdue = isToday ? entries.filter((e) => e.day < T).sort((a, b) => a.day.localeCompare(b.day) || byTime(a, b)) : [];
  // The day's tasks in time order, done ones included (struck through), as in a checklist.
  const todays = entries.filter((e) => e.day === D).sort(byTime);
  const doneCount = todays.filter((e) => e.done).length;

  const longDate = parseD(D)
    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
    .replace(/^./, (c) => c.toUpperCase());
  const shortDate = parseD(D)
    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" })
    .replace("-feira", "")
    .replace(".", "")
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-5 px-4 pt-5 pb-28 md:px-10 md:pt-7">
      <WelcomeBanner />
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          {/* The mascot says hello next to the greeting. */}
          <Mascot pose="acena" size={60} className="mascot-pop -my-1 shrink-0 max-md:size-12!" />
          <div className="flex min-w-0 flex-col">
            <p className="text-base text-muted-foreground">{greeting(ws.settings.name)}</p>
            <h1
              key={D}
              data-dir={dir ?? undefined}
              className={cn("text-[1.75rem] leading-tight font-extrabold tracking-tight md:text-4xl", dir && "cal-enter")}
            >
              <span className="md:hidden">{shortDate}</span>
              <span className="max-md:hidden">{longDate}</span>
            </h1>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 max-sm:w-full">
          <AreaSwitcher className="min-w-0 max-sm:w-full" />
          <span className="h-7 w-px bg-border max-sm:hidden" aria-hidden="true" />
          <DayPicker D={D} T={T} onPick={pick} />
        </div>
      </header>

      {/* Computer: "Hoje" is the big block on the left; the next alarm and the agenda on the right;
          habits and lists in a smaller row below. Phone: alarm, Hoje, agenda, habits, lists. */}
      <div
        key={D}
        data-dir={dir ?? undefined}
        className={cn(
          "flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.75fr)_minmax(20rem,1fr)] lg:grid-rows-[auto_1fr]",
          dir && "cal-enter",
        )}
      >
        <section
          aria-labelledby="home-tasks"
          className={cn(CARD, "flex min-w-0 flex-col gap-2 p-5 max-lg:order-2 md:p-6 lg:row-span-2")}
        >
          <div className="flex flex-col gap-4 pb-1">
            <div className="flex items-baseline gap-3">
              <h2 id="home-tasks" className="text-xl font-bold tracking-tight">
                {isToday ? "Hoje" : fmtDate(D)}
              </h2>
              <span className="text-sm text-muted-foreground tabular-nums">
                {todays.length
                  ? `${doneCount} de ${todays.length} ${todays.length === 1 ? "feita" : "feitas"}`
                  : isToday
                    ? "nada com prazo"
                    : "nenhuma tarefa"}
              </span>
              {others.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showAll}
                  aria-controls="home-others"
                  onClick={() => setShowAll(!showAll)}
                  className="ml-auto rounded-md px-1 text-sm font-semibold text-primary-strong hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {showAll ? "Esconder" : `Ver todas (${others.length})`}
                </button>
              )}
            </div>
            {todays.length > 0 && (
              <div
                role="progressbar"
                aria-label="Feitas no dia"
                aria-valuemin={0}
                aria-valuemax={todays.length}
                aria-valuenow={doneCount}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
                  style={{ width: `${(doneCount / todays.length) * 100}%` }}
                />
              </div>
            )}
          </div>

          {todays.length > 0 && <TaskList items={todays} T={T} label={isToday ? "Tarefas de hoje" : "Tarefas do dia"} />}
          {!todays.length && !overdue.length && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              {/* A free day: the mascot naps. */}
              <Mascot pose="dorme" size={80} className="mascot-pop" />
              <p className="text-base font-semibold">Dia livre</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {isToday
                  ? "Tarefas com prazo para hoje aparecem aqui. Dê uma data a elas nas listas."
                  : "Nenhuma tarefa com prazo para este dia."}
              </p>
            </div>
          )}
          {todays.length > 0 && doneCount === todays.length && !overdue.length && (
            <p className="flex items-center gap-2 px-1 pt-2 text-sm font-semibold text-primary-strong">
              <Mascot pose="comemora" size={28} />
              Tudo feito por hoje. Bom trabalho!
            </p>
          )}
          {overdue.length > 0 && (
            <div className="flex flex-col pt-3">
              <h3 className="flex items-center gap-1.5 px-1 pb-1 text-sm font-semibold text-destructive">
                <AlertCircle className="size-4" aria-hidden="true" />
                {overdue.length === 1 ? "Atrasada" : `Atrasadas (${overdue.length})`}
              </h3>
              <TaskList items={overdue} T={T} label="Tarefas atrasadas" />
            </div>
          )}
          {showAll && others.length > 0 && (
            <div id="home-others" className="flex flex-col pt-3">
              <h3 className="px-1 pb-1 text-sm font-semibold text-muted-foreground">
                {entries.length ? "Outras tarefas a fazer" : "Todas as tarefas a fazer"} ({others.length})
              </h3>
              <TaskList items={others} T={T} label="Outras tarefas a fazer" />
            </div>
          )}
        </section>

        <div className="max-lg:order-1">{isToday ? <NextAlarm now={now} area={area} /> : <DayNote D={D} />}</div>
        <div className="max-lg:order-3">
          <Agenda T={T} D={D} area={area} now={now} />
        </div>
      </div>

      {/* The smaller row: habits and lists. */}
      <div className="grid items-start gap-5 md:grid-cols-2">
        {D <= T && <HabitsBlock D={D} isToday={isToday} />}
        <ListsBlock />
      </div>
    </div>
  );
}

/** A block's title row: name, a count and a link on the right. */
function BlockHead({
  id,
  title,
  meta,
  link,
  children,
}: {
  id: string;
  title: string;
  meta?: React.ReactNode;
  link?: { label: string; run: () => void };
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 id={id} className="text-lg font-bold tracking-tight">
        {title}
      </h2>
      {meta && <span className="text-sm text-muted-foreground tabular-nums">{meta}</span>}
      {link && (
        <button
          type="button"
          onClick={link.run}
          className="ml-auto rounded-md px-1 text-sm font-semibold text-primary-strong hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {link.label}
        </button>
      )}
      {children}
    </div>
  );
}

/**
 * The next alarm (task or event) in the coming days: the one highlighted block. When it arrives, by
 * e-mail or WhatsApp, and buttons to open what it is for (where the alarm can be changed).
 */
function NextAlarm({ now, area }: { now: number; area: string }) {
  const ws = useStore((s) => s.ws);
  const next: Alarm | undefined = alarmsBetween(ws, area, now - 60_000, now + ALARM_DAYS * 864e5)[0];
  if (!next)
    return (
      <section aria-labelledby="home-alarm" className={cn(CARD, "flex items-center gap-4 p-5 md:p-6")}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <BellRing className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 id="home-alarm" className="text-base font-semibold">
            Nenhum alarme nos próximos dias
          </h2>
          <p className="text-sm text-muted-foreground">Abra uma tarefa ou evento e escolha quando ser avisado por e-mail.</p>
        </div>
      </section>
    );
  const off = !cloudEnabled
    ? "Os avisos começam a valer quando você entrar numa conta."
    : !ws.settings.emailAlerts
      ? "Os avisos estão desligados nas Configurações."
      : null;
  const ChannelIcon = next.channel === "whatsapp" ? MessageCircle : Mail;
  const open = () => (next.kind === "task" ? openPeek(next.id) : openEvent(next.id, next.day));
  return (
    <section
      aria-labelledby="home-alarm"
      className="relative flex flex-col gap-1 overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-card md:p-6"
    >
      <p className="flex items-center gap-2 pr-20 text-sm font-semibold opacity-85 md:pr-24 md:text-[15px]">
        <ChannelIcon className="size-[18px] shrink-0" aria-hidden="true" />
        {(() => {
          const when = untilLabel(next.at, now);
          // "em 1 h 18 min" / "agora" read as a sentence; a day ("amanhã", "9 nov") follows a dot.
          return /^(em|agora)/.test(when) ? `Próximo alarme ${when}` : `Próximo alarme · ${when}`;
        })()}
      </p>
      <h2
        id="home-alarm"
        className="pr-20 text-2xl leading-tight font-extrabold tracking-tight sm:text-[1.75rem] md:pr-24 md:text-[2rem]"
      >
        {CHANNEL[next.channel]} às {hhmm(next.at)}
      </h2>
      <p className="truncate pr-20 text-[15px] font-medium opacity-85 md:pr-24 md:whitespace-normal">
        {next.title}
        <span className="max-md:hidden"> · {beforeLabel(next)}</span>
      </p>
      {off && (
        <p className="mt-1 flex items-center gap-1.5 pr-24 text-xs font-medium opacity-80 max-md:hidden">
          <BellOff className="size-3.5 shrink-0" aria-hidden="true" />
          {off}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2 max-md:hidden">
        <button
          type="button"
          onClick={open}
          className="flex h-10 items-center gap-2 rounded-xl bg-primary-foreground px-4 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-primary focus-visible:outline-none"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          {next.kind === "task" ? "Abrir tarefa" : "Abrir evento"}
        </button>
        <button
          type="button"
          onClick={open}
          className="flex h-10 items-center gap-2 rounded-xl border border-primary-foreground/25 px-4 text-[15px] font-semibold transition-colors hover:bg-primary-foreground/8 focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:outline-none"
        >
          <BellRing className="size-4" aria-hidden="true" />
          Trocar alarme
        </button>
      </div>
      {/* Phones: the whole card opens it. */}
      <button type="button" onClick={open} className="absolute inset-0 md:hidden" aria-label={`Abrir “${next.title}”`} />
      {/* The mascot brings the letter. */}
      <Mascot
        pose="email"
        size={88}
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 max-md:size-[60px]! md:right-5"
      />
    </section>
  );
}

/** Another day picked: a short note instead of the alarm. */
function DayNote({ D }: { D: string }) {
  return (
    <section className={cn(CARD, "flex items-center gap-4 p-5 md:p-6")}>
      <Mascot pose="calendario" size={44} />
      <p className="text-sm text-muted-foreground">
        Vendo <b className="font-semibold text-foreground">{fmtDate(D).toLowerCase()}</b>. Use as setas ou “Hoje” para voltar.
      </p>
    </section>
  );
}

/** Events from the day on (the next week; or only the picked day's); a click shows that day in the calendar. */
function Agenda({ T, D, area, now }: { T: string; D: string; area: string; now: number }) {
  const isToday = D === T;
  const ws = useStore((s) => s.ws);
  const setUi = useStore((s) => s.setUi);
  const areas = useAreas();
  const cal = ws.pages.find((p) => p.type === "calendar");
  const nowHM = hhmm(now);
  const byDay = eventsByDay(ws, D, isToday ? addDays(T, UPCOMING_DAYS) : D, area);
  const list = Object.keys(byDay)
    .sort()
    .flatMap((d) => byDay[d].map((e) => ({ ...e, day: d })))
    // Today's events that already ended are left out.
    .filter((e) => e.day !== T || e.allDay || (e.end || e.start) >= nowHM)
    .slice(0, 4);
  const show = (day: string) => {
    if (!cal) return;
    setUi((u) => {
      u.calendar.anchor = day;
      u.calendar.selected = day;
    });
    go(cal.id);
  };
  return (
    <section aria-labelledby="home-agenda" className={cn(CARD, "flex h-full flex-col gap-3 p-5 md:p-6")}>
      <BlockHead id="home-agenda" title="Agenda" link={cal ? { label: "Calendário", run: () => show(D) } : undefined} />
      {list.length ? (
        <ul className="-mx-2 flex flex-col">
          {list.map((e, i) => {
            const d = parseD(e.day);
            const a = areas.find((x) => x.id === e.area);
            const alarm = alarmTimes(e.day, e.allDay, e.start, e.alerts).find((t) => t.at >= now);
            return (
              <li key={e.id + e.day} className={cn(i > 0 && "border-t border-border/70")}>
                <button
                  onClick={() => show(e.day)}
                  className="flex w-full items-center gap-4 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-muted leading-none">
                    <span className="text-lg font-bold tabular-nums">{d.getDate()}</span>
                    <span className="mt-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                      {d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-base font-medium">{e.title || "Evento"}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {e.allDay ? "Dia todo" : e.start + (e.end ? `–${e.end}` : "")}
                      {a ? ` · ${a.name}` : ""}
                    </span>
                  </span>
                  {alarm && (
                    <AlarmChip
                      alarm={{ at: alarm.at, channel: e.alertChannel ?? "email" }}
                      sameDay={dayOfMs(alarm.at) === e.day}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          compact
          pose="calendario"
          title={isToday ? "Agenda livre" : "Nada neste dia"}
          text={isToday ? `Nenhum evento nos próximos ${UPCOMING_DAYS} dias.` : "Nenhum evento marcado."}
          action={{ label: "Novo evento", run: () => openEvent(null, D) }}
        />
      )}
    </section>
  );
}

/** The day's habits: a tap marks one done (or not); each shows its streak. */
function HabitsBlock({ D, isToday }: { D: string; isToday: boolean }) {
  const habits = useStore((s) => s.ws.habits);
  const habitLog = useStore((s) => s.ws.habitLog);
  const page = useStore((s) => s.ws.pages.find((p) => p.type === "habits"));
  if (!page) return null;
  if (!habits.length)
    return (
      <section aria-label="Hábitos" className={cn(CARD, "p-5")}>
        <EmptyState
          compact
          pose="rega"
          title="Nenhum hábito ainda"
          text="Comece com algo pequeno, como beber água ou ler 10 minutos."
          action={{ label: "Criar um hábito", run: () => go(page.id) }}
        />
      </section>
    );
  const doneIds = new Set(habitLog[D] ?? []);
  const done = habits.filter((h) => doneIds.has(h.id)).length;
  return (
    <section aria-labelledby="home-habits" className={cn(CARD, "flex flex-col gap-3 p-5")}>
      <BlockHead
        id="home-habits"
        title="Hábitos"
        meta={`${done} de ${habits.length} ${isToday ? "hoje" : "no dia"}`}
        link={{ label: "Ver hábitos", run: () => go(page.id) }}
      />
      {/* Computer: rows. Phone: tiles side by side. */}
      <ul className="flex flex-col max-sm:grid max-sm:grid-cols-3 max-sm:gap-2.5">
        {habits.map((h, i) => {
          const on = doneIds.has(h.id);
          const streak = streakOf(habitLog, h.id);
          return (
            <li key={h.id} className={cn(i > 0 && "sm:border-t sm:border-border/70")}>
              <button
                type="button"
                aria-pressed={on}
                title={on ? "Desmarcar" : "Marcar como feito"}
                onClick={() => withMotion(() => toggleHabit(h.id, D))}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:-mx-1 sm:px-1 sm:hover:bg-muted/60",
                  "max-sm:h-full max-sm:flex-col max-sm:items-start max-sm:gap-2 max-sm:border max-sm:bg-background/40 max-sm:p-3",
                  on && "max-sm:border-primary-strong max-sm:bg-primary/10",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {on ? (
                    <Check className="pixel-hop size-5" strokeWidth={2.75} aria-hidden="true" />
                  ) : (
                    <Glyph icon={h.icon} size="sm" />
                  )}
                </span>
                <span
                  className={cn("min-w-0 flex-1 text-[15px] font-medium sm:truncate", on && "font-semibold text-primary-strong")}
                >
                  {h.name}
                </span>
                {streak > 0 && (
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-sm tabular-nums",
                      on ? "font-semibold text-primary-strong" : "text-muted-foreground",
                    )}
                  >
                    <Flame className="size-4" aria-hidden="true" />
                    {streak}
                    <span className="max-sm:hidden"> {streak === 1 ? "dia" : "dias"}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The folders (with their lists) and lists, with open-task counts; a click opens the list. */
function ListsBlock() {
  const ws = useStore((s) => s.ws);
  const [newFolder, setNewFolder] = useState(false);
  const lists = ws.pages.filter((p) => p.type === "db" && !p.archived);
  if (!lists.length)
    return (
      <section aria-label="Listas" className={cn(CARD, "p-5")}>
        <EmptyState
          compact
          pose="organiza"
          title="Nenhuma lista ainda"
          text="Separe suas tarefas em listas: faculdade, casa, trabalho…"
          action={{ label: "Criar a primeira lista", run: () => openModal("newBoard") }}
        />
      </section>
    );
  const icons = ws.settings.boardFolderIcons ?? {};
  const open = new Map<string, number>();
  for (const it of Object.values(ws.items)) {
    const db = ws.dbs[it.db];
    if (db && groupOf(db, it) !== "done") open.set(it.db, (open.get(it.db) ?? 0) + 1);
  }
  const top = boardFolderList(ws).filter((f) => !f.includes("/"));
  const inside = (f: string) => lists.filter((p) => p.folder === f || p.folder?.startsWith(f + "/"));
  const loose = lists.filter((p) => !p.folder);
  type Row = { key: string; depth: number; icon: React.ReactNode; name: string; count: number; run: () => void };
  const rows: Row[] = [];
  for (const f of top) {
    const ls = inside(f);
    rows.push({
      key: "f" + f,
      depth: 0,
      icon: <FolderGlyph icon={icons[f]} className="size-6!" />,
      name: f,
      count: ls.reduce((n, p) => n + (open.get(p.id) ?? 0), 0),
      run: () => (ls[0] ? go(ls[0].id) : openLists()),
    });
    for (const p of ls)
      rows.push({
        key: p.id,
        depth: 1,
        icon: <Glyph icon={p.icon} size="sm" className="text-muted-foreground" />,
        name: p.title || "Sem título",
        count: open.get(p.id) ?? 0,
        run: () => go(p.id),
      });
  }
  for (const p of loose)
    rows.push({
      key: p.id,
      depth: 0,
      icon: <Glyph icon={p.icon} size="sm" />,
      name: p.title || "Sem título",
      count: open.get(p.id) ?? 0,
      run: () => go(p.id),
    });
  const MAX = 7;
  return (
    <section aria-labelledby="home-lists" className={cn(CARD, "flex flex-col gap-3 p-5")}>
      <BlockHead
        id="home-lists"
        title="Listas"
        meta={top.length ? `${top.length} ${top.length === 1 ? "pasta" : "pastas"}` : `${lists.length}`}
      >
        <button
          type="button"
          aria-label="Criar nova pasta"
          title="Criar nova pasta"
          onClick={() => setNewFolder(true)}
          className="ml-auto flex size-8 items-center justify-center self-center rounded-lg transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <UiIcon name="newFolder" size={24} />
        </button>
      </BlockHead>
      <ul className="-mx-1 flex flex-col">
        {rows.slice(0, MAX).map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onClick={r.run}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                r.depth && "pl-9",
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center">{r.icon}</span>
              <span className={cn("min-w-0 flex-1 truncate", r.depth ? "text-[15px]" : "text-base font-semibold")}>{r.name}</span>
              {r.count > 0 && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{r.count}</span>}
            </button>
          </li>
        ))}
      </ul>
      {rows.length > MAX && (
        <button
          type="button"
          onClick={openLists}
          className="w-fit rounded-md px-1 text-sm font-semibold text-primary-strong hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Ver todas as listas
        </button>
      )}
      {newFolder && <FolderDialog parent="" onClose={() => setNewFolder(false)} />}
    </section>
  );
}

/** ‹ [📅 Hoje] › with the device's own date picker behind the middle button. */
function DayPicker({ D, T, onPick }: { D: string; T: string; onPick: (d: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  // fmtDate already says Hoje / Amanhã / Ontem for the nearby days.
  const label = fmtDate(D);
  const openPicker = () => {
    const el = input.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Escolher o dia">
      <Button variant="ghost" size="icon" className="size-10" aria-label="Dia anterior" onClick={() => onPick(addDays(D, -1))}>
        <ChevronLeft />
      </Button>
      <div className="relative">
        <Button
          variant="outline"
          className="h-10 gap-2 rounded-xl px-4 text-[15px]"
          onClick={openPicker}
          aria-label={`Escolher data (${label})`}
        >
          <CalendarDays data-icon="inline-start" />
          {label}
        </Button>
        {/* Invisible native date input behind the button: on phones it opens the system's date picker. */}
        <input
          ref={input}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={D}
          onChange={(e) => e.target.value && onPick(e.target.value)}
          className="pointer-events-none absolute inset-0 size-full opacity-0"
        />
      </div>
      <Button variant="ghost" size="icon" className="size-10" aria-label="Próximo dia" onClick={() => onPick(addDays(D, 1))}>
        <ChevronRight />
      </Button>
      {D !== T && (
        <Button variant="link" size="sm" className="h-10 px-1" onClick={() => onPick(T)}>
          Voltar para hoje
        </Button>
      )}
    </div>
  );
}

/** The alarm on a row: when it goes off, or "Enviado" once it went. */
function AlarmChip({ alarm, sameDay, compact }: { alarm: RowAlarm; sameDay: boolean; compact?: boolean }) {
  const sent = alarm.at < Date.now() - 60_000;
  const Icon = alarm.channel === "whatsapp" ? MessageCircle : Mail;
  const time = hhmm(alarm.at);
  const label = sent ? "Enviado" : sameDay ? time : `${fmtDate(dayOfMs(alarm.at))}, ${time}`;
  return (
    <span
      title={sent ? `Alarme enviado às ${time}` : `Alarme por ${CHANNEL[alarm.channel].toLowerCase()} às ${time}`}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold tabular-nums",
        sent ? "bg-muted text-muted-foreground" : "bg-primary/14 text-primary-strong",
        compact && "bg-transparent px-0",
      )}
    >
      <Icon className={cn("size-3.5", compact && "size-[18px]")} aria-hidden="true" />
      <span className={cn(compact && "sr-only")}>{label}</span>
      <span className="sr-only">{sent ? " (alarme enviado)" : " (alarme)"}</span>
    </span>
  );
}

/** Task rows separated by thin lines; a row lights up on hover. */
function TaskList({ items, T, label }: { items: Entry[]; T: string; label: string }) {
  return (
    <ol aria-label={label} className="stagger -mx-2 flex flex-col">
      {items.map((e, i) => (
        <Row key={e.key} e={e} i={i} T={T} />
      ))}
    </ol>
  );
}

function Row({ e, i, T }: { e: Entry; i: number; T: string }) {
  const late = !!e.day && e.day < T;
  const when = !e.day
    ? "Sem data"
    : late || (e.showDay && e.day !== T)
      ? late && e.day === addDays(T, -1)
        ? "Ontem"
        : fmtDate(e.day)
      : e.time || (e.showDay ? "Hoje" : "");
  const sameDay = !!e.alarm && dayOfMs(e.alarm.at) === e.day;
  const body = (
    <>
      {/* Phones: the folder's icon before the title (the list's name doesn't fit there). */}
      {e.folder && (
        <span className="-mr-2 shrink-0 md:hidden" title={`Na pasta ${e.folder.path}`}>
          <FolderGlyph icon={e.folder.icon} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            "line-clamp-2 min-w-0 text-base break-words md:truncate md:text-[17px]",
            e.done && "text-muted-foreground line-through",
          )}
        >
          {e.title}
        </span>
        {/* The task's priority, right after its name. */}
        {e.priority && (
          <span className="flex max-w-[40%] min-w-0 shrink-0" title={`Prioridade: ${e.priority.name}`}>
            <span className="sr-only">Prioridade: </span>
            <OptionBadge opt={e.priority} />
          </span>
        )}
      </span>
      {/* The list, in its area's color, with the icon of the folder it is in (when it is in one). */}
      {e.list && (
        <span
          className="flex max-w-[34%] min-w-0 items-center gap-2 text-sm text-muted-foreground max-md:hidden"
          title={e.folder ? `Na pasta ${e.folder.path} › ${e.list}` : `Lista ${e.list}`}
        >
          <span className="size-2 shrink-0 rounded-full bg-(--area,var(--muted-foreground))" aria-hidden="true" />
          {e.folder && <FolderGlyph icon={e.folder.icon} />}
          <span className="truncate">{e.list}</span>
          {e.folder && <span className="sr-only">, na pasta {e.folder.path}</span>}
        </span>
      )}
      {e.alarm && (
        <>
          <span className="max-md:hidden">
            <AlarmChip alarm={e.alarm} sameDay={sameDay} />
          </span>
          <span className="md:hidden">
            <AlarmChip alarm={e.alarm} sameDay={sameDay} compact />
          </span>
        </>
      )}
      {when && (
        <span
          className={cn(
            "min-w-12 shrink-0 text-right text-base tabular-nums",
            late ? "font-medium text-destructive" : e.time ? "font-semibold" : "text-sm text-muted-foreground",
            e.done && "font-normal text-muted-foreground",
          )}
        >
          {when}
        </span>
      )}
    </>
  );
  return (
    <li
      style={{ ...areaVar(e.area), "--i": Math.min(i, 12), viewTransitionName: vtName("home", e.key) } as React.CSSProperties}
      className={cn(
        "group/row relative flex items-center rounded-xl pr-1 pl-2 transition-colors focus-within:bg-muted/60 hover:bg-muted/60",
        // A thin line between rows (hidden around the highlighted one).
        "after:pointer-events-none after:absolute after:inset-x-3 after:top-0 after:h-px after:bg-border/70 first:after:hidden hover:after:opacity-0 [&:hover+li]:after:opacity-0",
      )}
    >
      {/* Done in one tap. */}
      {e.onToggle ? (
        <button
          role="checkbox"
          aria-checked={e.done}
          aria-label={e.done ? `Reabrir “${e.title}”` : `Concluir “${e.title}”`}
          title={e.done ? "Reabrir" : "Concluir"}
          onClick={e.onToggle}
          className="group/check flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span
            className={cn(
              "flex size-[22px] items-center justify-center rounded-full border-2 transition-colors",
              e.done
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/70 group-hover/check:border-primary-strong",
            )}
          >
            {e.done && <Check className="pixel-hop size-3.5" strokeWidth={3} aria-hidden="true" />}
          </span>
        </button>
      ) : (
        <span className="size-11 shrink-0" aria-hidden="true" />
      )}
      {e.onOpen ? (
        <button
          onClick={e.onOpen}
          title="Abrir a lista desta tarefa"
          className="flex min-w-0 flex-1 items-center gap-4 rounded-lg py-3.5 pr-2 pl-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-4 py-3.5 pr-2 pl-1">{body}</div>
      )}
      {/* Another day, without opening anything: shows on hover or focus. */}
      {!e.done && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remarcar “${e.title}”`}
              title="Remarcar"
              className="size-9 shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
            >
              <CalendarClock />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Remarcar para</DropdownMenuLabel>
            <DropdownMenuGroup>
              {e.day !== T && <DropdownMenuItem onSelect={() => e.onMove(T)}>Hoje</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => e.onMove(addDays(T, 1))}>Amanhã</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => e.onMove(addDays(T, 7))}>Daqui a uma semana</DropdownMenuItem>
            </DropdownMenuGroup>
            {e.day && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => e.onMove(null)}>Tirar a data</DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {/* Keeps the times lined up with the rows that have the button. */}
      {e.done && <span className="size-9 shrink-0 pointer-coarse:hidden" aria-hidden="true" />}
    </li>
  );
}

/**
 * First steps: while the starter examples are still around (and the person hasn't dismissed this),
 * a short card explains them and offers to clear them or keep exploring.
 */
function WelcomeBanner() {
  const ws = useStore((s) => s.ws);
  const mut = useStore((s) => s.mut);
  const [ask, setAsk] = useState(false);
  const ex = exampleData(ws);
  const count = ex.items.length + ex.events.length;
  if (!count || ws.settings.examplesDismissed) return null;
  const dismiss = () =>
    mut((w) => {
      w.settings.examplesDismissed = true;
    });
  return (
    <section
      aria-labelledby="welcome-title"
      className="flex flex-col gap-3 rounded-2xl border border-primary-strong/30 bg-card p-4 shadow-card sm:flex-row sm:items-center sm:gap-4 sm:p-5"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary-strong max-sm:hidden"
        aria-hidden="true"
      >
        <Sparkles className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="welcome-title" className="text-base font-semibold">
          Bem-vindo ao Organizer!
        </h2>
        <p className="text-sm text-muted-foreground">Você está visualizando dados de exemplo para conhecer os recursos.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setAsk(true)}>
          Limpar exemplos e começar do zero
        </Button>
        <Button variant="ghost" onClick={dismiss}>
          Explorar com exemplos
        </Button>
      </div>
      <AlertDialog open={ask} onOpenChange={setAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar os exemplos?</AlertDialogTitle>
            <AlertDialogDescription>
              Saem só os {count} itens de exemplo (tarefas e eventos). O guia “Comece por aqui” e o que você criou ficam. Dá para
              desfazer logo em seguida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                removeExamples();
                dismiss();
              }}
            >
              Limpar exemplos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

const movedLabel = (to: string | null) =>
  to === null ? "Data removida" : to === today() ? "Movida para hoje" : `Remarcada para ${fmtDate(to).toLowerCase()}`;

/** Done ⇄ not done, with undo. */
function toggleItemDone(id: string) {
  const { ws } = useStore.getState();
  const it = ws.items[id];
  const db = it && ws.dbs[it.db];
  const sp = db && statusProp(db);
  if (!it || !db || !sp) return;
  const prev = it.props[sp.id];
  const wasDone = groupOf(db, it) === "done";
  const next = wasDone ? (firstOptInGroup(db, "todo") ?? sp.options![0].id) : firstOptInGroup(db, "done");
  if (!next) return;
  withMotion(() => setProp(id, sp.id, next));
  const undo = () => setProp(id, sp.id, (prev as string) ?? null);
  if (wasDone) return toast("Tarefa reaberta", undo);
  // Was it the last open task for today? Then the mascot cheers.
  const T = today();
  const w = useStore.getState().ws;
  // (the change itself lands a frame later, inside the view transition, so this task is left out by id)
  const leftToday = Object.values(w.items).some((x) => {
    if (x.id === id) return false;
    const d = w.dbs[x.db];
    return d && dateOf(d, x).slice(0, 10) === T && groupOf(d, x) !== "done";
  });
  if (leftToday) celebrate("Tarefa concluída", it.title || undefined, "checklist", undo);
  else {
    // The day's last task: a burst of pixels from the checkbox, and the mascot cheers.
    pixelBurst(...focusPoint());
    celebrate("Tudo feito por hoje!", "Você zerou as tarefas do dia.", "comemora", undo);
  }
}

/** New day for a task (keeps its time), with undo. */
function moveItemDay(id: string, to: string | null) {
  const it = useStore.getState().ws.items[id];
  if (!it) return;
  const prev = typeof it.props.date === "string" ? it.props.date : null;
  withMotion(() => setProp(id, "date", to ? to + (prev?.slice(10) ?? "") : null, { quiet: true }));
  toast(movedLabel(to), () => setProp(id, "date", prev, { quiet: true }));
}
