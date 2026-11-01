import { useCallback, useMemo, useRef, useState } from "react";
import {
  Bold,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Code,
  Download,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  PanelLeft,
  PanelRight,
  Pencil,
  Pin,
  Quote,
  Search,
  Sigma,
  Strikethrough,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Note } from "@/lib/types";
import { ago, extractTags, folderList, headings, plainSnippet } from "@/lib/notes";
import { toast as sonner } from "sonner";
import { IMAGE_TYPES, attachmentMarkdown, saveAttachment } from "@/lib/attachments";
import { exportNoteMd, exportNotesZip, readMarkdownFiles } from "@/lib/notesIO";
import {
  addFolder,
  createNote,
  deleteFolder,
  deleteNote,
  openDailyNote,
  openNotes,
  openPeek,
  renameFolder,
  renameNote,
  toast,
  updateNote,
  useStore,
} from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NoteEditor, type EditorApi } from "./NoteEditor";
import { NoteReader } from "./NoteReader";

const byTitle = (a: Note, b: Note) => a.title.localeCompare(b.title, "pt-BR", { numeric: true });
const ui = () => useStore.getState().setUi;

/**
 * Notes: a home with recent and pinned notes, and a roomy editor. The note list and the
 * side panel (outline) can be hidden; "Foco" hides everything but the note.
 */
export default function NotesView() {
  const tab = useStore((s) => s.ui.notesTab);
  const noteId = useStore((s) => s.ui.noteId);
  const note = useStore((s) => (noteId ? s.ws.notes[noteId] : undefined));
  const listOpen = useStore((s) => s.ui.notesList);
  const sideOpen = useStore((s) => s.ui.notesSide);
  const editorApi = useRef<EditorApi | null>(null);
  const phone = (t: string) => (tab !== t ? "max-md:hidden" : "");
  return (
    <div className="flex min-h-0 flex-1">
      {listOpen && (
        <aside
          className={cn("flex min-h-0 w-full shrink-0 flex-col border-r bg-sidebar/60 md:w-72", phone("list"))}
          aria-label="Lista de notas"
        >
          <NotesPanel />
        </aside>
      )}
      <section className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto", listOpen && phone("note"))} aria-label="Nota">
        {note ? <NotePane key={note.id} note={note} editorApi={editorApi} /> : <NotesHome />}
      </section>
      {note && sideOpen && (
        <aside className="hidden min-h-0 w-72 shrink-0 overflow-y-auto border-l xl:block" aria-label="Sumário">
          <NoteSide note={note} editorApi={editorApi} />
        </aside>
      )}
    </div>
  );
}

/* ---------- home: when no note is open ---------- */
function NotesHome() {
  const notes = useStore((s) => s.ws.notes);
  const extra = useStore((s) => s.ws.settings.noteFolders);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const list = Object.values(notes);
  const folders = folderList(notes, extra).filter((f) => !f.includes("/"));
  const query = q.trim().toLowerCase();
  const filtered = list
    .filter((n) => !query || n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query))
    .filter((n) => folder === null || n.folder === folder || n.folder.startsWith(folder + "/"))
    .sort((a, b) => b.updated - a.updated);
  const pinned = !query && folder === null ? filtered.filter((n) => n.pinned) : [];
  const recent = filtered.filter((n) => !pinned.includes(n));
  const count = (f: string) => list.filter((n) => n.folder === f || n.folder.startsWith(f + "/")).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 md:px-10">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Anotações</h1>
            <p className="text-muted-foreground">
              {list.length} {list.length === 1 ? "nota" : "notas"}
              {folders.length ? `, ${folders.length} ${folders.length === 1 ? "pasta" : "pastas"}` : ""}
            </p>
          </div>
          <Button variant="outline" onClick={openDailyNote}>
            <CalendarDays data-icon="inline-start" />
            Nota do dia
          </Button>
          <Button onClick={() => createNote({ folder: folder ?? "" })}>
            <FilePlus2 data-icon="inline-start" />
            Nova nota
          </Button>
        </div>
        <InputGroup className="h-11 bg-card">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            autoComplete="off"
            placeholder="Buscar em todas as notas…"
            aria-label="Buscar em todas as notas"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="text-base"
          />
        </InputGroup>
        {folders.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por pasta">
            <Button size="sm" variant={folder === null ? "secondary" : "ghost"} onClick={() => setFolder(null)}>
              Todas
            </Button>
            {folders.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={folder === f ? "secondary" : "ghost"}
                onClick={() => setFolder(folder === f ? null : f)}
              >
                <Folder data-icon="inline-start" />
                {f}
                <span className="text-muted-foreground tabular-nums">{count(f)}</span>
              </Button>
            ))}
          </div>
        )}
      </header>

      {pinned.length > 0 && <CardGrid title="Fixadas" notes={pinned} />}
      {recent.length > 0 ? (
        <CardGrid title={query ? "Resultados" : folder ? folder : "Recentes"} notes={recent.slice(0, query ? 60 : 24)} />
      ) : (
        !pinned.length && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{query ? "Nada encontrado" : "Nenhuma nota ainda"}</EmptyTitle>
              <EmptyDescription>
                {query ? "Tente outra palavra." : "Comece uma nota nova ou abra a nota do dia."}
              </EmptyDescription>
            </EmptyHeader>
            {!query && (
              <EmptyContent>
                <Button onClick={() => createNote()}>Nova nota</Button>
              </EmptyContent>
            )}
          </Empty>
        )
      )}
    </div>
  );
}

function CardGrid({ title, notes }: { title: string; notes: Note[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((n) => {
          const tags = extractTags(n.body).slice(0, 3);
          const snippet = plainSnippet(n.body);
          return (
            <button
              key={n.id}
              data-del={"note:" + n.id}
              onClick={() => openNotes(n.id)}
              className="group flex min-h-36 flex-col gap-2 rounded-xl border bg-card p-4 text-left shadow-xs transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex items-start gap-2">
                <span className="line-clamp-2 flex-1 font-semibold break-words">{n.title || "Sem título"}</span>
                {n.pinned && <Pin className="size-3.5 shrink-0 text-primary" aria-label="Fixada" />}
              </span>
              <span
                className={cn(
                  "line-clamp-3 flex-1 text-[15px] break-words",
                  snippet ? "text-muted-foreground" : "text-muted-foreground/60 italic",
                )}
              >
                {snippet || "Nota vazia"}
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {n.folder && (
                  <span className="flex items-center gap-1">
                    <Folder className="size-3" />
                    {n.folder}
                  </span>
                )}
                {tags.map((t) => (
                  <Badge key={t} variant="outline" className="h-5 px-1.5 text-[11px]">
                    #{t}
                  </Badge>
                ))}
                <span className="ml-auto tabular-nums">{ago(n.updated)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- left: folders and notes ---------- */
const CLOSED_KEY = "organizer:notes-closed";

function NotesPanel() {
  const notes = useStore((s) => s.ws.notes);
  const extra = useStore((s) => s.ws.settings.noteFolders);
  const current = useStore((s) => s.ui.noteId);
  const tag = useStore((s) => s.ui.noteTag);
  const setUi = useStore((s) => s.setUi);
  const [q, setQ] = useState("");
  // Which folders are folded: kept on this device, so Anotações reopens the way it was left.
  const [closed, setClosedState] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const setClosed = (fn: (c: Record<string, boolean>) => Record<string, boolean>) =>
    setClosedState((c) => {
      const next = Object.fromEntries(Object.entries(fn(c)).filter(([, v]) => v));
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ mode: "new" | "rename"; path: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const list = Object.values(notes);
  const folders = folderList(notes, extra);
  const currentFolder = current ? (notes[current]?.folder ?? "") : "";
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of Object.values(notes)) for (const t of extractTags(n.body)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [notes]);
  const query = q.trim().toLowerCase();
  const flat =
    query || tag
      ? list
          .filter(
            (n) =>
              (!query || n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query)) &&
              (!tag || extractTags(n.body).includes(tag)),
          )
          .sort(byTitle)
      : null;

  // Folders and notes catch the drop themselves (a note: into its folder); anywhere else in the list is the top level.
  const dropProps = (folder: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      e.stopPropagation();
      if (over !== folder) setOver(folder);
    },
    onDragLeave: () => setOver((o) => (o === folder ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (drag && notes[drag] && notes[drag].folder !== folder) {
        updateNote(drag, { folder });
        toast(`Movida para ${folder || "Anotações"}`);
      }
      setDrag(null);
      setOver(null);
    },
  });
  // Same title in more than one place: show the folder, so they can be told apart.
  const titleCount = new Map<string, number>();
  for (const n of Object.values(notes))
    titleCount.set(n.title.trim().toLowerCase(), (titleCount.get(n.title.trim().toLowerCase()) ?? 0) + 1);
  const noteRow = (n: Note, depth: number) => {
    const untitled = !n.title.trim() || /^sem título( \d+)?$/i.test(n.title.trim());
    const dup = (titleCount.get(n.title.trim().toLowerCase()) ?? 0) > 1;
    const open = n.id === current;
    return (
      <button
        key={n.id}
        data-del={"note:" + n.id}
        draggable
        aria-current={open ? "page" : undefined}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => openNotes(n.id)}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", n.id);
          requestAnimationFrame(() => setDrag(n.id));
        }}
        onDragEnd={() => {
          setDrag(null);
          setOver(null);
        }}
        {...dropProps(n.folder)}
        className={cn(
          "relative flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-[15px] hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          // The open note: highlighted row with a bar in the accent color.
          open &&
            "bg-sidebar-accent font-semibold text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-primary",
        )}
      >
        {n.pinned ? (
          <Pin className="size-4 shrink-0 text-primary" />
        ) : (
          <FileText className={cn("size-4 shrink-0", open ? "text-primary-strong" : "text-muted-foreground")} />
        )}
        <span className={cn("min-w-0 truncate", untitled && "text-muted-foreground italic")}>{n.title || "Sem título"}</span>
        {dup && (
          <span
            className="ml-auto shrink-0 truncate pl-1 text-xs font-normal text-muted-foreground"
            title={`Na pasta ${n.folder || "raiz"}`}
          >
            {n.folder ? n.folder.split("/").pop() : "sem pasta"}
          </span>
        )}
      </button>
    );
  };
  const notesIn = (folder: string) => {
    const xs = list.filter((n) => n.folder === folder).sort(byTitle);
    return folder.startsWith("Diário") ? xs.reverse() : xs.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  };
  const tree = (parent: string, depth: number): React.ReactNode[] => [
    ...folders
      .filter((f) => (parent ? f.startsWith(parent + "/") && !f.slice(parent.length + 1).includes("/") : !f.includes("/")))
      .map((f) => {
        const open = !closed[f];
        const name = f.split("/").pop()!;
        return (
          <div key={"f:" + f}>
            <div
              className={cn("group flex items-center rounded-md hover:bg-sidebar-accent", over === f && "ring-2 ring-primary")}
              style={{ paddingLeft: 2 + depth * 14 }}
              {...dropProps(f)}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left text-[15px] font-medium"
                onClick={() => setClosed((c) => ({ ...c, [f]: open }))}
                aria-expanded={open}
              >
                {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{name}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Opções da pasta ${name}`}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={() => createNote({ folder: f })}>
                      <FilePlus2 />
                      Nova nota aqui
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setFolderDialog({ mode: "new", path: f })}>
                      <FolderPlus />
                      Nova subpasta
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setFolderDialog({ mode: "rename", path: f })}>
                      <Pencil />
                      Renomear
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => deleteFolder(f)}>
                    <Trash2 />
                    Excluir pasta
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {open && tree(f, depth + 1)}
          </div>
        );
      }),
    ...notesIn(parent).map((n) => noteRow(n, depth)),
  ];

  return (
    <>
      <div
        className={cn("flex items-center gap-1 px-3 pt-3 pb-2", over === "" && "rounded-md ring-2 ring-primary")}
        {...dropProps("")}
      >
        {/* Short label so it fits next to the four buttons; goes to the overview of all notes. */}
        <button
          className="mr-auto min-w-0 truncate rounded-md px-1 text-[15px] font-semibold hover:text-primary-strong"
          title="Ver todas as notas"
          onClick={() => openNotes(null)}
        >
          Notas
        </button>
        <IconTip label="Nova nota">
          <Button variant="ghost" size="icon-sm" aria-label="Nova nota" onClick={() => createNote({ folder: currentFolder })}>
            <FilePlus2 />
          </Button>
        </IconTip>
        <IconTip label="Nova pasta">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Nova pasta"
            onClick={() => setFolderDialog({ mode: "new", path: currentFolder })}
          >
            <FolderPlus />
          </Button>
        </IconTip>
        <IconTip label="Nota do dia">
          <Button variant="ghost" size="icon-sm" aria-label="Nota do dia" onClick={openDailyNote}>
            <CalendarDays />
          </Button>
        </IconTip>
        <IconTip label="Esconder lista">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Esconder lista de notas"
            className="max-md:hidden"
            onClick={() =>
              setUi((u) => {
                u.notesList = false;
              })
            }
          >
            <PanelLeft />
          </Button>
        </IconTip>
      </div>
      <div className="flex flex-col gap-2 px-3 pb-2">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            autoComplete="off"
            placeholder="Filtrar notas…"
            aria-label="Filtrar notas"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </InputGroup>
        {tag && (
          <Badge variant="secondary" className="w-fit gap-1 pr-1">
            #{tag}
            <button
              aria-label="Limpar tag"
              className="rounded-full p-0.5 hover:bg-background"
              onClick={() =>
                setUi((u) => {
                  u.noteTag = null;
                })
              }
            >
              <X className="size-3" />
            </button>
          </Badge>
        )}
      </div>
      <nav className={cn("min-h-0 flex-1 overflow-y-auto px-2 pb-3", over === "" && "bg-primary/5")} {...dropProps("")}>
        {flat ? (
          flat.length ? (
            flat.map((n) => noteRow(n, 0))
          ) : (
            <p className="px-2 text-sm text-muted-foreground">Nenhuma nota encontrada.</p>
          )
        ) : list.length || folders.length ? (
          tree("", 0)
        ) : (
          <p className="px-2 text-sm text-muted-foreground">Nenhuma nota ainda. Crie a primeira no botão acima.</p>
        )}
        {/* While a note from a folder is dragged: where to drop it to take it out. */}
        {drag && notes[drag]?.folder && (
          <div
            className={cn(
              "mt-2 rounded-lg border-2 border-dashed px-3 py-3 text-center text-sm text-muted-foreground",
              over === "" ? "border-primary bg-primary/10 text-primary-strong" : "border-border",
            )}
          >
            Solte aqui para tirar da pasta
          </div>
        )}
        {tagCounts.length > 0 && !flat && (
          <div className="mt-5 flex flex-col gap-2 px-1">
            <span className="text-xs font-medium text-muted-foreground">Tags</span>
            <div className="flex flex-wrap gap-1">
              {tagCounts.slice(0, 30).map(([t, n]) => (
                <button
                  key={t}
                  onClick={() =>
                    setUi((u) => {
                      u.noteTag = t;
                    })
                  }
                >
                  <Badge variant="outline">
                    #{t} <span className="text-muted-foreground">{n}</span>
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>
      <div className="flex flex-wrap gap-1 border-t p-2">
        <Button variant="ghost" size="sm" disabled={!list.length} onClick={() => exportNotesZip(notes)}>
          <Download data-icon="inline-start" />
          Exportar .zip
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
          <Upload data-icon="inline-start" />
          Importar .md
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          multiple
          hidden
          onChange={async (e) => {
            const files = e.target.files;
            if (!files?.length) return;
            const imported = await readMarkdownFiles(files, notes, "Importadas");
            e.target.value = "";
            if (!imported.length) return toast("Nenhum arquivo .md encontrado");
            useStore.getState().mut((w) => {
              for (const n of imported) w.notes[n.id] = n;
            });
            openNotes(imported[0].id);
            toast(`${imported.length} ${imported.length === 1 ? "nota importada" : "notas importadas"} para “Importadas”`);
          }}
        />
      </div>
      {folderDialog && <FolderDialog {...folderDialog} onClose={() => setFolderDialog(null)} />}
    </>
  );
}

function IconTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function FolderDialog({ mode, path, onClose }: { mode: "new" | "rename"; path: string; onClose: () => void }) {
  const [name, setName] = useState(mode === "rename" ? path.split("/").pop()! : "");
  const parent = mode === "rename" ? (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "") : path;
  const save = () => {
    if (!name.trim()) return;
    const full = (parent ? parent + "/" : "") + name.trim();
    if (mode === "new") addFolder(full);
    else renameFolder(path, full);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "new" ? (parent ? `Nova pasta em ${parent}` : "Nova pasta") : "Renomear pasta"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            autoFocus
            autoComplete="off"
            aria-label="Nome da pasta"
            placeholder="Nome da pasta…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {mode === "new" ? "Criar pasta" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- the note ---------- */
function useTagFilter() {
  return useCallback(
    (t: string) =>
      ui()((u) => {
        u.noteTag = t;
        u.notesTab = "list";
        u.notesList = true;
      }),
    [],
  );
}

/** Saves pasted, dropped or chosen files and puts a reference to each one at the cursor. */
function useAttach(editorApi: React.MutableRefObject<EditorApi | null>, noteId: string) {
  return useCallback(
    async (files: File[]) => {
      for (const f of files) {
        const id = sonner.loading(`Enviando ${f.name}…`);
        try {
          const a = await saveAttachment(f);
          const md = "\n" + attachmentMarkdown(a) + "\n";
          // Without the editor on screen, add it at the end of the note instead of losing it.
          if (editorApi.current) editorApi.current.insert(md);
          else updateNote(noteId, { body: (useStore.getState().ws.notes[noteId]?.body ?? "") + md });
          sonner.success(a.kind === "image" ? "Imagem anexada" : "PDF anexado", { id });
        } catch (e) {
          sonner.error(e instanceof Error ? e.message : "Não foi possível anexar.", { id, duration: 10000 });
        }
      }
    },
    [editorApi, noteId],
  );
}

const TOOLS: { label: string; icon: typeof Bold; run: (api: EditorApi) => void; kbd?: string }[] = [
  { label: "Negrito", icon: Bold, run: (a) => a.wrap("**"), kbd: "B" },
  { label: "Itálico", icon: Italic, run: (a) => a.wrap("*"), kbd: "I" },
  { label: "Riscado", icon: Strikethrough, run: (a) => a.wrap("~~") },
  { label: "Código", icon: Code, run: (a) => a.wrap("`") },
  { label: "Fórmula (LaTeX)", icon: Sigma, run: (a) => a.wrap("$") },
  { label: "Título 1", icon: Heading1, run: (a) => a.linePrefix("# ") },
  { label: "Título 2", icon: Heading2, run: (a) => a.linePrefix("## ") },
  { label: "Título 3", icon: Heading3, run: (a) => a.linePrefix("### ") },
  { label: "Lista", icon: List, run: (a) => a.linePrefix("- ") },
  { label: "Lista numerada", icon: ListOrdered, run: (a) => a.linePrefix("1. ") },
  { label: "Checklist", icon: CheckSquare, run: (a) => a.linePrefix("- [ ] ") },
  { label: "Citação", icon: Quote, run: (a) => a.linePrefix("> ") },
  { label: "Link", icon: Link2, run: (a) => a.link() },
];

function NotePane({ note, editorApi }: { note: Note; editorApi: React.MutableRefObject<EditorApi | null> }) {
  const mode = useStore((s) => s.ui.noteMode);
  const notes = useStore((s) => s.ws.notes);
  const extra = useStore((s) => s.ws.settings.noteFolders);
  const listOpen = useStore((s) => s.ui.notesList);
  const sideOpen = useStore((s) => s.ui.notesSide);
  const setUi = useStore((s) => s.setUi);
  const sidebar = useSidebar();
  const [title, setTitle] = useState(note.title);
  // The task this note was opened from (gone if the task was deleted).
  const task = useStore((s) => (note.task ? s.ws.items[note.task] : undefined));
  const onTag = useTagFilter();
  const fileInput = useRef<HTMLInputElement>(null);
  const attach = useAttach(editorApi, note.id);
  const dup =
    title.trim() &&
    Object.values(notes).some((n) => n.id !== note.id && n.title.trim().toLowerCase() === title.trim().toLowerCase());
  const words = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const tags = extractTags(note.body);
  const commit = () => {
    if (title.trim() !== note.title) renameNote(note.id, title);
  };
  const focusMode = !listOpen && !sideOpen && !sidebar.open;
  const toggleFocus = () => {
    if (focusMode) {
      setUi((u) => {
        u.notesList = true;
      });
      sidebar.setOpen(true);
    } else {
      setUi((u) => {
        u.notesList = false;
        u.notesSide = false;
      });
      sidebar.setOpen(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-[2] flex flex-col border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="flex items-center gap-1 px-3 py-2 md:px-5">
          {!listOpen && (
            <IconTip label="Mostrar lista de notas">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Mostrar lista de notas"
                onClick={() =>
                  setUi((u) => {
                    u.notesList = true;
                  })
                }
              >
                <PanelLeft />
              </Button>
            </IconTip>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Voltar para a lista"
            className="md:hidden"
            onClick={() =>
              setUi((u) => {
                u.notesTab = "list";
                u.notesList = true;
              })
            }
          >
            <ChevronRight className="rotate-180" />
          </Button>
          <nav aria-label="Caminho" className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm text-muted-foreground">
            <button className="hover:text-foreground" onClick={() => openNotes(null)}>
              Anotações
            </button>
            {note.folder &&
              note.folder.split("/").map((f, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="size-3.5" />
                  {f}
                </span>
              ))}
          </nav>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={mode}
            onValueChange={(v) =>
              v &&
              setUi((u) => {
                u.noteMode = v as "edit" | "read";
              })
            }
            aria-label="Modo"
          >
            <ToggleGroupItem value="edit" className="px-3">
              Editar
            </ToggleGroupItem>
            <ToggleGroupItem value="read" className="px-3">
              Ler
            </ToggleGroupItem>
          </ToggleGroup>
          <IconTip label={sideOpen ? "Esconder sumário" : "Mostrar sumário"}>
            <Button
              variant={sideOpen ? "secondary" : "ghost"}
              size="icon-sm"
              aria-pressed={sideOpen}
              aria-label="Sumário"
              className="max-xl:hidden"
              onClick={() =>
                setUi((u) => {
                  u.notesSide = !u.notesSide;
                })
              }
            >
              <PanelRight />
            </Button>
          </IconTip>
          <IconTip label={focusMode ? "Sair do modo foco" : "Modo foco"}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={focusMode ? "Sair do modo foco" : "Modo foco"}
              className="max-md:hidden"
              onClick={toggleFocus}
            >
              {focusMode ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </IconTip>
          <NoteMenu note={note} folders={folderList(notes, extra)} />
        </div>
        {mode === "edit" && (
          <div className="flex items-center gap-0.5 overflow-x-auto px-3 pb-2 md:px-5" role="toolbar" aria-label="Formatação">
            {TOOLS.map((t, i) => (
              <span key={t.label} className="flex items-center">
                {(i === 4 || i === 7 || i === 11) && <Separator orientation="vertical" className="mx-1 h-5" />}
                <IconTip label={t.kbd ? `${t.label} (Ctrl/⌘ ${t.kbd})` : t.label}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editorApi.current && t.run(editorApi.current)}
                  >
                    <t.icon />
                  </Button>
                </IconTip>
              </span>
            ))}
            <Separator orientation="vertical" className="mx-1 h-5" />
            <IconTip label="Anexar imagem ou PDF (ou cole e arraste no texto)">
              <Button
                variant="ghost"
                size="sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip data-icon="inline-start" />
                Imagem ou PDF
              </Button>
            </IconTip>
            <input
              ref={fileInput}
              type="file"
              accept={[...IMAGE_TYPES, "application/pdf", ".pdf", ".heic", ".heif"].join(",")}
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (files.length) void attach(files);
              }}
            />
          </div>
        )}
      </div>

      <article className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pt-8 md:px-12">
        <input
          aria-label="Título da nota"
          autoComplete="off"
          value={title}
          placeholder="Sem título"
          autoFocus={/^Sem título( \d+)?$/.test(note.title)}
          onFocus={(e) => {
            if (/^Sem título( \d+)?$/.test(e.target.value)) e.target.select();
          }}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              setTimeout(() => editorApi.current?.focus(), 0);
            }
          }}
          className="w-full bg-transparent text-4xl leading-tight font-bold tracking-tight text-balance outline-none placeholder:text-muted-foreground md:text-5xl"
        />
        <div className="mt-3 mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          {task && (
            <button
              type="button"
              onClick={() => openPeek(task.id)}
              title="Abrir a tarefa desta anotação"
              className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary-strong transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <CheckSquare className="size-3.5" aria-hidden="true" />
              Tarefa: {task.title || "Sem título"}
            </button>
          )}
          {note.folder && (
            <span className="flex items-center gap-1">
              <Folder className="size-3.5" />
              {note.folder}
            </span>
          )}
          <span>Editada {ago(note.updated)}</span>
          <span className="tabular-nums">
            {words} {words === 1 ? "palavra" : "palavras"}
          </span>
          {tags.map((t) => (
            <button key={t} onClick={() => onTag(t)}>
              <Badge variant="secondary">#{t}</Badge>
            </button>
          ))}
        </div>
        {dup && <p className="-mt-3 mb-4 text-sm text-warning">Já existe outra nota com esse nome.</p>}
        <div className="flex-1">
          {mode === "edit" ? (
            <NoteEditor
              noteId={note.id}
              body={note.body}
              onChange={(body) => updateNote(note.id, { body })}
              onTag={onTag}
              onFiles={attach}
              apiRef={editorApi}
            />
          ) : (
            <NoteReader body={note.body} onTag={onTag} />
          )}
        </div>
        <div className="mb-16" />
      </article>
    </div>
  );
}

function NoteMenu({ note, folders }: { note: Note; folders: string[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Opções da nota">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => updateNote(note.id, { pinned: !note.pinned })}>
            <Pin />
            {note.pinned ? "Desafixar" : "Fixar no topo"}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Folder />
              Mover para
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuLabel>Pasta</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={note.folder} onValueChange={(f) => updateNote(note.id, { folder: f })}>
                <DropdownMenuRadioItem value="">Sem pasta</DropdownMenuRadioItem>
                {folders.map((f) => (
                  <DropdownMenuRadioItem key={f} value={f}>
                    {f}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => exportNoteMd(note)}>
            <Download />
            Baixar como .md
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => deleteNote(note.id)}>
          <Trash2 />
          Excluir nota
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------- right: outline (optional) ---------- */
function NoteSide({ note, editorApi }: { note: Note; editorApi: React.MutableRefObject<EditorApi | null> }) {
  const mode = useStore((s) => s.ui.noteMode);
  const outline = headings(note.body);
  const goto = (i: number, line: number) => {
    if (mode === "edit") editorApi.current?.gotoLine(line);
    else
      document.querySelectorAll(".note-read :is(h1,h2,h3,h4,h5,h6)")[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="flex flex-col gap-6 p-5">
      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold">Sumário</h3>
        {outline.length ? (
          outline.map((h, i) => (
            <button
              key={i}
              onClick={() => goto(i, h.line)}
              style={{ paddingLeft: (h.level - 1) * 12 + 6 }}
              className="truncate rounded-md py-1 pr-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {h.text}
            </button>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Use títulos (# ou o botão H1) para montar o sumário.</p>
        )}
      </section>
    </div>
  );
}
