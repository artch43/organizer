// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CalendarPage } from "./CalendarPage";
import { useStore } from "@/store";
import { template } from "@/lib/template";
import { today } from "@/lib/util";

vi.mock("../app/Topbar", () => ({ AreaSwitcher: () => null }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const ws = template();
  ws.events = {};
  ws.items = {};
  useStore.setState({
    ws,
    ui: {
      ...useStore.getState().ui,
      area: "all",
      calendar: {
        view: "month",
        anchor: "2026-11-09",
        selected: "2026-11-09",
        showTasks: true,
      },
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function clickHeaderArrow(direction: "prev" | "next") {
  // The first pair of chevrons belongs to the main calendar toolbar.
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")].filter((b) =>
    b.querySelector(direction === "prev" ? ".lucide-chevron-left" : ".lucide-chevron-right"),
  );
  expect(buttons.length).toBeGreaterThan(0);
  act(() => buttons[0].click());
}

it.each([
  ["month", "2026-11-09", "next", "2026-11-10"],
  ["month", "2026-11-09", "prev", "2026-11-08"],
  ["month", "2026-01-31", "next", "2026-02-01"],
  ["month", "2027-01-01", "prev", "2026-12-31"],
  ["month", "2028-02-28", "next", "2028-02-29"],
  ["week", "2026-11-15", "next", "2026-11-16"],
  ["week", "2026-11-16", "prev", "2026-11-15"],
] as const)("navega um dia em %s: %s, %s → %s", (view, day, direction, expected) => {
  useStore.setState((s) => ({ ui: { ...s.ui, calendar: { ...s.ui.calendar, view, anchor: day, selected: day } } }));
  act(() => root.render(<CalendarPage />));
  clickHeaderArrow(direction);
  expect(useStore.getState().ui.calendar).toMatchObject({ anchor: expected, selected: expected, view });
  expect(host.querySelector("#day-panel")?.textContent).toBe(
    new Date(expected + "T00:00:00")
      .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
      .replace("-feira", "")
      .replace(/^./, (c) => c.toUpperCase()),
  );
});

it("navega a partir do dia escolhido na grade, mesmo com outra âncora", () => {
  useStore.setState((s) => ({ ui: { ...s.ui, calendar: { ...s.ui.calendar, selected: "2026-11-20" } } }));
  act(() => root.render(<CalendarPage />));
  clickHeaderArrow("next");
  expect(useStore.getState().ui.calendar).toMatchObject({ anchor: "2026-11-21", selected: "2026-11-21" });
});

it("mantém o dia ao mudar a visualização e volta para hoje", () => {
  act(() => root.render(<CalendarPage />));
  clickHeaderArrow("next");
  act(() => host.querySelectorAll<HTMLButtonElement>("[aria-pressed]")[1].click());
  expect(useStore.getState().ui.calendar).toMatchObject({ view: "week", anchor: "2026-11-10", selected: "2026-11-10" });
  act(() => [...host.querySelectorAll("button")].find((b) => b.textContent === "Hoje")!.click());
  expect(useStore.getState().ui.calendar).toMatchObject({ anchor: today(), selected: today() });
});

it.each([
  ["month", "2026-11-09", "next"],
  ["month", "2026-01-31", "next"],
  ["month", "2027-01-01", "prev"],
  ["week", "2026-11-15", "next"],
  ["week", "2026-11-16", "prev"],
] as const)("preserva a grade ao navegar em %s: %s, %s", (view, day, direction) => {
  useStore.setState((s) => ({ ui: { ...s.ui, calendar: { ...s.ui.calendar, view, anchor: day, selected: day } } }));
  act(() => root.render(<CalendarPage />));
  const gridLabel = () =>
    [...host.querySelectorAll("div")].find((el) => el.textContent === (view === "month" ? "seg" : "dia todo"));
  const before = gridLabel();
  expect(before).toBeDefined();
  clickHeaderArrow(direction);
  expect(gridLabel()).toBe(before);
});
