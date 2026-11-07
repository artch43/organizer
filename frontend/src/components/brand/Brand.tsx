import { cn } from "@/lib/utils";
import { LOGO, LOGO_SIZE, MASCOT, MASCOT_SIZE, type Layer, type MascotPose } from "./pixels";
import { PIXEL_ICONS, PIXEL_PALETTE, centered, toRuns, uiIconRuns, type UiIconName } from "./pixelIcons";

export type { MascotPose };

function Layers({ layers, prefix }: { layers: readonly Layer[]; prefix: string }) {
  return layers.map(([name, runs]) => (
    <g key={name} className={`${prefix}-${name}`}>
      {runs.map(([x, y, w, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={1} fill={c} />
      ))}
    </g>
  ));
}

/**
 * The mascot: a folder with a body, its index cards for hair. Each pose has its own small loop
 * (waving, a checklist filling in, an envelope with an alert, writing, cheering, sleeping) and
 * every pose blinks. Decorative: hidden from screen readers.
 */
export function Mascot({
  pose,
  size = 96,
  open,
  className,
}: {
  pose: MascotPose;
  size?: number;
  /** Folder poses: his index cards rise in a fan, like a folder opening. */
  open?: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${MASCOT_SIZE.w} ${MASCOT_SIZE.h}`}
      width={size}
      height={(size * MASCOT_SIZE.h) / MASCOT_SIZE.w}
      shapeRendering="crispEdges"
      data-pose={pose}
      data-open={open || undefined}
      className={cn("mascot shrink-0", className)}
    >
      <g className="m-all">
        <Layers layers={MASCOT[pose]} prefix="m" />
      </g>
    </svg>
  );
}

/**
 * The logo: a folder with three index cards. One drawing per theme (lime in dark mode, pink and
 * deep blue in light mode); the cards rise one after another under the pointer.
 */
export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  const svg = (theme: "escuro" | "claro") => (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${LOGO_SIZE.w} ${LOGO_SIZE.h}`}
      width={size}
      height={(size * LOGO_SIZE.h) / LOGO_SIZE.w}
      shapeRendering="crispEdges"
      className={`logo-art logo-${theme}`}
    >
      <Layers layers={LOGO[theme]} prefix="l" />
    </svg>
  );
  return (
    <span className={cn("logo inline-flex shrink-0", className)}>
      {svg("escuro")}
      {svg("claro")}
    </span>
  );
}

/** A pixel-art drawing (rows of palette letters, see `pixelIcons.ts`), crisp at any size. */
export function PixelArt({
  rows,
  palette,
  size = 24,
  className,
}: {
  rows: string[];
  palette: Record<string, string>;
  size?: number;
  className?: string;
}) {
  const w = rows[0]?.length ?? 0,
    h = rows.length;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      shapeRendering="crispEdges"
      className={cn("shrink-0", className)}
    >
      {toRuns(rows, palette).map(([x, y, rw, c], i) => (
        <rect key={i} x={x} y={y} width={rw} height={1} fill={c} />
      ))}
    </svg>
  );
}

/** One of the list icons (`pixel:<key>`), centered on its 12×12 grid. */
export function PixelListIcon({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const def = PIXEL_ICONS[name];
  if (!def) return null;
  return <PixelArt rows={centered(def.rows)} palette={PIXEL_PALETTE} size={size} className={className} />;
}

/**
 * The "create" icons of Listas (a folder or a list with a "+"), in pixel art like the logo: one
 * drawing per theme; a little hop under the pointer.
 */
export function UiIcon({ name, size = 22, className }: { name: UiIconName; size?: number; className?: string }) {
  const svg = (theme: "escuro" | "claro") => (
    <svg aria-hidden="true" viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" className={`pix-${theme}`}>
      {uiIconRuns(name, theme).map(([x, y, w, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={1} fill={c} />
      ))}
    </svg>
  );
  return (
    <span className={cn("pix-icon inline-flex shrink-0", className)}>
      {svg("escuro")}
      {svg("claro")}
    </span>
  );
}
