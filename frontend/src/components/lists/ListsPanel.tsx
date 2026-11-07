import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackToClose } from "@/lib/backClose";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ListsTree, ListsTreeHeader } from "./ListsTree";
import { FolderDialog } from "./FolderDialog";
import { setListsPanel, setListsSheet, useListsUi } from "./state";

function TreeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-xl border bg-background/60 px-2.5 text-sm text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
        placeholder="Filtrar listas"
        aria-label="Filtrar listas"
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar filtro"
          onClick={() => onChange("")}
          className="rounded-md p-0.5 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </label>
  );
}

/**
 * Computer and tablet: the folders and lists, in a card beside the list that's open (under the top bar).
 * Closes with the button in the list's header or Ctrl/⌘ + B; the choice is remembered.
 */
export function ListsPanel() {
  const open = useListsUi((s) => s.panel);
  const [filter, setFilter] = useState("");
  const [newFolder, setNewFolder] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b" && !e.defaultPrevented) {
        e.preventDefault();
        setListsPanel(!useListsUi.getState().panel);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none max-md:hidden",
        open ? "w-[18.5rem] opacity-100" : "w-0 opacity-0",
      )}
      inert={!open}
    >
      <aside
        aria-label="Pastas e listas"
        className="sticky top-16 flex h-[calc(100svh-4rem)] w-[18.5rem] flex-col py-5 pl-5 md:pl-6"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl border bg-card p-3 shadow-card">
          <div className="px-1 pt-1">
            <ListsTreeHeader onNewFolder={() => setNewFolder(true)} />
          </div>
          <TreeFilter value={filter} onChange={setFilter} />
          <div className="no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
            <ListsTree filter={filter} />
          </div>
        </div>
      </aside>
      {newFolder && <FolderDialog parent="" onClose={() => setNewFolder(false)} />}
    </div>
  );
}

/** Phones: the same folders and lists in a sheet from the left. */
export function ListsSheet() {
  const open = useListsUi((s) => s.sheet);
  const [filter, setFilter] = useState("");
  const [newFolder, setNewFolder] = useState(false);
  useBackToClose(open, () => setListsSheet(false));
  // Growing past phone size (rotating a tablet, resizing): the panel takes over, so the sheet closes.
  useEffect(() => {
    const mq = matchMedia("(min-width: 768px)");
    const close = () => mq.matches && setListsSheet(false);
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);
  return (
    <>
      <Sheet open={open} onOpenChange={setListsSheet}>
        <SheetContent side="left" className="w-[19rem] gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetHeader className="sr-only">
            <SheetTitle>Pastas e listas</SheetTitle>
            <SheetDescription>Escolha uma lista de tarefas.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 pt-5">
            <div className="pr-8">
              <ListsTreeHeader onNewFolder={() => setNewFolder(true)} />
            </div>
            <TreeFilter value={filter} onChange={setFilter} />
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-[env(safe-area-inset-bottom)]">
              <ListsTree filter={filter} onNavigate={() => setListsSheet(false)} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {newFolder && <FolderDialog parent="" onClose={() => setNewFolder(false)} />}
    </>
  );
}
