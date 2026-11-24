import { useId, useMemo, useState, type Ref } from "react";
import { ArrowLeft, CalendarDays, ChevronDown, Plus, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getHabitStatistics, type HabitDateRange, type HabitPeriod, type HabitRowStatistics } from "@/lib/habitStatistics";
import type { Habit } from "@/lib/types";
import { parseD } from "@/lib/util";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { Glyph } from "./icons";

const periods: HabitPeriod[] = [7, 30, 90];
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });

export function HabitStatistics({
  habits,
  today,
  headingRef,
  onBack,
  onCreate,
}: {
  habits: Habit[];
  today: string;
  headingRef: Ref<HTMLHeadingElement>;
  onBack: () => void;
  onCreate: () => void;
}) {
  const [period, setPeriod] = useState<HabitPeriod | HabitDateRange>(30);
  const [openHabitId, setOpenHabitId] = useState<string | null>(null);
  const log = useStore((s) => s.ws.habitLog);
  const stats = useMemo(() => getHabitStatistics(habits, log, today, period), [habits, log, today, period]);
  const rows = [...stats.habits].sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2));
  const startDate = stats.start.slice(0, 4) === stats.end.slice(0, 4) ? shortDate : fullDate;
  const recentDates: string[] = [];
  if (openHabitId) {
    for (let i = stats.days.length - 1; i >= 0 && recentDates.length < 5; i--) {
      const { date } = stats.days[i];
      if (log[date]?.includes(openHabitId)) recentDates.push(date);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-28 md:px-8 md:pt-6">
      <header className="flex flex-col gap-3">
        <Button variant="ghost" className="-ml-2.5 w-fit text-muted-foreground hover:text-foreground" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Voltar para hábitos
        </Button>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-extrabold tracking-tight outline-none md:text-4xl">
          Estatísticas de hábitos
        </h1>
        {habits.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-muted-foreground md:text-base">
              <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
              <span>
                {stats.start !== stats.end && `${startDate.format(parseD(stats.start))} a `}
                {fullDate.format(parseD(stats.end))}
              </span>
            </p>
            <div
              role="group"
              aria-label="Período das estatísticas"
              className="grid w-full grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1 sm:flex sm:w-fit"
            >
              {periods.map((option) => (
                <Button
                  key={option}
                  variant="ghost"
                  size="sm"
                  aria-pressed={period === option}
                  className="h-9 px-3.5 text-muted-foreground hover:text-foreground aria-pressed:bg-primary/15 aria-pressed:font-bold aria-pressed:text-foreground pointer-coarse:h-10"
                  onClick={() => setPeriod(option)}
                >
                  {option} dias
                </Button>
              ))}
              <HabitRangePicker today={today} range={stats} active={typeof period !== "number"} onApply={setPeriod} />
            </div>
          </div>
        )}
      </header>

      {habits.length === 0 ? (
        <Empty className="border bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sprout aria-hidden="true" className="text-primary-strong" />
            </EmptyMedia>
            <EmptyTitle>Nenhum hábito para acompanhar</EmptyTitle>
            <EmptyDescription>Crie um hábito e marque os dias em que o cumprir para acompanhar sua evolução.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onCreate}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Criar hábito
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <section aria-labelledby="habit-breakdown" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="habit-breakdown" className="text-xl font-bold tracking-tight">
              Progresso por hábito
            </h2>
            {rows.filter(({ rate }) => rate !== null).length > 1 && (
              <p className="text-sm text-muted-foreground">Menor taxa de conclusão primeiro</p>
            )}
          </div>
          <Card className="gap-0 py-0">
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <HabitReportRow
                  key={row.habit.id}
                  row={row}
                  open={row.habit.id === openHabitId}
                  onToggle={() => setOpenHabitId((current) => (current === row.habit.id ? null : row.habit.id))}
                  recentDates={row.habit.id === openHabitId ? recentDates : []}
                  year={stats.end.slice(0, 4)}
                />
              ))}
            </ul>
            {stats.rate !== null && (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border bg-muted/45 px-3.5 py-3 text-sm sm:px-5">
                <p className="font-semibold">Total no período</p>
                <p className="text-muted-foreground tabular-nums">
                  <strong className="font-bold text-foreground">
                    {stats.completed} de {stats.eligible} marcações possíveis
                  </strong>
                  {" · "}
                  {percent.format(stats.rate)}
                </p>
              </div>
            )}
          </Card>
          {stats.end === today && stats.eligible > 0 && (
            <p className="text-xs text-muted-foreground">O total de dias inclui hoje.</p>
          )}
        </section>
      )}
    </div>
  );
}

function HabitReportRow({
  row,
  open,
  onToggle,
  recentDates,
  year,
}: {
  row: HabitRowStatistics;
  open: boolean;
  onToggle: () => void;
  recentDates: string[];
  year: string;
}) {
  const detailsId = useId();
  const { habit, rate, completed, eligible, streak, previousRate } = row;
  const layout = "flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left sm:px-5 sm:py-4";
  const identity = (
    <span className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <Glyph icon={habit.icon} size="md" fallback={Sprout} />
      <span className="min-w-0">
        <span className="block text-base leading-snug font-bold [overflow-wrap:anywhere]">{habit.name}</span>
        {streak > 0 && (
          <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
            Sequência atual de {streak} {streak === 1 ? "dia" : "dias"}
          </span>
        )}
      </span>
    </span>
  );

  return (
    <li>
      {rate === null ? (
        <div className={layout}>
          {identity}
          <span className="shrink-0 text-right text-xs text-muted-foreground sm:pr-8">Sem dados no período</span>
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={onToggle}
            className={cn(
              layout,
              "cursor-pointer transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
              open && "bg-muted/60",
            )}
          >
            {identity}
            <span className="flex shrink-0 items-center gap-2 sm:gap-4">
              <span className="max-w-24 text-right tabular-nums sm:max-w-none">
                <span className="block text-sm leading-snug font-bold sm:text-base">
                  {completed} de {eligible} {eligible === 1 ? "dia" : "dias"}
                </span>
                <span className="block text-xs text-muted-foreground">{percent.format(rate)} de conclusão</span>
              </span>
              <span className="sr-only">{open ? "Ocultar detalhes" : "Ver detalhes"}</span>
              <ChevronDown
                className={cn("size-4 shrink-0 text-muted-foreground motion-safe:transition-transform", open && "rotate-180")}
                aria-hidden="true"
              />
            </span>
          </button>
          <div id={detailsId} hidden={!open}>
            {open && (
              <dl className="flex flex-col gap-x-6 gap-y-3 border-t border-border bg-muted/35 px-3.5 py-3 text-sm sm:flex-row sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <dt className="font-semibold">Últimos dias concluídos</dt>
                  <dd className="mt-1 text-muted-foreground">
                    {recentDates.length === 0 ? (
                      "Nenhum dia concluído no período."
                    ) : (
                      <ul className="flex flex-wrap gap-x-2 gap-y-1.5">
                        {recentDates.map((date) => (
                          <li key={date} className="rounded-md bg-card px-2 py-0.5">
                            <time dateTime={date}>{(date.slice(0, 4) === year ? shortDate : fullDate).format(parseD(date))}</time>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Período anterior</dt>
                  <dd className="mt-1 text-muted-foreground tabular-nums">
                    {previousRate === null ? "Sem dados para comparar" : `${percent.format(previousRate)} de conclusão`}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function HabitRangePicker({
  today,
  range,
  active,
  onApply,
}: {
  today: string;
  range: HabitDateRange;
  active: boolean;
  onApply: (range: HabitDateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<HabitDateRange>(range);
  const valid = draft.start.length === 10 && draft.end.length === 10 && draft.start <= draft.end && draft.end <= today;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft({ start: range.start, end: range.end });
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "col-span-3 h-9 px-3.5 text-muted-foreground hover:text-foreground pointer-coarse:h-10",
            active && "bg-primary/15 font-bold text-foreground",
          )}
        >
          <CalendarDays data-icon="inline-start" aria-hidden="true" />
          Escolher período
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Período personalizado" className="p-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            onApply(draft);
            setOpen(false);
          }}
        >
          <label className="flex flex-col gap-1.5 font-medium">
            Data de início
            <Input
              type="date"
              required
              max={today}
              value={draft.start}
              onChange={(event) => setDraft({ ...draft, start: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            Data de fim
            <Input
              type="date"
              required
              min={draft.start || undefined}
              max={today}
              value={draft.end}
              onChange={(event) => setDraft({ ...draft, end: event.target.value })}
            />
          </label>
          {draft.start && draft.end && draft.end < draft.start && (
            <p role="status" className="text-muted-foreground">
              A data de fim deve ser igual ou posterior à data de início.
            </p>
          )}
          <Button type="submit" disabled={!valid}>
            Aplicar período
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
