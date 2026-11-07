import { describe, expect, it } from "vitest";
import { alertLabel, eventsByDay, monthGrid, occurrences, remindersFor, startOf, taskAlertSource, weekOf } from "./events";
import type { CalendarEvent, Item, Workspace } from "./types";

const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e1",
  title: "Dentista",
  date: "2026-10-30",
  allDay: false,
  start: "15:00",
  end: "16:00",
  location: "",
  notes: "",
  alerts: [],
  created: 0,
  updated: 0,
  ...p,
});

describe("eventos e alertas", () => {
  it("calcula o horário de cada alerta no fuso do navegador", () => {
    const rows = remindersFor(ev({ alerts: [30, 0, 1440] }), new Date(2026, 9, 28, 10, 0));
    expect(
      rows.map((r) => new Date(r.send_at).toLocaleString("pt-BR", { day: "2-digit", hour: "2-digit", minute: "2-digit" })),
    ).toEqual(["29, 15:00", "30, 14:30", "30, 15:00"]);
    expect(rows[0].when_label).toBe("sexta-feira, 30 de outubro às 15:00");
  });

  it("usa 9:00 como referência para eventos de dia inteiro", () => {
    const rows = remindersFor(ev({ allDay: true, alerts: [60] }), new Date(2026, 9, 28));
    expect(new Date(rows[0].send_at).getHours()).toBe(8);
    expect(rows[0].when_label).toContain("dia inteiro");
  });

  it("ignora alertas que já passaram e alertas repetidos", () => {
    const rows = remindersFor(ev({ alerts: [10080, 30, 30] }), new Date(2026, 9, 28, 10, 0));
    expect(rows).toHaveLength(1);
  });

  it("descreve alertas personalizados", () => {
    expect(alertLabel(30)).toBe("30 min antes");
    expect(alertLabel(2880)).toBe("2 dias antes");
    expect(alertLabel(120)).toBe("2 horas antes");
    expect(alertLabel(45)).toBe("45 min antes");
  });

  it("agrupa por dia, respeita a área e ordena pelo horário", () => {
    const ws = {
      events: {
        a: ev({ id: "a", start: "18:00", area: "pessoal" }),
        b: ev({ id: "b", start: "08:00", area: "pessoal" }),
        c: ev({ id: "c", allDay: true, area: "profissional" }),
        d: ev({ id: "d", date: "2026-12-01" }),
      },
    } as unknown as Workspace;
    expect(eventsByDay(ws, "2026-10-01", "2026-10-31")["2026-10-30"].map((e) => e.id)).toEqual(["c", "b", "a"]);
    expect(eventsByDay(ws, "2026-10-01", "2026-10-31", "pessoal")["2026-10-30"].map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("monta a semana e o mês começando na segunda", () => {
    expect(weekOf("2026-10-28")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    // A Sunday belongs to the week that started on the Monday before it.
    expect(weekOf("2026-11-01")[0]).toBe("2026-10-26");
    const m = monthGrid("2026-10-15");
    expect(m[0]).toBe("2026-09-28");
    expect(m.length % 7).toBe(0);
    // Sunday first is still available.
    expect(weekOf("2026-10-28", 0)[0]).toBe("2026-10-25");
    expect(monthGrid("2026-10-15", 0)[0]).toBe("2026-09-27");
    expect(startOf(ev({})).getHours()).toBe(15);
  });
});

describe("eventos que se repetem", () => {
  const base = { date: "2026-10-28" } as const; // quarta-feira
  it("toda semana, no mesmo dia da semana", () => {
    expect(occurrences({ ...base, repeat: "weekly" }, "2026-10-01", "2026-11-20")).toEqual([
      "2026-10-28",
      "2026-11-04",
      "2026-11-11",
      "2026-11-18",
    ]);
  });
  it("dias úteis pulam sábado e domingo", () => {
    expect(occurrences({ ...base, repeat: "weekdays" }, "2026-10-29", "2026-11-03")).toEqual([
      "2026-10-29",
      "2026-10-30",
      "2026-11-02",
      "2026-11-03",
    ]);
  });
  it("todo mês pula meses sem aquele dia e respeita o fim da série", () => {
    expect(occurrences({ date: "2026-01-31", repeat: "monthly", repeatUntil: "2026-06-30" }, "2026-01-01", "2026-12-31")).toEqual(
      ["2026-01-31", "2026-03-31", "2026-05-31"],
    );
  });
  it("aparece em cada dia no calendário", () => {
    const ws = {
      events: { a: ev({ id: "a", date: "2026-10-26", repeat: "daily", repeatUntil: "2026-10-28" }) },
    } as unknown as Workspace;
    expect(Object.keys(eventsByDay(ws, "2026-10-01", "2026-10-31"))).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
  });
  it("agenda lembretes das próximas ocorrências", () => {
    const rows = remindersFor(
      ev({ date: "2026-10-01", start: "08:00", repeat: "weekly", alerts: [60] }),
      new Date(2026, 9, 28, 10, 0),
    );
    expect(rows[0].when_label).toBe("quinta-feira, 29 de outubro às 08:00");
    expect(rows.length).toBe(5);
  });
});

describe("alertas de tarefas", () => {
  it("usam a data e o horário da tarefa e nunca alertam tarefas concluídas", () => {
    const it0 = { id: "t", title: "Prova", props: { date: "2026-10-30 10:00" }, alerts: [1440] } as unknown as Item;
    const src = taskAlertSource(it0, false)!;
    expect(src).toMatchObject({ date: "2026-10-30", start: "10:00", allDay: false });
    expect(remindersFor(src, new Date(2026, 9, 28)).length).toBe(1);
    expect(taskAlertSource(it0, true)).toBeNull();
    expect(taskAlertSource({ ...it0, props: {} } as Item, false)).toBeNull();
  });
});
