// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "./NoteEditor";

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

function editor(body: string, cursor = body.length) {
  act(() => {
    root.render(createElement(NoteEditor, { noteId: "test", body, onChange: vi.fn(), onTag: vi.fn(), onFiles: vi.fn() }));
  });
  const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  act(() => {
    view.focus();
    view.dispatch({ selection: { anchor: cursor } });
  });
  return view;
}

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
