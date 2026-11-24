import { describe, expect, it } from "vitest";
import { getHabitStatistics } from "./habitStatistics";
import type { Habit } from "./types";

function habit(id: string, created?: string): Habit {
  return { id, name: id, icon: "lucide:book:purple", created };
}

describe("estatísticas de hábitos", () => {
  it("inclui as duas datas do período personalizado e compara com o período imediatamente anterior", () => {
    const result = getHabitStatistics(
      [habit("ler", "2026-11-01")],
      { "2026-11-05": ["ler"], "2026-11-07": ["ler"], "2026-11-08": ["ler"], "2026-11-20": ["ler"] },
      "2026-11-20",
      { start: "2026-11-05", end: "2026-11-07" },
    );
    expect(result).toMatchObject({
      start: "2026-11-05",
      end: "2026-11-07",
      completed: 2,
      eligible: 3,
      previousRate: 0,
    });
    expect(result.days.map(({ date }) => date)).toEqual(["2026-11-05", "2026-11-06", "2026-11-07"]);
    expect(result.habits[0]).toMatchObject({ streak: 1, previousRate: 0 });
  });

  it("pondera a consistência pelo número de oportunidades de cada hábito", () => {
    const result = getHabitStatistics(
      [habit("ler", "2026-11-13"), habit("água", "2026-11-19")],
      {
        "2026-11-13": ["ler"],
        "2026-11-14": ["ler", "ler", "excluído"],
        "2026-11-19": ["água"],
        "2026-11-20": ["ler"],
        "2026-11-21": ["ler", "água"],
      },
      "2026-11-20",
      7,
    );

    expect(result).toMatchObject({ completed: 3, eligible: 9, rate: 3 / 9, previousRate: 1 });
    expect(result.habits).toMatchObject([
      { habit: { id: "ler" }, completed: 2, eligible: 7, rate: 2 / 7, previousRate: 1 },
      { habit: { id: "água" }, completed: 1, eligible: 2, rate: 1 / 2, previousRate: null },
    ]);
    expect(result.days.at(-1)).toEqual({ date: "2026-11-20", completed: 1, eligible: 2, rate: 1 / 2 });
  });

  it("usa registros retroativos e preserva o início desconhecido de hábitos antigos", () => {
    const result = getHabitStatistics(
      [habit("ler", "2026-11-18"), habit("antigo"), habit("sem-data"), habit("data-inválida", "2026-11-00")],
      {
        "2026-11-09-x": ["ler"],
        "2026-11-15": ["ler"],
        "2026-11-19": ["antigo"],
        "2026-11-20": ["ler"],
        "2026-11-21": ["sem-data"],
      },
      "2026-11-20",
      7,
    );

    expect(result.days[0]).toEqual({ date: "2026-11-14", completed: 0, eligible: 0, rate: null });
    expect(result.days[1]).toEqual({ date: "2026-11-15", completed: 1, eligible: 1, rate: 1 });
    expect(result.habits).toMatchObject([
      { completed: 2, eligible: 6, rate: 2 / 6, previousRate: null },
      { completed: 1, eligible: 2, rate: 1 / 2, previousRate: null },
      { completed: 0, eligible: 0, rate: null, previousRate: null },
      { completed: 0, eligible: 0, rate: null, previousRate: null },
    ]);
    expect(result.previousRate).toBeNull();
  });

  it("distingue zero conclusões de um período sem dias elegíveis", () => {
    const existing = getHabitStatistics([habit("ler", "2026-11-13")], {}, "2026-11-20", 7);
    const newHabit = getHabitStatistics([habit("ler", "2026-11-20")], {}, "2026-11-20", 7);
    const empty = getHabitStatistics([], { "2026-11-20": ["excluído"] }, "2026-11-20", 7);

    expect(existing).toMatchObject({ completed: 0, eligible: 7, rate: 0, previousRate: 0 });
    expect(newHabit).toMatchObject({ completed: 0, eligible: 1, rate: 0, previousRate: null });
    expect(empty).toMatchObject({ completed: 0, eligible: 0, rate: null, previousRate: null, habits: [] });
  });

  it("mantém a sequência de ontem durante o dia em andamento e atravessa o começo do período", () => {
    const result = getHabitStatistics(
      [habit("ler", "2026-11-12"), habit("água", "2026-11-12")],
      {
        "2026-11-12": ["ler"],
        "2026-11-13": ["ler"],
        "2026-11-14": ["ler"],
        "2026-11-15": ["ler"],
        "2026-11-16": ["ler"],
        "2026-11-17": ["ler"],
        "2026-11-18": ["ler", "água"],
        "2026-11-19": ["ler"],
      },
      "2026-11-20",
      7,
    );

    expect(result.habits).toMatchObject([
      { completed: 6, streak: 8, previousRate: 1 },
      { completed: 1, streak: 0, previousRate: 0 },
    ]);
  });

  it.each([
    [7, "2024-02-24"],
    [30, "2024-02-01"],
    [90, "2023-12-03"],
  ] as const)("inclui exatamente %i dias corridos terminando hoje", (period, start) => {
    const result = getHabitStatistics([], {}, "2024-03-01", period);

    expect(result.start).toBe(start);
    expect(result.end).toBe("2024-03-01");
    expect(result.days).toHaveLength(period);
    expect(result.days.at(-2)?.date).toBe("2024-02-29");
  });
});
