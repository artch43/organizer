import { useRef, useState } from "react";
import {
  ArrowLeftRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  MoreHorizontal,
  NotebookPen,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database, Group, Item, Page, View } from "@/lib/types";
import { groupOf, optOf, statusProp } from "@/lib/model";
import { GROUPS, fmtDate, today } from "@/lib/util";
import {
  addStatus,
  deleteStatus,
  moveStatus,
  newItem,
  celebrate,
  isJustCreated,
  toast,
  openPeek,
  patchItem,
  renameStatus,
  setProp,
  setStatusColor,
  setStatusGroup,
  taskNoteOf,
  useStore,
} from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { OptionBadge, TagSwatches, areaVar, useAreas } from "../common";
import { TASK_MIME, setDraggedTask } from "@/lib/dnd";
import { vtName, withMotion } from "@/lib/motion";

/**
 * Kanban board. Columns are the status options and can be renamed by clicking their name.
 * While a card is dragged it stays where it is (moving it in the DOM would cancel the drag in
 * most browsers); only a drop line shows where it will land.
 */
export function Board({ page, db, view, list }: { page: Page; db: Database; view: View; list: Item[] }) {
  const sp = statusProp(db)!;
  const areas = useAreas();
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ col: string; index: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const finishDrop = (colId: string) => {
    if (!drag || !drop) return;
    const { mut } = useStore.getState();
    // Reordering inside a column means "I want my own order here": this view switches to manual,
    // starting from the order on screen, so only the dragged card moves.
    // Moving to another column keeps the automatic order (the card just lands where it belongs).
    const sameColumn = useStore.getState().ws.items[drag]?.props[sp.id] === colId;
    if (sameColumn && view.sort !== null) {
      mut((w) => {
        list.forEach((it, k) => {
          if (w.items[it.id]) w.items[it.id].order = (k + 1) * 1024;
        });
        w.dbs[page.id].views.find((v) => v.id === view.id)!.sort = null;
      });
      toast("Ordem manual neste quadro. Para voltar à automática, use Ordenar.");
    }
    const items = useStore.getState().ws.items;
    const ids = list.filter((i) => i.props[sp.id] === colId && i.id !== drag).map((i) => i.id);
    const prev = items[ids[drop.index - 1]],
      next = items[ids[drop.index]];
    const order = prev && next ? (prev.order + next.order) / 2 : prev ? prev.order + 1 : next ? next.order - 1 : Date.now();
    patchItem(drag, (it) => {
      it.order = order;
    });
    if (items[drag]?.props[sp.id] !== colId) setProp(drag, sp.id, colId);
  };

  return (
    // Phones: columns stacked full width (no sideways scrolling). Bigger screens: side by side, scrolling sideways if needed.
    <div className="stagger -mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-6 max-sm:flex-col max-sm:items-stretch max-sm:overflow-visible md:-mx-8 md:px-8">
      {sp.options!.map((o, ci) => {
        const items = list.filter((i) => i.props[sp.id] === o.id);
        return (
          <section
            key={o.id}
            aria-label={o.name}
            style={{ "--i": ci } as React.CSSProperties}
            className={cn(
              // Columns share the width on big screens (so four fit side by side), but stay readable: 16–22rem.
              "flex w-72 shrink-0 flex-col gap-2.5 rounded-2xl border bg-card/55 p-3 shadow-card transition-colors max-sm:w-full xl:w-auto xl:max-w-88 xl:min-w-64 xl:flex-1",
              drop?.col === o.id && "bg-primary/8 ring-2 ring-primary-strong/30",
            )}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const cards = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-card]:not([data-dragging])")];
              let index = cards.findIndex((el) => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
              if (index < 0) index = cards.length;
              if (drop?.col !== o.id || drop.index !== index) setDrop({ col: o.id, index });
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop((d) => (d?.col === o.id ? null : d));
            }}
            onDrop={(e) => {
              e.preventDefault();
              // The card glides into its new spot (and the others make room).
              withMotion(() => finishDrop(o.id));
              setDrag(null);
              setDrop(null);
            }}
          >
            <header className="flex items-center gap-2 px-1 pt-0.5 pb-1">
              <span aria-hidden="true" data-color={o.color} className="swatch-color size-2.5 shrink-0 rounded-full" />
              {editing === o.id ? (
                <ColumnName
                  name={o.name}
                  onDone={(name) => {
                    if (name !== null) renameStatus(page.id, o.id, name);
                    setEditing(null);
                  }}
                />
              ) : (
                <button
                  className="min-w-0 truncate rounded-md px-1 py-0.5 text-left text-base font-bold pointer-coarse:-my-2 pointer-coarse:py-2.5 hover:bg-background"
                  title="Clique para renomear"
                  onClick={() => setEditing(o.id)}
                >
                  {o.name}
                </button>
              )}
              <span className="text-sm tabular-nums text-muted-foreground">{items.length}</span>
              <ColumnMenu
                dbId={page.id}
                optId={o.id}
                first={ci === 0}
                last={ci === sp.options!.length - 1}
                only={sp.options!.length <= 1}
                color={o.color}
                group={o.group ?? "todo"}
                onRename={() => setEditing(o.id)}
              />
            </header>
            <div className="flex min-h-10 flex-col gap-2">
              {(() => {
                const nodes: React.ReactNode[] = [];
                let visible = 0;
                for (const it of items) {
                  if (drop?.col === o.id && it.id !== drag && visible === drop.index) nodes.push(<DropLine key="drop" />);
                  if (it.id !== drag) visible++;
                  nodes.push(
                    <Card
                      key={it.id}
                      it={it}
                      db={db}
                      area={areas.find((a) => a.id === it.area)}
                      dragging={drag === it.id}
                      onDragStart={() => setDrag(it.id)}
                      onDragEnd={() => {
                        setDrag(null);
                        setDrop(null);
                      }}
                    />,
                  );
                }
                if (drop?.col === o.id && visible === drop.index) nodes.push(<DropLine key="drop" />);
                // An empty column says what it's for, instead of being a blank box.
                if (!items.length && drop?.col !== o.id)
                  nodes.push(
                    <p
                      key="empty"
                      className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-sm text-muted-foreground"
                    >
                      Nenhuma tarefa aqui. Arraste uma para cá ou use Nova tarefa.
                    </p>,
                  );
                return nodes;
              })()}
            </div>
            <QuickAdd
              onAdd={(title) => {
                newItem(page.id, { [sp.id]: o.id }, title);
                celebrate("Tarefa adicionada", `“${title}” em ${o.name}`, "checklist");
              }}
            />
          </section>
        );
      })}
      {/* A slim dashed column at the end: clearly "add another column", without taking a column's width. */}
      <Button
        variant="ghost"
        aria-label="Nova coluna"
        title="Nova coluna"
        className="h-28 w-14 shrink-0 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:border-primary-strong/50 hover:bg-primary/5 hover:text-primary-strong max-sm:h-12 max-sm:w-full"
        onClick={() => {
          const id = addStatus(page.id);
          setEditing(id);
        }}
      >
        <Plus />
      </Button>
    </div>
  );
}

const DropLine = () => <div aria-hidden="true" className="-my-1 h-0.5 rounded-full bg-primary" />;

function ColumnName({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(name);
  // Enter or Esc already decided; the blur that follows when the field goes away must not decide again.
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <Input
      autoFocus
      aria-label="Nome da coluna"
      className="h-7 flex-1 px-1.5 text-base font-semibold pointer-fine:text-sm"
      value={v}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(v);
        if (e.key === "Escape") finish(null);
      }}
    />
  );
}

function ColumnMenu({
  dbId,
  optId,
  first,
  last,
  only,
  color,
  group,
  onRename,
}: {
  dbId: string;
  optId: string;
  first: boolean;
  last: boolean;
  only: boolean;
  color: import("@/lib/types").Color;
  group: Group;
  onRename: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Opções da coluna">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onRename}>
            <Pencil />
            Renomear
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette />
              Cor
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="p-3">
              <TagSwatches value={color} onChange={(c) => setStatusColor(dbId, optId, c)} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Tag />
              Conta como
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuLabel className="max-w-56 text-xs font-normal text-muted-foreground">
                Usado pelo Início e pela revisão espaçada.
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={group} onValueChange={(g) => setStatusGroup(dbId, optId, g as Group)}>
                {(Object.entries(GROUPS) as [Group, string][]).map(([g, n]) => (
                  <DropdownMenuRadioItem key={g} value={g}>
                    {n}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem disabled={first} onSelect={() => moveStatus(dbId, optId, -1)}>
            <ChevronLeft />
            Mover para a esquerda
          </DropdownMenuItem>
          <DropdownMenuItem disabled={last} onSelect={() => moveStatus(dbId, optId, 1)}>
            <ChevronRight />
            Mover para a direita
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" disabled={only} onSelect={() => deleteStatus(dbId, optId)}>
            <Trash2 />
            Excluir coluna
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Card({
  it,
  db,
  area,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  it: Item;
  db: Database;
  area?: import("@/lib/types").Area;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const sp = statusProp(db)!;
  const ref = useRef<HTMLDivElement>(null);
  const date = typeof it.props.date === "string" ? it.props.date : "";
  const late = date && date.slice(0, 10) < today() && groupOf(db, it) !== "done";
  const prio = optOf(
    db.props.find((p) => p.id === "prio"),
    it.props.prio,
  );
  const tags = ((it.props.tags as string[]) ?? [])
    .map((id) =>
      optOf(
        db.props.find((p) => p.id === "tags"),
        id,
      ),
    )
    .filter(Boolean);
  const review = db.srs && it.review?.next && groupOf(db, it) === "done";
  const isDone = groupOf(db, it) === "done";
  // An alarm marked (by e-mail or WhatsApp) and a linked note show as small chips.
  const hasAlarm = !!date && !isDone && !!it.alerts?.length;
  const hasNote = useStore((s) => !!taskNoteOf(s.ws.notes, it.id));
  // A card that just appeared pops in, so it's easy to see where the new task went.
  const [isNew] = useState(() => isJustCreated(it.id));
  return (
    <div
      ref={ref}
      data-card
      data-del={"task:" + it.id}
      data-dragging={dragging || undefined}
      draggable
      role="button"
      tabIndex={0}
      style={{ ...areaVar(area), viewTransitionName: vtName("card", it.id) }}
      aria-label={it.title || "Sem título"}
      className={cn(
        "lift group flex cursor-pointer flex-col gap-2.5 rounded-xl border bg-card p-3.5 select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        dragging && "opacity-40",
        isNew && "card-new",
      )}
      onClick={() => openPeek(it.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPeek(it.id);
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", it.id);
        e.dataTransfer.setData(TASK_MIME, it.id);
        setDraggedTask(it.id);
        // Defer the state change so the browser has already taken its drag snapshot.
        requestAnimationFrame(onDragStart);
      }}
      onDragEnd={() => {
        setDraggedTask(null);
        onDragEnd();
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn("min-w-0 flex-1 text-base font-semibold break-words", isDone && "text-muted-foreground line-through")}
        >
          {it.title || <span className="text-muted-foreground">Sem título</span>}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Mudar status"
              className="touch-hit opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowLeftRight />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel>Mover para</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(it.props[sp.id] ?? "")}
              onValueChange={(v) => withMotion(() => setProp(it.id, sp.id, v))}
            >
              {sp.options!.map((o) => (
                <DropdownMenuRadioItem key={o.id} value={o.id}>
                  {o.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {(prio || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {prio && <OptionBadge opt={prio} />}
          {tags.map((t) => (
            <OptionBadge key={t!.id} opt={t!} />
          ))}
        </div>
      )}
      {(date || review || hasAlarm || hasNote) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
          {area && (
            <span className="size-2 shrink-0 rounded-full bg-(--area)" title={area.name} aria-label={`Área: ${area.name}`} />
          )}
          {date && (
            <span
              className={cn(
                "flex items-center gap-1.5 tabular-nums",
                late ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              <CalendarClock className="size-3.5" aria-hidden="true" />
              {fmtDate(date)}
            </span>
          )}
          {hasAlarm && (
            <span
              className="flex items-center gap-1 rounded-md bg-primary/14 px-1.5 py-0.5 font-semibold text-primary-strong"
              title="Alarme marcado"
            >
              {it.alertChannel === "whatsapp" ? (
                <MessageCircle className="size-3.5" aria-hidden="true" />
              ) : (
                <Mail className="size-3.5" aria-hidden="true" />
              )}
              {it.alertChannel === "whatsapp" ? "WhatsApp" : "e-mail"}
            </span>
          )}
          {hasNote && (
            <span className="flex items-center gap-1 text-muted-foreground" title="Tem uma nota ligada">
              <NotebookPen className="size-3.5" aria-hidden="true" />
              Nota
            </span>
          )}
          {review && (
            <span className="flex items-center gap-1 text-primary-strong">
              <RotateCcw className="size-3" aria-hidden="true" />
              revisar {fmtDate(it.review!.next!).toLowerCase()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  // Esc cancels for good: the blur that may follow when the field goes away must not add the task.
  const cancelled = useRef(false);
  if (!open)
    return (
      <Button
        variant="ghost"
        size="sm"
        className="justify-start text-muted-foreground"
        onClick={() => {
          cancelled.current = false;
          setOpen(true);
        }}
      >
        <Plus data-icon="inline-start" />
        Nova tarefa
      </Button>
    );
  const submit = () => {
    if (v.trim()) onAdd(v.trim());
    setV("");
  };
  return (
    <Input
      autoFocus
      autoComplete="off"
      placeholder="Nome da tarefa e Enter…"
      aria-label="Nome da nova tarefa"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (!cancelled.current) submit();
        setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          cancelled.current = true;
          setV("");
          setOpen(false);
        }
      }}
    />
  );
}
