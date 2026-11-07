import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMOJI_GROUPS } from "@/lib/util";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Mascot } from "./brand/Brand";
import { ICON_COLORS, ICON_COLOR_NAMES, ICON_GROUPS, Glyph, makeIcon, makePixelIcon, parseIcon, type IconColor } from "./icons";
import { PIXEL_CATEGORIES, PIXEL_ICONS } from "./brand/pixelIcons";

/**
 * Choose an icon: drawn icons by theme (with a color for the tile), or an emoji. Opens from the
 * icon itself (`children`) or from a default button.
 */
export function IconPicker({
  value,
  onChange,
  label = "Trocar ícone",
  className,
  children,
  folder,
  open: openProp,
  onOpenChange,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  className?: string;
  children?: React.ReactElement;
  /** Folders: the first choice is the default folder (empty value). */
  folder?: boolean;
  /** Open it from elsewhere (e.g. a menu item); otherwise it opens from its own button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const cur = parseIcon(value);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setOpenState(v);
  };
  type Mode = "pixel" | "icons" | "emoji";
  const [mode, setMode] = useState<Mode>(cur.kind === "emoji" && cur.text ? "emoji" : cur.kind === "lucide" ? "icons" : "pixel");
  const [group, setGroup] = useState(0);
  const [color, setColor] = useState<IconColor>(cur.kind === "lucide" ? cur.color : "teal");
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState("");
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const query = q.trim().toLowerCase();
  const pixelCat = PIXEL_CATEGORIES[group] ?? PIXEL_CATEGORIES[0];
  const pixelFound = Object.entries(PIXEL_ICONS).filter(([k, d]) =>
    query ? d.label.toLowerCase().includes(query) || k.includes(query) : d.category === pixelCat.id,
  );
  const found = query
    ? ICON_GROUPS.flatMap((g) => Object.entries(g.items)).filter(
        ([k, d], i, all) =>
          (d.label.toLowerCase().includes(query) || k.includes(query)) && all.findIndex(([k2]) => k2 === k) === i,
      )
    : Object.entries(ICON_GROUPS[group].items);
  const chip = (active: boolean) =>
    cn(
      "shrink-0 rounded-full px-2.5 py-1 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button variant="ghost" size="icon" aria-label={label} className={cn("size-11", className)}>
            <Glyph icon={value} size="md" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col gap-3 p-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-3 rounded-lg bg-muted p-1" role="tablist" aria-label="Tipo de ícone">
          {(["pixel", "icons", "emoji"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setGroup(0);
              }}
              className={cn(
                "rounded-md py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "pixel" ? "Pixel" : m === "icons" ? "Ícones" : "Emoji"}
            </button>
          ))}
        </div>

        {mode === "pixel" ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                aria-label="Buscar desenho"
                placeholder="Buscar: casa, livro, café…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {!query && (
              <div className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3" role="tablist" aria-label="Temas">
                {PIXEL_CATEGORIES.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={group === i}
                    onClick={() => setGroup(i)}
                    className={chip(group === i)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {/* Drawings in pixel art: they bring their own colors, so there's no color to pick here. */}
            <div className="grid max-h-60 grid-cols-6 gap-1.5 overflow-y-auto" role="tabpanel">
              {folder && !query && (
                <IconButton label="Pasta (padrão)" selected={!value} onClick={() => pick("")} big>
                  <Mascot pose="pasta" size={26} className="mascot-still" />
                </IconButton>
              )}
              {pixelFound.map(([k, d]) => (
                <IconButton
                  key={k}
                  label={d.label}
                  selected={cur.kind === "pixel" && cur.key === k}
                  onClick={() => pick(makePixelIcon(k))}
                  big
                >
                  <Glyph icon={makePixelIcon(k)} size="lg" />
                </IconButton>
              ))}
              {!pixelFound.length && (
                <p className="col-span-6 py-4 text-center text-sm text-muted-foreground">Nenhum desenho com esse nome.</p>
              )}
            </div>
          </>
        ) : mode === "icons" ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                aria-label="Buscar ícone"
                placeholder="Buscar ícone: livro, academia, viagem…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor do ícone">
              {ICON_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={ICON_COLOR_NAMES[c]}
                  title={ICON_COLOR_NAMES[c]}
                  onClick={() => {
                    setColor(c);
                    // Recolor the current icon right away.
                    if (cur.kind === "lucide") onChange(makeIcon(cur.key, c));
                  }}
                  className={cn(
                    "rounded-full p-0.5 ring-offset-2 ring-offset-popover transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    color === c && "ring-2 ring-foreground/70",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="block size-5 rounded-full"
                    style={{ background: c === "teal" ? "var(--primary)" : `var(--tag-${c}-fg)` }}
                  />
                </button>
              ))}
            </div>
            {!query && (
              <div className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3" role="tablist" aria-label="Temas">
                {ICON_GROUPS.map((g, i) => (
                  <button
                    key={g.name}
                    type="button"
                    role="tab"
                    aria-selected={group === i}
                    onClick={() => setGroup(i)}
                    className={chip(group === i)}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
            <div className="grid max-h-60 grid-cols-7 gap-1 overflow-y-auto" role="tabpanel">
              {folder && !query && (
                <IconButton label="Pasta (padrão)" selected={!value} onClick={() => pick("")}>
                  {/* The default folder icon is the mascot (he is a folder). */}
                  <Mascot pose="pasta" size={22} className="mascot-still" />
                </IconButton>
              )}
              {found.map(([k, d]) => {
                const v = makeIcon(k, color);
                return (
                  <IconButton key={k} label={d.label} selected={cur.kind === "lucide" && cur.key === k} onClick={() => pick(v)}>
                    <Glyph icon={v} size="md" />
                  </IconButton>
                );
              })}
              {!found.length && (
                <p className="col-span-7 py-4 text-center text-sm text-muted-foreground">Nenhum ícone com esse nome.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3" role="tablist" aria-label="Categorias de emoji">
              {EMOJI_GROUPS.map((g, i) => (
                <button
                  key={g.name}
                  type="button"
                  role="tab"
                  aria-selected={group === i}
                  onClick={() => setGroup(i)}
                  className={chip(group === i)}
                >
                  {g.name}
                </button>
              ))}
            </div>
            <div className="grid max-h-60 grid-cols-8 gap-0.5 overflow-y-auto" role="tabpanel">
              {(EMOJI_GROUPS[group] ?? EMOJI_GROUPS[0]).list.map((e) => (
                <IconButton key={e} label={e} selected={cur.kind === "emoji" && cur.text === e} onClick={() => pick(e)}>
                  <span className="text-xl">{e}</span>
                </IconButton>
              ))}
            </div>
            <Input
              aria-label="Outro emoji"
              placeholder="Ou cole um emoji e tecle Enter…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) {
                  e.preventDefault();
                  pick([...custom.trim()].slice(0, 2).join(""));
                }
              }}
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function IconButton({
  label,
  selected,
  onClick,
  children,
  big,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** Pixel art: a bigger cell, so the drawing can be seen. */
  big?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-10 items-center justify-center rounded-lg transition-[background-color,transform] hover:scale-110 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        big && "size-12",
        selected && "bg-accent ring-2 ring-primary-strong",
      )}
    >
      {children}
    </button>
  );
}
