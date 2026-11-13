import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addBoardFolder, useStore } from "@/store";
import { TOUR_BEATS, TOUR_PAGES, advanceTour, currentBeat, endTour, startTour, useTour } from "./tour";

const at = () => useTour.getState().at;

describe("tour do Clebinho", () => {
  beforeEach(() => useTour.setState({ at: null, settling: false }));
  afterEach(() => vi.useRealTimers());

  it("começa na primeira fala, sem nada destacado", () => {
    startTour();
    expect(at()).toBe(0);
    expect(currentBeat(at())!.target).toBeUndefined();
  });

  it("passa pelas cinco páginas na ordem, abrindo cada uma pela sua aba", () => {
    const tabs = TOUR_BEATS.filter((b, i) => TOUR_BEATS[i + 1] && TOUR_BEATS[i + 1].page !== b.page).map((b) => [b.on, b.target]);
    expect(tabs).toEqual([
      ["click", '[data-tour="lists"]'],
      ["click", '[data-tour="cal"]'],
      ["click", '[data-tour="habits"]'],
      ["click", '[data-tour="notes"]'],
    ]);
    expect(new Set(TOUR_BEATS.map((b) => b.page)).size).toBe(TOUR_PAGES);
  });

  it("no Início pede concluir uma atrasada, uma de hoje e ir para amanhã, nessa ordem", () => {
    const steps = TOUR_BEATS.filter((b) => b.page === 0 && b.on === "click").map((b) => b.target);
    expect(steps).toEqual([
      '[data-tour="home-overdue"] [role="checkbox"]',
      '[data-tour="home-today"] [role="checkbox"]',
      'button[aria-label="Próximo dia"]',
      '[data-tour="lists"]',
    ]);
  });

  it("nas Listas pede pasta, lista e arraste, nessa ordem", () => {
    const tasks = TOUR_BEATS.filter((b) => b.page === 1 && b.on === "done").map((b) => b.target);
    expect(tasks).toEqual(['button[aria-label="Criar nova pasta"]', 'button[aria-label="Criar nova lista"]', '[data-tour="board"]']);
  });

  it("toda fala tem como seguir: um alvo, o Continuar ou o fim", () => {
    for (const b of TOUR_BEATS) {
      if (b.on === "click" || b.on === "done") expect(b.target).toBeTruthy();
      if (b.on === "done") expect(b.watch).toBeTypeOf("function");
    }
    expect(TOUR_BEATS.at(-1)!.on).toBe("end");
    expect(TOUR_BEATS.filter((b) => b.on === "end")).toHaveLength(1);
  });

  it("entre duas falas espera a página parar: um segundo clique no meio não pula uma fala", () => {
    vi.useFakeTimers();
    startTour();
    advanceTour();
    advanceTour();
    expect(at()).toBe(0);
    expect(useTour.getState().settling).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(at()).toBe(1);
    expect(useTour.getState().settling).toBe(false);
  });

  it("pede uma pasta só: criar uma com nome que já existe também conta", () => {
    vi.useFakeTimers();
    const folder = TOUR_BEATS.findIndex((b) => b.target === 'button[aria-label="Criar nova pasta"]');
    useTour.setState({ at: folder, settling: false });
    addBoardFolder("Faculdade");
    vi.advanceTimersByTime(2000);
    expect(at()).toBe(folder + 1);
    // Again, with the same name (nothing changes in the workspace): still only one folder asked for.
    useTour.setState({ at: folder, settling: false });
    addBoardFolder("Faculdade");
    vi.advanceTimersByTime(2000);
    expect(at()).toBe(folder + 1);
  });

  it("recomeçar no meio de uma espera não pula a primeira fala", () => {
    vi.useFakeTimers();
    startTour();
    advanceTour();
    endTour();
    startTour();
    vi.advanceTimersByTime(2000);
    expect(at()).toBe(0);
    expect(useTour.getState().settling).toBe(false);
  });

  it("ao terminar ou pular, apaga os exemplos que deixou; um que ganhou outro nome fica", () => {
    vi.useFakeTimers();
    const titles = () => Object.values(useStore.getState().ws.items).map((i) => i.title);
    // Starting also clears what a tour cut short left behind (earlier tests): count from here.
    startTour();
    const before = titles().length;
    advanceTour();
    vi.advanceTimersByTime(2000);
    const made = titles().filter((t) => t.includes("(exemplo)"));
    if (!made.length) return; // no list with dates in this workspace: nothing was left
    expect(titles().length).toBe(before + made.length);
    endTour();
    expect(titles().length).toBe(before);

    startTour();
    advanceTour();
    vi.advanceTimersByTime(2000);
    const mine = Object.values(useStore.getState().ws.items).find((i) => i.title.includes("(exemplo)"))!;
    useStore.getState().mut((w) => {
      w.items[mine.id].title = "Comprar pão";
    });
    endTour(true);
    expect(titles()).toContain("Comprar pão");
    expect(titles().some((t) => t.includes("(exemplo)"))).toBe(false);
  });

  it("avança até a última fala e para nela; pular encerra", () => {
    vi.useFakeTimers();
    startTour();
    for (let i = 0; i < TOUR_BEATS.length + 3; i++) {
      advanceTour();
      vi.advanceTimersByTime(2000);
    }
    expect(at()).toBe(TOUR_BEATS.length - 1);
    endTour(true);
    expect(at()).toBeNull();
    startTour();
    endTour();
    expect(at()).toBeNull();
  });
});
