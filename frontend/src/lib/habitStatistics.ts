import { streakOf } from "./model";
import type { Habit, Workspace } from "./types";
import { addDays, diffDays } from "./util";

export type HabitPeriod = 7 | 30 | 90;
export type HabitDateRange = { start: string; end: string };

interface HabitCounts {
  completed: number;
  eligible: number;
}

interface HabitMetrics extends HabitCounts {
  rate: number | null;
}

export interface HabitDayStatistics extends HabitMetrics {
  date: string;
}

export interface HabitRowStatistics extends HabitMetrics {
  habit: Habit;
  previousRate: number | null;
  streak: number;
}

export interface HabitStatistics extends HabitMetrics {
  start: string;
  end: string;
  previousRate: number | null;
  days: HabitDayStatistics[];
  habits: HabitRowStatistics[];
}

function rate({ completed, eligible }: HabitCounts) {
  return eligible > 0 ? completed / eligible : null;
}

function isDateKey(date: string | undefined): date is string {
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && addDays(date, 0) === date;
}

export function getHabitStatistics(
  habits: readonly Habit[],
  log: Workspace["habitLog"],
  today: string,
  period: HabitPeriod | HabitDateRange,
): HabitStatistics {
  const starts = new Map(habits.map((habit) => [habit.id, isDateKey(habit.created) ? habit.created : null]));

  // Earlier manual marks extend known history, including for legacy habits without a creation date.
  for (const [date, ids] of Object.entries(log)) {
    if (date > today || !isDateKey(date)) continue;
    for (const id of ids) {
      const start = starts.get(id);
      if (start === null || (start && date < start)) starts.set(id, date);
    }
  }

  const { start, end } = typeof period === "number" ? { start: addDays(today, 1 - period), end: today } : period;
  const length = diffDays(end, start) + 1;
  const current = { completed: 0, eligible: 0 };
  const previous = { completed: 0, eligible: 0 };
  const days: HabitDayStatistics[] = [];
  const rows = habits.map((habit) => ({
    habit,
    current: { completed: 0, eligible: 0 },
    previous: { completed: 0, eligible: 0 },
  }));

  for (let offset = -length; offset < length; offset++) {
    const date = addDays(start, offset);
    const marked = new Set(log[date]);
    const inPeriod = offset >= 0;
    const day = { date, completed: 0, eligible: 0 };

    for (const row of rows) {
      const started = starts.get(row.habit.id);
      if (!started || date < started) continue;
      const completed = Number(marked.has(row.habit.id));
      day.eligible++;
      day.completed += completed;
      const counts = inPeriod ? row.current : row.previous;
      counts.eligible++;
      counts.completed += completed;
    }

    const total = inPeriod ? current : previous;
    total.eligible += day.eligible;
    total.completed += day.completed;
    if (inPeriod) days.push({ ...day, rate: rate(day) });
  }

  return {
    start,
    end,
    ...current,
    rate: rate(current),
    previousRate: current.eligible > 0 ? rate(previous) : null,
    days,
    habits: rows.map(({ habit, current, previous }) => ({
      habit,
      ...current,
      rate: rate(current),
      previousRate: current.eligible > 0 ? rate(previous) : null,
      streak: streakOf(log, habit.id, today),
    })),
  };
}
