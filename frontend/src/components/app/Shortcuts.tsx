import { useEffect } from "react";
import { IS_MAC, MOD, isEditable } from "@/lib/shortcuts";
import { PROGRESS_ROUTE, SETTINGS_ROUTE, go, openModal, openNotes, useStore } from "@/store";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mascot } from "../brand/Brand";
import { openLists } from "../lists/state";

/** "G" then a letter: go to a page. */
const GOTO: Record<string, { label: string; run: () => void }> = {
  i: { label: "Início", run: () => goType("home") },
  l: { label: "Listas", run: openLists },
  c: { label: "Calendário", run: () => goType("calendar") },
  h: { label: "Hábitos", run: () => goType("habits") },
  n: { label: "Notas", run: () => openNotes() },
  p: { label: "Progresso", run: () => go(PROGRESS_ROUTE) },
  s: { label: "Configurações", run: () => go(SETTINGS_ROUTE) },
};
function goType(type: string) {
  const id = useStore.getState().ws.pages.find((p) => p.type === type)?.id;
  if (id) go(id);
}

/**
 * Single-key shortcuts, off while typing: N new task, / search, ? this list, G + letter to go to a
 * page. (Ctrl/⌘ + K search, Esc and Ctrl/⌘ + Delete live elsewhere.)
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isEditable(document.activeElement)) return;
      const { ui } = useStore.getState();
      // Only with nothing open on top (a window, the task panel, a menu).
      if (ui.modal && ui.modal !== "shortcuts") return;
      if (
        ui.peek ||
        ui.eventDialog ||
        ui.statusDialog ||
        document.querySelector("[role=menu], [role=dialog]:not([data-shortcuts])")
      )
        return;
      const k = e.key.toLowerCase();
      if (Date.now() - gAt < 1200 && GOTO[k]) {
        e.preventDefault();
        gAt = 0;
        GOTO[k].run();
        return;
      }
      if (k === "g") {
        gAt = Date.now();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        openModal(ui.modal === "shortcuts" ? null : "shortcuts");
      } else if (e.key === "/") {
        e.preventDefault();
        openModal("search");
      } else if (k === "n") {
        e.preventDefault();
        openModal("newTask");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-b-2 bg-muted px-1.5 py-0.5 font-sans text-xs font-semibold text-foreground">
    {children}
  </kbd>
);

const GROUPS: { title: string; rows: [React.ReactNode, string][] }[] = [
  {
    title: "Geral",
    rows: [
      [<Key key="n">N</Key>, "Nova tarefa"],
      [
        <span key="s" className="flex gap-1">
          <Key>/</Key> ou <Key>{IS_MAC ? "⌘" : "Ctrl"}</Key>
          <Key>K</Key>
        </span>,
        "Buscar",
      ],
      [<Key key="q">?</Key>, "Mostrar estes atalhos"],
      [<Key key="e">Esc</Key>, "Fechar o painel ou a janela aberta"],
      [
        <span key="d" className="flex gap-1">
          <Key>{MOD.replace("+", "")}</Key>
          <Key>{IS_MAC ? "⌫" : "Delete"}</Key>
        </span>,
        "Excluir o item em foco (com Desfazer)",
      ],
    ],
  },
  {
    title: "Ir para (G e depois a letra)",
    rows: Object.entries(GOTO).map(([k, v]) => [
      <span key={k} className="flex gap-1">
        <Key>G</Key>
        <Key>{k.toUpperCase()}</Key>
      </span>,
      v.label,
    ]),
  },
];

/** The "?" window: every keyboard shortcut. */
export function ShortcutsDialog() {
  const open = useStore((s) => s.ui.modal === "shortcuts");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && openModal(null)}>
      <DialogContent data-shortcuts className="sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-3">
          <Mascot pose="anota" size={44} />
          <div className="flex flex-col gap-1 text-left">
            <DialogTitle>Atalhos do teclado</DialogTitle>
            <DialogDescription>Funcionam fora dos campos de texto.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{g.title}</h3>
              <ul className="flex flex-col gap-1.5">
                {g.rows.map(([keys, label], i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    {keys}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
