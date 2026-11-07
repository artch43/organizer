import { describe, expect, it } from "vitest";
import type { Workspace } from "./types";
import { doneByDay, doneStreak, habitRate, lastDays } from "./progress";

const at = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00`).getTime();

describe("progresso", () => {
  it("conta cada tarefa uma vez por dia em que foi concluída", () => {
    const ws = {
      items: {
        a: {
          log: [
            { g: "done", t: at("2026-11-02") },
            { g: "todo", t: at("2026-11-02", 13) },
            { g: "done", t: at("2026-11-02", 14) },
          ],
        },
        b: { log: [{ g: "done", t: at("2026-11-03") }] },
        c: { log: [{ g: "doing", t: at("2026-11-03") }] },
      },
    } as unknown as Workspace;
    const m = doneByDay(ws);
    expect(m.get("2026-11-02")).toBe(1);
    expect(m.get("2026-11-03")).toBe(1);
    expect(doneStreak(m, "2026-11-03")).toBe(2);
    // Today without anything done yet doesn't break the streak.
    expect(doneStreak(m, "2026-11-04")).toBe(2);
    expect(doneStreak(m, "2026-11-05")).toBe(0);
  });

  it("calcula a taxa de hábitos a partir do dia em que cada um foi criado", () => {
    const ws = {
      habits: [
        { id: "h1", created: "2026-11-01" },
        { id: "h2", created: "2026-11-03" },
      ],
      habitLog: { "2026-11-02": ["h1"], "2026-11-03": ["h1", "h2"] },
    } as unknown as Workspace;
    // 11-02: h1 due (done); 11-03: h1 and h2 due (both done) → 3 of 3.
    expect(habitRate(ws, ["2026-11-02", "2026-11-03"])).toBe(1);
    expect(lastDays("2026-11-03", 3)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
});
