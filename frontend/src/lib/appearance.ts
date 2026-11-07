/**
 * Personal look: an accent color (buttons, links, focus, the active menu item) and a wallpaper.
 * Any accent works: the shades used for text and for button labels are adjusted until they pass
 * WCAG AA against the backgrounds they sit on, in light and in dark mode.
 */

import { openFilesDb } from "./rename";

export const DEFAULT_ACCENT = "#c6ff3d";
/** The default before the lime palette: picked by nobody on purpose, so it now means the default. */
const OLD_DEFAULT_ACCENT = "#1f7a8c";

export const ACCENTS: { name: string; hex: string }[] = [
  { name: "Padrão (lima no escuro, rosa no claro)", hex: "#c6ff3d" },
  { name: "Petróleo", hex: "#1f7a8c" },
  { name: "Azul", hex: "#2563eb" },
  { name: "Índigo", hex: "#4f46e5" },
  { name: "Roxo", hex: "#7c3aed" },
  { name: "Rosa", hex: "#db2777" },
  { name: "Coral", hex: "#e2553f" },
  { name: "Laranja", hex: "#d97706" },
  { name: "Verde", hex: "#15803d" },
  { name: "Grafite", hex: "#475569" },
];

/** One picture: none, a preset or the person's own image. */
export type WallpaperPick = { kind: "none" | "preset" | "image"; preset?: string };
/** The light-mode picture (top level), the dark-mode one (`dark`, when different) and how strongly they show. */
export type Wallpaper = WallpaperPick & {
  /** How strongly the wallpaper shows through (0.1–0.7). The rest is the page color, for legible text. */
  strength?: number;
  /** A different picture for the dark mode; without it the light-mode one is used in both. */
  dark?: WallpaperPick;
};
export type WallpaperSlot = "light" | "dark";

/** Whether this picture shows anything (a preset that no longer exists shows nothing). */
export const showsWallpaper = (p: WallpaperPick) =>
  p.kind === "image" || (p.kind === "preset" && WALLPAPERS.some((w) => w.id === p.preset));

/** The page background chosen in Settings, with the retired "still gradient" shown as the dots. */
export const backdropMode = (b: string | undefined): "dots" | "animated" | "plain" =>
  b === "animated" || b === "plain" ? b : "dots";

/** The picture shown in this mode. */
export function wallpaperFor(w: Wallpaper | undefined, dark: boolean): WallpaperPick {
  if (!w) return { kind: "none" };
  return dark && w.dark ? w.dark : { kind: w.kind, preset: w.preset };
}

export const WALLPAPERS: { id: string; name: string; css: string }[] = [
  { id: "aurora", name: "Aurora", css: "linear-gradient(135deg, #7dd3fc 0%, #a78bfa 50%, #f0abfc 100%)" },
  { id: "por-do-sol", name: "Pôr do sol", css: "linear-gradient(135deg, #fb923c 0%, #f472b6 55%, #8b5cf6 100%)" },
  { id: "oceano", name: "Oceano", css: "linear-gradient(160deg, #0ea5e9 0%, #14b8a6 55%, #1e3a8a 100%)" },
  { id: "floresta", name: "Floresta", css: "linear-gradient(150deg, #166534 0%, #65a30d 55%, #facc15 100%)" },
  {
    id: "lavanda",
    name: "Lavanda",
    css: "radial-gradient(circle at 20% 20%, #e9d5ff, transparent 55%), radial-gradient(circle at 80% 75%, #bae6fd, transparent 55%), #f5f3ff",
  },
  {
    id: "noite",
    name: "Noite",
    css: "radial-gradient(circle at 25% 20%, #4338ca, transparent 55%), radial-gradient(circle at 80% 80%, #0f766e, transparent 55%), #0b1020",
  },
];

/* ---------- color math ---------- */
type RGB = [number, number, number];
export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);
const parse = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) =>
  "#" +
  c
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;
const lum = ([r, g, b]: RGB) => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(parse(a)), lum(parse(b))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** Moves `hex` toward `to` in small steps until it reaches `min` contrast with `against`. */
function until(hex: string, to: string, against: string[], min: number) {
  let c = parse(hex);
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const h = toHex(mix(parse(hex), parse(to), t));
    c = parse(h);
    if (against.every((bg) => contrast(h, bg) >= min)) return h;
  }
  return toHex(c);
}

const LIGHT = { bg: "#ffffff", card: "#ffffff", ink: "#0b1d51" };
const DARK = { bg: "#1a1b1e", card: "#222327", ink: "#0a0a0a" };

/** All the CSS variables that follow the accent, for light and dark mode. */
export function accentVars(accent: string) {
  const hex = isHex(accent) ? accent : DEFAULT_ACCENT;
  // Light: the color must stand out on the page (3:1) — very pale picks get deepened — and the
  // button label (white or near-black, whichever reads better) must reach 4.5:1 on it.
  let lightPrimary = until(hex, "#000000", [LIGHT.bg, LIGHT.card], 3);
  let lightFg = "#ffffff";
  if (contrast("#ffffff", lightPrimary) < 4.5) {
    if (contrast(LIGHT.ink, lightPrimary) >= 4.5) lightFg = LIGHT.ink;
    else lightPrimary = until(lightPrimary, "#000000", ["#ffffff"], 4.5);
  }
  const lightAccentBg = toHex(mix(parse(hex), [255, 255, 255], 0.88));
  // Selected buttons sit on a light tint of the accent (bg-primary/10) over the page or a card.
  const lightTints = [LIGHT.bg, LIGHT.card].map((bg) => toHex(mix(parse(lightPrimary), parse(bg), 0.88)));
  const lightStrong = until(hex, "#000000", [LIGHT.bg, LIGHT.card, lightAccentBg, ...lightTints], 4.6);
  // Dark: lighter shades on the dark backgrounds, with a dark label (lightened further if needed).
  let darkPrimary = until(hex, "#ffffff", [DARK.bg, DARK.card], 4.5);
  let darkFg = DARK.ink;
  if (contrast(DARK.ink, darkPrimary) < 4.5) {
    if (contrast("#ffffff", darkPrimary) >= 4.5) darkFg = "#ffffff";
    else darkPrimary = until(darkPrimary, "#ffffff", [DARK.ink], 4.5);
  }
  const darkAccentBg = toHex(mix(parse(hex), parse(DARK.bg), 0.78));
  const darkTints = [DARK.bg, DARK.card].map((bg) => toHex(mix(parse(darkPrimary), parse(bg), 0.83)));
  const darkStrong = until(hex, "#ffffff", [DARK.bg, DARK.card, darkAccentBg, ...darkTints], 7);
  const vars = (p: string, fg: string, strong: string, accentBg: string) => ({
    "--primary": p,
    "--primary-foreground": fg,
    "--primary-strong": strong,
    "--ring": p,
    "--sidebar-primary": p,
    "--sidebar-primary-foreground": fg,
    "--sidebar-accent": accentBg,
    "--sidebar-accent-foreground": strong,
    "--sidebar-ring": p,
  });
  return {
    light: vars(lightPrimary, lightFg, lightStrong, lightAccentBg),
    dark: vars(darkPrimary, darkFg, darkStrong, darkAccentBg),
  };
}

const css = (sel: string, v: Record<string, string>) =>
  `${sel}{${Object.entries(v)
    .map(([k, x]) => `${k}:${x}`)
    .join(";")}}`;

/** Puts the accent on the page (removes the override for the default color). */
export function applyAccent(accent: string | undefined) {
  const id = "accent-vars";
  let tag = document.getElementById(id) as HTMLStyleElement | null;
  if (!accent || [DEFAULT_ACCENT, OLD_DEFAULT_ACCENT].includes(accent.toLowerCase())) {
    tag?.remove();
    return;
  }
  const v = accentVars(accent);
  if (!tag) {
    tag = document.createElement("style");
    tag.id = id;
    document.head.appendChild(tag);
  }
  tag.textContent = css(":root", v.light) + css(".dark,.ink", v.dark);
}

/* ---------- the wallpaper picture (kept on this device) ---------- */
const idb = () => openFilesDb("aparencia");
async function store<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const req = run(d.transaction("files", mode).objectStore("files"));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

const MAX_SIDE = 2400;
/** Shrinks big photos (phones take 4000px+) so the page stays fast; saves a JPEG/WebP. */
const imageKey = (slot: WallpaperSlot) => (slot === "dark" ? "wallpaper-dark" : "wallpaper");
export async function saveWallpaperImage(file: File, slot: WallpaperSlot = "light") {
  if (!/^image\/(png|jpe?g|webp|gif|avif|heic|heif)$/i.test(file.type)) throw new Error("Escolha uma imagem (JPG, PNG, WebP…).");
  if (file.size > 25 * 1024 * 1024) throw new Error("A imagem passa de 25 MB.");
  let blob: Blob = file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no()), "image/webp", 0.85));
  } catch {
    /* the browser can't decode it here (e.g. HEIC on some systems): keep the original */
  }
  await store("readwrite", (s) => s.put(blob, imageKey(slot)));
}
export const loadWallpaperImage = (slot: WallpaperSlot = "light") =>
  store<Blob | undefined>("readonly", (s) => s.get(imageKey(slot))).catch(() => undefined);
export const removeWallpaperImage = (slot: WallpaperSlot = "light") =>
  store("readwrite", (s) => s.delete(imageKey(slot))).catch(() => undefined);

let objectUrl: string | null = null;
let applying = 0;
/** Shows (or clears) the wallpaper of the current mode (light or dark) behind the pages. */
export async function applyWallpaper(w: Wallpaper | undefined, dark: boolean) {
  const root = document.documentElement;
  const run = ++applying;
  const pick = wallpaperFor(w, dark);
  let value = "";
  if (pick.kind === "preset") value = WALLPAPERS.find((p) => p.id === pick.preset)?.css ?? "";
  if (pick.kind === "image") {
    // The dark-mode picture is only its own image when the dark slot has one.
    const blob = await loadWallpaperImage(dark && w?.dark ? "dark" : "light");
    // A newer call (theme switched while loading) wins.
    if (run !== applying) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = blob ? URL.createObjectURL(blob) : null;
    value = objectUrl ? `url("${objectUrl}") center / cover no-repeat` : "";
  }
  if (!value) {
    root.classList.remove("has-wallpaper");
    root.style.removeProperty("--wallpaper");
    root.style.removeProperty("--wallpaper-veil");
    return;
  }
  root.classList.add("has-wallpaper");
  root.style.setProperty("--wallpaper", value);
  root.style.setProperty("--wallpaper-veil", String(1 - Math.min(0.7, Math.max(0.1, w?.strength ?? 0.35))));
}
