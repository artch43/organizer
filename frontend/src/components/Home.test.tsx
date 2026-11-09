// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Home } from "./Home";
import { useStore } from "@/store";
import { DEFAULT_STATUS, mkDb, template } from "@/lib/template";
import { addDays, today } from "@/lib/util";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("./app/Topbar", () => ({ AreaSwitcher: () => null }));
vi.mock("./app/AppHeader", () => ({ useNow: () => Date.now() }));
vi.mock("./HomeSummary", () => ({ HomeSummary: () => null }));

let host: HTMLDivElement;
let root: Root;
const T = today();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(toast).mockClear();
  const ws = template();
  ws.items = {};
  ws.dbs = { tasks: mkDb(DEFAULT_STATUS) };
  ws.settings.examplesDismissed = true;
  const done = ws.dbs.tasks.props[0].options!.find((o) => o.group === "done")!.id;
  for (const [id, date, area, status] of [
    ["late", addDays(T, -1) + "T09:30", "pessoal", ""],
    ["older", addDays(T, -3), "pessoal", ""],
    ["hidden", addDays(T, -1), "estudos", ""],
    ["done", addDays(T, -1), "pessoal", done],
    ["today", T, "pessoal", ""],
    ["future", addDays(T, 2), "pessoal", ""],
  ]) {
    ws.items[id] = { id, db: "tasks", title: id, area, props: { date, status }, notes: "", created: 1, updated: 1, order: 0, log: [] };
  }
  useStore.setState({ ws, ui: { ...useStore.getState().ui, area: "pessoal" } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it.each([
  ["Hoje", T],
  ["Amanhã", addDays(T, 1)],
  ["Daqui a uma semana", addDays(T, 7)],
  ["Tirar a data", null],
])("remarca todas as atrasadas visíveis para %s preservando horários e outras tarefas", async (label, date) => {
  act(() => root.render(<Home />));
  const before = structuredClone(useStore.getState().ws.items);
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Remarcar todas"));
  expect(button).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  const options = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  expect(options.map((o) => o.textContent)).toEqual(["Hoje", "Amanhã", "Daqui a uma semana", "Tirar a data"]);
  await act(async () => options.find((o) => o.textContent === label)!.click());
  const items = useStore.getState().ws.items;
  expect(items.late.props.date).toBe(date ? date + "T09:30" : undefined);
  expect(items.older.props.date).toBe(date ?? undefined);
  for (const id of ["hidden", "done", "today", "future"]) expect(items[id]).toEqual(before[id]);
  expect(host.textContent).not.toContain("Remarcar todas");
  expect(toast).toHaveBeenCalledTimes(1);
  const undo = vi.mocked(toast).mock.calls[0][1]!.action as unknown as { onClick: () => void };
  act(() => undo.onClick());
  expect(useStore.getState().ws.items.late.props.date).toBe(before.late.props.date);
  expect(useStore.getState().ws.items.older.props.date).toBe(before.older.props.date);
  expect(host.textContent).toContain("Remarcar todas");
});

it("não exibe a ação coletiva sem tarefas atrasadas", () => {
  useStore.getState().mut((ws) => { delete ws.items.late; delete ws.items.older; });
  act(() => root.render(<Home />));
  expect(host.textContent).not.toContain("Remarcar todas");
});
