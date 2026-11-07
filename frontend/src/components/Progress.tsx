import { useMemo, useState } from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, parseD } from "@/lib/util";
import { doneByDay, doneStreak, habitRate, habitStreaks, habitsOn, lastDays, listsBreakdown, notesEdited } from "@/lib/progress";
import { go, useStore } from "@/store";
import { Mascot, PixelListIcon } from "./brand/Brand";
import { Glyph } from "./icons";
import { useToday } from "./common";

const CARD = "rounded-2xl border bg-card shadow-card";
const short = (d: string) => parseD(d).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
const weekday = (d: string) => parseD(d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");

/** A number with its pixel icon, a label and how it compares with the period before. */
function Stat({ icon, value, label, note }: { icon: string; value: string; label: string; note?: React.ReactNode }) {
  return (
    <section className={cn(CARD, "flex items-center gap-4 p-5")}>
      <PixelListIcon name={icon} size={44} className="shrink-0" />
      <div className="flex min-w-0 flex-col">
        <span className="text-3xl leading-tight font-extrabold tracking-tight tabular-nums">{value}</span>
        <span className="text-sm font-medium">{label}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
    </section>
  );
}

/**
 * Progresso: what got done lately, drawn in the app's pixel style. Tasks completed per day as
 * stacks of pixels, the habits as a grid of squares, streaks, and open/done per list.
 */
export function Progress() {
  const ws = useStore((s) => s.ws);
  const T = useToday();
  const [range, setRange] = useState<14 | 28>(28);
  const byDay = useMemo(() => doneByDay(ws), [ws.items]);
  const days = lastDays(T, range);
  const week = lastDays(T, 7);
  const prevWeek = lastDays(addDays(T, -7), 7);
  const sum = (ds: string[]) => ds.reduce((n, d) => n + (byDay.get(d) ?? 0), 0);
  const thisWeek = sum(week),
    lastWeek = sum(prevWeek);
  const streak = doneStreak(byDay, T);
  const rate = habitRate(ws, week);
  const notes = notesEdited(ws, week[0], T);
  const max = Math.max(1, ...days.map((d) => byDay.get(d) ?? 0));
  // Each pixel is one task, up to 12 pixels tall; busier days scale down (one pixel = several tasks).
  const per = Math.max(1, Math.ceil(max / 12));
  const best = days.reduce((b, d) => ((byDay.get(d) ?? 0) > (byDay.get(b) ?? 0) ? d : b), days[0]);
  const diff = thisWeek - lastWeek;
  const lists = listsBreakdown(ws);
  const listMax = Math.max(1, ...lists.map((l) => l.open + l.done));
  const streaks = habitStreaks(ws);
  // Habits grid: the last 12 weeks, Monday first, one column per week.
  const gridStart = addDays(T, -(((parseD(T).getDay() + 6) % 7) + 7 * 11));
  const gridDays = Array.from({ length: 84 }, (_, i) => addDays(gridStart, i));
  const habitCount = Math.max(1, ws.habits.length);
  const habitsPage = ws.pages.find((p) => p.type === "habits");

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-5 px-4 pt-5 pb-28 md:px-10 md:pt-7">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Mascot pose="comemora" size={60} className="mascot-pop -my-1 shrink-0 max-md:size-12!" />
        <div className="mr-auto flex flex-col">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight md:text-[2.5rem]">Progresso</h1>
          <p className="text-base text-muted-foreground">O que você fez nos últimos dias.</p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon="checklist"
          value={String(thisWeek)}
          label="tarefas concluídas em 7 dias"
          note={diff === 0 ? "igual à semana anterior" : `${diff > 0 ? "+" : ""}${diff} em relação à semana anterior`}
        />
        <Stat
          icon="estrela"
          value={`${streak} ${streak === 1 ? "dia" : "dias"}`}
          label="seguidos concluindo tarefas"
          note={streak ? "Continue hoje para não perder!" : "Conclua uma tarefa para começar."}
        />
        <Stat
          icon="coracao"
          value={ws.habits.length ? `${Math.round(rate * 100)}%` : "–"}
          label="dos hábitos feitos em 7 dias"
          note={
            ws.habits.length ? `${ws.habits.length} ${ws.habits.length === 1 ? "hábito" : "hábitos"}` : "Nenhum hábito ainda."
          }
        />
        <Stat icon="caderno" value={String(notes)} label="notas editadas em 7 dias" />
      </div>

      {/* Tasks done per day: stacks of pixels. */}
      <section aria-labelledby="pg-days" className={cn(CARD, "flex flex-col gap-4 p-5 md:p-6")}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="pg-days" className="text-lg font-bold tracking-tight">
            Tarefas concluídas por dia
          </h2>
          {(byDay.get(best) ?? 0) > 0 && (
            <span className="text-sm text-muted-foreground">
              Melhor dia: {weekday(best)}, {short(best)} ({byDay.get(best)})
            </span>
          )}
          <div className="ml-auto flex rounded-xl border bg-background/40 p-0.5 text-sm" role="radiogroup" aria-label="Período">
            {([14, 28] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={range === r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-lg px-3 py-1 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  range === r ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r} dias
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-[3px] overflow-x-auto pb-1" aria-hidden="true">
          {days.map((d) => {
            const n = byDay.get(d) ?? 0;
            const px = Math.ceil(n / per);
            return (
              <div
                key={d}
                className="flex min-w-3 flex-1 flex-col items-center gap-1.5"
                title={`${weekday(d)}, ${short(d)}: ${n}`}
              >
                <div className="flex h-[10.5rem] w-full flex-col-reverse items-center gap-[3px]">
                  {Array.from({ length: px }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "pixel-pop block aspect-square w-full max-w-4 rounded-[2px]",
                        d === T ? "bg-primary-strong" : i === px - 1 ? "bg-primary" : "bg-primary/70",
                      )}
                      style={{ "--i": i } as React.CSSProperties}
                    />
                  ))}
                  {!n && <span className="block aspect-square w-full max-w-4 rounded-[2px] bg-muted" />}
                </div>
                <span className={cn("text-[10px] text-muted-foreground tabular-nums", d === T && "font-bold text-foreground")}>
                  {range === 14 || parseD(d).getDay() === 1 || d === T ? parseD(d).getDate() : ""}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Cada quadradinho é {per === 1 ? "uma tarefa" : `${per} tarefas`}. Hoje fica destacado.
        </p>
        <table className="sr-only">
          <caption>Tarefas concluídas por dia</caption>
          <tbody>
            {days.map((d) => (
              <tr key={d}>
                <th scope="row">{short(d)}</th>
                <td>{byDay.get(d) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* Habits: a grid of the last 12 weeks. */}
        <section aria-labelledby="pg-habits" className={cn(CARD, "flex flex-col gap-4 p-5 md:p-6")}>
          <div className="flex items-baseline gap-3">
            <h2 id="pg-habits" className="text-lg font-bold tracking-tight">
              Hábitos nas últimas 12 semanas
            </h2>
            {habitsPage && (
              <button
                type="button"
                onClick={() => go(habitsPage.id)}
                className="ml-auto rounded-md px-1 text-sm font-semibold text-primary-strong hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Ver hábitos
              </button>
            )}
          </div>
          {ws.habits.length ? (
            <>
              <div className="flex gap-3" aria-hidden="true">
                <div className="grid grid-rows-7 gap-[3px] pt-px text-[10px] leading-[14px] text-muted-foreground">
                  {["seg", "", "qua", "", "sex", "", "dom"].map((l, i) => (
                    <span key={i}>{l}</span>
                  ))}
                </div>
                <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
                  {gridDays.map((d) => {
                    const n = d > T ? -1 : habitsOn(ws, d);
                    const level = n <= 0 ? 0 : Math.ceil((n / habitCount) * 4);
                    return (
                      <span
                        key={d}
                        title={n < 0 ? undefined : `${short(d)}: ${n} de ${ws.habits.length}`}
                        className={cn(
                          "block size-3.5 rounded-[2px]",
                          n < 0 ? "bg-transparent" : level === 0 ? "bg-muted" : "",
                          level === 1 && "bg-primary/30",
                          level === 2 && "bg-primary/55",
                          level === 3 && "bg-primary/80",
                          level >= 4 && "bg-primary",
                          d === T && "ring-2 ring-foreground/60",
                        )}
                      />
                    );
                  })}
                </div>
              </div>
              <ul className="flex flex-col">
                {streaks.map(({ habit, streak }, i) => (
                  <li key={habit.id} className={cn("flex items-center gap-3 py-2", i > 0 && "border-t border-border/70")}>
                    <Glyph icon={habit.icon} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{habit.name}</span>
                    <span
                      className={cn(
                        "flex items-center gap-1 text-sm tabular-nums",
                        streak ? "font-semibold text-primary-strong" : "text-muted-foreground",
                      )}
                    >
                      <Flame className="size-4" aria-hidden="true" />
                      {streak} {streak === 1 ? "dia" : "dias"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyHint pose="rega" text="Crie um hábito para acompanhar aqui." />
          )}
        </section>

        {/* Lists: done and open per list, as bars of pixels. */}
        <section aria-labelledby="pg-lists" className={cn(CARD, "flex flex-col gap-4 p-5 md:p-6")}>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 id="pg-lists" className="text-lg font-bold tracking-tight">
              Por lista
            </h2>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-[2px] bg-primary" aria-hidden="true" /> feitas
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-[2px] bg-muted-foreground/35" aria-hidden="true" /> abertas
              </span>
            </span>
          </div>
          {lists.length ? (
            <ul className="flex flex-col gap-3">
              {lists.slice(0, 8).map(({ page, open, done }) => (
                <li key={page.id}>
                  <button
                    type="button"
                    onClick={() => go(page.id)}
                    className="flex w-full flex-col gap-1.5 rounded-xl p-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="flex items-center gap-2 text-[15px] font-medium">
                      <Glyph icon={page.icon} size="xs" />
                      <span className="truncate">{page.title || "Sem título"}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                        {done} feitas · {open} abertas
                      </span>
                    </span>
                    <span className="flex h-2.5 w-full gap-[2px]" aria-hidden="true">
                      <span className="rounded-[2px] bg-primary" style={{ width: `${(done / listMax) * 100}%` }} />
                      <span className="rounded-[2px] bg-muted-foreground/35" style={{ width: `${(open / listMax) * 100}%` }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint pose="checklist" text="Suas listas aparecem aqui quando tiverem tarefas." />
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyHint({ pose, text }: { pose: "rega" | "checklist"; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Mascot pose={pose} size={64} />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
