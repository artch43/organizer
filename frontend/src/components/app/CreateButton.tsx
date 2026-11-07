import { useState } from "react";
import { CalendarPlus, FilePlus2, Plus, SquareCheck } from "lucide-react";
import { UiIcon } from "../brand/Brand";
import { cn } from "@/lib/utils";
import { today } from "@/lib/util";
import { SETTINGS_ROUTE, createNote, openEvent, openModal, useStore } from "@/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderDialog } from "../lists/FolderDialog";
import { NewTaskDialog } from "../tasks/NewTaskDialog";
import { lastList } from "../lists/state";

/**
 * "Criar": one place to make a task, a list, a folder, a note or an event. The trigger is passed in
 * (the floating button on computers, the middle of the bottom bar on phones).
 */
export function CreateMenu({ children, side = "top" }: { children: React.ReactNode; side?: "top" | "bottom" }) {
  const [folder, setFolder] = useState(false);
  const calendarDay = useStore((s) => s.ui.calendar.selected);
  const onCalendar = useStore((s) => s.ws.pages.some((p) => p.id === s.ui.route && p.type === "calendar"));
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent side={side} align="end" sideOffset={10} className="w-56">
          <DropdownMenuLabel>Criar</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => openModal("newTask")}>
              <SquareCheck />
              Tarefa
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openEvent(null, onCalendar && calendarDay ? calendarDay : today())}>
              <CalendarPlus />
              Evento
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => createNote()}>
              <FilePlus2 />
              Nota
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openModal("newBoard")}>
              <UiIcon name="newList" size={18} />
              Lista
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setFolder(true)}>
              <UiIcon name="newFolder" size={18} />
              Pasta de listas
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {folder && <FolderDialog parent="" onClose={() => setFolder(false)} />}
    </>
  );
}

/** The floating "+ Criar" at the bottom right (computer and tablet). */
export function CreateButton() {
  // Notas has its own "new" buttons and Configurações creates nothing: no floating button there.
  const route = useStore((s) => s.ui.route);
  if (route === "notes" || route === SETTINGS_ROUTE) return null;
  return (
    <div className="fixed right-6 bottom-6 z-30 max-md:hidden">
      <CreateMenu>
        <button
          type="button"
          className={cn(
            "flex h-14 items-center gap-2.5 rounded-2xl bg-primary px-6 text-lg font-bold text-primary-foreground shadow-lift transition-[transform,background-color] duration-150 ease-out",
            "hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none active:scale-[0.97] data-[state=open]:scale-[0.97]",
          )}
        >
          <Plus className="size-6" strokeWidth={2.5} aria-hidden="true" />
          Criar
        </button>
      </CreateMenu>
    </div>
  );
}

/** The "Nova tarefa" window opened from "Criar" (any page): asks which list, starting at the last one opened. */
export function GlobalNewTask() {
  const modal = useStore((s) => s.ui.modal);
  const onList = useStore((s) => s.ws.pages.find((p) => p.id === s.ui.route && p.type === "db")?.id);
  if (modal !== "newTask") return null;
  return <NewTaskDialog startDb={onList ?? lastList()} onClose={() => openModal(null)} />;
}
