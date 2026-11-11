import { useEffect, useState, useSyncExternalStore } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteByShortcut } from "@/lib/shortcuts";
import { deleteBoardFolder, deleteBoardFolderWithLists, deletePage, useStore } from "@/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Dragged = { kind: string; id: string };
const KINDS = new Set(["task", "event", "todo", "note", "page", "folder"]);
const LABEL: Record<string, string> = {
  task: "a tarefa",
  event: "o evento",
  todo: "a tarefa",
  note: "a anotação",
  page: "a lista",
  folder: "a pasta",
};

/** What a drag started on: data-trash (lists, folders) or data-del (tasks, events, notes…), as "kind:id". */
function draggedFrom(target: EventTarget | null): Dragged | null {
  const el = (target as Element | null)?.closest?.("[data-trash], [data-del]");
  const v = el?.getAttribute("data-trash") || el?.getAttribute("data-del");
  const i = v?.indexOf(":") ?? -1;
  if (!v || i < 1) return null;
  const kind = v.slice(0, i);
  return KINDS.has(kind) ? { kind, id: v.slice(i + 1) } : null;
}

/* What is being dragged right now, readable anywhere (the sidebar trash, the phone's "Mais" button). */
let dragged: Dragged | null = null;
const subs = new Set<() => void>();
const setDragged = (d: Dragged | null) => {
  dragged = d;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
/** The item being dragged that could go to the trash, or null. */
export const useTrashDrag = () => useSyncExternalStore(subscribe, () => dragged);

/* Dropped on the trash: the burst and the confirmations live in <TrashDrops />. */
let onDropped: ((d: Dragged, x: number, y: number) => void) | null = null;

/**
 * Mounted once (App): follows drags (mouse or touch), and shows the burst where something was dropped
 * on the trash and the questions for lists and folders, since what's inside goes too.
 */
export function TrashDrops() {
  const [burst, setBurst] = useState<{ x: number; y: number; k: number } | null>(null);
  const [askPage, setAskPage] = useState<string | null>(null);
  const [askFolder, setAskFolder] = useState<string | null>(null);
  const pageTitle = useStore((s) => (askPage ? s.ws.pages.find((p) => p.id === askPage)?.title : undefined));
  const pageTasks = useStore((s) => (askPage ? Object.values(s.ws.items).filter((i) => i.db === askPage).length : 0));
  const inFolder = (f = "") => !!askFolder && (f === askFolder || f.startsWith(askFolder + "/"));
  const folderLists = useStore((s) => (askFolder ? s.ws.pages.filter((p) => p.type === "db" && inFolder(p.folder)).length : 0));

  useEffect(() => {
    const start = (e: DragEvent) => {
      const d = draggedFrom(e.target);
      // Next frame: changing the page right inside dragstart can cancel the drag in some browsers.
      if (d) requestAnimationFrame(() => setDragged(d));
    };
    const end = () => setDragged(null);
    // After a drop too: when the dropped item is deleted or moved, its dragend never reaches us.
    const dropped = () => requestAnimationFrame(end);
    document.addEventListener("dragstart", start, true);
    document.addEventListener("dragend", end, true);
    document.addEventListener("drop", dropped, true);
    onDropped = (d, x, y) => {
      setBurst({ x, y, k: Date.now() });
      navigator.vibrate?.(20);
      if (d.kind === "page") setAskPage(d.id);
      else if (d.kind === "folder") setAskFolder(d.id);
      else deleteByShortcut(d);
    };
    return () => {
      document.removeEventListener("dragstart", start, true);
      document.removeEventListener("dragend", end, true);
      document.removeEventListener("drop", dropped, true);
      onDropped = null;
    };
  }, []);

  return (
    <>
      {/* The burst where the item was dropped. */}
      {burst && (
        <div
          key={burst.k}
          aria-hidden="true"
          className="pointer-events-none fixed z-[60]"
          style={{ left: burst.x, top: burst.y }}
        >
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="trash-spark" style={{ "--a": `${i * 36}deg` } as React.CSSProperties} />
          ))}
          <span className="trash-ring" onAnimationEnd={() => setBurst(null)} />
        </div>
      )}

      <AlertDialog open={!!askPage} onOpenChange={(o) => !o && setAskPage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{pageTitle}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {pageTasks
                ? `A lista e as ${pageTasks} ${pageTasks === 1 ? "tarefa" : "tarefas"} dela serão excluídas.`
                : "A lista será excluída (ela não tem tarefas)."}{" "}
              Você pode desfazer logo em seguida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => askPage && deletePage(askPage)}>
              Excluir lista
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!askFolder} onOpenChange={(o) => !o && setAskFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a pasta “{askFolder?.split("/").pop()}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {folderLists
                ? `Ela tem ${folderLists} ${folderLists === 1 ? "lista" : "listas"}. Você pode manter as listas (elas saem da pasta) ou excluir tudo junto.`
                : "A pasta está vazia."}{" "}
              Você pode desfazer logo em seguida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {folderLists > 0 && (
              <AlertDialogAction variant="outline" onClick={() => askFolder && deleteBoardFolder(askFolder)}>
                Só a pasta
              </AlertDialogAction>
            )}
            <AlertDialogAction
              variant="destructive"
              onClick={() => askFolder && (folderLists ? deleteBoardFolderWithLists(askFolder) : deleteBoardFolder(askFolder))}
            >
              {folderLists ? "Excluir tudo" : "Excluir pasta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Drop-target behaviour shared by every "Lixeira" (sidebar row and the top bar button). */
export function useTrashTarget() {
  const drag = useTrashDrag();
  const [over, setOver] = useState(false);
  const [gulp, setGulp] = useState(0);
  useEffect(() => {
    if (!drag) setOver(false);
  }, [drag]);
  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!dragged) return;
      e.preventDefault();
      setOver(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!dragged) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (!over) setOver(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      const d = dragged;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      setGulp((g) => g + 1);
      onDropped?.(d, e.clientX, e.clientY);
    },
  };
  const what = LABEL[drag?.kind ?? "task"];
  return { drag, over, gulp, handlers, what };
}

/** The can itself: opens its lid while something hovers it and "gulps" on drop. */
export function TrashCan({ over, gulp }: { over: boolean; gulp: number }) {
  return (
    <span key={gulp} className={cn("flex", gulp > 0 && "trash-gulp")}>
      <span className={cn("trash-can flex", over && "trash-open")}>
        <Trash2 aria-hidden="true" />
      </span>
    </span>
  );
}

/**
 * "Lixeira" in the top bar: an icon button that works like the sidebar one. While something is being
 * dragged it opens up with a label, so it is an easy target on pages without the sidebar.
 */
export function HeaderTrash({ onOpen }: { onOpen: () => void }) {
  const { drag, over, gulp, handlers, what } = useTrashTarget();
  return (
    <button
      type="button"
      {...handlers}
      onClick={onOpen}
      aria-label="Lixeira"
      title={over ? `Soltar para excluir ${what}` : "Lixeira. Arraste algo até aqui para excluir."}
      className={cn(
        "flex h-9 min-w-9 items-center justify-center gap-2 rounded-xl px-2 text-muted-foreground md:h-10 md:min-w-10 md:px-2.5 transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-5",
        drag &&
          !over &&
          "bg-destructive/8 text-destructive md:px-3.5 outline-2 -outline-offset-2 outline-dashed outline-destructive/50",
        over && "scale-[1.04] bg-destructive! text-white! md:px-3.5 ring-2 ring-destructive",
      )}
    >
      <TrashCan over={over} gulp={gulp} />
      {drag && (
        // Phones: no room for the label next to the logo (the "+" at the bottom becomes the trash too).
        <span className="text-sm font-medium whitespace-nowrap max-md:hidden">{over ? `Soltar para excluir ${what}` : "Solte aqui"}</span>
      )}
    </button>
  );
}
