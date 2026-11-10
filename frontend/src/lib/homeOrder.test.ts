import { describe, expect, it } from "vitest";
import { template, mkDb, DEFAULT_STATUS } from "./template";
import type { Item } from "./types";
import { homeTasks, saveHomeOrder, moveHomeTask, hasCustomHomeOrder } from "./homeOrder";
import { fromRecords, toEntities } from "./records";
import { normalizeWorkspace } from "./migrate";

const day = "2026-11-07";
function fixture() {
  const ws = template();
  ws.items = {};
  ws.dbs = { a: mkDb(DEFAULT_STATUS), b: mkDb(DEFAULT_STATUS) };
  for (const db of Object.values(ws.dbs)) {
    db.props.find((p) => p.id === "prio")!.options = [
      { id: "high", name: "Alta", color: "red" },
      { id: "low", name: "Baixa", color: "gray" },
    ];
  }
  const add = (id: string, prio?: string, time = "", db = "a", area = "pessoal") => {
    ws.items[id] = {
      id,
      db,
      area,
      title: id,
      props: { date: day + time, ...(prio ? { prio } : {}) },
      notes: "",
      created: 1,
      updated: 1,
      order: 0,
      log: [],
    } satisfies Item;
  };
  add("low", "low", "T08:00");
  add("high", "high", "T15:00", "b");
  add("none");
  return { ws, add };
}
const ids = (items: Item[]) => items.map((it) => it.id);

describe("ordem das tarefas do início", () => {
  it("preserva a ordem ao recarregar e sincronizar sem modificar a ordem nas listas", () => {
    const { ws } = fixture();
    const originalItems = structuredClone(ws.items);
    saveHomeOrder(ws, day, ["none", "low", "high"]);
    const local = normalizeWorkspace(JSON.parse(JSON.stringify(ws)));
    expect(ids(homeTasks(local, day))).toEqual(["none", "low", "high"]);
    const records = [...toEntities(ws).values()].map(({ kind, id, data }) => ({ kind, id, data }));
    const synced = fromRecords(records, ws.settings);
    expect(ids(homeTasks(synced, day))).toEqual(["none", "low", "high"]);
    expect(ws.items).toEqual(originalItems);
  });
  it("prioriza importância entre listas antes do horário e deixa sem prioridade no fim", () => {
    const { ws } = fixture();
    expect(ids(homeTasks(ws, day))).toEqual(["high", "low", "none"]);
  });
  it("desempata por horário e criação com resultado determinístico", () => {
    const { ws, add } = fixture();
    add("earlier", "high", "T09:00");
    add("untimed", "high");
    expect(ids(homeTasks(ws, day))).toEqual(["earlier", "high", "untimed", "low", "none"]);
  });
  it("mantém ordem manual por dia e ordena novas tarefas por prioridade depois dela", () => {
    const { ws, add } = fixture();
    saveHomeOrder(ws, day, ["none", "high", "low"]);
    add("new", "high");
    expect(ids(homeTasks(ws, day))).toEqual(["none", "high", "low", "new"]);
    ws.items.high.props.date = "2026-11-08";
    expect(ids(homeTasks(ws, "2026-11-08"))).toEqual(["high"]);
    delete ws.settings.homeTaskOrder?.[day];
    expect(ids(homeTasks(ws, day))).toEqual(["new", "low", "none"]);
  });
  it("preserva tarefas de áreas ocultas ao salvar a ordem filtrada", () => {
    const { ws } = fixture();
    ws.items.low.area = "trabalho";
    saveHomeOrder(ws, day, ["none", "high"]);
    expect(ids(homeTasks(ws, day))).toEqual(["none", "low", "high"]);
    expect(ids(homeTasks(ws, day, "pessoal"))).toEqual(["none", "high"]);
  });
  it("ignora excluídas, concluídas e tarefas de outros dias", () => {
    const { ws } = fixture();
    const done = ws.dbs.a.props.find((p) => p.type === "status")!.options!.find((o) => o.group === "done")!.id;
    ws.items.low.props.status = done;
    ws.items.none.props.date = "2026-11-08";
    ws.settings.homeTaskOrder = { [day]: ["deleted", "none", "low", "high"] };
    expect(ids(homeTasks(ws, day))).toEqual(["high"]);
  });
  it("move para cima ou para baixo e ignora origens externas", () => {
    expect(moveHomeTask(["a", "b", "c"], "a", "c", true)).toEqual(["b", "c", "a"]);
    expect(moveHomeTask(["a", "b", "c"], "c", "a", false)).toEqual(["c", "a", "b"]);
    expect(moveHomeTask(["a", "b"], "external", "b", true)).toEqual(["a", "b"]);
  });
});

it("prioriza e salva grupos de atrasadas e outras sem alterar o dia", () => {
  const { ws } = fixture();
  ws.items.high.props.date = "2026-11-05";
  ws.items.low.props.date = "2026-11-04";
  expect(ids(homeTasks(ws, day, "all", "overdue"))).toEqual(["high", "low"]);
  saveHomeOrder(ws, day, ["low", "high"], "overdue");
  expect(ids(homeTasks(ws, day, "all", "overdue"))).toEqual(["low", "high"]);
  expect(ids(homeTasks(ws, day))).toEqual(["none"]);
  ws.items.high.props.date = "2026-11-09";
  ws.items.low.props.date = "";
  expect(ids(homeTasks(ws, day, "all", "others"))).toEqual(["high", "low"]);
  saveHomeOrder(ws, day, ["low", "high"], "others");
  expect(ids(homeTasks(ws, day, "all", "others"))).toEqual(["low", "high"]);
});


it("reconhece quando a ordem manual ja corresponde a prioridade", () => {
  const { ws } = fixture();
  expect(hasCustomHomeOrder(ws, day)).toBe(false);
  saveHomeOrder(ws, day, ["low", "high", "none"]);
  expect(hasCustomHomeOrder(ws, day)).toBe(true);
  saveHomeOrder(ws, day, ["high", "low", "none"]);
  expect(hasCustomHomeOrder(ws, day)).toBe(false);
  ws.items.high.props.date = "2026-11-05";
  ws.items.low.props.date = "2026-11-04";
  saveHomeOrder(ws, day, ["low", "high"], "overdue");
  expect(hasCustomHomeOrder(ws, day, "all", "overdue")).toBe(true);
  expect(hasCustomHomeOrder(ws, day, "pessoal", "overdue")).toBe(true);
  ws.items.low.area = "trabalho";
  expect(hasCustomHomeOrder(ws, day, "pessoal", "overdue")).toBe(false);
  saveHomeOrder(ws, day, ["high", "low"], "overdue");
  expect(hasCustomHomeOrder(ws, day, "all", "overdue")).toBe(false);
});
