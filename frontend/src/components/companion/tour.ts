import { create } from "zustand";
import { go, newItem, onFolderMade, useStore } from "@/store";
import { boardFolderList } from "@/lib/notes";
import { dateProp, firstOptInGroup, statusProp } from "@/lib/model";
import { homeTasks } from "@/lib/homeOrder";
import { GUIDE_SEEN_KEY } from "@/lib/template";
import { eventsByDay } from "@/lib/events";
import { addDays, today, uid } from "@/lib/util";
import { setListsPanel, setListsSheet } from "../lists/state";
import { reactCompanion } from "./reactions";
import type { Rect } from "./placement";

/**
 * One thing the mascot says, and what moves the tour on from it:
 * - "continue": the "Continuar" button in his bubble;
 * - "click": a click on `target` (lit and pulsing);
 * - "done": the person does something for real, starting at `target` (create a folder, drag a card):
 *   the tour moves on when `watch()` gives a different value than when the beat began;
 * - "end": the last one ("Começar a usar").
 */
export interface Beat {
  /** Which page of the tour this belongs to (the dots in the bubble). */
  page: number;
  /** What he says; `**bold**` allowed. Empty: he says nothing (no bubble), the lit target is enough. */
  text: string;
  /** What he says instead on a touch screen (where cards aren't dragged). */
  touchText?: string;
  on: "continue" | "click" | "done" | "end";
  /** CSS selector of what to light up (the first one on screen is used). */
  target?: string;
  /** Lit as a whole area to work in (a board), not a single button. */
  area?: boolean;
  /** He stays in his corner (bottom left) instead of walking to the target; only his bubble keeps clear of it. */
  corner?: boolean;
  /** Lit and pointed at, but not to be clicked (a "continue" beat about something on the page). */
  look?: string;
  /** What else he and his bubble stay clear of (a selector), so the group the target is in stays readable. */
  keepClear?: string;
  watch?: () => unknown;
  /** A "done" beat also done when this happens (something made that changes nothing, like a folder with a name that exists). */
  doneOn?: Set<() => void>;
  /** Runs when the beat begins. */
  enter?: () => void;
  /** Makes the target reachable again if it went out of sight (a panel was closed). */
  ensure?: () => void;
  /** When the target isn't on the page (no habits yet), the tour just moves on. */
  optional?: boolean;
}

const tab = (key: string) => `[data-tour="${key}"]`;
const ws = () => useStore.getState().ws;
const phone = () => typeof matchMedia !== "undefined" && matchMedia("(max-width: 767px)").matches;
/** The folders and lists: beside the list on a computer, in a sheet on a phone. */
const showLists = () => (phone() ? setListsSheet(true) : setListsPanel(true));

/** Scrolls something he talks about into view (after the click that shows it has run). */
const reveal = (selector: string, block: ScrollLogicalPosition = "nearest") => {
  if (typeof document === "undefined") return;
  // Again a moment later: the page it is on may still be opening.
  for (const wait of [60, 400])
    setTimeout(() => {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.querySelector(selector)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block });
    }, wait);
};

/**
 * The calendar opens on the next day with a compromisso (in the month, and in the day beside it), so
 * there is one to open; with none coming up, he leaves one today.
 */
function showEventDay() {
  const { ws: w, ui, mut, setUi } = useStore.getState();
  const T = today();
  let day = Object.keys(eventsByDay(w, T, addDays(T, 60), ui.area)).sort()[0];
  if (!day) {
    day = T;
    const id = uid();
    mut((x) => {
      x.events[id] = {
        id,
        title: "Compromisso de exemplo",
        date: T,
        allDay: false,
        start: "19:00",
        end: "20:00",
        area: ui.area === "all" ? undefined : ui.area,
        location: "",
        notes: "",
        alerts: [],
        created: Date.now(),
        updated: Date.now(),
      };
    });
  }
  setUi((u) => {
    Object.assign(u.calendar, { view: "month", anchor: day, selected: day });
  });
  // Below the month on smaller screens.
  reveal(tab("cal-entry"), "center");
}

/**
 * Início asks the person to mark an overdue task and one of today's as done: when there is none (a new
 * account), he leaves one of each in the first list that has dates and a "done" column.
 */
function ensureHomeTasks() {
  const { ws: w, ui, mut } = useStore.getState();
  const T = today();
  const page = w.pages.find(
    (p) => p.type === "db" && w.dbs[p.id] && dateProp(w.dbs[p.id]) && firstOptInGroup(w.dbs[p.id], "done"),
  );
  if (!page) return;
  const doable = (group: "overdue" | "day") =>
    homeTasks(w, T, ui.area, group).some((it) => !!firstOptInGroup(w.dbs[it.db], "done"));
  const add = (title: string, day: string) => {
    const id = newItem(page.id, {}, title);
    // The date afterwards: given to newItem, it would announce "added to the calendar".
    const dp = dateProp(ws().dbs[page.id])!;
    mut((x) => {
      x.items[id].props[dp.id] = day;
    });
  };
  if (!doable("overdue")) add("Tarefa atrasada (exemplo)", addDays(T, -1));
  if (!doable("day")) add("Tarefa de hoje (exemplo)", T);
}

/** The card he leaves in the new list, to be dragged. */
let demoCard: string | null = null;
const DEMO_TITLE = "Arraste-me para outra coluna";

export const TOUR_PAGES = 5;

export const TOUR_BEATS: Beat[] = [
  // ---- Início
  { page: 0, on: "continue", text: "Oi! Eu sou o Clebinho, e vou te mostrar a casa em um minutinho." },
  {
    page: 0,
    on: "click",
    target: `${tab("home-overdue")} [role="checkbox"]`,
    keepClear: tab("home-overdue"),
    enter: ensureHomeTasks,
    optional: true,
    text: "Este é o **Início**: o resumo do seu dia. Em **Atrasadas** ficam as tarefas que passaram do prazo. Marque uma como **concluída**.",
  },
  {
    page: 0,
    on: "click",
    target: `${tab("home-today")} [role="checkbox"]`,
    keepClear: tab("home-today"),
    optional: true,
    text: "Feito! Agora as tarefas de **hoje**: marque uma como concluída também.",
  },
  {
    page: 0,
    on: "click",
    target: 'button[aria-label="Próximo dia"]',
    optional: true,
    text: "As setas mostram os outros dias. Clique na seta e veja o resumo de **amanhã**.",
  },
  {
    page: 0,
    on: "continue",
    look: 'button[aria-label^="Escolher data"]',
    text: "Viu? O **Hoje** virou **Amanhã**: cada dia tem o seu resumo.",
  },
  { page: 0, on: "click", target: tab("lists"), text: "Agora, vamos para as **Listas**!" },

  // ---- Listas
  {
    page: 1,
    on: "done",
    target: 'button[aria-label="Criar nova pasta"]',
    // The whole Listas part happens in his corner: the panel slides in and windows open (name the
    // folder, pick an icon), and he would keep walking after them.
    corner: true,
    watch: () => boardFolderList(ws()).length,
    // A folder with a name that already exists changes nothing: making it still counts (one folder, not one per try).
    doneOn: onFolderMade,
    enter: showLists,
    ensure: showLists,
    text: "Nas **Listas** ficam as suas tarefas. Comece criando uma **pasta** para agrupar as listas: dê um nome e salve.",
  },
  {
    page: 1,
    on: "done",
    target: 'button[aria-label="Criar nova lista"]',
    corner: true,
    watch: () => ws().pages.filter((p) => p.type === "db").length,
    ensure: showLists,
    text: "Boa! Agora crie uma **lista**. Ela pode ficar dentro da pasta que você acabou de fazer.",
  },
  {
    page: 1,
    on: "done",
    target: tab("board"),
    area: true,
    enter: () => {
      setListsSheet(false);
      const { ui } = useStore.getState();
      demoCard = ws().dbs[ui.route] ? newItem(ui.route, {}, DEMO_TITLE) : null;
    },
    // Moved to another column (or thrown away): either way, the card was dragged.
    watch: () => {
      const it = demoCard ? ws().items[demoCard] : null;
      const sp = it && ws().dbs[it.db] ? statusProp(ws().dbs[it.db]) : null;
      return it && sp ? it.props[sp.id] : null;
    },
    optional: true,
    text: "Toda lista é um quadro com colunas. Deixei uma tarefa aí para você: **arraste o cartão** para outra coluna.",
    touchText:
      "Toda lista é um quadro com colunas. Deixei uma tarefa aí para você: toque em **⇆** no cartão e mude ele de coluna.",
  },
  {
    page: 1,
    on: "click",
    target: tab("cal"),
    text: "Isso! Abrindo uma tarefa você põe data, prioridade e **alarme**. Ele chega do jeito que você escolher: na hora que quiser, por **e-mail** ou **WhatsApp**.",
  },

  // ---- Calendário
  {
    page: 2,
    on: "click",
    target: tab("cal-entry"),
    enter: showEventDay,
    optional: true,
    text: "O **Calendário** junta as tarefas com data e os seus eventos numa visão só. Escolhi um dia que tem um **compromisso**: clique nele para abrir.",
  },
  {
    page: 2,
    on: "click",
    target: tab("habits"),
    text: "Aqui você muda o compromisso, e ele também tem **alarme**: é você quem decide quando e por onde ele chega. Para marcar outro, clique duas vezes num dia. Feche a janela e vamos aos **Hábitos**.",
    touchText:
      "Aqui você muda o compromisso, e ele também tem **alarme**: é você quem decide quando e por onde ele chega. Para marcar outro, toque no **+**. Feche a janela e vamos aos **Hábitos**.",
  },

  // ---- Hábitos
  {
    page: 3,
    on: "click",
    target: tab("habit-today"),
    optional: true,
    text: "Em **Hábitos** você acompanha o que quer fazer todo dia. Fez? É só marcar.",
  },
  {
    page: 3,
    on: "click",
    target: tab("notes"),
    text: "A sequência conta os dias seguidos, e o histórico mostra o mês inteiro.",
  },

  // ---- Notas
  {
    page: 4,
    on: "done",
    target: tab("new-note"),
    // In his corner, as in Listas: the page opens around the button and he would walk after it.
    corner: true,
    watch: () => Object.keys(ws().notes).length,
    optional: true,
    text: "As **Notas** são o seu caderno. Crie uma para ver como é.",
  },
  {
    page: 4,
    on: "continue",
    text: "Escreva livremente, organize em pastas e use #tags. E as notas conversam com as **Listas**: dentro de uma tarefa, **Criar anotação** abre uma nota ligada a ela.",
  },
  { page: 4, on: "end", text: "Pronto, agora é com você!" },
];

/** Where the tour is (an index into TOUR_BEATS); `null` = not running. */
export const useTour = create<{
  at: number | null;
  /** Between two beats: the page finishes what the click set going before he says the next thing. */
  settling: boolean;
}>(() => ({ at: null, settling: false }));

/**
 * What he is talking about, on screen (the lit element and the menus it opened, or a window open on
 * top): he goes next to it without covering it. `area` = a whole area to work in (he stays home).
 */
export const useTourSpot = create<{ rect: Rect | null; area: boolean }>(() => ({ rect: null, area: false }));

export const currentBeat = (at: number | null): Beat | null => (at === null ? null : (TOUR_BEATS[at] ?? null));

/** What `watch()` gave when the current "done" beat began. */
let base: unknown;
/** While a beat sets itself up (`enter` may change the workspace), nothing counts as "done" yet. */
let entering = false;
function begin(at: number) {
  const beat = TOUR_BEATS[at];
  entering = true;
  useTour.setState({ at, settling: false });
  try {
    beat.enter?.();
  } finally {
    base = beat.watch?.();
    entering = false;
  }
}

/** Starts (or restarts) the tour on Início. */
export function startTour() {
  const home = useStore.getState().ws.pages.find((p) => p.type === "home");
  if (home && useStore.getState().ui.route !== home.id) go(home.id);
  begin(0);
}

/** The longest he waits for the page to finish moving, and the shortest pause between two lines. */
const SETTLE_MAX = 350;
const SETTLE_MIN = 60;

/**
 * Nothing on the page is still moving: his own loops, the lit ring's pulse, the toasts and the glow
 * behind the page (it pulses with each of his hops) aside.
 */
function calm() {
  if (typeof document === "undefined" || typeof document.getAnimations !== "function") return true;
  return !document.getAnimations().some((a) => {
    if (a.playState !== "running") return false;
    if (a.effect?.getComputedTiming().iterations === Infinity) return false;
    const el = a.effect instanceof KeyframeEffect ? a.effect.target : null;
    return !(el && el.closest(".companion, .tour-spot, .app-backdrop, .backdrop-pulse, [data-sonner-toaster]"));
  });
}

/**
 * On to the next thing he says, once the page has finished what the click set going (a day sliding
 * in, a page opening, a task moving to "Concluídas"): his bubble steps away, and the next one comes
 * when everything is still. Never two at once.
 */
export function advanceTour() {
  const { at, settling } = useTour.getState();
  if (at === null || settling || at >= TOUR_BEATS.length - 1) return;
  useTour.setState({ settling: true });
  const start = performance.now();
  const check = () => {
    if (useTour.getState().at !== at) return;
    const waited = performance.now() - start;
    if (waited < SETTLE_MAX && !calm()) return void setTimeout(check, 32);
    begin(at + 1);
    reactCompanion("hop");
  };
  setTimeout(check, SETTLE_MIN);
}

/** Ends the tour; `done` = went to the end (he cheers), otherwise it was skipped. */
export function endTour(done = false) {
  if (useTour.getState().at === null) return;
  useTour.setState({ at: null, settling: false });
  demoCard = null;
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, "1");
  } catch {
    /* private mode: the tour shows again next time */
  }
  if (done) reactCompanion("cheer");
}

// "done" beats: the tour moves on when what they watch changes, or their event comes (a moment later,
// so the window that did it has closed).
const finish = (at: number | null) => setTimeout(() => useTour.getState().at === at && advanceTour(), 300);
useStore.subscribe(() => {
  const { at } = useTour.getState();
  const beat = currentBeat(at);
  if (entering || !beat || beat.on !== "done" || !beat.watch || beat.watch() === base) return;
  base = beat.watch();
  finish(at);
});
for (const signal of new Set(TOUR_BEATS.flatMap((b) => (b.doneOn ? [b.doneOn] : []))))
  signal.add(() => {
    const { at } = useTour.getState();
    if (currentBeat(at)?.doneOn === signal) finish(at);
  });
