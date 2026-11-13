import { useRef, useState } from "react";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Settings } from "@/lib/types";
import {
  ACCENTS,
  DEFAULT_ACCENT,
  WALLPAPERS,
  applyWallpaper,
  backdropMode,
  isHex,
  type WallpaperPick,
  type WallpaperSlot,
  removeWallpaperImage,
  saveWallpaperImage,
} from "@/lib/appearance";
import { useTheme } from "next-themes";
import { useStore } from "@/store";
import { useSync } from "@/lib/sync";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { startTour } from "./companion/tour";

/** Settings → Aparência: light/dark, accent color and wallpaper. */
export function AppearanceTab() {
  const st = useStore((s) => s.ws.settings);
  const mut = useStore((s) => s.mut);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    mut((w) => {
      w.settings[k] = v;
    });
  const accent = (st.accent ?? DEFAULT_ACCENT).toLowerCase();
  const wp: NonNullable<Settings["wallpaper"]> = st.wallpaper ?? { kind: "none" };
  const strength = wp.strength ?? 0.35;
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  // Which mode's picture is being chosen: starts at the mode on screen.
  const [slot, setSlot] = useState<WallpaperSlot>(isDark ? "dark" : "light");
  const lightPick: WallpaperPick = { kind: wp.kind, preset: wp.preset, image: wp.image };
  // The dark mode uses the light-mode picture until it gets its own.
  const pick: WallpaperPick | null = slot === "light" ? lightPick : (wp.dark ?? null);
  const nextWith = (p: WallpaperPick | null): NonNullable<Settings["wallpaper"]> =>
    slot === "light" ? { ...wp, kind: p!.kind, preset: p!.preset, image: p!.image } : { ...wp, dark: p ?? undefined };
  const choose = (p: WallpaperPick | null) => {
    // The old photo isn't used anymore: free its space (unless the other mode still shows it).
    const other = slot === "light" ? wp.dark : lightPick;
    if (pick?.kind === "image" && !(other?.kind === "image" && other.image === pick.image)) void removeWallpaperImage(pick, slot);
    set("wallpaper", nextWith(p));
  };
  const anyShown = wp.kind !== "none" || (!!wp.dark && wp.dark.kind !== "none");
  const signedIn = useSync((s) => !!s.user);

  const upload = async (f: File) => {
    setBusy(true);
    try {
      const image = await saveWallpaperImage(f);
      const next = nextWith({ kind: "image", image });
      choose({ kind: "image", image });
      // Show it now (without waiting for the next render).
      await applyWallpaper(next, isDark);
      toast.success(slot === "dark" ? "Papel de parede do modo escuro aplicado" : "Papel de parede do modo claro aplicado", {
        description: signedIn ? "Aparece também nos seus outros aparelhos." : "Entre na sua conta para levar a imagem aos outros aparelhos.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível usar essa imagem.");
    }
    setBusy(false);
  };

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Tema</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          value={st.theme}
          onValueChange={(v) => v && set("theme", v as Settings["theme"])}
        >
          <ToggleGroupItem value="system" className="px-3">
            Automático
          </ToggleGroupItem>
          <ToggleGroupItem value="light" className="px-3">
            Claro
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" className="px-3">
            Escuro
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      <FieldSet>
        <FieldLegend variant="label">Cor de destaque</FieldLegend>
        <FieldDescription>
          Botões, links e o item aberto no menu. Os tons são ajustados para o texto ficar sempre legível.
        </FieldDescription>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Cor de destaque">
          {ACCENTS.map((a) => {
            const on = accent === a.hex;
            return (
              <button
                key={a.hex}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={a.name}
                title={a.name}
                onClick={() => set("accent", a.hex === DEFAULT_ACCENT ? undefined : a.hex)}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on && "ring-2 ring-foreground",
                )}
                style={{ background: a.hex }}
              >
                {on && <Check className="size-5 text-white drop-shadow" aria-hidden="true" />}
              </button>
            );
          })}
          {/* Any color: the native picker. */}
          <label
            className={cn(
              "relative flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring",
              !ACCENTS.some((a) => a.hex === accent) && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
            )}
          >
            <span className="size-5 rounded-full border" style={{ background: accent }} aria-hidden="true" />
            Outra cor
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={isHex(accent) ? accent : DEFAULT_ACCENT}
              aria-label="Escolher outra cor de destaque"
              onChange={(e) => set("accent", e.target.value)}
            />
          </label>
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Fundo</FieldLegend>
        <FieldDescription>
          O que fica atrás das páginas. Um papel de parede, se escolhido, fica no lugar dele.
        </FieldDescription>
        <ToggleGroup
          type="single"
          variant="outline"
          className="flex-wrap"
          aria-label="Fundo"
          value={backdropMode(st.backdrop)}
          onValueChange={(v) => v && set("backdrop", v === "sweep" ? undefined : (v as Settings["backdrop"]))}
        >
          <ToggleGroupItem value="sweep" className="px-3">
            Degradê suave
          </ToggleGroupItem>
          <ToggleGroupItem value="dots" className="px-3">
            Pontilhado
          </ToggleGroupItem>
          <ToggleGroupItem value="animated" className="px-3">
            Degradê animado
          </ToggleGroupItem>
          <ToggleGroupItem value="plain" className="px-3">
            Liso
          </ToggleGroupItem>
        </ToggleGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Clebinho no canto</FieldLegend>
        <FieldDescription>O Clebinho, nosso mascote, fica pequeno no canto da tela, olha para o cursor e comemora suas tarefas.</FieldDescription>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="Clebinho no canto"
          value={st.companion === false ? "off" : "on"}
          onValueChange={(v) => v && set("companion", v === "on" ? undefined : false)}
        >
          <ToggleGroupItem value="on" className="px-3">
            Mostrar
          </ToggleGroupItem>
          <ToggleGroupItem value="off" className="px-3">
            Esconder
          </ToggleGroupItem>
        </ToggleGroup>
        <Button variant="outline" className="self-start" onClick={startTour}>
          Rever o tour do Clebinho
        </Button>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Papel de parede</FieldLegend>
        <FieldDescription>
          Aparece atrás das páginas. Escolha um para o modo claro e outro para o escuro, se quiser.
        </FieldDescription>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="Papel de parede de qual modo"
          value={slot}
          onValueChange={(v) => v && setSlot(v as WallpaperSlot)}
          className="self-start"
        >
          <ToggleGroupItem value="light" className="px-3">
            Modo claro
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" className="px-3">
            Modo escuro
          </ToggleGroupItem>
        </ToggleGroup>
        <div
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          role="radiogroup"
          aria-label={slot === "dark" ? "Papel de parede do modo escuro" : "Papel de parede do modo claro"}
        >
          {slot === "dark" && (
            <WallpaperChoice label="Igual ao claro" selected={pick === null} onClick={() => choose(null)}>
              <span className="absolute inset-0 bg-background" />
              <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                = claro
              </span>
            </WallpaperChoice>
          )}
          <WallpaperChoice label="Nenhum" selected={pick?.kind === "none"} onClick={() => choose({ kind: "none" })}>
            <span className="absolute inset-0 bg-background" />
          </WallpaperChoice>
          {WALLPAPERS.map((w) => (
            <WallpaperChoice
              key={w.id}
              label={w.name}
              selected={pick?.kind === "preset" && pick.preset === w.id}
              onClick={() => choose({ kind: "preset", preset: w.id })}
            >
              <span className="absolute inset-0 bg-background" />
              <span className="absolute inset-0" style={{ background: w.css }} />
            </WallpaperChoice>
          ))}
          <WallpaperChoice label="Sua imagem" selected={pick?.kind === "image"} onClick={() => file.current?.click()}>
            <span className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
              <ImagePlus className="size-6" aria-hidden="true" />
            </span>
          </WallpaperChoice>
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        {busy && <p className="text-sm text-muted-foreground">Preparando a imagem…</p>}
        {pick?.kind === "image" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}>
              <ImagePlus data-icon="inline-start" />
              Trocar imagem
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={async () => {
                choose({ kind: "none" });
              }}
            >
              <Trash2 data-icon="inline-start" />
              Remover imagem
            </Button>
            <span className="text-sm text-muted-foreground">
              {signedIn ? "Salva na sua conta." : "Fica só neste aparelho."}
            </span>
          </div>
        )}
        {anyShown && (
          <Field>
            <FieldLabel htmlFor="wp-strength">
              Intensidade <span className="font-normal text-muted-foreground tabular-nums">{Math.round(strength * 100)}%</span>
            </FieldLabel>
            <input
              id="wp-strength"
              type="range"
              min={10}
              max={70}
              step={5}
              value={Math.round(strength * 100)}
              onChange={(e) => set("wallpaper", { ...wp, strength: Number(e.target.value) / 100 })}
              className="w-full accent-(--primary)"
            />
            <FieldDescription>Mais baixo deixa o texto mais fácil de ler.</FieldDescription>
          </Field>
        )}
      </FieldSet>
    </FieldGroup>
  );
}

function WallpaperChoice({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "group flex flex-col gap-1 rounded-xl text-left text-sm focus-visible:outline-none",
        selected ? "font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "relative block aspect-[4/3] w-full overflow-hidden rounded-xl border transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-ring",
          selected && "ring-2 ring-primary-strong ring-offset-2 ring-offset-background",
        )}
      >
        {children}
        {selected && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </span>
      {label}
    </button>
  );
}
