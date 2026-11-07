import { useRef, useState } from "react";
import { addBoardFolder, renameBoardFolder, setBoardFolderIcon, useStore } from "@/store";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconPicker } from "../IconPicker";
import { FolderGlyph } from "../app/folderIcons";

export const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
export const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Name a new folder (inside `parent`) or rename `current`. */
export function FolderDialog({
  parent,
  current,
  onClose,
  onSaved,
}: {
  parent: string;
  current?: string;
  onClose: () => void;
  onSaved?: (path: string) => void;
}) {
  const [name, setName] = useState(current ? nameOf(current) : "");
  const [icon, setIcon] = useState(() => (current && useStore.getState().ws.settings.boardFolderIcons?.[current]) || "");
  const nameRef = useRef<HTMLInputElement>(null);
  const save = () => {
    const clean = name.replace(/\//g, "-").trim();
    if (!clean) return;
    const full = (parent ? parent + "/" : "") + clean;
    if (current) renameBoardFolder(current, full);
    else addBoardFolder(full);
    setBoardFolderIcon(full, icon);
    onSaved?.(full);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={(e) => {
          // Start in the name field (not the icon button), also when opened from a menu.
          e.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {current ? "Renomear pasta" : parent ? `Nova pasta em ${parent.split("/").join(" › ")}` : "Nova pasta"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex gap-2">
            <IconPicker value={icon} onChange={setIcon} label="Ícone da pasta" folder>
              <Button type="button" variant="outline" size="icon" aria-label="Ícone da pasta" className="size-10 shrink-0">
                <FolderGlyph icon={icon} />
              </Button>
            </IconPicker>
            <Input
              ref={nameRef}
              autoComplete="off"
              aria-label="Nome da pasta"
              placeholder="Ex.: Faculdade, Casa, Trabalho…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {current ? "Salvar" : "Criar pasta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
