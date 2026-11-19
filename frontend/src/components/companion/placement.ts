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
/** The same rectangle, moved back inside the window (as far as its size allows). */
const inView = <R extends Rect>(r: R, view: { w: number; h: number }): R => ({
  ...r,
  x: clamp(r.x, MARGIN, Math.max(MARGIN, view.w - MARGIN - r.w)),
  y: clamp(r.y, MARGIN, Math.max(MARGIN, view.h - MARGIN - r.h)),
});
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
    // His corner can be under a phone's keyboard: then just above it.
    home = { ...home, y: Math.min(home.y, Math.max(MARGIN, view.h - MARGIN - home.h)) };
    const list = bubbles(home, bubble, view, prefer);
    const ok = list.find((b) => fits(b, view));
    if (ok) return at(home, ok);
    // Nowhere it fits beside him (a small phone): on screen anyway, as little over him as can be.
    const kept = list.map((b) => inView(b, view));
    return at(
      home,
      kept.reduce((best, b) => (overlap(b, home) < overlap(best, home) ? b : best)),
    );
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
  const around = (["right", "left", "below", "above"] as const).flatMap((side) => sides[side]);
  const keep = pad(r, 6);
  const huge = r.w * r.h > (view.w * view.h) / 2;
  let order = 0;
  const tryFrom = (spots: [number, number][], stay: boolean) => {
    let best: { p: Placement; score: number } | null = null;
    for (const [sx, sy] of spots) {
      const m = { x: clamp(sx, MARGIN, view.w - MARGIN - w), y: clamp(sy, MARGIN, view.h - MARGIN - h), w, h };
      const covering = overlap(m, keep);
      for (const natural of bubbles(m, bubble, view, prefer)) {
        order++;
        // A bubble is never left off the screen (its buttons, "Pular" too, must stay reachable): one that
        // doesn't fit is pushed back in, and is then judged by what it covers there.
        const outside = fits(natural, view) ? 0 : 1;
        const b = outside ? inView(natural, view) : natural;
        // Covering the thing is the worst; then the bubble over him; then a bubble pushed in; then being far.
        const covered = overlap(b, keep) + covering;
        const overHim = overlap(b, m);
        // When there's no way around it (a window as big as a phone's screen), as low as can be: a
        // window's title and its close button are at its top.
        const low = covered && huge ? (view.h - Math.min(b.y, m.y)) * 50 : 0;
        const score =
          (covered ? 1e7 + covered + low : 0) +
          (overHim ? 1e5 + overHim : 0) +
          outside * 1e3 +
          (stay ? 0 : distTo(m.x + w / 2, m.y + h / 2, r)) +
          order * 0.01;
        if (!best || score < best.score) best = { p: at(m, b), score };
      }
    }
    return best!;
  };
  if (!stay) return tryFrom(around, false).p;
  const here = tryFrom([[home.x, home.y]], true);
  // From where he stands, his bubble can only cover the thing or him (a window open over most of a
  // phone's screen): he does move, if somewhere else it covers nothing.
  if (here.score < 1e5) return here.p;
  const moved = tryFrom(around, false);
  return moved.score < 1e7 ? moved.p : here.p;
}
