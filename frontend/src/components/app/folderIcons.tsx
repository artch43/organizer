import { cn } from "@/lib/utils";
import { Mascot } from "../brand/Brand";
import { Glyph } from "../icons";

/** No icon chosen (or the old 📁 default): the mascot, who is himself a folder. */
export const isDefaultFolderIcon = (icon?: string) => !icon || icon === "📁" || icon === "📂";

/**
 * A folder's icon in the sidebar: by default the mascot, standing still, with his index cards
 * fanned up while the folder is open; or the icon/emoji chosen for it.
 */
export function FolderGlyph({ icon, open, className }: { icon?: string; open?: boolean; className?: string }) {
  if (isDefaultFolderIcon(icon))
    return <Mascot pose="pasta" size={20} open={open} className={cn("mascot-still -my-0.5 size-5!", className)} />;
  return <Glyph icon={icon} size="sm" className={className} />;
}
