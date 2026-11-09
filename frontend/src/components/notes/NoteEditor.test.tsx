// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditor, type EditorApi } from "./NoteEditor";

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

function editor(body: string, cursor = body.length, apiRef?: { current: EditorApi | null }) {
  act(() => {
    root.render(createElement(NoteEditor, { noteId: "test", body, onChange: vi.fn(), onTag: vi.fn(), onFiles: vi.fn(), apiRef }));
  });
  const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  act(() => {
    view.focus();
    view.dispatch({ selection: { anchor: cursor } });
  });
  return view;
}

describe("riscado no editor", () => {
  it("alterna o riscado sem acumular marcadores e mantém o texto selecionado", () => {
    const api = { current: null as EditorApi | null };
    const view = editor("texto", 0, api);
    act(() => view.dispatch({ selection: { anchor: 0, head: 5 } }));
    for (const expected of ["~~texto~~", "texto", "~~texto~~", "texto"]) {
      act(() => api.current!.wrap("~~"));
      expect(view.state.doc.toString()).toBe(expected);
      expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe("texto");
      expect(host.querySelector(".cm-editor")).not.toBeNull();
    }
  });

  it("remove o riscado quando os marcadores também estão selecionados", () => {
    const api = { current: null as EditorApi | null };
    const view = editor("~~texto~~", 0, api);
    act(() => view.dispatch({ selection: { anchor: 9, head: 0 } }));
    act(() => api.current!.wrap("~~"));
    expect(view.state.doc.toString()).toBe("texto");
    expect(view.state.selection.main.anchor).toBe(5);
    expect(view.state.selection.main.head).toBe(0);
  });

  it("alterna os marcadores no cursor vazio sem criar um bloco de código", () => {
    const api = { current: null as EditorApi | null };
    const view = editor("", 0, api);
    act(() => api.current!.wrap("~~"));
    expect(view.state.doc.toString()).toBe("~~~~");
    act(() => api.current!.wrap("~~"));
    expect(view.state.doc.toString()).toBe("");
    expect(view.state.selection.main.head).toBe(0);
  });
});

describe("negrito e itálico no editor", () => {
  it.each(["*", "**"])("alterna %s em cliques repetidos", (mark) => {
    const api = { current: null as EditorApi | null };
    const view = editor("texto", 0, api);
    act(() => view.dispatch({ selection: { anchor: 0, head: 5 } }));
    for (const expected of [mark + "texto" + mark, "texto", mark + "texto" + mark, "texto"]) {
      act(() => api.current!.wrap(mark));
      expect(view.state.doc.toString()).toBe(expected);
      expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe("texto");
    }
  });

  it.each([
    ["***texto***", "*", "**texto**"],
    ["***texto***", "**", "*texto*"],
    ["**texto**", "*", "***texto***"],
    ["*texto*", "**", "***texto***"],
    ["__texto__", "**", "texto"],
    ["_texto_", "*", "texto"],
  ])("distingue %s ao alternar %s", (source, mark, expected) => {
    const api = { current: null as EditorApi | null };
    const from = source.indexOf("texto");
    const view = editor(source, from, api);
    act(() => view.dispatch({ selection: { anchor: from, head: from + 5 } }));
    act(() => api.current!.wrap(mark));
    expect(view.state.doc.toString()).toBe(expected);
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe("texto");
  });

  it.each(["*", "**"])("remove %s com os marcadores selecionados", (mark) => {
    const api = { current: null as EditorApi | null };
    const source = mark + "texto" + mark;
    const view = editor(source, 0, api);
    act(() => view.dispatch({ selection: { anchor: source.length, head: 0 } }));
    act(() => api.current!.wrap(mark));
    expect(view.state.doc.toString()).toBe("texto");
    expect(view.state.selection.main.anchor).toBe(5);
    expect(view.state.selection.main.head).toBe(0);
  });

  it.each(["*", "**"])("alterna %s no cursor vazio", (mark) => {
    const api = { current: null as EditorApi | null };
    const view = editor("", 0, api);
    act(() => api.current!.wrap(mark));
    act(() => api.current!.wrap(mark));
    expect(view.state.doc.toString()).toBe("");
  });
});

describe("código no editor", () => {
  it.each([
    ["texto", "`texto`"],
    ["um\ndois", "```\num\ndois\n```"],
    ["a ` b", "``a ` b``"],
    [" texto ", "`  texto  `"],
    ["`", "`` ` ``"],
    ["um\n```\ndois", "````\num\n```\ndois\n````"],
  ])("alterna código para %s preservando conteúdo e seleção", (source, formatted) => {
    const api = { current: null as EditorApi | null };
    const view = editor(source, 0, api);
    act(() => view.dispatch({ selection: { anchor: 0, head: source.length } }));
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe(formatted);
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe(source);
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(source);
  });

  it("não inclui a próxima linha quando a seleção termina no início dela", () => {
    const api = { current: null as EditorApi | null };
    const view = editor("um\ndois", 0, api);
    act(() => view.dispatch({ selection: { anchor: 0, head: 3 } }));
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe("```\num\n```\ndois");
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe("um\ndois");
  });

  it.each(["`texto`", "``texto``", "`` `texto` ``"])("remove delimitadores e padding de %s", (source) => {
    const api = { current: null as EditorApi | null };
    const view = editor(source, 0, api);
    act(() => view.dispatch({ selection: { anchor: 0, head: source.length } }));
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe(source.includes(" `") ? "`texto`" : "texto");
  });

  it("expande a seleção de várias linhas parciais para linhas inteiras", () => {
    const api = { current: null as EditorApi | null };
    const view = editor("antes\num\ndois\ndepois", 0, api);
    act(() => view.dispatch({ selection: { anchor: 7, head: 10 } }));
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe("antes\n```\num\ndois\n```\ndepois");
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe("antes\num\ndois\ndepois");
  });

  it("remove bloco existente mesmo quando só uma linha está selecionada", () => {
    const api = { current: null as EditorApi | null };
    const view = editor("```js\num\ndois\n```", 6, api);
    act(() => view.dispatch({ selection: { anchor: 6, head: 8 } }));
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe("um\ndois");
  });

  it("alterna código vazio", () => {
    const api = { current: null as EditorApi | null };
    const view = editor("", 0, api);
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe("``");
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe("");
  });

  it("remove um bloco vazio sem sobrepor as alterações", () => {
    const api = { current: null as EditorApi | null };
    const view = editor("```\n```", 4, api);
    act(() => api.current!.wrap("`"));
    expect(view.state.doc.toString()).toBe("");
  });
});

describe("prévia dos blocos de código", () => {
  it.each(["```", "````", "~~~"])("esconde as cercas %s ao sair e revela ao entrar no bloco", (fence) => {
    const source = `${fence}js\nconst x = 1;\n${fence}\nfora`;
    const view = editor(source);
    const content = () => host.querySelector(".cm-content")!.textContent!;
    expect(content()).not.toContain(fence);
    expect(content()).not.toContain("js");
    expect(content()).toContain("const x = 1;");
    expect(view.state.doc.toString()).toBe(source);
    act(() => view.dispatch({ selection: { anchor: source.indexOf("const") } }));
    expect(content()).toContain(fence + "js");
    act(() => view.dispatch({ selection: { anchor: source.length } }));
    expect(content()).not.toContain(fence);
    act(() => view.dispatch({ selection: { anchor: 0, head: source.length } }));
    expect(content()).toContain(fence);
  });

  it("mantém visível a cerca de um bloco ainda incompleto", () => {
    editor("```js\nconst x = 1;");
    expect(host.querySelector(".cm-content")!.textContent).toContain("```js");
  });
});

describe("links no editor de anotações", () => {
  it("torna o link clicável após um espaço na mesma linha e preserva o cursor no clique", () => {
    const source = "[Site](https://example.com)";
    const view = editor(source);
    expect(host.querySelector(".cm-link-preview")).toBeNull();

    act(() => view.dispatch({ changes: { from: source.length, insert: " " }, selection: { anchor: source.length + 1 } }));

    const link = host.querySelector<HTMLAnchorElement>(".cm-link-preview a")!;
    expect(link.textContent).toBe("Site");
    expect(link.href).toBe("https://example.com/");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => link.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBe(source.length + 1);
    // The widget leaves normal anchor activation to the browser.
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.addEventListener("click", (event) => {
      expect(event.defaultPrevented).toBe(false);
      event.preventDefault();
    });
    act(() => link.dispatchEvent(click));
    expect(view.state.doc.toString()).toBe(source + " ");
  });

  it("mostra novamente a sintaxe ao mover o cursor ou a seleção para o link", () => {
    const source = "[Site](https://example.com) ";
    const view = editor(source);
    expect(host.querySelector(".cm-link-preview a")).not.toBeNull();
    act(() => view.dispatch({ selection: { anchor: 10 } }));
    expect(host.querySelector(".cm-link-preview")).toBeNull();
    expect(host.querySelector(".cm-content")!.textContent).toBe(source);
    act(() => view.dispatch({ selection: { anchor: source.length } }));
    expect(host.querySelector(".cm-link-preview a")).not.toBeNull();
    act(() => view.dispatch({ selection: { anchor: 2, head: source.length } }));
    expect(host.querySelector(".cm-link-preview")).toBeNull();
  });

  it("entende parênteses no endereço, títulos e formatação no texto", () => {
    editor('[**Site**](https://example.com/a_(b) "Título") ');
    const link = host.querySelector<HTMLAnchorElement>(".cm-link-preview a")!;
    expect(link.href).toBe("https://example.com/a_(b)");
    expect(link.title).toBe("Título");
    expect(link.querySelector("strong")!.textContent).toBe("Site");
  });

  it.each([
    "`[Site](https://example.com)` ",
    "```\n[Site](https://example.com)\n```\n",
    "[Site](https://example.com ",
    "[Arquivo](anexo:123) ",
  ])("não converte código, links incompletos ou anexos: %s", (source) => {
    editor(source);
    expect(host.querySelector(".cm-link-preview")).toBeNull();
  });

  it("não permite endereços que executem scripts", () => {
    editor("[Site](javascript:alert(1)) ");
    expect(host.querySelector(".cm-link-preview a[href]")).toBeNull();
  });
});
