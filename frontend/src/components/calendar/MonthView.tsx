import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { vtName, withMotion } from "@/lib/motion";
import type { AlertChannel, Area } from "@/lib/types";
import { monthGrid } from "@/lib/events";
import { addDays, parseD, today } from "@/lib/util";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { areaVar } from "../common";
import { contrast, isHex } from "@/lib/appearance";
import { useStore } from "@/store";

export interface Entry {
  key: string;
  id: string;
  kind: "event" | "task" | "todo";
  title: string;
  time?: string;
  /** End time of a timed event. */
  end?: string;
  area?: Area;
  done?: boolean;
  /** The day this entry is shown on (for repeating events, the occurrence). */
  date?: string;
  repeat?: boolean;
  /** Spaced-review reminders are shown but cannot be dragged. */
  fixed?: boolean;
  /** Alarm minutes (before the start) and where they arrive. */
  alerts?: number[];
  channel?: AlertChannel;
}

export const DRAG_TYPE = "application/x-organizer";
/** Monday first, as in the grid. */
const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** An event or task in the calendar: a soft pill in its area's color (title, then time). Drag it to another day. */
export function EntryChip({
  e,
  onOpen,
  compact,
  large,
}: {
  e: Entry;
  onOpen: (e: Entry) => void;
  compact?: boolean;
  /** Bigger, for touch (the phone's day list). */
  large?: boolean;
}) {
  return (
    <button
      type="button"
      draggable={!e.fixed}
      data-del={e.fixed ? undefined : `${e.kind}:${e.id}`}
      onDragStart={(ev) => {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: e.kind, id: e.id, from: e.date }));
      }}
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(e);
      }}
      onDoubleClick={(ev) => ev.stopPropagation()}
      title={(e.time ? e.time + " · " : "") + e.title}
      // Glides to its new day when moved (the phone's day list uses its own name, so names stay unique).
      style={{ ...areaVar(e.area), viewTransitionName: vtName(large ? "day" : compact ? "cell" : "pop", e.key) }}
      className={cn(
        "area-pill flex w-full min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[13px] font-medium transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        e.done && "line-through opacity-55",
        large && "min-h-11 gap-2.5 px-3 py-2 text-[15px]",
      )}
    >
      <span className="sr-only">{e.kind === "event" ? "Evento: " : "Tarefa: "}</span>
      {e.done && <Check aria-hidden="true" className="size-3.5 shrink-0" />}
      {large && e.time && <span className="shrink-0 font-semibold tabular-nums">{e.time}</span>}
      <span className="truncate">{e.title || "Sem título"}</span>
      {!large && e.time && <span className="shrink-0 tabular-nums opacity-90">{e.time}</span>}
      {e.repeat && <Repeat className="ml-auto size-3 shrink-0 opacity-70" aria-label="Repete" />}
    </button>
  );
}

/**
 * Month grid (Monday first). Every entry can be dragged to another day. A click on a day chooses it
 * (`selected`/`onSelect` when the page shows the day elsewhere; otherwise the phone's list below).
 */
export function MonthView({
  anchor,
  byDay,
  onOpen,
  onAdd,
  onMove,
  selected,
  onSelect,
  max = 3,
}: {
  anchor: string;
  byDay: Record<string, Entry[]>;
  onOpen: (e: Entry) => void;
  onAdd?: (date: string) => void;
  onMove: (e: { kind: Entry["kind"]; id: string; from?: string }, date: string) => void;
  selected?: string;
  onSelect?: (date: string) => void;
  max?: number;
}) {
  const accent = useStore((s) => s.ws.settings.accent);
  const selectedColor = accent && isHex(accent) ? accent : undefined;
  const selectedForeground = selectedColor
    ? contrast(selectedColor, "#ffffff") >= contrast(selectedColor, "#000000")
      ? "#ffffff"
      : "#000000"
    : undefined;
  const days = monthGrid(anchor);
  const month = parseD(anchor).getMonth();
  const T = today();
  const [over, setOver] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const inMonth = (d: string) => parseD(d).getMonth() === month;
  const chosen = selected ?? picked;
  const day = chosen && days.includes(chosen) ? chosen : days.includes(T) && inMonth(T) ? T : days.find(inMonth)!;
  const pick = (d: string) => (onSelect ? onSelect(d) : setPicked(d));
  const dayList = byDay[day] ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-3 text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:px-3 sm:text-left sm:text-[13px]"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const list = byDay[d] ?? [];
            const out = !inMonth(d);
            const isPicked = d === day;
            return (
              <div
                key={d}
                onClick={() => pick(d)}
                onDoubleClick={() => onAdd?.(d)}
                className={cn(
                  "group relative flex min-h-16 min-w-0 cursor-default flex-col gap-1 border-r border-b p-1.5 transition-colors sm:min-h-32 sm:p-2",
                  (i + 1) % 7 === 0 && "border-r-0",
                  i >= days.length - 7 && "border-b-0",
                  over === d && "bg-primary/8 ring-2 ring-primary-strong/40 ring-inset",
                )}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(DRAG_TYPE)) {
                    e.preventDefault();
                    if (over !== d) setOver(d);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === d ? null : o));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  try {
                    const moved = JSON.parse(e.dataTransfer.getData(DRAG_TYPE));
                    withMotion(() => onMove(moved, d));
                  } catch {
                    /* not ours */
                  }
                }}
              >
                <div className="flex items-start justify-between max-sm:justify-center">
                  <div className="flex h-12 flex-col items-center gap-0.5">
                    <span
                      aria-current={d === T ? "date" : undefined}
                      aria-label={isPicked ? `${parseD(d).getDate()}, dia selecionado` : undefined}
                      style={isPicked ? { backgroundColor: selectedColor, color: selectedForeground } : undefined}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums max-sm:size-7 max-sm:text-sm",
                        isPicked ? "bg-primary text-primary-foreground" : out ? "text-muted-foreground/60" : "text-foreground",
                      )}
                    >
                      {parseD(d).getDate()}
                    </span>
                    {d === T && <span className="text-[10px] leading-3 font-medium text-muted-foreground">Hoje</span>}
                  </div>
                  {onAdd && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Adicionar em ${d}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 max-sm:hidden"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdd(d);
                      }}
                    >
                      <Plus />
                    </Button>
                  )}
                </div>
                {/* Phones: one dot per entry (up to 4), in the entry's area color. */}
                {list.length > 0 && (
                  <span
                    className="mt-auto flex flex-wrap justify-center gap-1 pb-1 sm:hidden"
                    aria-label={`${list.length} na agenda`}
                  >
                    {list.slice(0, 4).map((e) => (
                      <span
                        key={e.key}
                        style={areaVar(e.area)}
                        className={cn("size-1.5 rounded-full bg-(--area,var(--muted-foreground))", e.done && "opacity-40")}
                      />
                    ))}
                  </span>
                )}
                {list.slice(0, max).map((e) => (
                  <div key={e.key} className={cn("max-sm:hidden", out && "opacity-60")}>
                    <EntryChip e={e} onOpen={onOpen} compact />
                  </div>
                ))}
                {list.length > max && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="w-fit rounded-md px-1.5 py-0.5 text-left text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:hidden"
                        aria-label={`Ver todos os ${list.length} itens de ${parseD(d).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}`}
                      >
                        +{list.length - max} mais
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="flex w-72 flex-col gap-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {parseD(d)
                            .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
                            .replace(/^./, (c) => c.toUpperCase())}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">{list.length} itens</span>
                      </div>
                      {list.map((e) => (
                        <EntryChip key={e.key} e={e} onOpen={onOpen} />
                      ))}
                      {onAdd && (
                        <Button variant="ghost" size="sm" className="mt-1 justify-start" onClick={() => onAdd(d)}>
                          <Plus data-icon="inline-start" />
                          Adicionar neste dia
                        </Button>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Phones (when the page doesn't show the day itself): the chosen day, readable. */}
      {!onSelect && (
        <section className="flex flex-col gap-1.5 rounded-2xl border bg-card p-3 shadow-card sm:hidden" aria-live="polite">
          <div className="flex items-center justify-between gap-1 px-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dia anterior"
              disabled={day === days[0]}
              onClick={() => setPicked(addDays(day, -1))}
            >
              <ChevronLeft />
            </Button>
            <h3 className="mr-auto text-base font-semibold">
              {day === T
                ? "Hoje, " + parseD(day).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })
                : parseD(day)
                    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
                    .replace(/^./, (c) => c.toUpperCase())}
            </h3>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Próximo dia"
              disabled={day === days[days.length - 1]}
              onClick={() => setPicked(addDays(day, 1))}
            >
              <ChevronRight />
            </Button>
            {onAdd && (
              <Button variant="ghost" size="sm" onClick={() => onAdd(day)}>
                <Plus data-icon="inline-start" />
                Adicionar
              </Button>
            )}
          </div>
          {dayList.length ? (
            dayList.map((e) => <EntryChip key={e.key} e={e} onOpen={onOpen} large />)
          ) : (
            <p className="px-1 py-2 text-sm text-muted-foreground">Nada marcado neste dia.</p>
          )}
        </section>
      )}
    </div>
  );
}
