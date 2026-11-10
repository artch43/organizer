import { useState } from "react";
import { CalendarDays, CheckSquare, FileText, NotebookPen } from "lucide-react";
import { go, openEvent, openNotes, openPeek, useStore } from "@/store";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { emojiOf, fmtDate, ymd } from "@/lib/util";
import { dateOf, statusProp } from "@/lib/model";
import { REPEAT_LABELS } from "@/lib/events";
import { plainSnippet } from "@/lib/notes";
import { Glyph } from "./icons";
import { EmptyState } from "./EmptyState";

/** Ctrl/Cmd + K: find pages, tasks, events and notes. Each result has a second line so look-alike names can be told apart. */
export function Search() {
  // Empty box: a short preview of each group. Once something is typed, every item is searched.
  const [q, setQ] = useState("");
  const cap = q.trim() ? Infinity : 50;
  const ws = useStore((s) => s.ws);
  const setUi = useStore((s) => s.setUi);
  const close = () =>
    setUi((u) => {
      u.modal = null;
    });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <CommandDialog
      open
      onOpenChange={(o) => !o && close()}
      title="Buscar"
      description="Busque páginas, tarefas, eventos e anotações"
      // Phones: at the top, so the keyboard doesn't cover the results.
      className="max-sm:top-3 max-sm:translate-y-0 max-sm:[&_[data-slot=command-list]]:max-h-[45dvh]"
    >
      <Command>
        <CommandInput placeholder="Buscar páginas, tarefas, eventos e anotações…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>
            <EmptyState compact pose="dorme" title="Nada encontrado" text="Tente outra palavra, ou parte do nome." />
          </CommandEmpty>
          <CommandGroup heading="Páginas">
            {ws.pages.map((p) => (
              <CommandItem key={p.id} value={"pagina " + p.title} onSelect={run(() => go(p.id))}>
                <Glyph icon={p.icon} size="xs" />
                {p.title}
              </CommandItem>
            ))}
            <CommandItem value="pagina anotacoes" onSelect={run(() => openNotes(null))}>
              <NotebookPen />
              Anotações
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Tarefas">
            {Object.values(ws.items)
              .filter((i) => i.title)
              .slice(0, cap)
              .map((i) => {
                const db = ws.dbs[i.db];
                const list = ws.pages.find((p) => p.id === i.db);
                const sp = db && statusProp(db);
                const status = sp?.options?.find((o) => o.id === i.props[sp.id])?.name;
                const date = db && dateOf(db, i);
                return (
                  <CommandItem
                    key={i.id}
                    value={"tarefa " + i.title + " " + i.id}
                    // The list's name and the task's notes count too (searching "capítulo" finds a task that mentions it).
                    keywords={[list?.title ?? "", i.notes.slice(0, 200)].filter(Boolean)}
                    onSelect={run(() => {
                      go(i.db);
                      openPeek(i.id);
                    })}
                  >
                    <CheckSquare />
                    <Two
                      title={i.title}
                      sub={[list && `${emojiOf(list.icon)} ${list.title}`.trim(), status, date && fmtDate(date)]}
                    />
                  </CommandItem>
                );
              })}
          </CommandGroup>
          <CommandGroup heading="Eventos">
            {Object.values(ws.events)
              .slice(0, cap)
              .map((e) => (
                <CommandItem
                  key={e.id}
                  value={"evento " + e.title + " " + e.id}
                  onSelect={run(() => {
                    const c = ws.pages.find((p) => p.type === "calendar");
                    if (c) go(c.id);
                    openEvent(e.id);
                  })}
                >
                  <CalendarDays />
                  <Two
                    title={e.title || "Evento"}
                    sub={[
                      fmtDate(e.date) + (e.allDay ? ", dia inteiro" : `, ${e.start}`),
                      e.repeat && e.repeat !== "none" ? REPEAT_LABELS[e.repeat] : "",
                      e.location,
                    ]}
                  />
                </CommandItem>
              ))}
          </CommandGroup>
          <CommandGroup heading="Anotações">
            {Object.values(ws.notes).map((n) => (
              <CommandItem
                key={n.id}
                value={"nota " + n.title + " " + n.body.slice(0, 400) + " " + n.id}
                onSelect={run(() => openNotes(n.id))}
              >
                <FileText />
                <Two
                  title={n.title || "Sem título"}
                  sub={[
                    n.folder ? `Pasta ${n.folder.split("/").join(" › ")}` : "",
                    "editada " + fmtDate(ymd(new Date(n.updated))).toLowerCase(),
                    plainSnippet(n.body, 60),
                  ]}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function Two({ title, sub }: { title: string; sub: (string | false | undefined | null)[] }) {
  const line = sub.filter(Boolean).join(" · ");
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{title}</span>
      {line && <span className="truncate text-xs text-muted-foreground">{line}</span>}
    </span>
  );
}
