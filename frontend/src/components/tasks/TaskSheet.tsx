import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BellRing, Check, NotebookPen, NotebookText, RotateCcw, Trash2, X } from "lucide-react";
import type { PropValue } from "@/lib/types";
import { groupOf, optOf, statusProp } from "@/lib/model";
import { COLORS, INTERVALS, fmtDate, uid } from "@/lib/util";
import { closePeek, deleteItem, openTaskNote, patchItem, setProp, taskNoteOf, useStore } from "@/store";
import { plainSnippet } from "@/lib/notes";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AreaDot, NewAreaButton, OptionBadge, areaVar, useAreas } from "../common";
import { AlertPicker } from "../calendar/AlertPicker";
import { Kbd } from "@/components/ui/kbd";
import { MOD } from "@/lib/shortcuts";
import { Glyph } from "../icons";

const NONE = "__none";

/** Side panel with everything about one task. */
export function TaskSheet() {
  const id = useStore((s) => s.ui.peek);
  const it = useStore((s) => (id ? s.ws.items[id] : undefined));
  const db = useStore((s) => (it ? s.ws.dbs[it.db] : undefined));
  const page = useStore((s) => (it ? s.ws.pages.find((p) => p.id === it.db) : undefined));
  const focus = useStore((s) => s.ui.peekFocus);
  const setUi = useStore((s) => s.setUi);
  const areas = useAreas();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focus || !it) return;
    setUi((u) => {
      u.peekFocus = false;
    });
    setTimeout(() => titleRef.current?.focus(), 80);
  }, [focus, id]);

  const open = !!it && !!db;
  const sp = db ? statusProp(db) : undefined;
  const prio = db?.props.find((p) => p.id === "prio");
  const date = it && typeof it.props.date === "string" ? it.props.date : "";
  const area = areas.find((a) => a.id === it?.area);
  const r = it?.review;
  const g = it && db ? groupOf(db, it) : null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && closePeek()}>
      <SheetContent
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
        // Opening a task to read it shouldn't pop up the phone keyboard: only a new task starts in its title.
        onOpenAutoFocus={(e) => {
          if (!focus) e.preventDefault();
        }}
      >
        {it && db && sp && (
          <>
            <SheetHeader className="area-stripe gap-1 border-b pl-7" style={areaVar(area)}>
              <SheetDescription className="flex items-center gap-1.5">
                {page ? (
                  <>
                    <Glyph icon={page.icon} size="xs" />
                    {page.title}
                  </>
                ) : (
                  "Tarefa"
                )}
              </SheetDescription>
              <SheetTitle className="sr-only">{it.title || "Tarefa sem título"}</SheetTitle>
              <Input
                ref={titleRef}
                data-title-field
                autoComplete="off"
                aria-label="Nome da tarefa"
                placeholder="Nome da tarefa"
                value={it.title}
                className="h-auto border-0 bg-transparent px-0 text-xl font-bold shadow-none focus-visible:ring-0 md:text-xl dark:bg-transparent"
                onChange={(e) =>
                  patchItem(it.id, (x) => {
                    x.title = e.target.value;
                  })
                }
              />
            </SheetHeader>

            <div className="flex flex-col gap-6 p-4">
              <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="task-status">Status</FieldLabel>
                  <Select value={String(it.props[sp.id] ?? "")} onValueChange={(v) => setProp(it.id, sp.id, v)}>
                    <SelectTrigger id="task-status" className="w-full">
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sp.options!.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            <span data-color={o.color} className="swatch-color size-2 rounded-full" />
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-area">Área</FieldLabel>
                  <div className="flex gap-2">
                    <Select
                      value={it.area ?? NONE}
                      onValueChange={(v) =>
                        patchItem(it.id, (x) => {
                          x.area = v === NONE ? undefined : v;
                        })
                      }
                    >
                      <SelectTrigger id="task-area" className="w-full min-w-0 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={NONE}>Sem área</SelectItem>
                          {areas.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              <AreaDot area={a} />
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <NewAreaButton
                      className="size-9"
                      onCreated={(id) =>
                        patchItem(it.id, (x) => {
                          x.area = id;
                        })
                      }
                    />
                  </div>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="task-date">Data</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="task-date"
                      type="date"
                      value={date.slice(0, 10)}
                      className="min-w-0 flex-1"
                      onChange={(e) => setProp(it.id, "date", e.target.value ? e.target.value + (date.slice(10) || "") : null)}
                    />
                    <Input
                      type="time"
                      aria-label="Horário"
                      value={date.slice(11, 16)}
                      disabled={!date}
                      className="w-28"
                      onChange={(e) => setProp(it.id, "date", date.slice(0, 10) + (e.target.value ? " " + e.target.value : ""))}
                    />
                  </div>
                </Field>
                {prio && (
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="task-prio">Prioridade</FieldLabel>
                    <Select
                      value={String(it.props.prio ?? NONE)}
                      onValueChange={(v) => setProp(it.id, "prio", v === NONE ? null : v)}
                    >
                      <SelectTrigger id="task-prio" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {prio.options!.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              <span data-color={o.color} className="swatch-color size-2 rounded-full" />
                              {o.name}
                            </SelectItem>
                          ))}
                          <SelectItem value={NONE}>Sem prioridade</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <div className="sm:col-span-2">
                  {date ? (
                    <AlertPicker
                      what="compromisso"
                      value={it.alerts ?? []}
                      allDay={!date.slice(11, 16)}
                      onChange={(alerts) =>
                        patchItem(it.id, (x) => {
                          x.alerts = alerts;
                        })
                      }
                      channel={it.alertChannel ?? "email"}
                      onChannelChange={(c) =>
                        patchItem(it.id, (x) => {
                          x.alertChannel = c;
                        })
                      }
                    />
                  ) : (
                    <p className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      <BellRing className="size-4 shrink-0" aria-hidden="true" />
                      Dê uma data à tarefa para ligar o alarme por e-mail ou WhatsApp.
                    </p>
                  )}
                </div>
                <Field className="sm:col-span-2">
                  <FieldLabel>Etiquetas</FieldLabel>
                  <TagPicker dbId={it.db} itemId={it.id} value={(it.props.tags as string[]) ?? []} />
                </Field>
              </FieldGroup>

              {db.srs && r && (
                <Alert>
                  <RotateCcw />
                  <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex-1">
                      {r.finished
                        ? "Ciclo de revisões concluído."
                        : g === "review"
                          ? `Hora de revisar! Quando terminar, mude para “${sp.options!.find((o) => o.group === "done")?.name ?? "concluído"}”.`
                          : `Próxima revisão ${fmtDate(r.next!).toLowerCase()} (${INTERVALS[r.stage]} ${INTERVALS[r.stage] === 1 ? "dia" : "dias"} depois).`}
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() =>
                        patchItem(it.id, (x) => {
                          delete x.review;
                        })
                      }
                    >
                      Parar revisões
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <TaskNote key={it.id} itemId={it.id} oldText={it.notes} />
            </div>

            <SheetFooter className="mt-auto flex-row justify-between border-t">
              <Button variant="ghost" className="text-destructive" onClick={() => deleteItem(it.id)}>
                <Trash2 data-icon="inline-start" />
                Excluir tarefa
                <Kbd className="ml-1 hidden sm:inline-flex">{MOD}⌫</Kbd>
              </Button>
              <Button onClick={closePeek}>
                <Check data-icon="inline-start" />
                Pronto
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The task's note lives in Anotações (with everything the editor offers). Here: a button that opens
 * it — creating it the first time — or, once it exists, a card with its first lines.
 */
function TaskNote({ itemId, oldText }: { itemId: string; oldText: string }) {
  const note = useStore((s) => taskNoteOf(s.ws.notes, itemId));
  const preview = note ? plainSnippet(note.body, 140) : oldText.trim() ? plainSnippet(oldText, 140) : "";
  return (
    <Field>
      <FieldLabel>Anotação</FieldLabel>
      <button
        type="button"
        onClick={() => openTaskNote(itemId)}
        className={cn(
          "group flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-primary-strong/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.99]",
          !note && "border-dashed",
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-strong">
          {note ? <NotebookText className="size-5" aria-hidden="true" /> : <NotebookPen className="size-5" aria-hidden="true" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">{note ? note.title : oldText.trim() ? "Mover para Anotações" : "Criar anotação"}</span>
          <span className={cn("text-sm text-muted-foreground", preview ? "line-clamp-2" : "")}>
            {preview || "Abre na aba Anotações, ligada a esta tarefa: com títulos, listas, fórmulas, imagens e PDF."}
          </span>
        </span>
        <ArrowUpRight
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden="true"
        />
      </button>
    </Field>
  );
}

/** Pick existing tags or create a new one by typing. */
function TagPicker({ dbId, itemId, value }: { dbId: string; itemId: string; value: string[] }) {
  const tags = useStore((s) => s.ws.dbs[dbId]?.props.find((p) => p.id === "tags"));
  const mut = useStore((s) => s.mut);
  const [q, setQ] = useState("");
  const set = (v: PropValue) => setProp(itemId, "tags", v);
  const toggle = (id: string) => set(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const create = () => {
    const name = q.trim();
    if (!name || !tags) return;
    const existing = tags.options!.find((o) => o.name.toLowerCase() === name.toLowerCase());
    const id = existing?.id ?? uid();
    if (!existing)
      mut((w) => {
        w.dbs[dbId].props
          .find((p) => p.id === "tags")!
          .options!.push({ id, name, color: COLORS[(tags.options!.length + 3) % COLORS.length] });
      });
    if (!value.includes(id)) set([...value, id]);
    setQ("");
  };
  const exact = tags?.options?.some((o) => o.name.toLowerCase() === q.trim().toLowerCase());
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((id) => {
        const o = optOf(tags, id);
        return o ? (
          <span key={id} className="flex items-center">
            <OptionBadge opt={o} className="max-w-none pr-6" />
            <button
              aria-label={`Tirar ${o.name}`}
              className="-ml-5 flex size-4 items-center justify-center rounded-full hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => toggle(id)}
            >
              <X className="size-3" />
            </button>
          </span>
        ) : null;
      })}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            Adicionar etiqueta
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Buscar ou criar…"
              value={q}
              onValueChange={setQ}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim() && !exact) {
                  e.preventDefault();
                  create();
                }
              }}
            />
            <CommandList>
              <CommandEmpty>{q.trim() ? "Tecle Enter para criar." : "Nenhuma etiqueta ainda."}</CommandEmpty>
              <CommandGroup>
                {tags?.options?.map((o) => (
                  <CommandItem key={o.id} value={o.name} onSelect={() => toggle(o.id)}>
                    <OptionBadge opt={o} />
                    {value.includes(o.id) && <Check className="ml-auto" />}
                  </CommandItem>
                ))}
                {q.trim() && !exact && (
                  <CommandItem value={"__create " + q} onSelect={create}>
                    Criar “{q.trim()}”
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
