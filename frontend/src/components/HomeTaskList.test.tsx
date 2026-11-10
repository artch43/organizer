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
      renderRow={(item, _, { attributes }) => (
        <li key={item.key} {...attributes}>
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
  drag("dragstart", host.querySelector("li")!);
  drag("dragover", host.querySelectorAll("li")[2], 10);
  drag("drop", host.querySelectorAll("li")[2], 10);
  expect(order()).toEqual(["Média", "Baixa", "Alta"]);
  expect(host.querySelector('[role="status"]')?.textContent).toContain("posição 3 de 3");
  drag("dragstart", host.querySelectorAll("li")[2]);
  drag("drop", host.querySelectorAll("li")[0]);
  expect(order()).toEqual(["Alta", "Média", "Baixa"]);
});

it("oferece reordenação por teclado e preserva foco e limites", () => {
  act(() => root.render(<Fixture />));
  const button = host.querySelector<HTMLLIElement>("li")!;
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
  drag("dragstart", host.querySelector("li")!);
  drag("dragend", host.querySelector("li")!);
  drag("drop", host.querySelectorAll("li")[2], 10);
  expect(order()).toEqual(["Alta", "Média", "Baixa"]);
});

 it("arrasta pela caixa inteira", () => {
  act(() => root.render(<Fixture />));
  expect(host.querySelector("li")!.draggable).toBe(true);
  drag("dragstart", host.querySelector("li")!);
  drag("drop", host.querySelectorAll("li")[2], 10);
  expect(order()[2]).toBe("Alta");
});

it("preserva cliques e bloqueia arraste nos botoes de acao", () => {
  const click = vi.fn();
  const reorder = vi.fn();
  act(() => root.render(<HomeTaskList items={[{key: "a", title: "A"}, {key: "b", title: "B"}]} onReorder={reorder}
    renderRow={(item, _, {attributes}) => <li key={item.key} {...attributes}><button onClick={click}>Concluir</button><button data-home-drag-surface onClick={click}>Abrir</button></li>} />));
  const buttons = host.querySelectorAll("button");
  act(() => buttons[0].click());
  act(() => buttons[1].click());
  expect(click).toHaveBeenCalledTimes(2);
  drag("dragstart", buttons[0]);
  drag("drop", host.querySelectorAll("li")[1], 10);
  expect(reorder).not.toHaveBeenCalled();
  drag("dragstart", buttons[1]);
  drag("drop", host.querySelectorAll("li")[1], 10);
  expect(reorder).toHaveBeenCalledWith(["b", "a"]);
});


it("reordena ao entrar na borda da tarefa vizinha sem cruzar a metade", () => {
  act(() => root.render(<Fixture />));
  const neighbor = host.querySelectorAll("li")[1];
  vi.spyOn(neighbor, "getBoundingClientRect").mockReturnValue({ top: 100, height: 100 } as DOMRect);
  drag("dragstart", host.querySelectorAll("li")[0]);
  drag("dragover", neighbor, 101);
  expect((neighbor as HTMLElement).style.borderBottomWidth).toBe("3px");
  drag("drop", neighbor, 101);
  expect(order()[1]).toBe("Alta");

  const above = host.querySelectorAll("li")[0];
  vi.spyOn(above, "getBoundingClientRect").mockReturnValue({ top: 0, height: 100 } as DOMRect);
  drag("dragstart", host.querySelectorAll("li")[1]);
  drag("dragover", above, 99);
  expect((above as HTMLElement).style.borderTopWidth).toBe("3px");
  drag("drop", above, 99);
  expect(order()[0]).toBe("Alta");
});
