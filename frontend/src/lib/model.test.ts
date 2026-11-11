import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleWorkspace as template } from "./sampleWorkspace";
import { applyFilters, applyStatusChange, firstDoneOf, groupOf, runReviews, statusProp, streakOf } from "./model";
import { addDays, today } from "./util";
import type { Item, Workspace } from "./types";

let ws: Workspace;
const find = (title: string) => Object.values(ws.items).find((i) => i.title === title)!;
const optId = (dbId: string, group: string) => statusProp(ws.dbs[dbId])!.options!.find((o) => o.group === group)!.id;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 27, 10, 0));
  ws = template();
});
afterEach(() => vi.useRealTimers());

describe("revisão espaçada", () => {
  it("agenda a primeira revisão para o dia seguinte ao concluir", () => {
    const it0 = find("Revolução Francesa");
    const db = ws.dbs.estudos;
    const old = it0.props.status;
    it0.props.status = optId("estudos", "done");
    applyStatusChange(it0, db, old, it0.props.status);
    expect(it0.review).toEqual({ stage: 0, next: "2026-10-28" });
  });

  it("avança o estágio ao concluir uma revisão (1 → 7 → 30 dias) e depois encerra", () => {
    const it0 = find("Logaritmos"); // está em Revisar, estágio 1
    const db = ws.dbs.estudos;
    const done = optId("estudos", "done"),
      review = optId("estudos", "review");
    applyStatusChange(it0, db, review, done);
    expect(it0.review).toEqual({ stage: 2, next: addDays(today(), 30) });
    applyStatusChange(it0, db, review, done);
    expect(it0.review).toMatchObject({ finished: true, next: null });
  });

  it("não agenda revisões quando o banco não tem revisão espaçada", () => {
    const it0 = find("Relatório mensal");
    applyStatusChange(it0, ws.dbs.trabalho, it0.props.status, optId("trabalho", "done"));
    expect(it0.review).toBeUndefined();
  });

  it("devolve para Revisar quando a data chega", () => {
    const it0 = find("Concordância verbal"); // Estudado, revisão amanhã
    runReviews(ws);
    expect(groupOf(ws.dbs.estudos, it0)).toBe("done");
    vi.setSystemTime(new Date(2026, 9, 28, 9, 0));
    runReviews(ws);
    expect(groupOf(ws.dbs.estudos, it0)).toBe("review");
  });

  it("registra o histórico de status", () => {
    const it0: Item = find("Revolução Francesa");
    applyStatusChange(it0, ws.dbs.estudos, it0.props.status, optId("estudos", "doing"));
    expect(it0.log.at(-1)).toMatchObject({ g: "doing" });
  });
});

describe("filtros e ordenação", () => {
  const view = () => structuredClone(ws.dbs.estudos.views[0]);

  it("filtra por status", () => {
    const v = { ...view(), filters: [{ prop: "status", op: "is" as const, val: optId("estudos", "doing") }] };
    expect(applyFilters(ws, "estudos", v, "").map((i) => i.title)).toEqual(["Funções do 2º grau"]);
  });

  it("dois status no filtro mostram os dois (não se anulam)", () => {
    const v = {
      ...view(),
      filters: [
        { prop: "status", op: "is" as const, val: optId("estudos", "doing") },
        { prop: "status", op: "is" as const, val: optId("estudos", "review") },
      ],
    };
    expect(
      applyFilters(ws, "estudos", v, "")
        .map((i) => i.title)
        .sort(),
    ).toEqual(["Funções do 2º grau", "Logaritmos"]);
  });

  it("filtra datas atrasadas ignorando concluídos", () => {
    find("Revolução Francesa").props.date = "2026-10-20";
    const v = { ...view(), filters: [{ prop: "date", op: "is" as const, val: "overdue" }] };
    expect(applyFilters(ws, "estudos", v, "").map((i) => i.title)).toEqual(["Revolução Francesa"]);
  });

  it("busca pelo título sem diferenciar maiúsculas", () => {
    expect(applyFilters(ws, "estudos", view(), "LOGA").map((i) => i.title)).toEqual(["Logaritmos"]);
  });

  it("ordena sozinho por prazo e, no mesmo dia, por prioridade; sem prazo vai para o fim", () => {
    const db = ws.dbs.estudos;
    const prio = (n: string) => db.props.find((p) => p.id === "prio")!.options!.find((o) => o.name === n)!.id;
    const set = (t: string, date: string | undefined, p?: string) => {
      const it = find(t);
      if (date) it.props.date = date;
      else delete it.props.date;
      if (p) it.props.prio = prio(p);
      else delete it.props.prio;
    };
    set("Logaritmos", "2026-10-30", "Baixa");
    set("Revolução Francesa", "2026-10-30T09:00", "Alta");
    set("Funções do 2º grau", "2026-10-28");
    set("Concordância verbal", undefined, "Alta");
    const v = { ...view(), sort: undefined };
    expect(applyFilters(ws, "estudos", v, "").map((i) => i.title)).toEqual([
      "Funções do 2º grau",
      "Revolução Francesa",
      "Logaritmos",
      "Concordância verbal",
    ]);
    // Arranged by hand (null): the cards keep the order they were placed in.
    const manual = applyFilters(ws, "estudos", { ...v, sort: null }, "");
    expect(manual.map((i) => i.order)).toEqual([...manual.map((i) => i.order)].sort((a, b) => a - b));
  });

  it("ordena só pelo prazo pela hora, com os dois formatos salvos (espaço ou T) e sem prazo no fim", () => {
    find("Logaritmos").props.date = "2026-10-30 14:00";
    find("Revolução Francesa").props.date = "2026-10-30T09:00";
    find("Funções do 2º grau").props.date = "2026-10-30T16:00";
    delete find("Concordância verbal").props.date;
    const v = { ...view(), sort: { prop: "date", dir: "asc" as const } };
    expect(applyFilters(ws, "estudos", v, "").map((i) => i.title)).toEqual([
      "Revolução Francesa",
      "Logaritmos",
      "Funções do 2º grau",
      "Concordância verbal",
    ]);
  });

  it("ordena por nome", () => {
    const v = { ...view(), sort: { prop: "title", dir: "asc" as const } };
    expect(applyFilters(ws, "estudos", v, "").map((i) => i.title)).toEqual([
      "Concordância verbal",
      "Funções do 2º grau",
      "Logaritmos",
      "Revolução Francesa",
    ]);
  });
});

describe("sequência de hábitos", () => {
  it("conta dias seguidos até hoje", () => {
    const log = { "2026-10-25": ["h"], "2026-10-26": ["h"], "2026-10-27": ["h"] };
    expect(streakOf(log, "h")).toBe(3);
  });
  it("continua valendo se hoje ainda não foi marcado", () => {
    expect(streakOf({ "2026-10-25": ["h"], "2026-10-26": ["h"] }, "h")).toBe(2);
  });
  it("zera quando houve um dia sem marcar", () => {
    expect(streakOf({ "2026-10-24": ["h"], "2026-10-25": ["h"] }, "h")).toBe(0);
  });
  it("não depende da ordem em que os dias foram marcados", () => {
    const log = { "2026-10-27": ["h"], "2026-10-25": ["h"], "2026-10-26": ["h"] };
    expect(streakOf(log, "h")).toBe(3);
  });
  it("conta só a partir do último buraco", () => {
    const log = { "2026-10-22": ["h"], "2026-10-23": ["h"], "2026-10-25": ["h"], "2026-10-26": ["h"], "2026-10-27": ["h"] };
    expect(streakOf(log, "h")).toBe(3);
  });
  it("acha o primeiro dia marcado (antes dele os dias ficam cinza)", () => {
    expect(firstDoneOf({ "2026-10-26": ["h"], "2026-10-20": ["outro", "h"], "2026-10-22": ["outro"] }, "h")).toBe("2026-10-20");
    expect(firstDoneOf({ "2026-10-26": ["outro"] }, "h")).toBeNull();
  });
  it("ignora os outros hábitos do mesmo dia", () => {
    expect(streakOf({ "2026-10-26": ["outro"], "2026-10-27": ["h", "outro"] }, "h")).toBe(1);
  });
});

describe("áreas", () => {
  it("filtra as tarefas pela área escolhida no topo", () => {
    const w = template();
    const v = w.dbs.trabalho.views[0];
    expect(applyFilters(w, "trabalho", v, "", "profissional").length).toBe(2);
    expect(applyFilters(w, "trabalho", v, "", "pessoal").length).toBe(0);
    expect(applyFilters(w, "trabalho", v, "", "all").length).toBe(2);
  });
});

describe("telefone do WhatsApp", () => {
  it("aceita número brasileiro com ou sem DDI e com máscara", async () => {
    const { normalizePhone, formatPhone } = await import("./util");
    expect(normalizePhone("(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizePhone("+55 11 98765 4321")).toBe("+5511987654321");
    expect(normalizePhone("+1 415 523 8886")).toBe("+14155238886");
    expect(normalizePhone("1234")).toBe("");
    expect(formatPhone("+5511987654321")).toBe("+55 11 98765-4321");
  });
});
