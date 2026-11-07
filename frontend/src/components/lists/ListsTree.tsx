import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderInput,
  FolderPlus,
  FolderX,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Page } from "@/lib/types";
import { cn } from "@/lib/utils";
import { childrenOf, groupOf } from "@/lib/model";
import { boardFolderList } from "@/lib/notes";
import { TASK_MIME, draggedTask } from "@/lib/dnd";
import {
  archivePage,
  celebrate,
  deleteBoardFolder,
  deleteBoardFolderWithLists,
  deletePage,
  go,
  moveBoardFolder,
  moveItemTo,
  movePage,
  openModal,
  renameBoardFolder,
  renamePage,
  setBoardFolderIcon,
  setPageFolder,
  useStore,
} from "@/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { UiIcon } from "../brand/Brand";
import { IconPicker } from "../IconPicker";
import { Glyph } from "../icons";
import { BoardDialog } from "../app/BoardDialog";
import { FolderGlyph } from "../app/folderIcons";
import { FolderDialog, nameOf, parentOf } from "./FolderDialog";

type TreeDialog =
  | { kind: "edit"; pageId: string }
  | { kind: "newBoard"; folder: string }
  | { kind: "newFolder"; parent: string }
  | { kind: "renameFolder"; path: string };

const OPEN_KEY = "board-folders-open";
function readOpenFolders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * Ids that just appeared in `ids` (never on the first render), for a moment: used to animate a folder
 * or list that was just created. Only when the list grew, so renames don't count.
 */
function useJustAdded(ids: string[], ms = 1200) {
  const prev = useRef<Set<string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [fresh, setFresh] = useState<string[]>([]);
  const key = ids.join("\n");
  useEffect(() => {
    const before = prev.current;
    prev.current = new Set(ids);
    if (!before || ids.length <= before.size) return;
    const added = ids.filter((id) => !before.has(id));
    if (!added.length) return;
    setFresh(added);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFresh([]), ms);
  }, [key]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return fresh;
}

/** A row's "⋯" button: shows on hover or focus (always on touch screens). */
const ROW_ACTION =
  "flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:opacity-100 pointer-coarse:opacity-100 [&_svg]:size-4";

/**
 * The folders and task lists (and only them): open/close folders, drag lists and folders between
 * folders, drop a task on a list to move it, rename with a double click, change icons, archive and
 * delete. Used by the panel beside a list (computer) and the sheet (phone).
 */
export function ListsTree({ onNavigate, filter = "" }: { onNavigate?: () => void; filter?: string }) {
  const ws = useStore((s) => s.ws);
  const route = useStore((s) => s.ui.route);
  const [dialog, setDialog] = useState<TreeDialog | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const [removeFolder, setRemoveFolder] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState(readOpenFolders);
  /** What is being dragged, the folder it would land in ("" = top level) and which row is being renamed. */
  const [drag, setDrag] = useState<{ kind: "folder" | "board"; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const icons = ws.settings.boardFolderIcons ?? {};
  const allBoards = childrenOf(ws, null).filter((p) => p.type === "db");
  const boards = allBoards.filter((p) => !p.archived);
  const archived = allBoards.filter((p) => p.archived);
  const q = filter.trim().toLocaleLowerCase("pt-BR");
  const matches = (p: Page) => !q || (p.title || "").toLocaleLowerCase("pt-BR").includes(q);
  // Open tasks per list, shown next to its name.
  const openCount = new Map<string, number>();
  for (const it of Object.values(ws.items)) {
    const db = ws.dbs[it.db];
    if (db && groupOf(db, it) !== "done") openCount.set(it.db, (openCount.get(it.db) ?? 0) + 1);
  }
  const folders = boardFolderList(ws);
  const newFolders = useJustAdded(folders);
  const newBoards = useJustAdded(boards.map((p) => p.id));
  const activeFolder = boards.find((p) => p.id === route)?.folder;
  const saveOpen = (next: string[]) => {
    setOpenFolders(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* private mode: just don't remember */
    }
  };
  const toggleFolder = (path: string) =>
    saveOpen(openFolders.includes(path) ? openFolders.filter((f) => f !== path) : [...openFolders, path]);
  const showFolder = (path: string) => {
    const chain = path.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"));
    saveOpen([...new Set([...openFolders, ...chain])]);
  };
  // Opening a list (or creating one inside a folder) unfolds the folders around it.
  useEffect(() => {
    if (activeFolder) showFolder(activeFolder);
  }, [route, activeFolder]);

  const canDrop = (into: string) => {
    if (!drag) return false;
    if (drag.kind === "board") return (boards.find((p) => p.id === drag.id)?.folder ?? "") !== into;
    return drag.id !== into && !into.startsWith(drag.id + "/") && parentOf(drag.id) !== into;
  };
  const dropProps = (into: string) => ({
    onDragOver: (e: React.DragEvent) => {
      // Stop here even when the drop isn't allowed, so the folder around it doesn't light up instead.
      e.stopPropagation();
      if (!canDrop(into)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== into) setOver(into);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === into ? null : o));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (drag && canDrop(into)) {
        if (drag.kind === "board") setPageFolder(drag.id, into, true);
        else moveBoardFolder(drag.id, into);
        if (into) showFolder(into);
      }
      setDrag(null);
      setOver(null);
    },
  });
  const dragProps = (kind: "folder" | "board", id: string) => ({
    draggable: renaming === null,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
      setDrag({ kind, id });
    },
    onDragEnd: () => {
      setDrag(null);
      setOver(null);
    },
  });
  const nav = (id: string) => {
    go(id);
    onNavigate?.();
  };

  /** Lists and subfolders directly inside `parent` ("" is the top level); hides what the filter leaves out. */
  const hasMatch = (f: string): boolean => boards.some((p) => (p.folder === f || p.folder?.startsWith(f + "/")) && matches(p));
  const tree = (parent: string) => {
    const subs = folders.filter((f) => parentOf(f) === parent && (!q || hasMatch(f)));
    const here = boards.filter((p) => (p.folder ?? "") === parent && matches(p));
    return (
      <>
        {subs.map((f) => {
          const isOpen = !!q || openFolders.includes(f);
          const count = boards
            .filter((p) => p.folder === f || p.folder?.startsWith(f + "/"))
            .reduce((n, p) => n + (openCount.get(p.id) ?? 0), 0);
          return (
            <li
              key={"f:" + f}
              {...dropProps(f)}
              data-trash={"folder:" + f}
              className={cn(
                "rounded-xl transition-colors",
                newFolders.includes(f) && "folder-new",
                over === f && "bg-primary/10 ring-2 ring-primary-strong/50",
                drag?.id === f && "opacity-50",
              )}
            >
              <div className="group/row relative flex h-9 items-center gap-1 rounded-xl pr-1 transition-colors hover:bg-muted">
                {renaming === "f:" + f ? (
                  <InlineName
                    value={nameOf(f)}
                    label="Nome da pasta"
                    onDone={(v) => {
                      setRenaming(null);
                      const clean = v.replace(/\//g, "-").trim();
                      if (clean && clean !== nameOf(f)) renameBoardFolder(f, (parentOf(f) ? parentOf(f) + "/" : "") + clean);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    {...dragProps("folder", f)}
                    aria-expanded={isOpen}
                    title="Clique para abrir. Clique duas vezes para renomear. Arraste para mover."
                    onClick={(e) => e.detail < 2 && toggleFolder(f)}
                    onDoubleClick={() => setRenaming("f:" + f)}
                    className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-xl pl-1.5 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                        isOpen && "rotate-90",
                      )}
                      aria-hidden="true"
                    />
                    <IconSpot
                      label="Trocar ícone da pasta"
                      folder
                      value={icons[f] ?? ""}
                      onPick={(v) => setBoardFolderIcon(f, v)}
                    >
                      <FolderGlyph icon={icons[f]} open={isOpen} />
                    </IconSpot>
                    <span className="truncate">{nameOf(f)}</span>
                    {count > 0 && (
                      <span className="ml-auto pl-1 text-xs font-medium text-muted-foreground tabular-nums group-hover/row:hidden group-focus-within/row:hidden pointer-coarse:hidden">
                        {count}
                      </span>
                    )}
                  </button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`Opções da pasta ${nameOf(f)}`} className={cn(ROW_ACTION, "ml-auto")}>
                      <MoreHorizontal />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "newBoard", folder: f })}>
                        <Plus />
                        Nova lista aqui
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "newFolder", parent: f })}>
                        <FolderPlus />
                        Nova subpasta
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "renameFolder", path: f })}>
                        <Pencil />
                        Renomear e trocar ícone
                      </DropdownMenuItem>
                      {parentOf(f) && (
                        <DropdownMenuItem onSelect={() => moveBoardFolder(f, "")}>
                          <FolderInput />
                          Tirar da pasta {nameOf(parentOf(f))}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => deleteBoardFolder(f)}>
                        <FolderX />
                        Excluir só a pasta (mantém as listas)
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setRemoveFolder(f)}>
                        <Trash2 />
                        Excluir pasta, listas e tarefas
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {isOpen && (
                // Inside a folder: indented, with a thin guide line.
                <ul className="mt-0.5 mb-1 ml-[1.05rem] flex flex-col gap-0.5 border-l border-border/80 pl-1.5">
                  {tree(f)}
                  {!folders.some((x) => parentOf(x) === f) && !boards.some((p) => p.folder === f) && (
                    <li className="px-2 py-1.5 text-xs text-muted-foreground">Pasta vazia</li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
        {here.map((p, i) => (
          <BoardRow
            key={p.id}
            p={p}
            active={route === p.id}
            first={i === 0}
            last={i === here.length - 1}
            fresh={newBoards.includes(p.id)}
            dragging={drag?.id === p.id}
            renaming={renaming === "b:" + p.id}
            dragProps={dragProps("board", p.id)}
            dropProps={dropProps(p.folder ?? "")}
            onOpen={() => nav(p.id)}
            onStartRename={() => setRenaming("b:" + p.id)}
            onRenamed={(title) => {
              setRenaming(null);
              if (title.trim() && title.trim() !== p.title) {
                renamePage(p.id, title);
                celebrate("Lista renomeada", `Agora se chama “${title.trim()}”`, "anota");
              }
            }}
            onEdit={() => setDialog({ kind: "edit", pageId: p.id })}
            onRemove={() => setRemove(p.id)}
            onArchive={() => archivePage(p.id, true)}
            count={openCount.get(p.id) ?? 0}
          />
        ))}
      </>
    );
  };

  const toRemove = ws.pages.find((p) => p.id === remove);
  const removeCount = remove ? Object.values(ws.items).filter((i) => i.db === remove).length : 0;
  const inFolder = (f?: string) => !!removeFolder && !!f && (f === removeFolder || f.startsWith(removeFolder + "/"));
  const folderLists = allBoards.filter((p) => inFolder(p.folder));
  const folderTasks = Object.values(ws.items).filter((i) => folderLists.some((p) => p.id === i.db)).length;
  const empty = q && !boards.some(matches);

  return (
    <div className="flex flex-col gap-1" {...dropProps("")}>
      <ul className="flex flex-col gap-0.5">{tree("")}</ul>
      {empty && <p className="px-2 py-2 text-sm text-muted-foreground">Nenhuma lista com “{filter.trim()}”.</p>}
      {drag && canDrop("") && (
        <p
          className={cn(
            "rounded-xl border-2 border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors",
            over === "" ? "border-primary-strong bg-primary/10 text-foreground" : "border-border",
          )}
        >
          Solte aqui para tirar da pasta
        </p>
      )}
      <button
        type="button"
        onClick={() => openModal("newBoard")}
        className="mt-1 flex h-9 items-center gap-2 rounded-xl border border-dashed border-border px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary-strong/50 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Plus className="size-4" aria-hidden="true" />
        Nova lista
      </button>
      {/* Archived lists: out of the way, one click to see and bring back. */}
      {archived.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived(!showArchived)}
            className="flex h-8 w-full items-center gap-2 rounded-xl px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Archive className="size-3.5" aria-hidden="true" />
            Arquivadas ({archived.length})
            <ChevronRight
              className={cn("ml-auto size-3.5 transition-transform", showArchived && "rotate-90")}
              aria-hidden="true"
            />
          </button>
          {showArchived && (
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {archived.map((p) => (
                <li key={p.id} className="group/row flex h-9 items-center gap-1 rounded-xl pr-1 hover:bg-muted">
                  <button
                    type="button"
                    title={p.title}
                    onClick={() => nav(p.id)}
                    className={cn(
                      "flex h-full min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      route === p.id && "font-semibold text-foreground",
                    )}
                  >
                    <Glyph icon={p.icon} size="sm" className="opacity-70" />
                    <span className="truncate">{p.title}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Desarquivar ${p.title}`}
                    title="Desarquivar"
                    onClick={() => archivePage(p.id, false)}
                    className={ROW_ACTION}
                  >
                    <ArchiveRestore />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {dialog?.kind === "edit" && <BoardDialog pageId={dialog.pageId} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog?.kind === "newBoard" && <BoardDialog folder={dialog.folder} open onOpenChange={(o) => !o && setDialog(null)} />}
      {(dialog?.kind === "newFolder" || dialog?.kind === "renameFolder") && (
        <FolderDialog
          parent={dialog.kind === "newFolder" ? dialog.parent : parentOf(dialog.path)}
          current={dialog.kind === "renameFolder" ? dialog.path : undefined}
          onClose={() => setDialog(null)}
          onSaved={showFolder}
        />
      )}
      <AlertDialog open={!!removeFolder} onOpenChange={(o) => !o && setRemoveFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a pasta “{removeFolder && nameOf(removeFolder)}” com tudo dentro?</AlertDialogTitle>
            <AlertDialogDescription>
              Saem {folderLists.length} {folderLists.length === 1 ? "lista" : "listas"} e {folderTasks}{" "}
              {folderTasks === 1 ? "tarefa" : "tarefas"}
              {folderLists.length ? ` (${folderLists.map((p) => p.title).join(", ")})` : ""}. Você pode desfazer logo em seguida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => removeFolder && deleteBoardFolderWithLists(removeFolder)}>
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{toRemove?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeCount
                ? `A lista e as ${removeCount} ${removeCount === 1 ? "tarefa" : "tarefas"} dela serão excluídas.`
                : "A lista será excluída (ela não tem tarefas)."}{" "}
              Você pode desfazer logo em seguida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove && deletePage(remove)}>
              Excluir lista
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The header of the panel/sheet: title, folder count and the two "new" buttons. */
export function ListsTreeHeader({ onNewFolder }: { onNewFolder: () => void }) {
  const ws = useStore((s) => s.ws);
  const folders = boardFolderList(ws).filter((f) => !f.includes("/")).length;
  const lists = ws.pages.filter((p) => p.type === "db" && !p.archived).length;
  return (
    <div className="flex items-center gap-1">
      <h2 className="text-[15px] font-bold">Listas</h2>
      <span className="ml-1 text-xs text-muted-foreground tabular-nums">
        {folders ? `${folders} ${folders === 1 ? "pasta" : "pastas"}` : `${lists} ${lists === 1 ? "lista" : "listas"}`}
      </span>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Criar nova pasta"
            onClick={onNewFolder}
            className="ml-auto flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {/* Creating a folder: a pixel-art folder with a "+". */}
            <UiIcon name="newFolder" size={22} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Criar nova pasta</TooltipContent>
      </Tooltip>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Criar nova lista"
            onClick={() => openModal("newBoard")}
            className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {/* Creating a list: a pixel-art checklist with a "+". */}
            <UiIcon name="newList" size={22} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Criar nova lista</TooltipContent>
      </Tooltip>
    </div>
  );
}

function BoardRow({
  p,
  active,
  first,
  last,
  fresh,
  dragging,
  renaming,
  dragProps,
  dropProps,
  onOpen,
  onStartRename,
  onRenamed,
  onEdit,
  onRemove,
  onArchive,
  count,
}: {
  p: Page;
  active: boolean;
  first: boolean;
  last: boolean;
  /** Just created: slides in with a glow. */
  fresh: boolean;
  dragging: boolean;
  renaming: boolean;
  dragProps: React.HTMLAttributes<HTMLElement> & { draggable: boolean };
  dropProps: React.HTMLAttributes<HTMLElement>;
  onOpen: () => void;
  onStartRename: () => void;
  onRenamed: (title: string) => void;
  onEdit: () => void;
  onRemove: () => void;
  onArchive: () => void;
  /** Open tasks in the list. */
  count: number;
}) {
  const [taskOver, setTaskOver] = useState(false);
  // A task card from a board can be dropped here: it moves to this list.
  const isTask = (e: React.DragEvent) => e.dataTransfer.types.includes(TASK_MIME);
  const canMove = () => {
    const id = draggedTask();
    return !!id && useStore.getState().ws.items[id]?.db !== p.id;
  };
  return (
    <li
      {...dropProps}
      // Can be dragged to the trash, which asks before deleting.
      data-trash={"page:" + p.id}
      onDragOver={(e) => {
        if (!isTask(e)) return dropProps.onDragOver?.(e);
        e.stopPropagation();
        if (!canMove()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setTaskOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setTaskOver(false);
        dropProps.onDragLeave?.(e);
      }}
      onDrop={(e) => {
        if (!isTask(e)) return dropProps.onDrop?.(e);
        e.preventDefault();
        e.stopPropagation();
        setTaskOver(false);
        const id = draggedTask();
        if (id && canMove()) moveItemTo(id, p.id);
      }}
      title={taskOver ? `Soltar para mover para ${p.title}` : undefined}
      className={cn(
        "group/row relative flex h-9 items-center gap-1 rounded-xl pr-1 transition-colors",
        active ? "bg-primary/12" : "hover:bg-muted",
        // The open list: a short bar in the accent color on its left edge.
        active &&
          "before:absolute before:top-2 before:bottom-2 before:-left-px before:w-[3px] before:rounded-full before:bg-primary-strong",
        fresh && "board-new",
        dragging && "opacity-50",
        taskOver && "bg-primary/10 ring-2 ring-primary-strong/50",
      )}
    >
      {renaming ? (
        <InlineName value={p.title} label="Nome da lista" icon={p.icon} onDone={onRenamed} />
      ) : (
        <button
          type="button"
          {...dragProps}
          aria-current={active ? "page" : undefined}
          title={`${p.title || "Sem título"} · ${count ? `${count} ${count === 1 ? "tarefa aberta" : "tarefas abertas"}` : "sem tarefas abertas"}. Clique duas vezes para renomear; arraste para uma pasta.`}
          onClick={(e) => e.detail < 2 && onOpen()}
          onDoubleClick={onStartRename}
          className={cn(
            "flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-xl pl-2.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            active ? "font-semibold text-foreground" : "font-medium text-foreground/85",
          )}
        >
          <IconSpot label="Trocar ícone da lista" value={p.icon} onPick={(v) => renamePage(p.id, p.title, v)}>
            <Glyph icon={p.icon} size="sm" className={cn(active && "text-primary-strong")} />
          </IconSpot>
          <span className="truncate">{p.title || "Sem título"}</span>
          {count > 0 && (
            <span
              className={cn(
                "ml-auto pl-1 text-xs tabular-nums group-hover/row:hidden group-focus-within/row:hidden pointer-coarse:hidden",
                active ? "font-semibold text-primary-strong" : "text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {count}
            </span>
          )}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Opções de ${p.title}`} className={cn(ROW_ACTION, "ml-auto")}>
            <MoreHorizontal />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onStartRename}>
              <Pencil />
              Renomear
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>
              <FolderInput />
              Mover para pasta e ícone
            </DropdownMenuItem>
            <DropdownMenuItem disabled={first} onSelect={() => movePage(p.id, -1)}>
              <ChevronUp />
              Mover para cima
            </DropdownMenuItem>
            <DropdownMenuItem disabled={last} onSelect={() => movePage(p.id, 1)}>
              <ChevronDown />
              Mover para baixo
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onArchive}>
              <Archive />
              Arquivar lista
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 />
              Excluir lista
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Renaming in place: Enter or leaving the field saves, Esc cancels. */
function InlineName({
  value,
  label,
  icon,
  onDone,
}: {
  value: string;
  label: string;
  icon?: string;
  onDone: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  // Esc or Enter decide once; the blur that may follow when the field goes away doesn't count.
  const decided = useRef(false);
  const finish = (next: string) => {
    if (decided.current) return;
    decided.current = true;
    onDone(next);
  };
  return (
    <div className="flex h-9 flex-1 items-center gap-2 px-1.5">
      {icon && <Glyph icon={icon} size="sm" />}
      <Input
        autoFocus
        aria-label={label}
        value={v}
        className="h-7 px-2"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => finish(v)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(v);
          if (e.key === "Escape") finish(value);
        }}
      />
    </div>
  );
}

/** The icon in a row: one click opens the icon picker (the row's menu also has it, for the keyboard). */
function IconSpot({
  label,
  onPick,
  value,
  folder,
  children,
}: {
  label: string;
  value: string;
  onPick: (v: string) => void;
  folder?: boolean;
  children: React.ReactNode;
}) {
  return (
    <IconPicker value={value} onChange={onPick} label={label} folder={folder}>
      <span
        aria-hidden="true"
        title={label}
        className="-m-1 flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 transition-colors hover:bg-background/80 data-[state=open]:bg-background"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {children}
      </span>
    </IconPicker>
  );
}
