import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderInput,
  FolderPlus,
  FolderX,
  Home,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Settings,
  Sprout,
  Trash2,
} from "lucide-react";
import type { Page } from "@/lib/types";
import { cn } from "@/lib/utils";
import { childrenOf, groupOf } from "@/lib/model";
import { boardFolderList } from "@/lib/notes";
import {
  addBoardFolder,
  archivePage,
  moveItemTo,
  celebrate,
  deleteBoardFolder,
  deleteBoardFolderWithLists,
  deletePage,
  go,
  moveBoardFolder,
  movePage,
  openModal,
  openNotes,
  renameBoardFolder,
  renamePage,
  setBoardFolderIcon,
  setPageFolder,
  useStore,
} from "@/store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BoardDialog } from "./BoardDialog";
import { IconPicker } from "../IconPicker";
import { Glyph } from "../icons";
import { SidebarTrash } from "./TrashDropZone";
import { useBackToClose } from "@/lib/backClose";
import { FolderGlyph } from "./folderIcons";
import { TASK_MIME, draggedTask } from "@/lib/dnd";
import { emojiOf } from "@/lib/util";

type SideDialog =
  | { kind: "edit"; pageId: string }
  | { kind: "newBoard"; folder: string }
  | { kind: "newFolder"; parent: string }
  | { kind: "renameFolder"; path: string };

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const OPEN_KEY = "board-folders-open";
function readOpenFolders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) || "[]");
  } catch {
    return [];
  }
}

export function Logo() {
  return (
    <span aria-hidden="true" className="flex h-6 items-end gap-1">
      <span className="h-6 w-2 rounded-full bg-area-coral" />
      <span className="h-4 w-2 rounded-full bg-area-petrol" />
      <span className="h-5 w-2 rounded-full bg-area-violet" />
    </span>
  );
}

export function AppSidebar() {
  const pages = useStore((s) => s.ws.pages);
  const route = useStore((s) => s.ui.route);
  const ws = useStore((s) => s.ws);
  const { openMobile, setOpenMobile, isMobile } = useSidebar();
  const [dialog, setDialog] = useState<SideDialog | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const [removeFolder, setRemoveFolder] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState(readOpenFolders);
  /** What is being dragged, the folder it would land in ("" = top level) and which row is being renamed. */
  const [drag, setDrag] = useState<{ kind: "folder" | "board"; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const icons = ws.settings.boardFolderIcons ?? {};
  const allBoards = childrenOf(ws, null).filter((p) => p.type === "db");
  const boards = allBoards.filter((p) => !p.archived);
  const archived = allBoards.filter((p) => p.archived);
  const [showArchived, setShowArchived] = useState(false);
  // Open tasks per list, shown next to its name.
  const openCount = (id: string) => {
    const db = ws.dbs[id];
    return db ? Object.values(ws.items).filter((i) => i.db === id && groupOf(db, i) !== "done").length : 0;
  };
  const folders = boardFolderList(ws);
  // Opening a list (or creating one inside a folder) unfolds the folders around it.
  const activeFolder = boards.find((p) => p.id === route)?.folder;
  const toggleFolder = (path: string) => {
    const next = openFolders.includes(path) ? openFolders.filter((f) => f !== path) : [...openFolders, path];
    setOpenFolders(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* private mode: just don't remember */
    }
  };
  const showFolder = (path: string) => {
    const chain = path.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"));
    const next = [...new Set([...openFolders, ...chain])];
    setOpenFolders(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* private mode: just don't remember */
    }
  };

  useEffect(() => {
    if (activeFolder) showFolder(activeFolder);
    // Only when another list is opened; the person can still close the folder afterwards.
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

  /** The lists and subfolders directly inside `parent` ("" is the top level). */
  const tree = (parent: string) => {
    const subs = folders.filter((f) => parentOf(f) === parent);
    const here = boards.filter((p) => (p.folder ?? "") === parent);
    return (
      <>
        {subs.map((f) => {
          const isOpen = openFolders.includes(f);
          const count = boards.filter((p) => p.folder === f || p.folder?.startsWith(f + "/")).length;
          return (
            <SidebarMenuItem
              key={"f:" + f}
              {...dropProps(f)}
              data-trash={"folder:" + f}
              className={cn(
                "rounded-lg transition-colors",
                over === f && "bg-primary/10 ring-2 ring-primary/50",
                drag?.id === f && "opacity-50",
              )}
            >
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
                <SidebarMenuButton
                  {...dragProps("folder", f)}
                  aria-expanded={isOpen}
                  title="Clique para abrir. Clique duas vezes para renomear. Arraste para mover."
                  onClick={(e) => e.detail < 2 && toggleFolder(f)}
                  onDoubleClick={() => setRenaming("f:" + f)}
                >
                  <ChevronRight
                    className={cn("-mx-1 size-4! shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")}
                  />
                  <IconSpot label="Trocar ícone da pasta" folder value={icons[f] ?? ""} onPick={(v) => setBoardFolderIcon(f, v)}>
                    <FolderGlyph icon={icons[f]} open={isOpen} />
                  </IconSpot>
                  <span>{nameOf(f)}</span>
                  {!isOpen && count > 0 && (
                    <span className="ml-auto pr-6 text-xs text-muted-foreground tabular-nums">{count}</span>
                  )}
                </SidebarMenuButton>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover aria-label={`Opções da pasta ${nameOf(f)}`}>
                    <MoreHorizontal />
                  </SidebarMenuAction>
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
              {isOpen && (
                <SidebarMenuSub className="mr-0 pr-0">
                  {tree(f)}
                  {subs.length === 0 && count === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">Pasta vazia</li>}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
          );
        })}
        {here.map((p, i) => (
          <BoardItem
            key={p.id}
            p={p}
            active={route === p.id}
            first={i === 0}
            last={i === here.length - 1}
            dragging={drag?.id === p.id}
            renaming={renaming === "b:" + p.id}
            dragProps={dragProps("board", p.id)}
            dropProps={dropProps(p.folder ?? "")}
            onOpen={nav(() => go(p.id))}
            onStartRename={() => setRenaming("b:" + p.id)}
            onRenamed={(title) => {
              setRenaming(null);
              if (title.trim() && title.trim() !== p.title) {
                renamePage(p.id, title);
                celebrate("Lista renomeada", `Agora se chama “${title.trim()}”`, emojiOf(p.icon, "✏️"));
              }
            }}
            onEdit={() => setDialog({ kind: "edit", pageId: p.id })}
            onRemove={() => setRemove(p.id)}
            onArchive={() => archivePage(p.id, true)}
            count={openCount(p.id)}
          />
        ))}
      </>
    );
  };
  const fixed = (type: string) => pages.find((p) => p.type === type);
  // On phones the menu is a drawer: Back closes it.
  useBackToClose(isMobile && openMobile, () => setOpenMobile(false));
  const nav = (fn: () => void) => () => {
    fn();
    if (isMobile) setOpenMobile(false);
  };
  const home = fixed("home"),
    cal = fixed("calendar"),
    habits = fixed("habits");
  const toRemove = pages.find((p) => p.id === remove);
  const removeCount = remove ? Object.values(ws.items).filter((i) => i.db === remove).length : 0;
  const inFolder = (f?: string) => !!removeFolder && !!f && (f === removeFolder || f.startsWith(removeFolder + "/"));
  const folderLists = allBoards.filter((p) => inFolder(p.folder));
  const folderTasks = Object.values(ws.items).filter((i) => folderLists.some((p) => p.id === i.db)).length;

  return (
    <Sidebar>
      <SidebarHeader className="gap-4 px-3 pt-5">
        <div className="flex items-center gap-2.5 px-1">
          <Logo />
          <span className="truncate text-lg font-extrabold tracking-tight">Organizer</span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={nav(() => openModal("search"))} className="text-muted-foreground">
              <Search />
              <span>Buscar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {home && (
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={route === home.id} onClick={nav(() => go(home.id))}>
                    <Home />
                    <span>Início</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton isActive={route === "notes"} onClick={nav(() => openNotes())}>
                  <NotebookPen />
                  <span>Anotações</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {cal && (
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={route === cal.id} onClick={nav(() => go(cal.id))}>
                    <CalendarDays />
                    <span>Calendário</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {habits && (
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={route === habits.id} onClick={nav(() => go(habits.id))}>
                    <Sprout />
                    <span>Hábitos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup {...dropProps("")}>
          <SidebarGroupLabel>Listas de tarefas</SidebarGroupLabel>
          <SidebarGroupAction
            title="Nova pasta"
            aria-label="Nova pasta de listas"
            className="right-11 pointer-coarse:right-14"
            onClick={() => setDialog({ kind: "newFolder", parent: "" })}
          >
            <FolderPlus />
          </SidebarGroupAction>
          <SidebarGroupAction title="Nova lista" aria-label="Nova lista de tarefas" onClick={nav(() => openModal("newBoard"))}>
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {tree("")}
              {drag && canDrop("") && (
                <li
                  className={cn(
                    "rounded-lg border-2 border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors",
                    over === "" ? "border-primary bg-primary/10 text-foreground" : "border-border",
                  )}
                >
                  Solte aqui para tirar da pasta
                </li>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton className="text-muted-foreground" onClick={nav(() => openModal("newBoard"))}>
                  <Plus />
                  <span>Nova lista</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {/* Archived lists: out of the way, one click to see and bring back. */}
              {archived.length > 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    aria-expanded={showArchived}
                    className="text-muted-foreground"
                    onClick={() => setShowArchived(!showArchived)}
                  >
                    <Archive />
                    <span>Arquivadas ({archived.length})</span>
                  </SidebarMenuButton>
                  {showArchived && (
                    <SidebarMenuSub className="mr-0 pr-0">
                      {archived.map((p) => (
                        <SidebarMenuItem key={p.id}>
                          <SidebarMenuButton
                            className="text-muted-foreground"
                            title={p.title}
                            isActive={route === p.id}
                            onClick={nav(() => go(p.id))}
                          >
                            <Glyph icon={p.icon} size="sm" className="opacity-70" />
                            <span>{p.title}</span>
                          </SidebarMenuButton>
                          <SidebarMenuAction
                            showOnHover
                            aria-label={`Desarquivar ${p.title}`}
                            title="Desarquivar"
                            onClick={() => archivePage(p.id, false)}
                          >
                            <ArchiveRestore />
                          </SidebarMenuAction>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {/* The trash works with or without an account (kept on this device when there is none). */}
          <SidebarTrash onOpen={nav(() => openModal("trash"))} />
          <SidebarMenuItem>
            <SidebarMenuButton onClick={nav(() => openModal("settings"))}>
              <Settings />
              <span>Configurações</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />

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
    </Sidebar>
  );
}

function BoardItem({
  p,
  active,
  first,
  last,
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
    <SidebarMenuItem
      {...dropProps}
      // Can be dragged to the sidebar trash (SidebarTrash), which asks before deleting.
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
      className={cn("rounded-lg transition-colors", dragging && "opacity-50", taskOver && "bg-primary/10 ring-2 ring-primary/50")}
    >
      {renaming ? (
        <InlineName value={p.title} label="Nome da lista" icon={p.icon} onDone={onRenamed} />
      ) : (
        <SidebarMenuButton
          {...dragProps}
          isActive={active}
          title={`${p.title || "Sem título"} · ${count ? `${count} ${count === 1 ? "tarefa aberta" : "tarefas abertas"}` : "sem tarefas abertas"}. Clique duas vezes para renomear; arraste para uma pasta.`}
          onClick={(e) => e.detail < 2 && onOpen()}
          onDoubleClick={onStartRename}
        >
          <IconSpot label="Trocar ícone da lista" value={p.icon} onPick={(v) => renamePage(p.id, p.title, v)}>
            <Glyph icon={p.icon} size="sm" />
          </IconSpot>
          <span>{p.title || "Sem título"}</span>
          {count > 0 && (
            <span
              className="ml-auto pl-1 text-xs text-muted-foreground tabular-nums group-hover/menu-item:opacity-0 group-focus-within/menu-item:opacity-0 pointer-coarse:hidden"
              aria-hidden="true"
            >
              {count}
            </span>
          )}
        </SidebarMenuButton>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover aria-label={`Opções de ${p.title}`}>
            <MoreHorizontal />
          </SidebarMenuAction>
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
    </SidebarMenuItem>
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
    <div className="flex h-10 items-center gap-2 px-1.5">
      {icon && <Glyph icon={icon} size="sm" />}
      <Input
        autoFocus
        aria-label={label}
        value={v}
        className="h-8 px-2"
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

/** The icon in a sidebar row: one click opens the icon picker (the row's menu also has it, for the keyboard). */
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
        className="-m-1 flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 transition-colors hover:bg-sidebar-border/70 data-[state=open]:bg-sidebar-border"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {children}
      </span>
    </IconPicker>
  );
}

/** Name a new folder (inside `parent`) or rename `current`. */
function FolderDialog({
  parent,
  current,
  onClose,
  onSaved,
}: {
  parent: string;
  current?: string;
  onClose: () => void;
  onSaved: (path: string) => void;
}) {
  const [name, setName] = useState(current ? nameOf(current) : "");
  const [icon, setIcon] = useState(() => (current && useStore.getState().ws.settings.boardFolderIcons?.[current]) || "");
  const nameRef = useRef<HTMLInputElement>(null);
  const save = () => {
    const clean = name.replace(/\//g, "-").trim();
    if (!clean) return;
    const full = (parent ? parent + "/" : "") + clean;
    if (current) renameBoardFolder(current, full);
    else addBoardFolder(full);
    setBoardFolderIcon(full, icon);
    onSaved(full);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={(e) => {
          // Start in the name field (not the icon button), also when opened from a menu.
          e.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {current ? "Renomear pasta" : parent ? `Nova pasta em ${parent.split("/").join(" › ")}` : "Nova pasta"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex gap-2">
            <IconPicker value={icon} onChange={setIcon} label="Ícone da pasta" folder>
              <Button type="button" variant="outline" size="icon" aria-label="Ícone da pasta" className="size-10 shrink-0">
                <FolderGlyph icon={icon} />
              </Button>
            </IconPicker>
            <Input
              ref={nameRef}
              autoComplete="off"
              aria-label="Nome da pasta"
              placeholder="Ex.: Faculdade, Casa, Trabalho…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {current ? "Salvar" : "Criar pasta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
