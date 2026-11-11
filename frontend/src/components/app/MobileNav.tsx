import { CalendarDays, Home, ListChecks, NotebookPen, Plus, Sprout } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { go, openModal, openNotes, useStore } from "@/store";
import { TrashCan, useTrashTarget } from "./TrashDropZone";
import { CreateMenu } from "./CreateButton";
import { openLists, setListsSheet } from "../lists/state";

/**
 * Phone only: the same pages as the tabs at the top on a computer (Início, Listas, Calendário, Hábitos,
 * Notas) with "Criar" in the middle. While something is dragged, "Criar" turns into the trash.
 */
export function MobileNav() {
  const route = useStore((s) => s.ui.route);
  const pages = useStore((s) => s.ws.pages);
  const page = pages.find((p) => p.id === route);
  const id = (type: string) => pages.find((p) => p.type === type)?.id;
  const home = id("home"),
    cal = id("calendar"),
    habits = id("habits");
  const onList = page?.type === "db";
  const items = [
    { label: "Início", icon: Home, active: page?.type === "home", run: () => home && go(home) },
    // On a list already: opens the folders and lists.
    { label: "Listas", icon: ListChecks, active: onList, run: () => (onList ? setListsSheet(true) : openLists()) },
    null,
    { label: "Calendário", icon: CalendarDays, active: page?.type === "calendar", run: () => cal && go(cal) },
    { label: "Hábitos", icon: Sprout, active: page?.type === "habits", run: () => habits && go(habits) },
    { label: "Notas", icon: NotebookPen, active: route === "notes", run: () => openNotes() },
  ];
  return (
    <nav
      aria-label="Navegação principal"
      className="sticky bottom-0 z-20 grid grid-cols-6 items-end border-t bg-chrome/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-chrome/85 md:hidden"
    >
      {items.map((it) =>
        it ? (
          <button
            key={it.label}
            type="button"
            aria-current={it.active ? "page" : undefined}
            onClick={it.run}
            className={cn(
              "group flex min-w-0 flex-col items-center gap-1 pt-2 pb-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none active:[&>span]:scale-90",
              it.active ? "text-primary-strong" : "text-muted-foreground",
            )}
          >
            <span className="relative flex h-8 w-11 items-center justify-center rounded-full transition-transform duration-150 ease-out group-focus-visible:ring-2 group-focus-visible:ring-ring">
              {it.active && (
                <motion.span
                  aria-hidden="true"
                  layoutId="mobile-nav-active"
                  transition={{ type: "spring", duration: 0.35, bounce: 0.12 }}
                  className="absolute inset-0 rounded-full bg-primary/14"
                />
              )}
              <it.icon className="relative size-[22px]" aria-hidden="true" />
            </span>
            <span className="max-w-full truncate px-0.5">{it.label}</span>
          </button>
        ) : (
          <CenterButton key="criar" />
        ),
      )}
    </nav>
  );
}

/** The raised "+" in the middle: opens "Criar"; while dragging, it is the trash. */
function CenterButton() {
  const { drag, over, gulp, handlers, what } = useTrashTarget();
  if (drag)
    return (
      <div className="flex justify-center pb-2">
        <button
          type="button"
          {...handlers}
          onClick={() => openModal("trash")}
          aria-label={over ? `Soltar para excluir ${what}` : "Lixeira"}
          className={cn(
            "-mt-5 flex size-14 flex-col items-center justify-center rounded-2xl text-[11px] font-semibold transition-[background-color,transform] duration-200 [&_svg]:size-6",
            over
              ? "scale-110 bg-destructive text-white"
              : "bg-destructive/12 text-destructive outline-2 outline-destructive/50 outline-dashed",
          )}
        >
          <TrashCan over={over} gulp={gulp} />
          Lixeira
        </button>
      </div>
    );
  return (
    <div className="flex justify-center pb-2">
      <CreateMenu side="top">
        <button
          type="button"
          aria-label="Criar"
          className="-mt-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lift transition-transform duration-150 ease-out focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none active:scale-95"
        >
          <Plus className="size-7" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </CreateMenu>
    </div>
  );
}
