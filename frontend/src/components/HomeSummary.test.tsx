// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeSummary, summaryOrder } from "./HomeSummary";
import { template } from "@/lib/template";
import { normalizeWorkspace } from "@/lib/migrate";
import { fromRecords, toEntities } from "@/lib/records";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Fixture() {
  const [order, setOrder] = useState<string[]>([]);
  return <HomeSummary order={order} onReorder={setOrder} sections={[
    { id: "alarm", title: "E-mail", content: <section>E-mail<button>Abrir</button></section> },
    { id: "habits", title: "Hábitos", content: <section>Hábitos</section> },
    { id: "agenda", title: "Agenda", content: <section>Agenda</section> },
  ]} />;
}
const blocks = () => [...host.querySelectorAll<HTMLElement>("[draggable]")];
const order = () => blocks().map((el) => el.getAttribute("aria-label"));
function drag(type: string, el: Element, y = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y });
  Object.defineProperty(event, "dataTransfer", { value: { setData: vi.fn(), effectAllowed: "", dropEffect: "" } });
  act(() => el.dispatchEvent(event));
}
it("arrasta o bloco inteiro nas duas direções sem adicionar botões", () => {
  act(() => root.render(<Fixture />));
  expect(host.querySelectorAll("button")).toHaveLength(1);
  drag("dragstart", blocks()[0]);
  drag("drop", blocks()[2], 10);
  expect(order()).toEqual(["Hábitos", "Agenda", "E-mail"]);
  drag("dragstart", blocks()[2]);
  drag("drop", blocks()[0]);
  expect(order()).toEqual(["E-mail", "Hábitos", "Agenda"]);
});
it("ignora arrastes externos, cancelados e iniciados em controles", () => {
  act(() => root.render(<Fixture />));
  drag("drop", blocks()[2], 10);
  drag("dragstart", host.querySelector("button")!);
  drag("drop", blocks()[2], 10);
  drag("dragstart", blocks()[0]);
  drag("dragend", blocks()[0]);
  drag("drop", blocks()[2], 10);
  expect(order()).toEqual(["E-mail", "Hábitos", "Agenda"]);
});
it("move para baixo ao soltar na metade superior do próximo bloco e para cima na metade inferior", () => {
  act(() => root.render(<Fixture />));
  const habits = blocks()[1];
  vi.spyOn(habits, "getBoundingClientRect").mockReturnValue({ top: 100, height: 300 } as DOMRect);
  drag("dragstart", blocks()[0]);
  drag("dragover", habits, 110);
  drag("drop", habits, 110);
  expect(order()).toEqual(["Hábitos", "E-mail", "Agenda"]);
  drag("dragstart", blocks()[1]);
  drag("dragover", habits, 390);
  drag("drop", habits, 390);
  expect(order()).toEqual(["E-mail", "Hábitos", "Agenda"]);
});
it("permite reordenar pelo teclado mantendo o foco", () => {
  act(() => root.render(<Fixture />));
  const first = blocks()[0];
  first.focus();
  act(() => first.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, altKey: true, key: "ArrowDown" })));
  expect(order()).toEqual(["Hábitos", "E-mail", "Agenda"]);
  expect(document.activeElement).toBe(first);
});
it("restaura a ordem salva e recupera seções ausentes ou desconhecidas", () => {
  expect(summaryOrder(JSON.parse('["agenda","alarm","habits"]'))).toEqual(["agenda", "alarm", "habits"]);
  expect(summaryOrder(["agenda", "agenda", "removed"])).toEqual(["agenda", "alarm", "habits"]);
});
it("preserva a preferência ao recarregar e sincronizar o workspace", () => {
  const ws = template();
  ws.settings.homeSectionOrder = ["agenda", "habits", "alarm"];
  const restored = normalizeWorkspace(JSON.parse(JSON.stringify(ws)));
  expect(summaryOrder(restored.settings.homeSectionOrder)).toEqual(ws.settings.homeSectionOrder);
  const records = [...toEntities(ws).values()].map(({ kind, id, data }) => ({ kind, id, data }));
  expect(summaryOrder(fromRecords(records, ws.settings).settings.homeSectionOrder)).toEqual(ws.settings.homeSectionOrder);
});
