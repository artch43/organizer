import { useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Flame,
  History as HistoryIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Smile,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Habit } from "@/lib/types";
import { firstDoneOf, streakOf } from "@/lib/model";
import { DEFAULT_HABIT_ICON, DOW, addDays, fmtDate, parseD, uid } from "@/lib/util";
import { celebrate, deleteHabit, toggleHabit, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Mascot } from "@/components/brand/Brand";
import { useToday } from "./common";
import { IconPicker } from "./IconPicker";

export function Habits() {
  const habits = useStore((s) => s.ws.habits);
  const T = useToday();
  const doneToday = useStore((s) => (s.ws.habitLog[T] || []).filter((id) => s.ws.habits.some((h) => h.id === id)).length);
  const mut = useStore((s) => s.mut);
  // A habit is only created once it has a name; the form can be cancelled.
  const [adding, setAdding] = useState(false);
  const add = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    mut((w) => {
      w.habits.push({ id: uid(), name: clean, icon: DEFAULT_HABIT_ICON, created: T });
    });
    celebrate(`Hábito “${clean}” criado`, "Toque em Marcar hoje quando fizer.", "acena");
    setAdding(false);
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-28 md:px-8 md:pt-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Hábitos</h1>
          <p className="text-base text-muted-foreground">
            {habits.length
              ? `Hoje: ${doneToday} de ${habits.length} feitos`
              : "Pequenas coisas que você quer fazer com frequência."}
          </p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <Plus data-icon="inline-start" />
          Novo hábito
        </Button>
      </div>
      {adding && <NewHabit onAdd={add} onCancel={() => setAdding(false)} />}
      {habits.length ? (
        <>
          <HabitLegend />
          <Card className="py-2 shadow-card">
            <CardContent className="stagger flex flex-col divide-y px-4">
              {habits.map((h, i) => (
                <HabitRow key={h.id} h={h} T={T} i={i} />
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia>
              <Mascot pose="checklist" size={80} className="mascot-pop" />
            </EmptyMedia>
            <EmptyTitle>Nenhum hábito ainda</EmptyTitle>
            <EmptyDescription>Comece com algo pequeno, como ler 10 minutos por dia.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setAdding(true)}>Criar hábito</Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}

function HabitRow({ h, T, i }: { h: Habit; T: string; i: number }) {
  const log = useStore((s) => s.ws.habitLog);
  const mut = useStore((s) => s.mut);
  const [name, setName] = useState(h.name);
  const [history, setHistory] = useState(() => readOpen(h.id));
  const [iconOpen, setIconOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const afterMenu = useRef<(() => void) | null>(null);
  const isOn = (d: string) => (log[d] || []).includes(h.id);
  // Red only for past days after the first mark: before it the habit hadn't started (gray); today still has time.
  const first = firstDoneOf(log, h.id);
  const missed = (d: string) => !!first && d > first && d < T && !isOn(d);
  // Oldest on the left, today last.
  const week = Array.from({ length: 7 }, (_, k) => addDays(T, k - 6));
  const streak = streakOf(log, h.id);
  const edit = (fn: (x: Habit) => void) => mut((w) => fn(w.habits.find((x) => x.id === h.id)!));
  const on = isOn(T);
  const toggleHistory = () => {
    setHistory(!history);
    saveOpen(h.id, !history);
  };
  return (
    <div
      data-del={"habit:" + h.id}
      className="group/habit flex flex-col gap-3 py-5"
      style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
    >
      <div className="flex items-center gap-3 max-sm:flex-wrap">
        <IconPicker
          value={h.icon}
          label={`Trocar ícone de ${h.name}`}
          open={iconOpen}
          onOpenChange={setIconOpen}
          onChange={(icon) =>
            edit((x) => {
              x.icon = icon;
            })
          }
        />
        <div className="flex min-w-0 flex-1 flex-col max-sm:min-w-[calc(100%-3.75rem)]">
          <input
            ref={nameRef}
            data-habit-name
            aria-label="Nome do hábito"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              edit((x) => {
                x.name = name.trim() || x.name;
              })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="min-w-0 rounded-md bg-transparent px-1 py-0.5 text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="px-1 text-sm text-muted-foreground">
            {streak ? (
              <>
                <Flame className="inline size-4 -translate-y-px text-warning" aria-hidden="true" />{" "}
                <b key={streak} className="streak-bump inline-block font-semibold text-foreground tabular-nums">
                  {streak}
                </b>{" "}
                {streak === 1 ? "dia seguido" : "dias seguidos"}
              </>
            ) : !first ? (
              "Comece hoje"
            ) : null}
          </span>
        </div>
        {/* Phones: on a line of their own under the name, so the name keeps the width. */}
        <div className="flex shrink-0 items-center gap-1 max-sm:w-full max-sm:justify-between max-sm:pl-14">
          {/* The main action: clearly clickable before (teal outline), clearly done after (green). */}
          <Button
            variant={on ? "default" : "outline"}
            aria-pressed={on}
            size="lg"
            className={cn(
              "h-11 min-w-24 shrink-0 text-base sm:min-w-36",
              on
                ? "pop bg-success text-white hover:bg-success/90 dark:text-background"
                : "border-primary-strong/45 text-primary-strong hover:border-primary-strong hover:bg-primary/8 hover:text-primary-strong",
            )}
            onClick={() => toggleHabit(h.id, T)}
          >
            {on ? <Check data-icon="inline-start" /> : <Circle data-icon="inline-start" />}
            <span className="sm:hidden">{on ? "Feito" : "Hoje"}</span>
            <span className="max-sm:hidden">{on ? "Feito hoje" : "Marcar hoje"}</span>
          </Button>
          {/* Always visible (touch and mouse): everything else about this habit. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Opções de ${h.name}`}
                title="Opções"
                className="shrink-0 text-muted-foreground"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              // Renomear / Trocar ícone run once the menu has closed, instead of the focus going back to "⋯".
              onCloseAutoFocus={(e) => {
                const run = afterMenu.current;
                afterMenu.current = null;
                if (run) {
                  e.preventDefault();
                  run();
                }
              }}
            >
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => {
                    afterMenu.current = () => {
                      nameRef.current?.focus();
                      nameRef.current?.select();
                    };
                  }}
                >
                  <Pencil />
                  Renomear
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => (afterMenu.current = () => setIconOpen(true))}>
                  <Smile />
                  Trocar ícone
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={toggleHistory}>
                  <HistoryIcon />
                  {history ? "Esconder histórico" : "Ver histórico"}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onSelect={() => deleteHabit(h.id)}>
                  <Trash2 />
                  Excluir hábito
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:pl-14">
        <div className="flex gap-1.5" role="group" aria-label="Últimos dias">
          {week.map((d) => (
            // The weekday above each day, so "27" reads as "segunda, 27".
            <div key={d} className="flex flex-col items-center gap-1">
              <span
                aria-hidden="true"
                className={cn("text-[11px] leading-none text-muted-foreground", d === T && "font-semibold text-primary-strong")}
              >
                {DOW[parseD(d).getDay()]}
              </span>
              <DayDot day={d} on={isOn(d)} today={d === T} missed={missed(d)} onClick={() => toggleHabit(h.id, d)} />
            </div>
          ))}
        </div>
        <button
          className="touch-hit ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-expanded={history}
          onClick={toggleHistory}
        >
          {history ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
          {history ? "Esconder histórico" : "Ver histórico"}
        </button>
      </div>
      {history && <History T={T} isOn={isOn} missed={missed} onToggle={(d) => toggleHabit(h.id, d)} />}
    </div>
  );
}

function DayDot({
  day,
  on,
  today: isToday,
  missed,
  onClick,
}: {
  day: string;
  on: boolean;
  today?: boolean;
  missed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={on}
      aria-label={`${isToday ? "Hoje" : fmtDate(day)}${on ? ", feito" : missed ? ", não feito" : ""}`}
      title={isToday ? "Hoje" : fmtDate(day)}
      onClick={onClick}
      // Each state has its own shape, not only its own color: done = solid with a ✓ badge,
      // not done = dashed outline, no record = plain gray.
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:size-9",
        on
          ? "pop bg-success text-white dark:text-background"
          : missed
            ? "border-2 border-dashed border-(--tag-red-fg)/70 text-(--tag-red-fg) hover:bg-(--tag-red-bg)/60"
            : "bg-muted text-muted-foreground hover:bg-accent",
        isToday && "ring-2 ring-primary-strong ring-offset-2 ring-offset-card",
      )}
    >
      {parseD(day).getDate()}
      {on && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-card text-success ring-1 ring-success/40"
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function NewHabit({ onAdd, onCancel }: { onAdd: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-primary-strong/40 bg-card p-4 shadow-card sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name);
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">
        Nome do novo hábito
        <Input
          autoFocus
          autoComplete="off"
          placeholder="Ex.: Ler 10 minutos, Beber água"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
        />
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          Criar hábito
        </Button>
      </div>
    </form>
  );
}

/** What the day circles mean, in the same shapes. */
function HabitLegend() {
  const item = (dot: React.ReactNode, label: string) => (
    <span className="flex items-center gap-1.5">
      {dot}
      {label}
    </span>
  );
  return (
    <p className="-mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-label="Legenda">
      {item(
        <span className="relative size-3.5 rounded-full bg-success">
          <Check
            className="absolute inset-0 m-auto size-2.5 text-white dark:text-background"
            strokeWidth={3.5}
            aria-hidden="true"
          />
        </span>,
        "Feito",
      )}
      {item(<span className="size-3.5 rounded-full border-2 border-dashed border-(--tag-red-fg)/70" />, "Não feito")}
      {item(<span className="size-3.5 rounded-full bg-muted ring-1 ring-border" />, "Sem registro")}
    </p>
  );
}

/** A month calendar of the habit, Monday first: look back month by month and fix a missed mark. */
function History({
  T,
  isOn,
  missed,
  onToggle,
}: {
  T: string;
  isOn: (d: string) => boolean;
  missed: (d: string) => boolean;
  onToggle: (d: string) => void;
}) {
  const thisMonth = T.slice(0, 7) + "-01";
  const [month, setMonth] = useState(thisMonth);
  const shift = (k: number) => {
    const d = parseD(month);
    d.setMonth(d.getMonth() + k);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  };
  const first = parseD(month);
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const days = Array.from({ length }, (_, k) => addDays(month, k));
  const lead = (first.getDay() + 6) % 7;
  const past = days.filter((d) => d <= T);
  const done = past.filter(isOn).length;
  const label = first.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const title = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <div className="flex w-max flex-col gap-2 rounded-xl bg-muted/40 p-3 sm:ml-14">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Mês anterior" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <span className="text-sm font-semibold" aria-live="polite">
          {title}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Próximo mês" disabled={month >= thisMonth} onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
      </div>
      <div key={month} className="cal-enter grid w-max grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">
        {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => (
          <span key={d} className="w-8 sm:w-9">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, k) => (
          <span key={"x" + k} className="size-8 sm:size-9" />
        ))}
        {days.map((d) =>
          d > T ? (
            <span
              key={d}
              className="flex size-8 items-center justify-center rounded-full text-xs text-muted-foreground/50 tabular-nums sm:size-9"
            >
              {parseD(d).getDate()}
            </span>
          ) : (
            <DayDot key={d} day={d} on={isOn(d)} today={d === T} missed={missed(d)} onClick={() => onToggle(d)} />
          ),
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {past.length ? (
          <>
            <span className="font-semibold text-foreground tabular-nums">{done}</span> de {past.length}{" "}
            {past.length === 1 ? "dia" : "dias"} {month === thisMonth ? "neste mês" : "no mês"}
          </>
        ) : (
          "Este mês ainda não começou."
        )}
      </p>
    </div>
  );
}

const histKey = (id: string) => "habit-history-" + id;
function readOpen(id: string) {
  try {
    return localStorage.getItem(histKey(id)) === "1";
  } catch {
    return false;
  }
}
function saveOpen(id: string, open: boolean) {
  try {
    if (open) localStorage.setItem(histKey(id), "1");
    else localStorage.removeItem(histKey(id));
  } catch {
    /* private mode: just don't remember */
  }
}
