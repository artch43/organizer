import { useId, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { moveHomeTask } from "@/lib/homeOrder";

interface Task {
  key: string;
  title: string;
}
interface RowControls {
  attributes: HTMLAttributes<HTMLLIElement>;
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
  const helpId = useId();
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
              draggable: true,
              onTouchStart: (event) => {
                if ((event.target as Element).closest('button:not([data-home-drag-surface]), a, input, select, textarea, [role="button"]')) event.stopPropagation();
              },
              onDragStart: (event) => {
                if ((event.target as Element).closest('button:not([data-home-drag-surface]), a, input, select, textarea, [role="button"]')) {
                  event.preventDefault();
                  return;
                }
                source.current = item.key;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.key);
              },
              onDragEnd: clear,
              onDragOver: (event) => {
                if (!source.current || source.current === item.key) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const after = index > keys.indexOf(source.current);
                setTarget((prev) => (prev?.key === item.key && prev.after === after ? prev : { key: item.key, after }));
              },
              onDrop: (event) => {
                if (!source.current) return;
                event.preventDefault();
                move(source.current, item.key, index > keys.indexOf(source.current));
                clear();
              },
              onDragLeave: (event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null);
              },
              tabIndex: 0,
              "aria-label": `Reordenar ?${item.title}?`,
              "aria-describedby": helpId,
              onKeyDown: (event) => {
                if (event.target !== event.currentTarget || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                event.preventDefault();
                const down = event.key === "ArrowDown";
                const neighbor = keys[index + (down ? 1 : -1)];
                if (neighbor) move(item.key, neighbor, down);
              },
              style: {
                cursor: "grab",
                ...(target?.key === item.key ? {
                  [target.after ? "borderBottomColor" : "borderTopColor"]: "var(--primary)",
                  [target.after ? "borderBottomWidth" : "borderTopWidth"]: 3,
                } : {}),
              },
            },
          }),
        )}
      </ol>
      <span id={helpId} className="sr-only">
        Arraste para cima ou para baixo. Com o foco na alça, use Alt e as setas para reordenar.
      </span>
    </>
  );
}
