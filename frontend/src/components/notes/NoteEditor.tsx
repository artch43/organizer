import { useEffect, useRef, type MutableRefObject } from "react";
import { EditorSelection, EditorState, StateField, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  placeholder,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { TAG_RE } from "../../lib/notes";
import { ATTACH_PREFIX, attachmentUrl } from "../../lib/attachments";
import { findMath, renderMath } from "../../lib/math";
import "katex/dist/katex.min.css";

export interface EditorApi {
  gotoLine: (line: number) => void;
  focus: () => void;
  /** Formatting toolbar: wrap the selection (bold, italic, code), prefix the current lines (headings, lists), or insert a link. */
  wrap: (mark: string) => void;
  linePrefix: (prefix: string) => void;
  link: () => void;
  /** Puts text at the cursor (used for attachments). */
  insert: (text: string) => void;
}

/** Adds a prefix like "## " or "- [ ] " to the selected lines, replacing any heading/list/quote prefix they had; toggles it off if already there. */
function setLinePrefix(view: EditorView, prefix: string) {
  const { state } = view;
  const changes: { from: number; to: number; insert: string }[] = [];
  const seen = new Set<number>();
  for (const r of state.selection.ranges)
    for (let pos = r.from; pos <= r.to;) {
      const line = state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        const m = /^(#{1,6} |- \[[ x]\] |[-*] |\d+\. |> )/.exec(line.text);
        const current = m ? m[1] : "";
        const next = current === prefix ? "" : prefix;
        changes.push({ from: line.from, to: line.from + current.length, insert: next });
      }
      pos = line.to + 1;
    }
  view.dispatch({ changes, userEvent: "input" });
  view.focus();
}

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "700" },
  { tag: t.heading2, fontWeight: "700" },
  { tag: t.heading3, fontWeight: "650" },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "650" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.url, color: "var(--muted)" },
  { tag: t.monospace, fontFamily: "var(--f-mono)", fontSize: "0.88em" },
  { tag: t.quote, color: "var(--muted)" },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: "var(--faint)" },
]);

const theme = EditorView.theme({
  "&": { fontSize: "16px", color: "var(--fg)", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--f-body)", lineHeight: "1.7", overflow: "visible" },
  ".cm-content": { padding: "4px 0 40vh", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent) !important",
  },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-placeholder": { color: "var(--faint)" },
  ".cm-tooltip": {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    boxShadow: "var(--shadow)",
    overflow: "hidden",
  },
});

const hide = Decoration.replace({});

/** A real checkbox in place of "- [ ]" / "- [x]"; clicking it ticks the item in the text. */
class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-task-box";
    box.setAttribute("aria-label", this.checked ? "Desmarcar item" : "Marcar item");
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos, to: this.pos + 1, insert: this.checked ? " " : "x" }, userEvent: "input" });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}
/** "•" in place of "-" / "*" for plain list items. */
class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-bullet";
    s.textContent = "•";
    return s;
  }
}
const bullet = Decoration.replace({ widget: new BulletWidget() });

/** A clickable link while the cursor is outside its Markdown source, even on the same line. */
class LinkWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(other: LinkWidget) {
    return other.source === this.source;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-link-preview";
    el.innerHTML = DOMPurify.sanitize(marked.parseInline(this.source, { async: false }) as string);
    for (const a of el.querySelectorAll("a[href]")) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      // Keep the caret outside the source so the preview survives until the click opens the link.
      a.addEventListener("mousedown", (e) => e.preventDefault());
    }
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

/** The picture itself in place of ![name](anexo:ID) or ![name](https://...). */
class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const img = document.createElement("img");
    img.className = "attach-img cm-attach-img";
    img.alt = this.alt;
    if (this.src.startsWith(ATTACH_PREFIX))
      void attachmentUrl(this.src.slice(ATTACH_PREFIX.length)).then((u) => {
        if (u) img.src = u;
        else img.alt = `${this.alt} (arquivo não encontrado)`;
      });
    else img.src = this.src;
    return img;
  }
}
/** A card that opens the PDF in a new tab, in place of [📄 name](anexo:ID). */
class FileWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly label: string,
  ) {
    super();
  }
  eq(other: FileWidget) {
    return other.id === this.id && other.label === this.label;
  }
  toDOM() {
    const a = document.createElement("a");
    a.className = "attach-file";
    a.textContent = this.label;
    a.title = "Abrir em nova aba";
    a.addEventListener("mousedown", (e) => e.preventDefault());
    a.addEventListener("click", (e) => {
      e.preventDefault();
      // Opened right away (still inside the click, so it isn't blocked), cut off from this page, then pointed at the file.
      const tab = window.open("about:blank", "_blank");
      if (tab) tab.opener = null;
      void attachmentUrl(this.id).then((u) => {
        if (tab && u) tab.location.href = u;
        else tab?.close();
      });
    });
    return a;
  }
  ignoreEvent() {
    return true;
  }
}
/** A LaTeX formula drawn by KaTeX, in place of $…$ or $$…$$ while the cursor is elsewhere. */
class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }
  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display;
  }
  toDOM() {
    const el = document.createElement(this.display ? "div" : "span");
    el.className = this.display ? "cm-math cm-math-block" : "cm-math";
    el.title = "Clique para editar a fórmula";
    el.innerHTML = renderMath(this.tex, this.display);
    return el;
  }
}
const inCodeAt = (state: EditorState, pos: number) => {
  for (
    let n: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(state).resolveInner(pos, 1);
    n;
    n = n.parent
  )
    if (n.name === "FencedCode" || n.name === "InlineCode" || n.name === "CodeBlock") return true;
  return false;
};
/** $$ blocks that span several lines need a block widget, which only a state field may provide. */
const mathBlocks = StateField.define<DecorationSet>({
  create: (state) => blockMath(state),
  update: (deco, tr) => (tr.docChanged || tr.selection ? blockMath(tr.state) : deco),
  provide: (f) => EditorView.decorations.from(f),
});
function blockMath(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = [];
  const doc = state.doc;
  for (const m of findMath(doc.toString())) {
    if (!m.display) continue;
    const a = doc.lineAt(m.from),
      b = doc.lineAt(m.to);
    // Only $$ on lines of their own, and not while the cursor is inside.
    if (a.number === b.number || doc.sliceString(a.from, m.from).trim() || doc.sliceString(m.to, b.to).trim()) continue;
    if (state.selection.ranges.some((r) => r.to >= a.from && r.from <= b.to) || inCodeAt(state, m.from)) continue;
    out.push(Decoration.replace({ widget: new MathWidget(m.tex, true), block: true }).range(a.from, b.to));
  }
  return Decoration.set(out, true);
}

/**
 * LaTeX source in color while it's being written: what's between $…$ / $$…$$ is tinted and the
 * dollar signs stand out. A $$ that isn't closed yet tints everything after it, until it is.
 * (Outside the line being edited, the formula is drawn instead; see MathWidget.)
 */
const mathSource = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = mathMarks(view.state);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = mathMarks(u.state);
    }
  },
  { decorations: (v) => v.decorations },
);
const mathMark = Decoration.mark({ class: "cm-math-src" });
const mathDelim = Decoration.mark({ class: "cm-math-delim" });
const mathOpen = Decoration.mark({ class: "cm-math-src cm-math-open", attributes: { title: "Feche a fórmula com $$" } });
function mathMarks(state: EditorState): DecorationSet {
  const text = state.doc.toString();
  const out: Range<Decoration>[] = [];
  const taken: [number, number][] = [];
  for (const m of findMath(text)) {
    if (inCodeAt(state, m.from)) continue;
    const d = m.display ? 2 : 1;
    taken.push([m.from, m.to]);
    out.push(mathDelim.range(m.from, m.from + d), mathMark.range(m.from + d, m.to - d), mathDelim.range(m.to - d, m.to));
  }
  // A $$ still waiting for its closing pair.
  for (let i = text.indexOf("$$"); i >= 0; i = text.indexOf("$$", i + 2)) {
    if (taken.some(([a, b]) => i >= a && i < b) || inCodeAt(state, i) || text[i - 1] === "\\") continue;
    out.push(mathDelim.range(i, i + 2));
    if (i + 2 < text.length) out.push(mathOpen.range(i + 2, text.length));
    break;
  }
  return Decoration.set(
    out.filter((r) => r.from < r.to),
    true,
  );
}

const IMG = /!\[([^\]\n]*)\]\(((?:anexo:|https?:\/\/)[^)\s]+)\)/g;
const FILE = /(?<!!)\[([^\]\n]+)\]\(anexo:([^)\s]+)\)/g;
const lineDeco = (cls: string) => Decoration.line({ class: cls });

/** Obsidian-style live preview: markup characters disappear on lines the cursor is not on. */
function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const active = new Set<number>();
  if (view.hasFocus)
    for (const r of state.selection.ranges) {
      const a = state.doc.lineAt(r.from).number,
        b = state.doc.lineAt(r.to).number;
      for (let i = a; i <= b; i++) active.add(i);
    }
  const out: Range<Decoration>[] = [];
  const code: [number, number][] = [];
  const inCode = (a: number, b: number) => code.some(([c, d]) => a < d && b > c);
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const line = state.doc.lineAt(node.from);
        const name = node.name;
        const h = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
        if (h) out.push(lineDeco("cm-h" + h[1]).range(line.from));
        if (name === "Blockquote") {
          for (let p = node.from; p <= node.to;) {
            const l = state.doc.lineAt(p);
            out.push(lineDeco("cm-quote").range(l.from));
            p = l.to + 1;
          }
        }
        if (name === "FencedCode" || name === "InlineCode" || name === "CodeBlock") code.push([node.from, node.to]);
        if (name === "FencedCode") {
          const fences = node.node.getChildren("CodeMark");
          const editing = view.hasFocus && state.selection.ranges.some((r) => r.to >= node.from && r.from <= node.to);
          if (!editing && fences.length === 2) {
            for (const fence of fences) {
              const fenceLine = state.doc.lineAt(fence.from);
              out.push(hide.range(fenceLine.from, fenceLine.to));
            }
          }
          for (let p = node.from; p <= node.to;) {
            const l = state.doc.lineAt(p);
            out.push(lineDeco("cm-codeblock").range(l.from));
            p = l.to + 1;
          }
          return false;
        }
        if (name === "InlineCode") out.push(Decoration.mark({ class: "cm-inline-code" }).range(node.from, node.to));
        if (name === "Link") {
          const url = node.node.getChild("URL");
          const editing = view.hasFocus && state.selection.ranges.some((r) => r.to >= node.from && r.from <= node.to);
          if (
            url &&
            !state.doc.sliceString(url.from, url.to).startsWith(ATTACH_PREFIX) &&
            !editing &&
            state.doc.lineAt(node.to).number === line.number
          ) {
            out.push(
              Decoration.replace({ widget: new LinkWidget(state.doc.sliceString(node.from, node.to)) }).range(node.from, node.to),
            );
            return false;
          }
        }
        if (active.has(line.number)) return;
        if (name === "HeaderMark" || name === "QuoteMark") {
          let end = node.to;
          if (state.doc.sliceString(end, end + 1) === " ") end++;
          if (end > node.from) out.push(hide.range(node.from, end));
        } else if (
          name === "EmphasisMark" ||
          name === "StrikethroughMark" ||
          (name === "CodeMark" && node.node.parent?.name === "InlineCode")
        ) {
          out.push(hide.range(node.from, node.to));
        }
      },
    });
    // Checklists and bullets render as widgets outside the line being edited.
    for (let pos = from; pos <= to;) {
      const line = state.doc.lineAt(pos);
      if (!active.has(line.number) && !inCode(line.from, line.to)) {
        const task = /^(\s*)[-*+] \[([ xX])\] /.exec(line.text);
        const item = !task && /^(\s*)[-*+] /.exec(line.text);
        if (task) {
          const start = line.from + task[1].length;
          out.push(Decoration.replace({ widget: new CheckboxWidget(task[2] !== " ", start + 3) }).range(start, start + 6));
          if (task[2] !== " ") out.push(Decoration.mark({ class: "cm-task-done" }).range(start + 6, line.to));
        } else if (item) {
          const start = line.from + item[1].length;
          out.push(bullet.range(start, start + 1));
        }
      }
      pos = line.to + 1;
    }
    const text = state.doc.sliceString(from, to);
    for (const m of text.matchAll(IMG)) {
      const s = from + m.index!,
        e = s + m[0].length;
      if (inCode(s, e) || active.has(state.doc.lineAt(s).number)) continue;
      out.push(Decoration.replace({ widget: new ImageWidget(m[2], m[1]) }).range(s, e));
    }
    for (const m of text.matchAll(FILE)) {
      const s = from + m.index!,
        e = s + m[0].length;
      if (inCode(s, e) || active.has(state.doc.lineAt(s).number)) continue;
      out.push(Decoration.replace({ widget: new FileWidget(m[2], m[1]) }).range(s, e));
    }
    // Formulas within one line (the ones over several lines are in mathBlocks).
    for (const m of findMath(text)) {
      const s = from + m.from,
        e = from + m.to;
      if (state.doc.lineAt(s).number !== state.doc.lineAt(e).number) continue;
      if (inCode(s, e) || active.has(state.doc.lineAt(s).number)) continue;
      out.push(Decoration.replace({ widget: new MathWidget(m.tex, m.display) }).range(s, e));
    }
    for (const m of text.matchAll(TAG_RE)) {
      const s = from + m.index! + m[1].length;
      if (inCode(s, s + 1)) continue;
      out.push(
        Decoration.mark({ class: "cm-tag", attributes: { "data-tag": m[2].toLowerCase() } }).range(s, s + 1 + m[2].length),
      );
    }
  }
  return Decoration.set(out, true);
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) this.decorations = buildDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

/** Toggle existing code first, then choose inline or fenced code by selection. */
function codeRange(state: EditorState, r: typeof state.selection.main) {
  let delimiters: { from: number; to: number }[] | undefined;
  syntaxTree(state).iterate({
    from: r.from,
    to: r.to,
    enter(node) {
      if (node.from > r.from || node.to < r.to) return;
      if (node.name !== "InlineCode" && node.name !== "FencedCode") return;
      const marks = node.node.getChildren("CodeMark");
      if (marks.length !== 2) return;
      if (node.name === "InlineCode") {
        delimiters = marks.map(({ from, to }) => ({ from, to }));
        const content = state.sliceDoc(marks[0].to, marks[1].from);
        if (content.startsWith(" ") && content.endsWith(" ") && /[^ ]/.test(content)) {
          delimiters[0].to++;
          delimiters[1].from--;
        }
      } else {
        const first = state.doc.lineAt(marks[0].from);
        const last = state.doc.lineAt(marks[1].from);
        delimiters = first.to + 1 > last.from - 1
          ? [{ from: first.from, to: last.to }]
          : [{ from: first.from, to: first.to + 1 }, { from: last.from - 1, to: last.to }];
      }
    },
  });
  if (!delimiters && r.empty && state.sliceDoc(r.from - 1, r.from + 1) === "``") {
    delimiters = [{ from: r.from - 1, to: r.from + 1 }];
  }
  if (delimiters) {
    const changes = state.changes(delimiters.map(({ from, to }) => ({ from, to, insert: "" })));
    return { changes, range: EditorSelection.range(changes.mapPos(r.anchor), changes.mapPos(r.head)) };
  }
  const selected = state.sliceDoc(r.from, r.to);
  const multiline = selected.includes("\n");
  const from = multiline ? state.doc.lineAt(r.from).from : r.from;
  const to = multiline ? state.doc.lineAt(r.to > r.from && state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to).to : r.to;
  const text = state.sliceDoc(from, to);
  const runs = [...text.matchAll(/`+/g)].map((m) => m[0].length);
  const fence = "`".repeat(Math.max(multiline ? 3 : 1, ...runs.map((size) => size + 1)));
  const padding = !multiline && (text.startsWith("`") || text.endsWith("`") ||
    (text.startsWith(" ") && text.endsWith(" ") && /[^ ]/.test(text))) ? " " : "";
  const prefix = fence + (multiline ? "\n" : padding);
  const suffix = (multiline ? "\n" : padding) + fence;
  return {
    changes: [{ from, insert: prefix }, { from: to, insert: suffix }],
    range: EditorSelection.range(
      Math.min(r.anchor, to) + prefix.length,
      Math.min(r.head, to) + prefix.length,
    ),
  };
}

function wrapWith(mark: string) {
  return (view: EditorView) => {
    view.dispatch(
      view.state.changeByRange((r) => {
        if (mark === "`") return codeRange(view.state, r);
        if (mark === "*" || mark === "**") {
          const name = mark === "**" ? "StrongEmphasis" : "Emphasis";
          let delimiters: { from: number; to: number }[] | undefined;
          syntaxTree(view.state).iterate({
            from: r.from,
            to: r.to,
            enter(node) {
              if (node.name !== name || node.from > r.from || node.to < r.to) return;
              const marks = node.node.getChildren("EmphasisMark");
              if (marks.length === 2) delimiters = marks;
            },
          });
          // Empty pairs have no emphasis node yet. Only remove an exact pair,
          // so the stars belonging to bold cannot be mistaken for italic.
          const size = mark.length;
          if (!delimiters && r.empty && r.from >= size &&
            view.state.sliceDoc(r.from - size, r.from) === mark &&
            view.state.sliceDoc(r.to, r.to + size) === mark &&
            view.state.sliceDoc(r.from - size - 1, r.from - size) !== "*" &&
            view.state.sliceDoc(r.to + size, r.to + size + 1) !== "*") {
            delimiters = [{ from: r.from - size, to: r.from }, { from: r.to, to: r.to + size }];
          }
          if (delimiters) {
            const changes = view.state.changes(delimiters.map(({ from, to }) => ({ from, to, insert: "" })));
            return {
              changes,
              range: EditorSelection.range(changes.mapPos(r.anchor), changes.mapPos(r.head)),
            };
          }
        }
        if (mark === "~~") {
          const selected = view.state.sliceDoc(r.from, r.to);
          const inside = selected.length >= 4 && selected.startsWith(mark) && selected.endsWith(mark);
          const outside =
            r.from >= 2 && view.state.sliceDoc(r.from - 2, r.from) === mark &&
            view.state.sliceDoc(r.to, r.to + 2) === mark;
          if (inside || outside) {
            const from = inside ? r.from : r.from - 2;
            const to = inside ? r.to : r.to + 2;
            const end = to - 4;
            return {
              changes: [
                { from, to: from + 2, insert: "" },
                { from: to - 2, to, insert: "" },
              ],
              range: EditorSelection.range(r.anchor > r.head ? end : from, r.anchor > r.head ? from : end),
            };
          }
        }
        return {
          changes: [
            { from: r.from, insert: mark },
            { from: r.to, insert: mark },
          ],
          range: EditorSelection.range(r.from + mark.length, r.to + mark.length),
        };
      }),
      { userEvent: "input" },
    );
    return true;
  };
}
function insertLink(view: EditorView) {
  const r = view.state.selection.main;
  if (r.empty) return false; // let Ctrl/Cmd+K open the search instead
  const text = view.state.sliceDoc(r.from, r.to);
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: `[${text}](url)` },
    selection: EditorSelection.range(r.from + text.length + 3, r.from + text.length + 6),
  });
  return true;
}

export function NoteEditor(props: {
  noteId: string;
  body: string;
  onChange: (body: string) => void;
  onTag: (tag: string) => void;
  /** Images or PDFs pasted or dropped into the text. */
  onFiles: (files: File[]) => void;
  apiRef?: MutableRefObject<EditorApi | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: props.body,
        extensions: [
          history(),
          keymap.of([
            { key: "Mod-b", run: wrapWith("**") },
            { key: "Mod-i", run: wrapWith("*") },
            { key: "Mod-k", run: insertLink },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(highlight),
          livePreview,
          mathSource,
          mathBlocks,
          EditorView.lineWrapping,
          placeholder("Comece a escrever… Use # para tags e $x^2$ para fórmulas."),
          theme,
          EditorView.contentAttributes.of({ "aria-label": "Texto da anotação", spellcheck: "true" }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste: (e) => {
              const files = [...(e.clipboardData?.files ?? [])];
              if (!files.length) return false;
              e.preventDefault();
              cb.current.onFiles(files);
              return true;
            },
            drop: (e, view) => {
              const files = [...(e.dataTransfer?.files ?? [])];
              if (!files.length) return false;
              e.preventDefault();
              const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
              if (pos != null) view.dispatch({ selection: { anchor: pos } });
              cb.current.onFiles(files);
              return true;
            },
            mousedown: (e) => {
              const el = (e.target as HTMLElement).closest<HTMLElement>(".cm-tag");
              if (!el) return false;
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                cb.current.onTag(el.dataset.tag!);
                return true;
              }
              return false;
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (props.apiRef)
      props.apiRef.current = {
        focus: () => view.focus(),
        gotoLine: (n) => {
          const line = view.state.doc.line(Math.min(n + 1, view.state.doc.lines));
          view.dispatch({
            selection: { anchor: line.from },
            effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 80 }),
          });
          view.focus();
        },
        wrap: (mark) => {
          wrapWith(mark)(view);
          view.focus();
        },
        linePrefix: (prefix) => setLinePrefix(view, prefix),
        insert: (text) => {
          const r = view.state.selection.main;
          view.dispatch({
            changes: { from: r.from, to: r.to, insert: text },
            selection: { anchor: r.from + text.length },
            userEvent: "input",
          });
          view.focus();
        },
        link: () => {
          const r = view.state.selection.main;
          const text = view.state.sliceDoc(r.from, r.to) || "texto";
          view.dispatch({
            changes: { from: r.from, to: r.to, insert: `[${text}](https://)` },
            selection: EditorSelection.range(r.from + text.length + 3, r.from + text.length + 11),
          });
          view.focus();
        },
      };
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [props.noteId]);

  // Changes made elsewhere (another device, renamed links) flow in while you're not typing here.
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== props.body && !v.hasFocus) v.dispatch({ changes: { from: 0, to: cur.length, insert: props.body } });
  }, [props.body]);

  return <div className="note-editor" ref={host} />;
}
