import { useState } from "react";
import { CalendarPlus, FilePlus2, SquareCheck } from "lucide-react";
import { UiIcon } from "../brand/Brand";
import { today } from "@/lib/util";
import { createNote, openEvent, openModal, useStore } from "@/store";
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

/** The "Nova tarefa" window opened from "Criar" (any page): asks which list, starting at the last one opened. */
export function GlobalNewTask() {
  const modal = useStore((s) => s.ui.modal);
  const onList = useStore((s) => s.ws.pages.find((p) => p.id === s.ui.route && p.type === "db")?.id);
  if (modal !== "newTask") return null;
  return <NewTaskDialog startDb={onList ?? lastList()} onClose={() => openModal(null)} />;
}
