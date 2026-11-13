import { useRef, useState } from "react";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Settings } from "@/lib/types";
import {
  ACCENTS,
  DEFAULT_ACCENT,
  backdropMode,
  isHex,
  wallpaperFor,
  saveWallpaperImage,
  removeWallpaperImage,
  type WallpaperPick,
} from "@/lib/appearance";
import { useTheme } from "next-themes";
import { useStore } from "@/store";
import { useSync } from "@/lib/sync";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Settings → Aparência: theme, accent, backdrop and a custom image for each theme. */
export function AppearanceTab() {
  const st = useStore((s) => s.ws.settings);
  const mut = useStore((s) => s.mut);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    mut((w) => {
      w.settings[k] = v;
    });
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  // Edit the active theme; automatic mode follows the system theme.
  const slot: "light" | "dark" = (st.theme === "system" ? isDark : st.theme === "dark") ? "dark" : "light";
  const accent = (slot === "dark" ? st.accentDark ?? st.accent ?? "default" : st.accent ?? "default").toLowerCase();
  const defaultColor = slot === "dark" ? DEFAULT_ACCENT : "#ff5fa2";
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const signedIn = useSync((s) => !!s.user);
  const pick = wallpaperFor(st.wallpaper, slot === "dark");
  const strength = st.wallpaper?.strength ?? 0.85;
  const chooseWallpaper = (nextPick: WallpaperPick, newStrength?: number) => {
    const previous = wallpaperFor(useStore.getState().ws.settings.wallpaper, slot === "dark");
    mut((w) => {
      const current = w.settings.wallpaper ?? { kind: "none" as const };
      const light = { kind: current.kind, preset: current.preset, image: current.image };
      w.settings.wallpaper = slot === "light"
        ? { ...current, kind: nextPick.kind, preset: nextPick.preset, image: nextPick.image, dark: current.dark ?? light }
        : { ...current, dark: nextPick };
      if (newStrength !== undefined) w.settings.wallpaper.strength = newStrength;
    });
    // A picture shared by both themes must survive changing just one of them.
    const next = useStore.getState().ws.settings.wallpaper;
    const other = wallpaperFor(next, slot !== "dark");
    if (previous.kind === "image" && !(other.kind === "image" && other.image === previous.image)) {
      void removeWallpaperImage(previous, slot);
    }
  };
  const uploadImage = async (file: File) => {
    setBusy(true);
    let preview: string | undefined;
    try {
      const limit = signedIn ? 10 : 25;
      if (file.size > limit * 1024 * 1024) throw new Error(`A imagem passa de ${limit} MB. Escolha uma menor.`);
      // Check that this device can display the source before replacing the current background.
      preview = URL.createObjectURL(file);
      const image = new Image();
      image.src = preview;
      await image.decode().catch(() => {
        throw new Error("Não foi possível abrir essa imagem. Escolha um JPG, PNG, WebP, GIF ou AVIF válido.");
      });
      const id = await saveWallpaperImage(file);
      chooseWallpaper({ kind: "image", image: id }, strength);
      toast.success(`Imagem de fundo do modo ${slot === "dark" ? "escuro" : "claro"} aplicada`, {
        description: signedIn ? "O arquivo original também fica disponível nos seus outros aparelhos." : "O arquivo original foi salvo neste aparelho.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível usar essa imagem.");
    } finally {
      if (preview) URL.revokeObjectURL(preview);
      setBusy(false);
    }
  };
  const chooseAccent = (color: string) => mut((w) => {
    if (slot === "dark") w.settings.accentDark = color;
    else {
      w.settings.accentDark ??= w.settings.accent ?? "default";
      w.settings.accent = color;
    }
  });
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
          <button
            type="button"
            role="radio"
            aria-checked={accent === "default"}
            onClick={() => chooseAccent("default")}
            className={cn("h-10 rounded-full border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", accent === "default" && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
          >
            Padrão
          </button>
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
                onClick={() => chooseAccent(a.hex)}
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
              accent !== "default" && !ACCENTS.some((a) => a.hex === accent) && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
            )}
          >
            <span className="size-5 rounded-full border" style={{ background: isHex(accent) ? accent : defaultColor }} aria-hidden="true" />
            Outra cor
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={isHex(accent) ? accent : defaultColor}
              aria-label="Escolher outra cor de destaque"
              onChange={(e) => chooseAccent(e.target.value)}
            />
          </label>
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Fundo</FieldLegend>
        <FieldDescription>
          Escolha entre o degradê na cor de destaque, o pontilhado e o fundo liso do tema.
        </FieldDescription>
        <ToggleGroup
          type="single"
          variant="outline"
          className="flex-wrap"
          aria-label="Fundo"
          value={pick.kind === "image" ? "" : backdropMode(st.backdrop)}
          disabled={busy}
          onValueChange={(v) => {
            if (!v) return;
            set("backdrop", v === "sweep" ? undefined : (v as Settings["backdrop"]));
            if (pick.kind !== "none") chooseWallpaper({ kind: "none" });
          }}
        >
          <ToggleGroupItem value="sweep" className="px-3">
            Degradê suave
          </ToggleGroupItem>
          <ToggleGroupItem value="dots" className="px-3">
            Pontilhado
          </ToggleGroupItem>
          <ToggleGroupItem value="plain" className="px-3">
            Liso
          </ToggleGroupItem>
        </ToggleGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Imagem personalizada</FieldLegend>
        <FieldDescription>
          Escolha uma imagem para o modo {slot === "dark" ? "escuro" : "claro"}. Ela preenche a tela sem esticar,
          preservando o arquivo original. Algumas bordas podem ser recortadas para caber.
        </FieldDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            <ImagePlus data-icon="inline-start" />
            {busy ? "Preparando imagem…" : pick.kind === "image" ? "Trocar imagem" : "Escolher imagem"}
          </Button>
          {pick.kind === "image" && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => chooseWallpaper({ kind: "none" })}>
              <Trash2 data-icon="inline-start" />
              Remover imagem
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          aria-label="Escolher imagem de fundo personalizada"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadImage(file);
          }}
        />
        <FieldDescription>
          JPG, PNG, WebP, GIF ou AVIF. Até {signedIn ? "10" : "25"} MB.
          {signedIn ? " Sincronizada com seus outros aparelhos." : " Salva neste aparelho."}
        </FieldDescription>
        {busy && <p role="status" className="text-sm text-muted-foreground">Salvando a imagem original…</p>}
        {pick.kind === "image" && (
          <Field>
            <FieldLabel htmlFor="wallpaper-strength">
              Intensidade da imagem <span className="font-normal text-muted-foreground tabular-nums">{Math.round(strength * 100)}%</span>
            </FieldLabel>
            <input
              id="wallpaper-strength"
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(strength * 100)}
              disabled={busy}
              onChange={(event) => mut((w) => {
                if (w.settings.wallpaper) w.settings.wallpaper.strength = Number(event.target.value) / 100;
              })}
              className="w-full accent-(--primary)"
            />
            <FieldDescription>Diminua a intensidade se precisar de mais contraste para ler.</FieldDescription>
          </Field>
        )}
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
      </FieldSet>

    </FieldGroup>
  );
}
