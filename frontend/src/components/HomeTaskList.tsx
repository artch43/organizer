import { GripVertical } from "lucide-react";
import { useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { moveHomeTask } from "@/lib/homeOrder";

interface Task {
  key: string;
  title: string;
}
interface RowControls {
  attributes: HTMLAttributes<HTMLLIElement>;
  handle: ReactNode;
}

/** Native mouse dragging, also supported by the app's existing touch drag adapter. */
export function HomeTaskList<T extends Task>({
  items,
  onReorder,
  renderRow,
}: {
  items: T[];
  onReorder: (keys: string[]) => void;
  renderRow: (item: T, index: number, controls: RowControls) => ReactNode;
}) {
  const source = useRef<string | null>(null);
  const [target, setTarget] = useState<{ key: string; after: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const keys = items.map((it) => it.key);
  const clear = () => {
    source.current = null;
    setTarget(null);
  };
  const move = (from: string, to: string, after: boolean) => {
    const result = moveHomeTask(keys, from, to, after);
    if (result.every((key, i) => key === keys[i])) return;
    onReorder(result);
    setAnnouncement(`${items.find((it) => it.key === from)?.title}: posição ${result.indexOf(from) + 1} de ${result.length}.`);
  };
  return (
    <>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      <ol className="stagger flex flex-col gap-2.5">
        {items.map((item, index) =>
          renderRow(item, index, {
            attributes: {
              onDragOver: (event) => {
                if (!source.current || source.current === item.key) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = event.currentTarget.getBoundingClientRect();
                const after = event.clientY > rect.top + rect.height / 2;
                setTarget((prev) => (prev?.key === item.key && prev.after === after ? prev : { key: item.key, after }));
              },
              onDrop: (event) => {
                if (!source.current) return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                move(source.current, item.key, event.clientY > rect.top + rect.height / 2);
                clear();
              },
              onDragLeave: (event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null);
              },
              style:
                target?.key === item.key
                  ? {
                      [target.after ? "borderBottomColor" : "borderTopColor"]: "var(--primary)",
                      [target.after ? "borderBottomWidth" : "borderTopWidth"]: 3,
                    }
                  : undefined,
            },
            handle: (
              <button
                type="button"
                draggable
                aria-label={`Reordenar “${item.title}”`}
                title="Arraste para reordenar ou use Alt + ↑/↓"
                aria-describedby="home-reorder-help"
                className="flex size-11 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                onDragStart={(event) => {
                  source.current = item.key;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.key);
                }}
                onDragEnd={clear}
                onKeyDown={(event) => {
                  if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  const down = event.key === "ArrowDown";
                  const neighbor = keys[index + (down ? 1 : -1)];
                  if (neighbor) move(item.key, neighbor, down);
                }}
              >
                <GripVertical className="size-4" aria-hidden="true" />
              </button>
            ),
          }),
        )}
      </ol>
      <span id="home-reorder-help" className="sr-only">
        Arraste para cima ou para baixo. Com o foco na alça, use Alt e as setas para reordenar.
      </span>
    </>
  );
}
