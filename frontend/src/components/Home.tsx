import {
  AlertCircle,
  BellOff,
  BellRing,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
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
import { homeTasks, saveHomeOrder } from "@/lib/homeOrder";
import { HomeTaskList } from "./HomeTaskList";

interface Entry {
  key: string;
  time: string;
  title: string;
  /** The task's list name and icon. */
  list?: string;
  listIcon?: string;
  /** The task's priority (from the list's "Prioridade" column), when it has one. */
  priority?: Option;
  area?: Area;
  done: boolean;
  order: number;
  /** The task's day (YYYY-MM-DD): today, or earlier for overdue ones; "" when it has no date. */
  day: string;
  /** Say the day, not just the time (the list of all tasks mixes days). */
  showDay?: boolean;
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
    const entry: Entry = {
      key: "t" + it.id,
      time,
      title: it.title || "Sem título",
      list: page?.title,
      listIcon: page?.icon,
      priority: optOf(
        db.props.find((p) => p.id === "prio"),
        it.props.prio,
      ),
      area: areaOf(it.area),
      done: isDone,
      order: it.created,
      day,
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
  const todays = entries.filter((e) => e.day === D);
  const openEntries = new Map(todays.filter((e) => !e.done).map((e) => [e.key, e]));
  const open = homeTasks(ws, D, area).map((it) => openEntries.get("t" + it.id)!);
  const manualOrder = !!ws.settings.homeTaskOrder?.[D];
  const reorder = (keys: string[]) =>
    useStore.getState().mut((w) =>
      saveHomeOrder(
        w,
        D,
        keys.map((key) => key.slice(1)),
      ),
    );
  const done = todays.filter((e) => e.done).sort(byTime);
  const summary = !isToday
    ? open.length + done.length === 0
      ? "Nenhuma tarefa neste dia."
      : `${open.length + done.length} ${open.length + done.length === 1 ? "tarefa" : "tarefas"} neste dia${done.length ? `, ${done.length} ${done.length === 1 ? "feita" : "feitas"}` : ""}.`
    : (open.length === 0
        ? done.length
          ? "Tudo feito por hoje."
          : "Nenhuma tarefa com prazo para hoje."
        : `${open.length} ${open.length === 1 ? "tarefa" : "tarefas"} para hoje${done.length ? `, ${done.length} já ${done.length === 1 ? "feita" : "feitas"}` : ""}.`) +
      (overdue.length ? ` ${overdue.length} ${overdue.length === 1 ? "atrasada" : "atrasadas"}.` : "");

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

      {/* Two columns. Left: the day's tasks, as a list of cards (Atrasadas, the day's, the done ones folded
          away, "Ver todas"). Right: the next alarm, the agenda, the habits and the lists, one under the other.
          Phone: one column, tasks first. */}
      <div
        key={D}
        data-dir={dir ?? undefined}
        className={cn("grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)] xl:gap-8", dir && "cal-enter")}
      >
        <section aria-labelledby="home-tasks" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="home-tasks" className="sr-only">
              {isToday ? "Tarefas de hoje" : "Tarefas do dia"}
            </h2>
            <p className="text-lg text-muted-foreground">{summary}</p>
            {/* How much of the day is done: a bar with an outlined track (visible even at 0%), the count, and a done state. */}
            {todays.length > 0 && <DayProgress done={done.length} total={todays.length} />}
          </div>
          {overdue.length > 0 && (
            <TaskGroup
              title="Atrasadas"
              count={overdue.length}
              tone="warning"
              hint="Ficaram de dias anteriores. Conclua ou remarque."
              items={overdue}
              T={T}
            />
          )}
          {open.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>{manualOrder ? "Ordem personalizada" : "Por prioridade"} · Arraste pela alça para reordenar</span>
                {manualOrder && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      useStore.getState().mut((w) => {
                        delete w.settings.homeTaskOrder?.[D];
                      })
                    }
                  >
                    Ordenar por prioridade
                  </Button>
                )}
              </div>
              <TaskGroup
                title={isToday ? "Hoje" : "A fazer"}
                count={open.length}
                items={open}
                T={T}
                hideTitle={!overdue.length}
                onReorder={reorder}
              />
            </>
          )}
          {!open.length && !overdue.length && (
            <Empty className="border border-dashed bg-card/60">
              <EmptyHeader>
                <EmptyTitle>{done.length ? (isToday ? "Tudo feito por hoje" : "Tudo feito neste dia") : "Dia livre"}</EmptyTitle>
                <EmptyDescription>
                  {done.length
                    ? "Bom trabalho! As concluídas estão logo abaixo."
                    : isToday
                      ? "Tarefas com prazo para hoje aparecem aqui. Dê uma data a elas nas listas."
                      : "Nenhuma tarefa com prazo para este dia."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {done.length > 0 && <DoneGroup items={done} T={T} label={isToday ? "Concluídas hoje" : "Concluídas"} />}
          {/* Every other open task (any day, or none), shown until hidden again. */}
          {others.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showAll}
              aria-controls="home-others"
              onClick={() => setShowAll(!showAll)}
              className="w-fit font-normal text-muted-foreground"
            >
              {showAll ? (
                <ChevronDown data-icon="inline-start" aria-hidden="true" />
              ) : (
                <ChevronRight data-icon="inline-start" aria-hidden="true" />
              )}
              {showAll ? "Esconder as outras tarefas" : `Ver todas as tarefas (${others.length})`}
            </Button>
          )}
          {showAll && others.length > 0 && (
            <div id="home-others">
              <TaskGroup
                title={entries.length ? "Outras tarefas a fazer" : "Todas as tarefas a fazer"}
                count={others.length}
                items={others}
                T={T}
                hideTitle
              />
            </div>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-5" aria-label="Resumo do dia">
          {isToday ? <NextAlarm now={now} area={area} /> : <DayNote D={D} />}
          <Agenda T={T} D={D} area={area} now={now} />
          {D <= T && <HabitsBlock D={D} isToday={isToday} />}
          <ListsBlock />
        </aside>
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
      <h2 id={id} className="text-base font-bold tracking-tight">
        {title}
      </h2>
      {meta && <span className="text-[13px] text-muted-foreground tabular-nums">{meta}</span>}
      {link && (
        <button
          type="button"
          onClick={link.run}
          className="ml-auto rounded-md px-1 text-[13px] font-semibold text-primary-strong hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
    .slice(0, 3);
  const show = (day: string) => {
    if (!cal) return;
    setUi((u) => {
      u.calendar.anchor = day;
      u.calendar.selected = day;
    });
    go(cal.id);
  };
  return (
    <section aria-labelledby="home-agenda" className={cn(CARD, "flex flex-col gap-1.5 px-4 py-3.5")}>
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
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-lg bg-muted leading-none">
                    <span className="text-sm font-bold tabular-nums">{d.getDate()}</span>
                    <span className="mt-0.5 text-[9px] font-semibold text-muted-foreground uppercase">
                      {d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{e.title || "Evento"}</span>
                    <span className="truncate text-xs text-muted-foreground">
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
      <section aria-label="Hábitos" className={cn(CARD, "px-4 py-3.5")}>
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
    <section aria-labelledby="home-habits" className={cn(CARD, "flex flex-col gap-1.5 px-4 py-3.5")}>
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
                  "flex w-full items-center gap-2.5 rounded-xl py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:-mx-1 sm:px-1 sm:hover:bg-muted/60",
                  "max-sm:h-full max-sm:flex-col max-sm:items-start max-sm:gap-2 max-sm:border max-sm:bg-background/40 max-sm:p-3",
                  on && "max-sm:border-primary-strong max-sm:bg-primary/10",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {on ? (
                    <Check className="pixel-hop size-4" strokeWidth={2.75} aria-hidden="true" />
                  ) : (
                    <Glyph icon={h.icon} size="xs" />
                  )}
                </span>
                <span className={cn("min-w-0 flex-1 text-sm font-medium sm:truncate", on && "font-semibold text-primary-strong")}>
                  {h.name}
                </span>
                {streak > 0 && (
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-[13px] tabular-nums",
                      on ? "font-semibold text-primary-strong" : "text-muted-foreground",
                    )}
                  >
                    <Flame className="size-3.5" aria-hidden="true" />
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
      <section aria-label="Listas" className={cn(CARD, "px-4 py-3.5")}>
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
      icon: <FolderGlyph icon={icons[f]} className="size-5!" />,
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
  const MAX = 5;
  return (
    <section aria-labelledby="home-lists" className={cn(CARD, "flex flex-col gap-1.5 px-4 py-3.5")}>
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
          className="ml-auto flex size-7 items-center justify-center self-center rounded-lg transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <UiIcon name="newFolder" size={20} />
        </button>
      </BlockHead>
      <ul className="-mx-1 flex flex-col">
        {rows.slice(0, MAX).map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onClick={r.run}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                r.depth && "pl-8",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">{r.icon}</span>
              <span className={cn("min-w-0 flex-1 truncate", r.depth ? "text-[13px]" : "text-sm font-semibold")}>{r.name}</span>
              {r.count > 0 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{r.count}</span>}
            </button>
          </li>
        ))}
      </ul>
      {rows.length > MAX && (
        <button
          type="button"
          onClick={openLists}
          className="w-fit rounded-md px-1 text-[13px] font-semibold text-primary-strong hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
function AlarmChip({
  alarm,
  sameDay,
  compact,
}: {
  alarm: { at: number; channel: AlertChannel };
  sameDay: boolean;
  compact?: boolean;
}) {
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

function DayProgress({ done, total }: { done: number; total: number }) {
  const complete = done === total;
  return (
    <div className="mt-2 flex max-w-md items-center gap-3">
      <Progress
        value={(done / total) * 100}
        aria-label={`${done} de ${total} feitas`}
        className="h-2.5 flex-1 bg-transparent ring-1 ring-(--input) ring-inset [&>[data-slot=progress-indicator]]:rounded-full [&>[data-slot=progress-indicator]]:bg-success"
      />
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 text-sm font-semibold",
          complete ? "text-success" : "text-muted-foreground",
        )}
      >
        {complete && <CircleCheck className="size-4" aria-hidden="true" />}
        {complete ? "Tudo feito!" : `${done}/${total}`}
      </span>
    </div>
  );
}

/** A titled group of task rows (Atrasadas, Hoje). */
function TaskGroup({
  title,
  count,
  items,
  T,
  tone,
  hint,
  hideTitle,
  onReorder,
}: {
  title: string;
  count: number;
  items: Entry[];
  T: string;
  tone?: "warning";
  hint?: string;
  hideTitle?: boolean;
  onReorder?: (keys: string[]) => void;
}) {
  const id = "grp-" + title;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <h2
        id={id}
        className={cn(
          "flex items-baseline gap-2 text-sm font-semibold",
          tone === "warning" ? "text-warning" : "text-muted-foreground",
          hideTitle && "sr-only",
        )}
      >
        {tone === "warning" && <AlertCircle className="size-4 self-center" aria-hidden="true" />}
        {title}
        <span className="font-normal">({count})</span>
        {hint && <span className="font-normal text-muted-foreground max-sm:hidden">· {hint}</span>}
      </h2>
      {onReorder ? (
        <HomeTaskList
          items={items}
          onReorder={onReorder}
          renderRow={(e, i, controls) => <Row key={e.key} e={e} i={i} T={T} drag={controls} />}
        />
      ) : (
        <ol className="stagger flex flex-col gap-2.5">
          {items.map((e, i) => (
            <Row key={e.key} e={e} i={i} T={T} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Done on the day: folded away by default, one click to see them. */
function DoneGroup({ items, T, label }: { items: Entry[]; T: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-2.5">
      <button
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-fit items-center gap-1.5 rounded-md px-1 py-1 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden="true" />
        {label} <span className="font-normal">({items.length})</span>
      </button>
      {open && (
        <ol className="flex flex-col gap-2.5">
          {items.map((e, i) => (
            <Row key={e.key} e={e} i={i} T={T} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** One task: a card with its area's stripe, done in one tap, the time on the left and "remarcar" on the right. */
function Row({
  e,
  i,
  T,
  drag,
}: {
  e: Entry;
  i: number;
  T: string;
  drag?: {
    attributes: React.HTMLAttributes<HTMLLIElement>;
    handle: React.ReactNode;
  };
}) {
  const late = !!e.day && e.day < T;
  const when = !e.day
    ? "Sem data"
    : late || (e.showDay && e.day !== T)
      ? fmtDate(e.day)
      : e.time || (e.showDay ? "Hoje" : "Dia todo");
  const sub = e.list ? (
    <span className="inline-flex items-center gap-1.5">
      <Glyph icon={e.listIcon} size="xs" />
      {e.list}
    </span>
  ) : undefined;
  const body = (
    <>
      {/* The left column says when: the time today, or the day for overdue ones. */}
      <span
        className={cn(
          "flex w-16 shrink-0 flex-col text-base leading-tight max-sm:hidden",
          e.time && !late ? "font-semibold" : "text-sm text-muted-foreground",
          late && "font-medium text-warning",
          e.done && "text-muted-foreground",
        )}
      >
        {when}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-base font-medium", e.done && "text-muted-foreground line-through")}>{e.title}</span>
          {e.priority && (
            <span className="flex max-w-[40%] min-w-0 shrink-0" title={`Prioridade: ${e.priority.name}`}>
              <span className="sr-only">Prioridade: </span>
              <OptionBadge opt={e.priority} />
            </span>
          )}
        </span>
        {/* Phones: "when" moves under the title, so the title gets the width. */}
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
          <span className={cn("shrink-0 sm:hidden", late && "font-medium text-warning")}>
            {when}
            {sub ? " ·" : ""}
          </span>
          {sub}
        </span>
      </span>
      {e.onOpen && <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  return (
    <li
      {...drag?.attributes}
      style={
        {
          ...areaVar(e.area),
          "--i": Math.min(i, 12),
          viewTransitionName: vtName("home", e.key),
          ...drag?.attributes.style,
        } as React.CSSProperties
      }
      className={cn(
        "area-stripe flex items-center gap-1 rounded-2xl border border-border/70 bg-card py-1.5 pr-1.5 pl-3 shadow-card transition-colors focus-within:border-primary/40 hover:border-primary/40",
        e.done && "opacity-75",
      )}
    >
      {drag?.handle}
      {/* Done in one tap. */}
      {e.onToggle && (
        <button
          role="checkbox"
          aria-checked={e.done}
          aria-label={e.done ? `Reabrir “${e.title}”` : `Concluir “${e.title}”`}
          title={e.done ? "Reabrir" : "Concluir"}
          onClick={e.onToggle}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            e.done ? "text-success" : "text-muted-foreground hover:text-success",
          )}
        >
          {e.done ? <CircleCheck className="pop size-6" /> : <Circle className="size-6" strokeWidth={1.75} />}
        </button>
      )}
      {e.onOpen ? (
        <button
          onClick={e.onOpen}
          title="Abrir a lista desta tarefa"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 pr-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2">{body}</div>
      )}
      {/* Another day, without opening anything. */}
      {!e.done && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remarcar “${e.title}”`}
              title="Remarcar"
              className="size-11 shrink-0 text-muted-foreground"
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
