import type { Area, CalendarEvent, Color, Database, Group, Item, Note, Option, Settings, Workspace } from "./types";
import { addDays, today, uid } from "./util";

export const opts = (list: [string, Color, Group?][]): Option[] =>
  list.map(([name, color, group]) => ({ id: uid(), name, color, ...(group ? { group } : {}) }));

export const DEFAULT_STATUS: [string, Color, Group][] = [
  ["Não comecei", "gray", "todo"],
  ["Fazendo", "blue", "doing"],
  ["Feito", "green", "done"],
  ["Revisar", "orange", "review"],
];

export const DEFAULT_AREAS: Area[] = [
  { id: "pessoal", name: "Pessoal", color: "coral" },
  { id: "profissional", name: "Profissional", color: "petrol" },
  { id: "estudos", name: "Estudos", color: "violet" },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  start: "home",
  name: "",
  areas: DEFAULT_AREAS,
  emailAlerts: true,
  // No alarm unless the person picks one.
  defaultAlerts: [],
  noteFolders: [],
};

export function mkDb(
  status: [string, Color, Group][],
  defaultArea?: string,
  srs = false,
  tags: [string, Color][] = [],
): Database {
  return {
    srs,
    defaultArea,
    props: [
      { id: "status", name: "Status", type: "status", options: opts(status) },
      { id: "date", name: "Data", type: "date" },
      {
        id: "prio",
        name: "Prioridade",
        type: "select",
        options: opts([
          ["Alta", "red"],
          ["Média", "yellow"],
          ["Baixa", "gray"],
        ]),
      },
      { id: "tags", name: "Etiquetas", type: "multi", options: opts([...tags, ["Exemplo", "gray"]]) },
    ],
    views: [
      { id: uid(), name: "Quadro", type: "board", filters: [], hidden: [] },
      { id: uid(), name: "Tabela", type: "table", filters: [], hidden: [], widths: {} },
      { id: uid(), name: "Calendário", type: "calendar", filters: [], hidden: [] },
    ],
  };
}

/** Bump when the guide text changes, so saved copies that were never edited get the new one. */
export const GUIDE_VERSION = 5;

/** The one guide: short on purpose, so it gets read to the end. Same id everywhere (no copies). */
/** Set once the guide has opened by itself on this device (first visit). */
export const GUIDE_SEEN_KEY = "organizer:guide-seen";
export const GUIDE_ID = "comece-por-aqui";
export const GUIDE_TITLE = "Comece por aqui";
export const GUIDE_BODY_V4 = [
  "Bem-vindo! Em 2 minutos você aprende o essencial. Marque cada ✓ quando fizer.",
  "",
  "## 1. Tarefas",
  "Abra a lista **Pessoal** na barra lateral: as tarefas de lá ensinam o passo a passo.",
  "- **Nova tarefa** no fim de uma coluna cria uma tarefa.",
  "- Toque no cartão para pôr **data**, **prioridade** e **alarme**.",
  "- Arraste o cartão entre as colunas para mudar o status, ou até a **Lixeira** para excluir.",
  "",
  "- [ ] Criar a minha primeira tarefa",
  "",
  "## 2. O seu dia",
  "O **Início** mostra o que vence hoje. O **Calendário** junta tarefas com data e eventos; clique num dia para criar um evento.",
  "",
  "## 3. Anotações",
  "Escreva aqui como num caderno. Numa tarefa, **Criar anotação** abre uma nota ligada a ela.",
  "- `#palavra` vira uma tag, e `$x^2$` vira a fórmula $x^2$.",
  "",
  "- [ ] Criar uma anotação",
  "",
  "## 4. Hábitos",
  "Toque em **Hoje** quando fizer. A 🔥 conta os dias seguidos, e o **Histórico** mostra o mês.",
  "",
  "---",
  "Pronto! Para apagar os exemplos: **Configurações → Remover exemplos**. Dica: **Ctrl/⌘ + K** busca em tudo.",
  "",
].join("\n");

export const GUIDE_NOTE = (id = GUIDE_ID): Note => ({
  id,
  folder: "",
  title: GUIDE_TITLE,
  created: Date.now(),
  updated: Date.now(),
  body: GUIDE_BODY_V4,
});

/** The example's original emojis and the drawn icons that replace them (only while still untouched). */
export const EXAMPLE_ICONS: { pages: Record<string, [string, string]>; habits: Record<string, [string, string]> } = {
  pages: {
    home: ["🏠", "lucide:house"],
    calendario: ["🗓️", "lucide:calendar-days:blue"],
    estudos: ["📚", "lucide:graduation:purple"],
    trabalho: ["💼", "lucide:briefcase:blue"],
    compromissos: ["📅", "lucide:calendar-check:orange"],
    habits: ["🌱", "lucide:sprout:green"],
  },
  habits: {
    "Ler 20 minutos": ["📖", "lucide:book:purple"],
    Exercício: ["🏃", "lucide:dumbbell:orange"],
    "Beber 2 L de água": ["💧", "lucide:droplet:blue"],
  },
};

/** The example lists' columns: simple words for a first look. */
const STARTER_STATUS: [string, Color, Group][] = [
  ["A fazer", "gray", "todo"],
  ["Fazendo", "blue", "doing"],
  ["Feito", "green", "done"],
];

/**
 * The examples a beginner sees: the "Pessoal" list's tasks are the tutorial itself, "Estudos" shows
 * a real task, plus one event and three habits. Fixed ids, so two devices setting up the same account
 * at once end up with one copy (not two). Everything is tagged "Exemplo" / "(exemplo)".
 */
export function examples(T = today()) {
  const P = "pessoal",
    E = "estudos";
  const dbP = mkDb(STARTER_STATUS, "pessoal");
  const dbE = mkDb(STARTER_STATUS, "estudos", true, [
    ["Matemática", "blue"],
    ["Português", "orange"],
  ]);
  const opt = (db: Database, pid: string, name: string) =>
    db.props.find((p) => p.id === pid)!.options!.find((o) => o.name === name)!.id;
  let n = 0;
  const item = (id: string, dbId: string, db: Database, title: string, props: Item["props"], notes = ""): Item => ({
    id,
    db: dbId,
    title,
    area: db.defaultArea,
    notes,
    props: {
      status: db.props[0].options![0].id,
      ...props,
      tags: [...((props.tags as string[]) ?? []), opt(db, "tags", "Exemplo")],
    },
    created: Date.now() + n,
    updated: Date.now(),
    order: ++n,
    log: [],
  });
  const items = [
    item("ex-toque", P, dbP, "👋 Toque em mim para ver os detalhes", { date: T, prio: opt(dbP, "prio", "Alta") }),
    item("ex-arraste", P, dbP, "Arraste este cartão para “Fazendo”", { date: T }),
    item("ex-nova", P, dbP, "Crie a sua primeira tarefa em “Nova tarefa”", {}),
    item("ex-lixeira", P, dbP, "Arraste esta tarefa até a Lixeira para excluir", {}),
    item("ex-revisar", E, dbE, "Revisar matemática para a prova", {
      date: addDays(T, 1),
      prio: opt(dbE, "prio", "Alta"),
      tags: [opt(dbE, "tags", "Matemática")],
    }),
  ];
  const events: CalendarEvent[] = [
    {
      id: "ex-aula",
      title: "Aula de inglês (exemplo)",
      date: addDays(T, 1),
      allDay: false,
      start: "19:00",
      end: "20:00",
      area: "estudos",
      location: "",
      notes: "",
      alerts: [],
      created: Date.now(),
      updated: Date.now(),
    },
  ];
  return {
    pages: [
      { id: P, title: "Pessoal", icon: "lucide:user:pink", type: "db" as const, parent: null, order: 2, fav: true },
      { id: E, title: "Estudos", icon: "lucide:graduation:purple", type: "db" as const, parent: null, order: 3 },
    ],
    dbs: { [P]: dbP, [E]: dbE } as Record<string, Database>,
    items,
    events,
    habits: [
      { id: "ex-ler", name: "Ler 20 minutos", icon: "lucide:book:purple", created: T },
      { id: "ex-exercicio", name: "Exercício", icon: "lucide:dumbbell:orange", created: T },
      { id: "ex-agua", name: "Beber água", icon: "lucide:droplet:blue", created: T },
    ],
  };
}

/** Starting workspace for a new person: the guide, the examples and the fixed pages. */
export function template(): Workspace {
  const ex = examples();
  const guide = GUIDE_NOTE();
  return {
    version: 2,
    pages: [
      { id: "home", title: "Início", icon: "lucide:house", type: "home", parent: null, order: 0 },
      { id: "calendario", title: "Calendário", icon: "lucide:calendar-days:blue", type: "calendar", parent: null, order: 1 },
      ...ex.pages,
      { id: "habits", title: "Hábitos", icon: "lucide:sprout:green", type: "habits", parent: null, order: 5 },
    ],
    dbs: ex.dbs,
    items: Object.fromEntries(ex.items.map((i) => [i.id, i])),
    events: Object.fromEntries(ex.events.map((e) => [e.id, e])),
    todos: {},
    notes: { [guide.id]: guide },
    habits: ex.habits,
    habitLog: {},
    settings: { ...DEFAULT_SETTINGS, areas: DEFAULT_AREAS.map((a) => ({ ...a })), guideVersion: GUIDE_VERSION },
  };
}
