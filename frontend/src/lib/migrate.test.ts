import { describe, expect, it } from "vitest";
import { blocksToMarkdown, normalizeWorkspace } from "./migrate";
import { today } from "./util";
import type { Workspace } from "./types";

/** A workspace saved by version 1 of the app (block pages, extra properties, list view). */
function v1(): Workspace {
  return {
    version: 1,
    pages: [
      { id: "home", title: "Início", icon: "🏠", type: "home", parent: null, order: 0 },
      { id: "estudos", title: "Estudos", icon: "📚", type: "db", parent: null, order: 1 },
      { id: "guia", title: "Guia rápido", icon: "💡", type: "doc", parent: null, order: 2 },
      { id: "sub", title: "Sub", icon: "📝", type: "db", parent: "guia", order: 1 },
    ],
    dbs: {
      estudos: {
        srs: true,
        props: [
          {
            id: "status",
            name: "Status",
            type: "status",
            options: [{ id: "s1", name: "Não comecei", color: "gray", group: "todo" }],
          },
          { id: "date", name: "Data", type: "date" },
          { id: "subj", name: "Matéria", type: "select", options: [{ id: "m1", name: "Matemática", color: "blue" }] },
          { id: "place", name: "Local", type: "text" },
          { id: "tags", name: "Etiquetas", type: "multi", options: [] },
        ],
        views: [{ id: "v1", name: "Lista", type: "list", filters: [{ prop: "subj", op: "is", val: "m1" }], hidden: ["subj"] }],
      },
      sub: { srs: false, props: [], views: [] },
    },
    items: {
      a: {
        id: "a",
        db: "estudos",
        title: "Funções",
        created: 1,
        updated: 1,
        order: 1,
        log: [],
        props: { status: "s1", subj: "m1", place: "Biblioteca" },
        blocks: [
          { id: "b1", type: "h2", text: "Resumo" },
          { id: "b2", type: "todo", text: "Exercícios", checked: true },
        ],
      },
    },
    docs: {
      guia: [
        { id: "x", type: "h1", text: "Olá" },
        { id: "y", type: "ul", text: "item" },
      ],
    },
    notes: {},
    habits: [],
    habitLog: {},
    // Already past the version-4 clean-up, to look at the version-2 changes alone.
    settings: { theme: "dark", start: "home", name: "Ana", guideVersion: 99 },
  } as unknown as Workspace;
}

describe("migração para a versão 2", () => {
  it("converte blocos em Markdown", () => {
    expect(
      blocksToMarkdown([
        { id: "1", type: "h1", text: "T" },
        { id: "2", type: "ol", text: "a" },
        { id: "3", type: "ol", text: "b" },
        { id: "4", type: "todo", text: "c", checked: false },
        { id: "5", type: "divider", text: "" },
      ]),
    ).toBe("# T\n1. a\n2. b\n- [ ] c\n---");
  });

  it("transforma páginas de texto em notas e sobe as subpáginas", () => {
    const w = normalizeWorkspace(v1());
    expect(w.pages.some((p) => p.id === "guia")).toBe(false);
    expect(w.notes.guia).toMatchObject({ title: "Guia rápido", body: "# Olá\n- item" });
    expect(w.pages.find((p) => p.id === "sub")!.parent).toBeNull();
    expect("docs" in w).toBe(false);
  });

  it("mantém todos os itens e converte propriedades extras", () => {
    const w = normalizeWorkspace(v1());
    const it = w.items.a;
    expect(Object.keys(w.items)).toEqual(["a"]);
    const tags = w.dbs.estudos.props.find((p) => p.id === "tags")!.options!;
    expect((it.props.tags as string[]).map((id) => tags.find((o) => o.id === id)!.name)).toEqual(["Matemática"]);
    expect(it.notes).toBe("Local: Biblioteca\n\n## Resumo\n- [x] Exercícios");
    expect(it.props.subj).toBeUndefined();
    expect(w.dbs.estudos.props.map((p) => p.id)).toEqual(["status", "date", "tags"]);
  });

  it("troca a visão Lista por Tabela, limpa filtros antigos e acrescenta o calendário", () => {
    const views = normalizeWorkspace(v1()).dbs.estudos.views;
    expect(views.map((v) => v.type)).toEqual(["table", "calendar"]);
    expect(views[0].filters).toEqual([]);
    expect(views[0].hidden).toEqual([]);
  });

  it("acrescenta áreas, eventos e a página Calendário, mantendo as preferências", () => {
    const w = normalizeWorkspace(v1());
    expect(w.version).toBe(2);
    expect(w.settings).toMatchObject({ theme: "dark", name: "Ana" });
    expect(w.settings.areas.map((a) => a.id)).toEqual(["pessoal", "profissional", "estudos"]);
    expect(w.items.a.area).toBe("estudos");
    expect(w.events).toEqual({});
    expect(w.pages.find((p) => p.type === "calendar")).toBeTruthy();
  });

  it("pode rodar de novo sem mudar nada", () => {
    const once = normalizeWorkspace(v1());
    const twice = normalizeWorkspace(once);
    expect(twice.items).toEqual(once.items);
    expect(twice.pages).toEqual(once.pages);
    expect(twice.dbs).toEqual(once.dbs);
  });

  it("tira a página To-do e leva os afazeres pendentes sem data para hoje", () => {
    const w = v1();
    w.pages.push({ id: "todo", title: "To-do", icon: "✅", type: "todo" as never, parent: null, order: 1.5 });
    w.todos = {
      a: { id: "a", text: "Sem data", done: false, order: 1, created: 1 },
      b: { id: "b", text: "Feito sem data", done: true, order: 2, created: 1 },
      c: { id: "c", text: "Amanhã", done: false, order: 3, created: 1, date: "2099-01-01" },
    };
    const out = normalizeWorkspace(w);
    expect(out.pages.some((p) => (p.type as string) === "todo")).toBe(false);
    expect(Object.keys(out.todos)).toEqual(["a", "b", "c"]);
    expect(out.todos.a.date).toBe(today());
    expect(out.todos.b.date).toBeUndefined();
    expect(out.todos.c.date).toBe("2099-01-01");
  });
});

describe("dados salvos pela versão atual", () => {
  it("mantém pastas das listas, ícones e WhatsApp ao recarregar", async () => {
    const { template } = await import("./template");
    const w = template();
    w.settings.boardFolders = ["Casa", "Casa/Obras"];
    w.settings.boardFolderIcons = { Casa: "lucide:house" };
    w.settings.whatsapp = "+5511987654321";
    const out = normalizeWorkspace(w);
    expect(out.settings.boardFolders).toEqual(["Casa", "Casa/Obras"]);
    expect(out.settings.boardFolderIcons).toEqual({ Casa: "lucide:house" });
    expect(out.settings.whatsapp).toBe("+5511987654321");
  });

  it("tira filtros repetidos", async () => {
    const { template } = await import("./template");
    const w = template();
    const f = { prop: "status", op: "is" as const, val: "x" };
    w.dbs.estudos.views[0].filters = [f, { ...f }, { ...f, val: "y" }];
    expect(normalizeWorkspace(w).dbs.estudos.views[0].filters).toEqual([f, { ...f, val: "y" }]);
  });

  it("deixa só um filtro de data", async () => {
    const { template } = await import("./template");
    const w = template();
    const d = (val: string) => ({ prop: "date", op: "is" as const, val });
    w.dbs.estudos.views[0].filters = [d("today"), d("week")];
    expect(normalizeWorkspace(w).dbs.estudos.views[0].filters).toEqual([d("today")]);
  });

  it("versão 4: um guia só, sem tarefas soltas, exemplos novos e hábitos sem repetição", async () => {
    const { template, mkDb, DEFAULT_STATUS, GUIDE_ID } = await import("./template");
    const w = template();
    // An account from before: two guides, the example note, quick tasks, old examples and repeated habits.
    for (const id of Object.keys(w.items)) delete w.items[id];
    for (const id of Object.keys(w.notes)) delete w.notes[id];
    w.notes.g1 = { id: "g1", title: "Guia rápido", folder: "", body: "texto", created: 0, updated: 0 };
    w.notes.g2 = { id: "g2", title: "Guia rápido (novo)", folder: "", body: "texto", created: 0, updated: 0 };
    w.notes.ideias = { id: "ideias", title: "Ideias", folder: "", body: "- Anote aqui.\n\n#exemplo\n", created: 0, updated: 0 };
    w.notes.minha = { id: "minha", title: "Minha nota", folder: "", body: "minha", created: 0, updated: 0 };
    w.todos = { t: { id: "t", text: "Comprar pão", done: false, order: 1, created: 0, date: "2026-01-01" } };
    w.pages.push({ id: "trabalho", title: "Trabalho", icon: "", type: "db", parent: null, order: 9 });
    w.dbs.trabalho = mkDb(DEFAULT_STATUS);
    const exTag = w.dbs.trabalho.props.find((p) => p.id === "tags")!.options!.find((o) => o.name === "Exemplo")!.id;
    const base = { notes: "", created: 0, updated: 0, order: 1, log: [] };
    w.items.old = { ...base, id: "old", db: "trabalho", title: "Relatório (exemplo)", props: { tags: [exTag] } };
    w.items.mine = { ...base, id: "mine", db: "estudos", title: "Minha tarefa", props: {} };
    w.habits = [
      { id: "h1", name: "Ler 20 minutos", icon: "" },
      { id: "h2", name: "ler 20  minutos", icon: "" },
    ];
    w.habitLog = { "2026-10-01": ["h2"], "2026-10-02": ["h1", "h2"] };
    delete w.settings.guideVersion;

    const out = normalizeWorkspace(w);
    expect(Object.keys(out.notes).sort()).toEqual([GUIDE_ID, "minha"].sort());
    expect(out.todos).toEqual({});
    expect(out.items.old).toBeUndefined();
    expect(out.items.mine).toBeTruthy();
    expect(out.pages.some((p) => p.id === "trabalho")).toBe(false);
    expect(out.items["ex-toque"]?.db).toBe("pessoal");
    expect(out.habits.map((h) => h.id)).toEqual(["h1"]);
    expect(out.habitLog).toEqual({ "2026-10-01": ["h1"], "2026-10-02": ["h1"] });
    // Only once: running again changes nothing.
    expect(normalizeWorkspace(structuredClone(out))).toEqual(out);
  });
});

describe("atualização ao abrir", () => {
  it("é estável: rodar de novo não muda nada (não reenvia tudo à nuvem a cada início)", async () => {
    const { template } = await import("./template");
    const { toEntities } = await import("./records");
    const once = normalizeWorkspace(template());
    const twice = normalizeWorkspace(once);
    const a = toEntities(once),
      b = toEntities(twice);
    const diff = [...a.keys()].filter((k) => JSON.stringify(a.get(k)!.data) !== JSON.stringify(b.get(k)?.data));
    expect(diff).toEqual([]);
  });
  it("um espaço novo já sai atualizado (nada a enviar no primeiro início)", async () => {
    const { template } = await import("./template");
    const { toEntities } = await import("./records");
    const w = template();
    const a = toEntities(w),
      b = toEntities(normalizeWorkspace(w));
    const diff = [...a.keys()].filter((k) => JSON.stringify(a.get(k)!.data) !== JSON.stringify(b.get(k)?.data));
    expect(diff).toEqual([]);
  });
});

describe("ícones do exemplo", () => {
  it("troca os emojis originais por ícones, mas mantém os que a pessoa escolheu", async () => {
    const { sampleWorkspace: template } = await import("./sampleWorkspace");
    const w = template();
    w.pages.find((p) => p.id === "estudos")!.icon = "📚";
    w.pages.find((p) => p.id === "trabalho")!.icon = "🦄";
    w.habits[0].icon = "📖";
    w.habits[1].icon = "🎯";
    const out = normalizeWorkspace(w);
    expect(out.pages.find((p) => p.id === "estudos")!.icon).toBe("lucide:graduation:purple");
    expect(out.pages.find((p) => p.id === "trabalho")!.icon).toBe("🦄");
    expect(out.habits[0].icon).toBe("lucide:book:purple");
    expect(out.habits[1].icon).toBe("🎯");
  });

  it("alarme só quando escolhido: tira o padrão antigo de 30 min (v5), mas mantém outra escolha", () => {
    const old = v1();
    old.settings = { ...old.settings, guideVersion: 4, defaultAlerts: [30] } as never;
    expect(normalizeWorkspace(old).settings.defaultAlerts).toEqual([]);

    const chosen = v1();
    chosen.settings = { ...chosen.settings, guideVersion: 4, defaultAlerts: [10, 60] } as never;
    expect(normalizeWorkspace(chosen).settings.defaultAlerts).toEqual([10, 60]);

    // Already on v5: a later choice of 30 min stays.
    const later = v1();
    later.settings = { ...later.settings, guideVersion: 5, defaultAlerts: [30] } as never;
    expect(normalizeWorkspace(later).settings.defaultAlerts).toEqual([30]);
  });
});
