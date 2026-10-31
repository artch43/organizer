import {
  AlertCircle,
  Sparkles,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListTodo,
  CircleCheck,
  Sprout,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Area } from "@/lib/types";
import { eventsByDay, inArea } from "@/lib/events";
import { dateOf, firstOptInGroup, groupOf, statusProp } from "@/lib/model";
import { addDays, fmtDate, parseD, today } from "@/lib/util";
import { exampleData, go, removeExamples, setProp, toast, useStore } from "@/store";
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { areaVar, greeting, useAreas, useToday } from "./common";
import { Progress } from "@/components/ui/progress";
import { Glyph } from "./icons";
import { vtName, withMotion } from "@/lib/motion";

interface Entry {
  key: string;
  time: string;
  title: string;
  sub?: React.ReactNode;
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

/**
 * Home: what to do today (and what was left from earlier), with done/remarcar in one tap; a click on the name opens its list.
 * Another day can be picked in the header to see that day's tasks and events.
 */
export function Home() {
  const ws = useStore((s) => s.ws);
  const area = useStore((s) => s.ui.area);
  const areas = useAreas();
  const T = useToday();
  // The day being looked at; null follows today (also past midnight).
  const [picked, setPicked] = useState<string | null>(null);
  const D = picked ?? T;
  const isToday = D === T;
  const pick = (d: string) => setPicked(d === T ? null : d);
  const areaOf = (id?: string) => areas.find((a) => a.id === id);
  // A free day offers every open task (any day, or none) instead of an empty page.
  const [showAll, setShowAll] = useState(false);

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
    const entry: Entry = {
      key: "t" + it.id,
      time: d.slice(11, 16),
      title: it.title || "Sem título",
      sub: page ? (
        <span className="inline-flex items-center gap-1.5">
          <Glyph icon={page.icon} size="xs" />
          {page.title}
        </span>
      ) : undefined,
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
  const overdue = isToday ? entries.filter((e) => e.day < T).sort((a, b) => a.day.localeCompare(b.day) || byTime(a, b)) : [];
  const todays = entries.filter((e) => e.day === D);
  const open = todays.filter((e) => !e.done).sort(byTime);
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
  const date = parseD(D)
    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8 px-4 py-6 md:px-8 md:py-8 lg:max-w-6xl">
      <WelcomeBanner />
      <header className="flex flex-col gap-2">
        <p className="text-lg text-muted-foreground">{greeting(ws.settings.name)}</p>
        <h1 className="text-4xl leading-tight font-extrabold tracking-tight md:text-5xl">{date}</h1>
        <DayPicker D={D} T={T} onPick={pick} />
        <p className="text-lg text-muted-foreground">{summary}</p>
        {/* How much of today is already done: a bar with an outlined track (visible even at 0%), the count in words, and a done state. */}
        {todays.length > 0 && <DayProgress done={done.length} total={todays.length} />}
      </header>

      {/* Wide screens: today's tasks on the left, what's coming up on the right. Phones: one column, tasks first. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <section aria-labelledby="home-tasks" className="flex min-w-0 flex-col gap-3">
          <h2 id="home-tasks" className="sr-only">
            {isToday ? "Tarefas de hoje" : "Tarefas do dia"}
          </h2>
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
            <TaskGroup title={isToday ? "Hoje" : "A fazer"} count={open.length} items={open} T={T} hideTitle={!overdue.length} />
          )}
          {!open.length && !overdue.length && (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>{done.length ? (isToday ? "Tudo feito por hoje" : "Tudo feito neste dia") : "Dia livre"}</EmptyTitle>
                <EmptyDescription>
                  {done.length
                    ? "Bom trabalho! As concluídas estão logo abaixo."
                    : isToday
                      ? "Tarefas com prazo para hoje aparecem aqui. Dê uma data a elas nos quadros."
                      : "Nenhuma tarefa com prazo para este dia."}
                </EmptyDescription>
              </EmptyHeader>
              {allOpen.length > 0 && (
                <EmptyContent>
                  <Button variant="outline" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
                    <ListTodo data-icon="inline-start" />
                    {showAll ? "Esconder as outras tarefas" : `Ver todas as tarefas (${allOpen.length})`}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )}
          {!open.length && !overdue.length && showAll && allOpen.length > 0 && (
            <TaskGroup title="Todas as tarefas a fazer" count={allOpen.length} items={allOpen} T={T} />
          )}
          {done.length > 0 && <DoneGroup items={done} T={T} label={isToday ? "Concluídas hoje" : "Concluídas"} />}
        </section>
        <aside className="flex flex-col gap-4" aria-label="Resumo">
          <Upcoming T={T} D={D} area={area} />
          {D <= T && <HabitsToday D={D} isToday={isToday} />}
        </aside>
      </div>
    </div>
  );
}

const UPCOMING_DAYS = 3;

/** Events from now to the next few days (or only the picked day's), read-only; a click shows that day in the calendar. */
function Upcoming({ T, D, area }: { T: string; D: string; area: string }) {
  const isToday = D === T;
  const ws = useStore((s) => s.ws);
  const setUi = useStore((s) => s.setUi);
  const areas = useAreas();
  const cal = ws.pages.find((p) => p.type === "calendar");
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const byDay = eventsByDay(ws, D, isToday ? addDays(T, UPCOMING_DAYS) : D, area);
  const list = Object.keys(byDay)
    .sort()
    .flatMap((d) => byDay[d].map((e) => ({ ...e, day: d })))
    // Today's events that already ended are left out.
    .filter((e) => e.day !== T || e.allDay || (e.end || e.start) >= hhmm)
    .slice(0, isToday ? 6 : undefined);
  const show = (day: string) => {
    if (!cal) return;
    setUi((u) => {
      u.calendar.anchor = day;
    });
    go(cal.id);
  };
  const dayName = (d: string) =>
    d === T
      ? "Hoje"
      : d === addDays(T, 1)
        ? "Amanhã"
        : parseD(d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return (
    <section
      aria-labelledby="home-upcoming"
      className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-upcoming" className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="size-[18px] text-primary-strong" aria-hidden="true" />
          {isToday ? "Próximos compromissos" : "Compromissos do dia"}
        </h2>
        {cal && (
          <button
            onClick={() => show(D)}
            className="rounded-md px-1 text-sm font-medium text-primary-strong hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Ver agenda
          </button>
        )}
      </div>
      {list.length ? (
        <ul className="flex flex-col gap-1">
          {list.map((e) => (
            <li key={e.id + e.day}>
              <button
                onClick={() => show(e.day)}
                style={areaVar(areas.find((a) => a.id === e.area))}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="h-9 w-1 shrink-0 rounded-full bg-(--area,var(--primary))" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-medium">{e.title || "Evento"}</span>
                  <span className="text-sm text-muted-foreground capitalize">
                    {isToday ? `${dayName(e.day)} · ` : ""}
                    {e.allDay ? "dia todo" : e.start + (e.end ? `–${e.end}` : "")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isToday ? `Nenhum evento nos próximos ${UPCOMING_DAYS} dias.` : "Nenhum evento neste dia."}
        </p>
      )}
    </section>
  );
}

/** How many habits are done on the day (today or a past one); a click opens Hábitos. */
function HabitsToday({ D, isToday }: { D: string; isToday: boolean }) {
  const habits = useStore((s) => s.ws.habits);
  const log = useStore((s) => s.ws.habitLog[D]);
  const page = useStore((s) => s.ws.pages.find((p) => p.type === "habits"));
  if (!habits.length || !page) return null;
  const doneIds = new Set(log ?? []);
  const done = habits.filter((h) => doneIds.has(h.id)).length;
  return (
    <button
      onClick={() => go(page.id)}
      className="lift flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-base font-semibold">
          <Sprout className="size-[18px] text-success" aria-hidden="true" />
          {isToday ? "Hábitos de hoje" : "Hábitos do dia"}
        </span>
        <span className="text-sm font-semibold text-muted-foreground tabular-nums">
          {done}/{habits.length}
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {habits.map((h) => (
          <span
            key={h.id}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm",
              doneIds.has(h.id) ? "border-success/40 bg-success/10 text-foreground" : "border-border text-muted-foreground",
            )}
          >
            {doneIds.has(h.id) && <Check className="size-3.5 text-success" aria-label="feito" />}
            {h.name}
          </span>
        ))}
      </span>
    </button>
  );
}

/** ‹ day › with a date button (the device's own picker) and a way back to today. */
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
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Escolher o dia">
      <Button variant="ghost" size="icon" className="size-9" aria-label="Dia anterior" onClick={() => onPick(addDays(D, -1))}>
        <ChevronLeft />
      </Button>
      <div className="relative">
        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={openPicker} aria-label={`Escolher data (${label})`}>
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
      <Button variant="ghost" size="icon" className="size-9" aria-label="Próximo dia" onClick={() => onPick(addDays(D, 1))}>
        <ChevronRight />
      </Button>
      {D !== T && (
        <Button variant="link" size="sm" className="h-9" onClick={() => onPick(T)}>
          Voltar para hoje
        </Button>
      )}
    </div>
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
          "flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums",
          complete ? "text-success" : "text-muted-foreground",
        )}
      >
        {complete && <CircleCheck className="size-4" aria-hidden="true" />}
        {complete ? "Tudo feito!" : `${done}/${total}`}
      </span>
    </div>
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
      className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-card p-4 shadow-card sm:flex-row sm:items-center sm:gap-4 sm:p-5"
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

/** A titled group of task rows (Atrasadas, Hoje). */
function TaskGroup({
  title,
  count,
  items,
  T,
  tone,
  hint,
  hideTitle,
}: {
  title: string;
  count: number;
  items: Entry[];
  T: string;
  tone?: "warning";
  hint?: string;
  hideTitle?: boolean;
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
        <span className="font-normal tabular-nums">({count})</span>
        {hint && <span className="font-normal text-muted-foreground max-sm:hidden">· {hint}</span>}
      </h2>
      <ol className="stagger flex flex-col gap-2.5">
        {items.map((e, i) => (
          <Row key={e.key} e={e} i={i} T={T} />
        ))}
      </ol>
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
        {label} <span className="font-normal tabular-nums">({items.length})</span>
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
  toast(wasDone ? "Tarefa reaberta" : "Tarefa concluída", () => setProp(id, sp.id, (prev as string) ?? null));
}

/** New day for a task (keeps its time), with undo. */
function moveItemDay(id: string, to: string | null) {
  const it = useStore.getState().ws.items[id];
  if (!it) return;
  const prev = typeof it.props.date === "string" ? it.props.date : null;
  withMotion(() => setProp(id, "date", to ? to + (prev?.slice(10) ?? "") : null, { quiet: true }));
  toast(movedLabel(to), () => setProp(id, "date", prev, { quiet: true }));
}

function Row({ e, i, T }: { e: Entry; i: number; T: string }) {
  const late = !!e.day && e.day < T;
  const when = !e.day
    ? "Sem data"
    : late || (e.showDay && e.day !== T)
      ? fmtDate(e.day)
      : e.time || (e.showDay ? "Hoje" : "Dia todo");
  const body = (
    <>
      {/* The left column says when: the time today, or the day for overdue ones. */}
      <span
        className={cn(
          "flex w-16 shrink-0 flex-col text-base leading-tight tabular-nums max-sm:hidden",
          e.time && !late ? "font-semibold" : "text-sm text-muted-foreground",
          late && "font-medium text-warning",
          e.done && "text-muted-foreground",
        )}
      >
        {when}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("truncate text-base font-medium", e.done && "text-muted-foreground line-through")}>{e.title}</span>
        {/* Phones: "when" moves under the title, so the title gets the width. */}
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
          <span className={cn("shrink-0 tabular-nums sm:hidden", late && "font-medium text-warning")}>
            {when}
            {e.sub ? " ·" : ""}
          </span>
          {e.sub}
        </span>
      </span>
      {e.onOpen && <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  return (
    <li
      style={{ ...areaVar(e.area), "--i": Math.min(i, 12), viewTransitionName: vtName("home", e.key) } as React.CSSProperties}
      className={cn(
        "area-stripe flex items-center gap-1 rounded-2xl border border-border/70 bg-card py-1.5 pr-1.5 pl-3 shadow-card transition-colors focus-within:border-primary/40 hover:border-primary/40",
        e.done && "opacity-75",
      )}
    >
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
