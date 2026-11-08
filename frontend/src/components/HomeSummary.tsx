import { useRef, useState, type ReactNode } from "react";
import { moveHomeTask } from "@/lib/homeOrder";
import { cn } from "@/lib/utils";

const DEFAULT_ORDER = ["alarm", "habits", "agenda"];
export function summaryOrder(saved: string[] = []) {
  return [...new Set([...saved.filter((id) => DEFAULT_ORDER.includes(id)), ...DEFAULT_ORDER])];
}
const INTERACTIVE = "button,a,input,select,textarea,[contenteditable=true],[role=button]";

/** Whole-card dragging; existing controls keep their normal click behavior. */
export function HomeSummary({ order, onReorder, sections }: {
  order?: string[];
  onReorder: (order: string[]) => void;
  sections: { id: string; title: string; content: ReactNode }[];
}) {
  const source = useRef<string | null>(null);
  const blocked = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; after: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const keys = summaryOrder(order);
  const visible = keys.flatMap((id) => sections.filter((section) => section.id === id));
  const clear = () => {
    source.current = null;
    blocked.current = false;
    setDragging(null);
    setTarget(null);
  };
  const move = (from: string, to: string, after: boolean) => {
    const next = moveHomeTask(keys, from, to, after);
    if (next.every((id, i) => id === keys[i])) return;
    onReorder(next);
    const shown = next.filter((id) => sections.some((section) => section.id === id));
    setAnnouncement(`${sections.find((section) => section.id === from)?.title}: posição ${shown.indexOf(from) + 1} de ${shown.length}.`);
  };
  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label="Resumo do dia">
      <span className="sr-only" role="status">{announcement}</span>
      <span id="home-summary-help" className="sr-only">
        Arraste para reordenar. Com o bloco em foco, use Alt e as setas para cima ou para baixo.
      </span>
      {visible.map((section, index) => (
        <div
          key={section.id}
          draggable
          tabIndex={0}
          role="group"
          aria-label={section.title}
          aria-describedby="home-summary-help"
          className={cn(
            "relative min-w-0 cursor-grab rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing",
            dragging === section.id && "opacity-50",
          )}
          onMouseDownCapture={(event) => { blocked.current = !!(event.target as Element).closest(INTERACTIVE); }}
          onDragStart={(event) => {
            if (blocked.current || (event.target as Element).closest(INTERACTIVE)) {
              event.preventDefault();
              return;
            }
            source.current = section.id;
            setDragging(section.id);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", section.id);
          }}
          onDragEnd={clear}
          onDragOver={(event) => {
            if (!source.current || source.current === section.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            const after = keys.indexOf(source.current) < keys.indexOf(section.id);
            setTarget((prev) => prev?.id === section.id && prev.after === after ? prev : { id: section.id, after });
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null);
          }}
          onDrop={(event) => {
            if (!source.current) return;
            event.preventDefault();
            move(source.current, section.id, keys.indexOf(source.current) < keys.indexOf(section.id));
            clear();
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const down = event.key === "ArrowDown";
            const neighbor = visible[index + (down ? 1 : -1)];
            if (neighbor) move(section.id, neighbor.id, down);
          }}
        >
          {target?.id === section.id && (
            <span aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-primary", target.after ? "-bottom-3" : "-top-3")} />
          )}
          {section.content}
        </div>
      ))}
    </aside>
  );
}
