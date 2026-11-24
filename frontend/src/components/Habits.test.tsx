// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { template } from "@/lib/template";
import { DEFAULT_HABIT_ICON, addDays, today } from "@/lib/util";
import { useStore } from "@/store";
import { Habits } from "./Habits";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const ws = template();
  ws.habits = [];
  ws.habitLog = {};
  useStore.setState({ ws });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function clickButton(label: string) {
  const button = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
  expect(button, `Botão ${label}`).toBeDefined();
  act(() => button!.click());
  return button;
}

it("abre as estatísticas, altera o intervalo consultado e devolve o foco ao voltar aos hábitos", () => {
  const day = today();
  const ws = useStore.getState().ws;
  useStore.setState({
    ws: {
      ...ws,
      habits: [{ id: "reading", name: "Ler", icon: DEFAULT_HABIT_ICON, created: addDays(day, -40) }],
      habitLog: { [addDays(day, -10)]: ["reading"], [addDays(day, -1)]: ["reading"] },
    },
  });

  act(() => root.render(<Habits />));
  clickButton("Estatísticas");
  expect(host.querySelector("h1")?.textContent).toBe("Estatísticas de hábitos");
  expect(document.activeElement).toBe(host.querySelector("h1"));
  expect(host.textContent).toContain("2 de 30 marcações");

  expect(clickButton("7 dias")?.getAttribute("aria-pressed")).toBe("true");
  expect(host.textContent).toContain("1 de 7 marcações");
  expect(host.textContent).not.toContain("2 de 30 marcações");

  clickButton("Voltar para hábitos");
  expect(host.querySelector("h1")?.textContent).toBe("Hábitos");
  expect(document.activeElement?.textContent).toBe("Estatísticas");
});

it("aplica um intervalo personalizado, incluindo a data final", () => {
  const day = today();
  const start = addDays(day, -8);
  const end = addDays(day, -6);
  const ws = useStore.getState().ws;
  useStore.setState({
    ws: {
      ...ws,
      habits: [{ id: "reading", name: "Ler", icon: DEFAULT_HABIT_ICON, created: start }],
      habitLog: { [end]: ["reading"], [day]: ["reading"] },
    },
  });

  act(() => root.render(<Habits />));
  clickButton("Estatísticas");
  clickButton("Escolher período");
  const picker = document.querySelector('[aria-label="Período personalizado"]');
  const fields = picker!.querySelectorAll<HTMLInputElement>('input[type="date"]');
  const setDate = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  for (const [index, value] of [start, end].entries()) {
    act(() => {
      setDate.call(fields[index], value);
      fields[index].dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  act(() => picker!.querySelector("button")!.click());
  expect(host.textContent).toContain("1 de 3 dias");
  clickButton("7 dias");
  expect(host.textContent).toContain("2 de 7 dias");
});

it("mostra o progresso de cada hábito e abre somente os detalhes do hábito escolhido", () => {
  const day = today();
  const yesterday = addDays(day, -1);
  const oldMark = addDays(day, -8);
  const ws = useStore.getState().ws;
  useStore.setState({
    ws: {
      ...ws,
      habits: [
        { id: "reading", name: "Ler", icon: DEFAULT_HABIT_ICON, created: addDays(day, -14) },
        { id: "walking", name: "Caminhar", icon: DEFAULT_HABIT_ICON, created: yesterday },
        { id: "sleep", name: "Dormir cedo", icon: DEFAULT_HABIT_ICON },
      ],
      habitLog: { [day]: ["reading"], [yesterday]: ["walking"], [oldMark]: ["reading"] },
    },
  });

  act(() => root.render(<Habits />));
  clickButton("Estatísticas");
  clickButton("7 dias");
  const report = host.querySelector('[aria-labelledby="habit-breakdown"]');
  const habitButton = (name: string) =>
    [...(report?.querySelectorAll<HTMLButtonElement>("button[aria-expanded]") ?? [])].find((button) =>
      button.textContent?.includes(name),
    );
  const reading = habitButton("Ler");
  const walking = habitButton("Caminhar");
  expect(reading?.textContent).toContain("1 de 7 dias");
  expect(walking?.textContent).toContain("1 de 2 dias");
  expect(report?.textContent).toContain("Dormir cedo");
  expect(report?.textContent).toContain("Sem dados no período");
  expect(reading?.getAttribute("aria-expanded")).toBe("false");

  const details = (button: HTMLButtonElement | undefined) => document.getElementById(button?.getAttribute("aria-controls") ?? "");
  act(() => reading?.click());
  expect(details(reading)?.textContent).toContain("14%");
  expect([...details(reading)!.querySelectorAll("time")].map(({ dateTime }) => dateTime)).toEqual([day]);
  act(() => walking?.click());
  expect(details(reading)?.hidden).toBe(true);
  expect(details(walking)?.textContent).toContain("Sem dados para comparar");
  expect([...details(walking)!.querySelectorAll("time")].map(({ dateTime }) => dateTime)).toEqual([yesterday]);
});

it("oferece a criação de um hábito quando as estatísticas estão vazias e preserva o rascunho ao consultar o painel", () => {
  act(() => root.render(<Habits />));
  clickButton("Estatísticas");
  expect(host.querySelector("h1")?.textContent).toBe("Estatísticas de hábitos");

  clickButton("Criar hábito");
  expect(host.querySelector("h1")?.textContent).toBe("Hábitos");
  const input = host.querySelector<HTMLInputElement>("form input");
  expect(input).toBe(document.activeElement);

  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Estudar");
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  clickButton("Estatísticas");
  clickButton("Voltar para hábitos");
  expect(host.querySelector<HTMLInputElement>("form input")?.value).toBe("Estudar");
});
