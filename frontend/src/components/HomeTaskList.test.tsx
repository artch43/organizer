// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeTaskList } from "./HomeTaskList";

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
  const [keys, setKeys] = useState(["Alta", "Média", "Baixa"]);
  return (
    <HomeTaskList
      items={keys.map((key) => ({ key, title: key }))}
      onReorder={setKeys}
      renderRow={(item, _, { attributes, handle }) => (
        <li key={item.key} {...attributes}>
          {handle}
          {item.title}
        </li>
      )}
    />
  );
}
const order = () => [...host.querySelectorAll("li")].map((li) => li.textContent);
function drag(type: string, element: Element, y = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y });
  Object.defineProperty(event, "dataTransfer", { value: { setData: vi.fn(), effectAllowed: "", dropEffect: "" } });
  act(() => element.dispatchEvent(event));
}

it("permite arrastar para baixo e para cima e anuncia a nova posição", () => {
  act(() => root.render(<Fixture />));
  drag("dragstart", host.querySelector("button")!);
  drag("dragover", host.querySelectorAll("li")[2], 10);
  drag("drop", host.querySelectorAll("li")[2], 10);
  expect(order()).toEqual(["Média", "Baixa", "Alta"]);
  expect(host.querySelector('[role="status"]')?.textContent).toContain("posição 3 de 3");
  drag("dragstart", host.querySelectorAll("button")[2]);
  drag("drop", host.querySelectorAll("li")[0]);
  expect(order()).toEqual(["Alta", "Média", "Baixa"]);
});

it("oferece reordenação por teclado e preserva foco e limites", () => {
  act(() => root.render(<Fixture />));
  const button = host.querySelector<HTMLButtonElement>("button")!;
  button.focus();
  act(() => button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, altKey: true, key: "ArrowUp" })));
  expect(order()).toEqual(["Alta", "Média", "Baixa"]);
  act(() => button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, altKey: true, key: "ArrowDown" })));
  expect(order()).toEqual(["Média", "Alta", "Baixa"]);
  expect(document.activeElement).toBe(button);
});

it("ignora drops externos e arrastes cancelados", () => {
  act(() => root.render(<Fixture />));
  drag("drop", host.querySelectorAll("li")[2], 10);
  drag("dragstart", host.querySelector("button")!);
  drag("dragend", host.querySelector("button")!);
  drag("drop", host.querySelectorAll("li")[2], 10);
  expect(order()).toEqual(["Alta", "Média", "Baixa"]);
});
