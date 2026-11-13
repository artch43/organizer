/** Where the mascot stands during the tour, and where his bubble opens, so neither covers what he talks about. */

export type Rect = { x: number; y: number; w: number; h: number };
export type Side = "above" | "below" | "left" | "right";
export interface Placement {
  /** His box's top-left on screen. */
  x: number;
  y: number;
  /** The bubble's top-left, relative to his box. */
  bubble: { x: number; y: number; side: Side };
}

const MARGIN = 8;
const GAP = 12;
/** How far the bubble's tail sits from his edge (it opens from near his head). */
const TAIL = 24;

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fits = (r: Rect, view: { w: number; h: number }) =>
  r.x >= MARGIN - 0.5 && r.y >= MARGIN - 0.5 && r.x + r.w <= view.w - MARGIN + 0.5 && r.y + r.h <= view.h - MARGIN + 0.5;
const pad = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
/** From a point to the nearest point of a rectangle. */
const distTo = (px: number, py: number, r: Rect) =>
  Math.hypot(Math.max(r.x - px, 0, px - (r.x + r.w)), Math.max(r.y - py, 0, py - (r.y + r.h)));

/** The places the bubble can open around him, in order of preference. */
function bubbles(m: Rect, b: { w: number; h: number }, view: { w: number; h: number }, prefer: Side[]) {
  const sideY = clamp(m.y + m.h - b.h, MARGIN, view.h - MARGIN - b.h);
  const toRight = clamp(m.x + TAIL, MARGIN, view.w - MARGIN - b.w);
  const toLeft = clamp(m.x + m.w - TAIL - b.w, MARGIN, view.w - MARGIN - b.w);
  const all: (Rect & { side: Side })[] = [
    { side: "above", x: toRight, y: m.y - GAP - b.h, ...b },
    { side: "above", x: toLeft, y: m.y - GAP - b.h, ...b },
    { side: "right", x: m.x + m.w + GAP, y: sideY, ...b },
    { side: "left", x: m.x - GAP - b.w, y: sideY, ...b },
    { side: "below", x: toRight, y: m.y + m.h + GAP, ...b },
    { side: "below", x: toLeft, y: m.y + m.h + GAP, ...b },
  ];
  return all.sort((p, q) => rank(prefer, p.side) - rank(prefer, q.side));
}
const rank = (prefer: Side[], s: Side) => (prefer.includes(s) ? prefer.indexOf(s) : prefer.length);

/**
 * `home`: where he stands when there is nothing to point at. `avoid`: what he talks about (the lit
 * button, or a window that is open): he goes next to it, and neither he nor his bubble covers it.
 */
export function place({
  home,
  avoid,
  bubble,
  view,
  prefer = ["above", "right", "below", "left"],
  stay = false,
}: {
  home: Rect;
  avoid: Rect | null;
  bubble: { w: number; h: number };
  view: { w: number; h: number };
  prefer?: Side[];
  /** He stays at `home` (the person put him there); only the bubble keeps clear of `avoid`. */
  stay?: boolean;
}): Placement {
  const at = (m: Rect, b: Rect & { side: Side }): Placement => ({
    x: m.x,
    y: m.y,
    bubble: { x: b.x - m.x, y: b.y - m.y, side: b.side },
  });

  if (!avoid) {
    const list = bubbles(home, bubble, view, prefer);
    return at(home, list.find((b) => fits(b, view)) ?? list[0]);
  }

  const { w, h } = home;
  const r = avoid;
  const g = GAP + 4;
  const cy = r.y + r.h / 2 - h / 2;
  const cx = r.x + r.w / 2 - w / 2;
  const sides: Record<Side, [number, number][]> = {
    right: [cy, r.y, r.y + r.h - h].map((y) => [r.x + r.w + g, y]),
    left: [cy, r.y, r.y + r.h - h].map((y) => [r.x - g - w, y]),
    below: [cx, r.x, r.x + r.w - w].map((x) => [x, r.y + r.h + g]),
    above: [cx, r.x, r.x + r.w - w].map((x) => [x, r.y - g - h]),
  };
  const spots: [number, number][] = stay
    ? [[home.x, home.y]]
    : (["right", "left", "below", "above"] as const).flatMap((side) => sides[side]);
  const keep = pad(r, 6);
  let best: { p: Placement; score: number } | null = null;
  let order = 0;
  for (const [sx, sy] of spots) {
    const m = { x: clamp(sx, MARGIN, view.w - MARGIN - w), y: clamp(sy, MARGIN, view.h - MARGIN - h), w, h };
    const covering = overlap(m, keep);
    for (const b of bubbles(m, bubble, view, prefer)) {
      order++;
      const outside = fits(b, view) ? 0 : 1;
      // Covering the thing is the worst; then a bubble off the screen; then being far from it.
      const covered = overlap(b, keep) + covering;
      const score =
        (covered ? 1e7 + covered : 0) + outside * 1e5 + (stay ? 0 : distTo(m.x + w / 2, m.y + h / 2, r)) + order * 0.01;
      if (!best || score < best.score) best = { p: at(m, b), score };
    }
  }
  return best!.p;
}
