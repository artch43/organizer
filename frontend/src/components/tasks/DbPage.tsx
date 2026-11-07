import { Mascot } from "@/components/brand/Brand";
import { useRef, useState } from "react";
import { NewTaskDialog } from "./NewTaskDialog";
import { EmptyState } from "../EmptyState";
import { withMotion } from "@/lib/motion";
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  Columns3,
  Filter,
  FolderTree,
  PanelLeft,
  Plus,
  Search,
  Settings2,
  Table2,
  X,
} from "lucide-react";
import type { Filter as F, Page, View } from "@/lib/types";
import { applyFilters, defaultsFromFilters, filterLabel, groupOf } from "@/lib/model";
import { celebrate, renamePage, useStore } from "@/store";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { OptionBadge } from "../common";
import { Board } from "./Board";
import { TaskTable } from "./TaskTable";
import { TaskCalendar } from "./TaskCalendar";
import { AreaSwitcher } from "../app/Topbar";
import { setListsPanel, setListsSheet, useListsUi } from "../lists/state";

const ICON = { board: Columns3, table: Table2, calendar: CalendarDays } as const;
const DATE_FILTERS: [string, string][] = [
  ["today", "Hoje"],
  ["week", "Próximos 7 dias"],
  ["overdue", "Atrasadas"],
  ["empty", "Sem data"],
];

export function DbPage({ page }: { page: Page }) {
  const ws = useStore((s) => s.ws);
  const viewId = useStore((s) => s.ui.viewByDb[page.id]);
  const search = useStore((s) => s.ui.search[page.id]) ?? "";
  const area = useStore((s) => s.ui.area);
  const { setUi, mut } = useStore.getState();
  const [newTask, setNewTask] = useState<{ date: string } | null>(null);
  const db = ws.dbs[page.id];
  if (!db) return null;
  const view = db.views.find((v) => v.id === viewId) ?? db.views[0];
  const list = applyFilters(ws, page.id, view, search, area);
  const hasAny = Object.values(ws.items).some((i) => i.db === page.id);
  const mutView = (fn: (v: View) => void) => mut((w) => fn(w.dbs[page.id].views.find((x) => x.id === view.id)!));
  // Opens the short "Nova tarefa" form; nothing is saved until the person confirms it.
  const create = (props: { date?: string } = {}) => setNewTask({ date: props.date ?? "" });
  // "4 tarefas abertas · 1 para revisar · na pasta Faculdade"
  const items = Object.values(ws.items).filter((i) => i.db === page.id);
  const openN = items.filter((i) => groupOf(db, i) !== "done").length;
  const reviewN = items.filter((i) => groupOf(db, i) === "review").length;
  const folder = page.folder?.split("/").pop();
  const subtitle = [
    openN ? `${openN} ${openN === 1 ? "tarefa aberta" : "tarefas abertas"}` : "Nenhuma tarefa aberta",
    reviewN ? `${reviewN} para revisar` : "",
    folder ? `na pasta ${folder}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 pt-5 pb-28 md:px-8 md:pt-7">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <ListsToggle />
        <PageTitle page={page} subtitle={subtitle} />
        <div className="flex items-center gap-2 max-sm:w-full">
          <FilterButton
            dbId={page.id}
            view={view}
            onAdd={(f) =>
              mutView((v) => {
                if (v.filters.some((g) => sameFilter(g, f))) return;
                // Only one date filter at a time: a new one replaces the old.
                if (f.prop === "date") v.filters = v.filters.filter((g) => g.prop !== "date");
                v.filters.push(f);
              })
            }
          />
          <SortButton
            view={view}
            onChange={(sort) =>
              withMotion(() =>
                mutView((v) => {
                  if (sort === undefined) delete v.sort;
                  else v.sort = sort;
                }),
              )
            }
          />
          <Button
            variant="outline"
            aria-label="Editar status"
            title="Editar status"
            className="h-10 rounded-xl max-lg:size-10 max-lg:px-0"
            onClick={() =>
              setUi((u) => {
                u.statusDialog = page.id;
              })
            }
          >
            <Settings2 data-icon="inline-start" className="max-lg:m-0" />
            <span className="max-lg:hidden">Editar status</span>
          </Button>
          <Button onClick={() => create()} className="h-10 rounded-xl px-4 font-semibold max-sm:ml-auto">
            <Plus data-icon="inline-start" />
            Nova tarefa
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={view.id}
          onValueChange={(v) =>
            setUi((u) => {
              u.viewByDb[page.id] = v;
            })
          }
        >
          <TabsList>
            {db.views.map((v) => {
              const Icon = ICON[v.type];
              return (
                <TabsTrigger
                  key={v.id}
                  value={v.id}
                  className="relative data-active:bg-transparent data-active:shadow-none group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent"
                >
                  {/* The selected tab's background glides to the next one. */}
                  {v.id === view.id && (
                    <motion.span
                      aria-hidden="true"
                      layoutId={`view-tab-${page.id}`}
                      transition={{ type: "spring", duration: 0.3, bounce: 0.1 }}
                      className="absolute inset-0 rounded-md bg-background shadow-sm dark:bg-input/30 dark:ring-1 dark:ring-input"
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon />
                    {v.name}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 max-sm:w-full sm:ml-auto">
          <InputGroup className="h-10 w-56 rounded-xl max-sm:flex-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Buscar tarefas…"
              aria-label="Buscar nesta lista"
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                setUi((u) => {
                  u.search[page.id] = v;
                });
              }}
            />
          </InputGroup>
        </div>
      </div>

      {view.filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {view.filters.map((f, k) => (
            <Badge key={k} variant="secondary" className="gap-1 pr-1">
              {filterLabel(db, f)}
              <button
                aria-label="Remover filtro"
                className="rounded-full p-0.5 hover:bg-background"
                onClick={() =>
                  mutView((v) => {
                    v.filters.splice(k, 1);
                  })
                }
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Button
            variant="link"
            size="sm"
            onClick={() =>
              mutView((v) => {
                v.filters = [];
              })
            }
          >
            Limpar filtros
          </Button>
        </div>
      )}

      {/* A brand-new list: say what it's for, with the button that starts it (the columns stay below for dragging). */}
      {view.type === "board" && !hasAny && (
        <div className="rounded-2xl border border-dashed bg-card/60">
          <EmptyState
            pose="checklist"
            title="Lista vazia"
            text="Anote o que precisa ser feito. Cada tarefa vira um cartão que você arrasta entre as colunas."
            action={{ label: "Criar a primeira tarefa", run: () => create() }}
          />
        </div>
      )}
      {view.type === "board" && <Board page={page} db={db} view={view} list={list} />}
      {view.type === "table" && <TaskTable db={db} list={list} hasAny={hasAny} onCreate={() => create()} />}
      {view.type === "calendar" && <TaskCalendar dbId={page.id} db={db} list={list} onCreate={(date) => create({ date })} />}
      {newTask && (
        <NewTaskDialog
          dbId={page.id}
          defaults={defaultsFromFilters(db, view)}
          date={newTask.date}
          onClose={() => setNewTask(null)}
        />
      )}
    </div>
  );
}

const SORTS: { key: string; label: string; sort: View["sort"] }[] = [
  { key: "auto", label: "Automática: prazo e prioridade", sort: undefined },
  { key: "date", label: "Só pelo prazo", sort: { prop: "date", dir: "asc" } },
  { key: "prio", label: "Só pela prioridade", sort: { prop: "prio", dir: "asc" } },
  { key: "title", label: "Nome (A–Z)", sort: { prop: "title", dir: "asc" } },
  { key: "manual", label: "Manual (como você arrastou)", sort: null },
];
const sortKey = (s: View["sort"]) => (s === undefined || s?.prop === "auto" ? "auto" : s === null ? "manual" : s.prop);

/** How the cards are ordered. Automatic by default; dragging inside a column switches to manual. */
function SortButton({ view, onChange }: { view: View; onChange: (s: View["sort"]) => void }) {
  const key = sortKey(view.sort);
  const cur = SORTS.find((x) => x.key === key) ?? SORTS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Ordenar: ${cur.label}`}
          title={`Ordem: ${cur.label}`}
          className="h-10 rounded-xl max-sm:size-10 max-sm:px-0"
        >
          <ArrowDownUp data-icon="inline-start" className="max-sm:m-0" />
          <span className="max-sm:hidden">{key === "auto" ? "Ordenar" : cur.key === "manual" ? "Manual" : "Ordenado"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Ordem das tarefas</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={key} onValueChange={(k) => onChange(SORTS.find((x) => x.key === k)!.sort)}>
          {SORTS.map((x) => (
            <DropdownMenuRadioItem key={x.key} value={x.key}>
              {x.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Na automática, o prazo mais próximo vem primeiro e, no mesmo dia, a prioridade mais alta. Arrastar um cartão dentro da
          coluna muda para a manual.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const sameFilter = (a: F, b: F) => a.prop === b.prop && a.op === b.op && a.val === b.val;

function FilterButton({ dbId, view, onAdd }: { dbId: string; view: View; onAdd: (f: F) => void }) {
  const db = useStore((s) => s.ws.dbs[dbId]);
  const area = useStore((s) => s.ui.area);
  const [open, setOpen] = useState(false);
  const count = view.filters.length + (area !== "all" ? 1 : 0);
  const add = (f: F) => {
    onAdd(f);
    setOpen(false);
  };
  // A filter already in use is shown checked and can't be added again.
  const used = (f: F) => view.filters.some((g) => sameFilter(g, f));
  const pick = (f: F, children: React.ReactNode) => (
    <button
      key={f.val}
      disabled={used(f)}
      aria-pressed={used(f)}
      title={used(f) ? "Filtro já aplicado" : undefined}
      onClick={() => add(f)}
      className="relative rounded-full disabled:cursor-default disabled:opacity-60"
    >
      {children}
      {used(f) && (
        <Check
          className="absolute -top-1 -right-1 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground"
          aria-hidden="true"
        />
      )}
    </button>
  );
  const status = db.props.find((p) => p.id === "status")!;
  const prio = db.props.find((p) => p.id === "prio");
  const tags = db.props.find((p) => p.id === "tags");
  const section = (title: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={count ? "secondary" : "outline"}
          className="h-10 rounded-xl"
          aria-label={`Filtrar${count ? ` (${count})` : ""}`}
        >
          <Filter data-icon="inline-start" className="max-sm:m-0" />
          <span className="max-sm:hidden">Filtrar{count ? ` (${count})` : ""}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-4">
        {/* The area filter is shared with Início and the calendar. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Área (vale para todo o site)</span>
          <AreaSwitcher className="min-w-0" />
        </div>
        <Separator />
        {section(
          "Status",
          status.options!.map((o) => pick({ prop: "status", op: "is", val: o.id }, <OptionBadge opt={o} dot />)),
        )}
        {prio?.options?.length
          ? section(
              "Prioridade",
              prio.options.map((o) => pick({ prop: "prio", op: "is", val: o.id }, <OptionBadge opt={o} />)),
            )
          : null}
        {tags?.options?.length
          ? section(
              "Etiqueta",
              tags.options.map((o) => pick({ prop: "tags", op: "is", val: o.id }, <OptionBadge opt={o} />)),
            )
          : null}
        <Separator />
        {section(
          "Data (uma por vez)",
          DATE_FILTERS.map(([k, n]) => (
            <Button
              key={k}
              variant={used({ prop: "date", op: "is", val: k }) ? "secondary" : "outline"}
              size="sm"
              disabled={used({ prop: "date", op: "is", val: k })}
              aria-pressed={used({ prop: "date", op: "is", val: k })}
              onClick={() => add({ prop: "date", op: "is", val: k })}
            >
              {used({ prop: "date", op: "is", val: k }) && <Check data-icon="inline-start" />}
              {n}
            </Button>
          )),
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The list's name; double-click to rename it in place. */
function PageTitle({ page, subtitle }: { page: Page; subtitle: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(page.title);
  // Esc cancels for good: the blur that may follow when the field goes away must not save.
  const decided = useRef(false);
  const done = (save: boolean) => {
    if (decided.current) return;
    decided.current = true;
    setEditing(false);
    if (save && v.trim() && v.trim() !== page.title) {
      renamePage(page.id, v);
      celebrate("Lista renomeada", `Agora se chama “${v.trim()}”`, "anota");
    }
  };
  return (
    <div className="mr-auto flex min-w-0 items-center gap-4">
      {/* The mascot files a card into his folder, next to the list's name. */}
      <Mascot pose="organiza" size={56} className="mascot-pop shrink-0 max-sm:hidden" />
      <div className="flex min-w-0 flex-col">
        <h1 className="flex min-w-0 items-center text-3xl leading-tight font-extrabold tracking-tight md:text-[2.5rem]">
          {editing ? (
            <input
              autoFocus
              aria-label="Nome da lista"
              value={v}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setV(e.target.value)}
              onBlur={() => done(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") done(true);
                if (e.key === "Escape") done(false);
              }}
              className="min-w-0 flex-1 rounded-lg bg-transparent px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <span
              className="cursor-text truncate rounded-lg px-1 hover:bg-muted/60"
              title="Clique duas vezes para renomear"
              onDoubleClick={() => {
                setV(page.title);
                decided.current = false;
                setEditing(true);
              }}
            >
              {page.title || "Sem título"}
            </span>
          )}
        </h1>
        <p className="truncate px-1 text-base text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

/** Opens/closes the folders and lists: the panel beside (computer) or the sheet (phone). */
function ListsToggle() {
  const open = useListsUi((s) => s.panel);
  return (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label={open ? "Esconder pastas e listas (Ctrl+B)" : "Mostrar pastas e listas (Ctrl+B)"}
        aria-pressed={open}
        title={open ? "Esconder pastas e listas (Ctrl+B)" : "Mostrar pastas e listas (Ctrl+B)"}
        onClick={() => setListsPanel(!open)}
        className="size-10 shrink-0 rounded-xl max-md:hidden"
      >
        <PanelLeft />
      </Button>
      <Button
        variant="outline"
        aria-label="Pastas e listas"
        onClick={() => setListsSheet(true)}
        className="h-10 shrink-0 rounded-xl md:hidden"
      >
        <FolderTree data-icon="inline-start" />
        Listas
      </Button>
    </>
  );
}
