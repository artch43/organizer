import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, useStore } from "@/store";
import { Mascot } from "../brand/Brand";
import { firstAppearance } from "./reactions";
import { TOUR_BEATS, TOUR_PAGES, advanceTour, endTour, useTour, useTourSpot } from "./tour";
import { place, type Placement } from "./placement";

// The 3D scene is the same one as on the sign-in screen, loaded on its own.
const MascotScene = lazy(() => import("../auth3d/MascotScene"));

const LINES = [
  "Bora!",
  "Clebinho na área!",
  "Você está indo bem.",
  "Já bebeu água hoje?",
  "Aperte ? para ver os atalhos.",
  "Uma coisa de cada vez.",
  "Respira. Você dá conta.",
];

function useMedia(query: string) {
  const [on, setOn] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const f = () => setOn(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [query]);
  return on;
}

/** Where he was dropped on this device (left/top of his box, in px). Per device: screens differ. */
type Pos = { x: number; y: number };
const POS_KEY = "clebinho-pos";

function loadPos(): Pos | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
}

function savePos(p: Pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) }));
  } catch {
    /* private mode: he just won't remember */
  }
}

function clampPos(p: Pos, el: HTMLElement | null): Pos {
  const w = el?.offsetWidth ?? 120,
    h = el?.offsetHeight ?? 132;
  return {
    x: Math.max(0, Math.min(innerWidth - w, p.x)),
    y: Math.max(0, Math.min(innerHeight - h, p.y)),
  };
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

class Quiet extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The little 3D mascot in the corner (on phones, just above the bottom bar): quiet company. He breathes, blinks and
 * looks toward the pointer; waves when it comes near; hops when a task is done and cheers when the day
 * is cleared; does a rare stretch, look-around or yawn; dozes off after a while without activity.
 * He speaks only when clicked. Fades back while a window or panel is open. Can be hidden.
 */
export function Companion() {
  const tour = useTour((s) => s.at);
  const settling = useTour((s) => s.settling);
  // The tour is his to give: he shows up for it even when hidden in Settings.
  const enabled = useStore((s) => s.ws.settings.companion !== false) || tour !== null;
  const mut = useStore((s) => s.mut);
  const busy = useStore((s) => !!(s.ui.modal || s.ui.peek || s.ui.eventDialog || s.ui.statusDialog));
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const [webgl] = useState(hasWebGL);
  const [assemble] = useState(firstAppearance);
  const anchor = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<string | null>(null);
  const lineTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(lineTimer.current), []);
  const desktop = useMedia("(min-width: 768px)");
  const [pos, setPos] = useState<Pos | null>(loadPos);
  // A drag ends with a click on him: that one is not a poke.
  const swallowClick = useRef(false);
  const bubble = useRef<HTMLDivElement>(null);
  // In the tour he can be dragged too: he stays where he is put until the next thing he talks about.
  const [held, setHeld] = useState<{ at: number; x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const spot = useTourPlacement(tour, anchor, bubble, held && held.at === tour ? held : null);
  const arrived = useWalk(anchor, spot, reduced, dragging);

  // Keep him inside the window when it shrinks.
  useEffect(() => {
    if (!desktop) return;
    const fit = () => setPos((p) => (p ? clampPos(p, anchor.current) : p));
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, [desktop, enabled]);

  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      // Only a click on him (his bubble's buttons always work).
      if (!swallowClick.current || (e.target as Element).closest("[data-no-drag]")) return;
      swallowClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    };
    el.addEventListener("click", onClick, true);
    return () => el.removeEventListener("click", onClick, true);
  }, [enabled]);

  if (!enabled) return null;

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!desktop || e.button !== 0 || (e.target as Element).closest("[data-no-drag]")) return;
    const el = anchor.current;
    if (!el) return;
    swallowClick.current = false;
    // Where he is on screen (in the tour, wherever he walked to).
    const box = el.getBoundingClientRect();
    const touring = tour;
    const sx = e.clientX,
      sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx,
        dy = ev.clientY - sy;
      if (!moved) {
        if (Math.hypot(dx, dy) < 4) return;
        moved = true;
        el.classList.add("companion-dragging");
        document.body.style.cursor = "grabbing";
      }
      const p = clampPos({ x: box.left + dx, y: box.top + dy }, el);
      if (touring !== null) {
        dragging.current = true;
        setHeld({ at: touring, ...p });
      } else setPos(p);
    };
    const end = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
      removeEventListener("pointercancel", end);
      if (!moved) return;
      swallowClick.current = true;
      // The click that ends a drag comes right away; none came (let go off him): nothing to swallow.
      setTimeout(() => (swallowClick.current = false), 100);
      el.classList.remove("companion-dragging");
      document.body.style.cursor = "";
      dragging.current = false;
      // His spot in the tour is for this tour only.
      if (touring !== null) return;
      setPos((p) => {
        if (p) savePos(p);
        return p;
      });
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
  };

  // The speech bubble opens toward the middle of the window.
  const onLeft = !desktop || (pos ? pos.x + 60 < innerWidth / 2 : true);

  const say = () => {
    setLine((cur) => {
      const options = LINES.filter((l) => l !== cur);
      return options[Math.floor(Math.random() * options.length)];
    });
    clearTimeout(lineTimer.current);
    lineTimer.current = setTimeout(() => setLine(null), 2500);
  };
  const hide = () => {
    mut((w) => {
      w.settings.companion = false;
    });
    toast("Clebinho escondido. Ele volta em Configurações › Aparência.", () =>
      mut((w) => {
        w.settings.companion = true;
      }),
    );
  };
  const flat = <Mascot pose="acena" size={56} className="mx-auto mt-4" />;

  return (
    <div
      ref={anchor}
      onPointerDown={startDrag}
      title={desktop ? "Arraste para mudar o Clebinho de lugar" : undefined}
      // In the tour he starts at the bottom left (not where he was dropped) and walks to what he talks
      // about (useWalk moves him); the tour lets him be dragged (`data-tour-ui`).
      data-tour-ui={tour !== null ? "" : undefined}
      style={tour === null && desktop && pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
      className={cn(
        "companion group/companion select-none",
        tour !== null ? "companion-tour" : busy && "companion-dim",
      )}
    >
      {tour !== null && <TourBubble at={tour} ref={bubble} place={spot?.bubble ?? null} away={!arrived || settling} />}
      {line && tour === null && (
        <p
          key={line}
          role="status"
          className={cn(
            "auth-bubble absolute bottom-[calc(100%+0.75rem)] w-max max-w-48 rounded-2xl bg-popover px-3 py-2 text-sm font-semibold text-foreground shadow-lift ring-1 ring-border",
            onLeft ? "left-10 rounded-bl-sm" : "right-10 rounded-br-sm",
          )}
        >
          {line}
        </p>
      )}
      {tour === null && (
      <button
        type="button"
        data-no-drag
        onClick={hide}
        aria-label="Esconder o Clebinho"
        title="Esconder o Clebinho"
        className="touch-hit absolute -top-1 -left-1 cursor-pointer z-10 flex size-6 max-md:hidden items-center justify-center rounded-full bg-card text-muted-foreground opacity-0 shadow-card ring-1 ring-border transition-opacity group-hover/companion:opacity-100 pointer-coarse:opacity-40 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-3.5" />
      </button>
      )}
      <div className="size-full" aria-hidden="true">
        {webgl ? (
          <Quiet fallback={flat}>
            <Suspense fallback={flat}>
              <MascotScene reduced={reduced} anchor={anchor} assemble={assemble && !reduced} onPoke={say} />
            </Suspense>
          </Quiet>
        ) : (
          <button type="button" onClick={say} className="size-full" tabIndex={-1}>
            {flat}
          </button>
        )}
      </div>
    </div>
  );
}

/** `**bold**` in a tour line. */
function rich(text: string) {
  return text.split("**").map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

type Spot = { dx: number; dy: number; bubble: Placement["bubble"] };

/**
 * During the tour: where he stands (as an offset from his corner) and where his bubble opens, so that
 * neither covers what he talks about. Nothing to point at, or a whole area: he stays in his corner.
 * `held`: where the person dragged him (only his bubble moves then).
 */
function useTourPlacement(
  tour: number | null,
  anchor: RefObject<HTMLDivElement | null>,
  bubble: RefObject<HTMLDivElement | null>,
  held: Pos | null,
): Spot | null {
  const { rect, area } = useTourSpot();
  const [spot, setSpot] = useState<Spot | null>(null);
  // The window's size and the bubble's (each line has its own length) change where he fits.
  const [tick, setTick] = useState(0);
  const touring = tour !== null;
  useEffect(() => {
    if (!touring) return;
    const bump = () => setTick((t) => t + 1);
    addEventListener("resize", bump);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(bump) : null;
    if (bubble.current) ro?.observe(bubble.current);
    return () => {
      removeEventListener("resize", bump);
      ro?.disconnect();
    };
  }, [touring, bubble]);

  useLayoutEffect(() => {
    const me = anchor.current;
    const b = bubble.current;
    if (!touring || !me) return setSpot(null);
    // His corner: offsets leave out the transform that walks him.
    const corner = { x: me.offsetLeft, y: me.offsetTop, w: me.offsetWidth, h: me.offsetHeight };
    const p = place({
      home: held ? { ...corner, ...held } : corner,
      stay: !!held || !!TOUR_BEATS[tour]?.corner,
      avoid: area ? null : rect,
      // A quiet beat has no bubble (it is not displayed: 0 × 0).
      bubble: { w: b?.offsetWidth ?? 0, h: b?.offsetHeight ?? 0 },
      // Without the scrollbar.
      view: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
      // Over a board the bubble goes beside him, low, out of its way.
      prefer: area ? ["right", "above"] : undefined,
    });
    const next = { dx: Math.round(p.x - corner.x), dy: Math.round(p.y - corner.y), bubble: p.bubble };
    setSpot((old) =>
      old &&
      old.dx === next.dx &&
      old.dy === next.dy &&
      old.bubble.side === next.bubble.side &&
      Math.round(old.bubble.x) === Math.round(next.bubble.x) &&
      Math.round(old.bubble.y) === Math.round(next.bubble.y)
        ? old
        : next,
    );
  }, [touring, tour, rect, area, tick, anchor, bubble, held]);
  return touring ? spot : null;
}

/** How fast he may walk (px/s): a long way is crossed at an even pace, not in a few big leaps. */
const MAX_SPEED = 2600;
/** About how long a short walk takes (s). */
const SMOOTH = 0.12;

type Walker = { x: number; y: number; vx: number; vy: number };

/**
 * Unity's SmoothDamp, in 2D and with a top speed: a critically damped spring toward (tx, ty) that
 * speeds up, cruises, slows down and never overshoots, and keeps its speed when the goal moves.
 */
function damp(w: Walker, tx: number, ty: number, dt: number) {
  const omega = 2 / SMOOTH;
  const x = omega * dt;
  const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let cx = w.x - tx;
  let cy = w.y - ty;
  const len = Math.hypot(cx, cy);
  const max = MAX_SPEED * SMOOTH;
  if (len > max) {
    cx *= max / len;
    cy *= max / len;
  }
  const gx = w.x - cx;
  const gy = w.y - cy;
  const px = (w.vx + omega * cx) * dt;
  const py = (w.vy + omega * cy) * dt;
  w.vx = (w.vx - omega * px) * k;
  w.vy = (w.vy - omega * py) * k;
  let nx = gx + (cx + px) * k;
  let ny = gy + (cy + py) * k;
  // Past the goal: stop on it.
  if ((tx - w.x) * (nx - tx) + (ty - w.y) * (ny - ty) > 0) {
    nx = tx;
    ny = ty;
    w.vx = w.vy = 0;
  }
  w.x = nx;
  w.y = ny;
}

/** Far enough that it is a walk (his bubble waits); closer, he just keeps up with the page. */
const WALK = 40;

/**
 * Walks him to `spot`, a frame at a time: he speeds up, slows down and arrives, and if the place
 * changes on the way (the page scrolls, a panel slides in) he just curves toward the new one instead
 * of starting over. Writes the transform directly (no re-render per frame). Returns whether he is
 * there: his bubble waits until then, instead of flying across the page with him.
 */
function useWalk(
  anchor: RefObject<HTMLDivElement | null>,
  spot: Spot | null,
  reduced: boolean,
  dragging: RefObject<boolean>,
) {
  const [arrived, setArrived] = useState(true);
  const goal = useRef<Spot | null>(null);
  // Where he is (from his corner), and whether he counts as there.
  const pos = useRef<Walker>({ x: 0, y: 0, vx: 0, vy: 0 });
  const there = useRef(true);
  const touring = spot !== null;
  useLayoutEffect(() => {
    goal.current = spot;
    // A new place far away: the bubble steps away before this frame is drawn, not one frame later.
    if (spot && !reduced && !dragging.current && Math.hypot(spot.dx - pos.current.x, spot.dy - pos.current.y) > WALK) {
      there.current = false;
      setArrived(false);
    }
  }, [spot, reduced, dragging]);
  useEffect(() => {
    const el = anchor.current;
    if (!touring || !el) return;
    const at = pos.current;
    let last = performance.now();
    let drawn = "";
    let frame = requestAnimationFrame(function step(now) {
      frame = requestAnimationFrame(step);
      const g = goal.current;
      if (!g) return;
      // At most one ordinary frame's worth of walk per frame: when the page stalls (a task saved, a page
      // drawn), he carries on from where he was instead of jumping ahead to catch up.
      const dt = Math.min(1 / 50, (now - last) / 1000);
      last = now;
      if (reduced || dragging.current) Object.assign(at, { x: g.dx, y: g.dy, vx: 0, vy: 0 });
      else if (at.x !== g.dx || at.y !== g.dy) damp(at, g.dx, g.dy, dt);
      const left = Math.hypot(g.dx - at.x, g.dy - at.y);
      if (left < 0.5 && Math.hypot(at.vx, at.vy) < 5) Object.assign(at, { x: g.dx, y: g.dy, vx: 0, vy: 0 });
      // Standing still (most of the tour): nothing to write.
      const transform = `translate3d(${at.x.toFixed(2)}px, ${at.y.toFixed(2)}px, 0)`;
      if (transform !== drawn) el.style.transform = drawn = transform;
      // A real walk hides the bubble until he stands still; a few pixels with the page don't.
      const nowThere = there.current ? left < WALK : left < 1;
      if (nowThere !== there.current) setArrived((there.current = nowThere));
    });
    return () => {
      cancelAnimationFrame(frame);
      el.style.transform = "";
      // Next tour: from his corner again.
      Object.assign(at, { x: 0, y: 0, vx: 0, vy: 0 });
      there.current = true;
      setArrived(true);
    };
  }, [touring, anchor, reduced, dragging]);
  return arrived;
}

/** The bubble's corner nearest him, as its tail. */
function tail(p: Placement["bubble"]) {
  if (p.side === "right") return "rounded-bl-sm";
  if (p.side === "left") return "rounded-br-sm";
  const toRight = p.x >= 0;
  if (p.side === "above") return toRight ? "rounded-bl-sm" : "rounded-br-sm";
  return toRight ? "rounded-tl-sm" : "rounded-tr-sm";
}

/** What he says during the tour: the line, where the tour is, and the way on (or out). */
function TourBubble({
  at,
  place: where,
  ref,
  away,
}: {
  at: number;
  place: Placement["bubble"] | null;
  ref: RefObject<HTMLDivElement | null>;
  /** He is walking: the bubble waits, unseen. */
  away: boolean;
}) {
  const beat = TOUR_BEATS[at];
  const touch = useMedia("(pointer: coarse)");
  const action =
    "flex h-9 items-center rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover focus-visible:outline-none active:scale-[0.97]";
  return (
    <div
      ref={ref}
      data-tour-ui
      data-no-drag
      style={where ? { left: where.x, top: where.y } : { left: 24, bottom: "calc(100% + 0.75rem)" }}
      className={cn(
        "tour-bubble absolute flex w-[min(20rem,calc(100vw-1.5rem))] cursor-default flex-col gap-3 rounded-2xl bg-popover p-4 text-foreground shadow-lift ring-1 ring-border",
        where ? tail(where) : "rounded-bl-sm",
        away ? "tour-bubble-away" : "tour-bubble-in",
        // A quiet beat: no bubble (kept in the page, so it is measured again when he talks).
        !beat.text && "hidden",
      )}
    >
      <p key={at} role="status" className="auth-bubble text-[15px] leading-snug text-pretty">
        {rich((touch && beat.touchText) || beat.text)}
      </p>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5" role="img" aria-label={`Parte ${beat.page + 1} de ${TOUR_PAGES}`}>
          {Array.from({ length: TOUR_PAGES }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] duration-200 ease-out",
                i === beat.page ? "w-4 bg-primary-strong" : i < beat.page ? "w-1.5 bg-primary-strong/60" : "w-1.5 bg-muted-foreground/30",
              )}
            />
          ))}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {beat.on !== "end" && (
            <button
              type="button"
              onClick={() => endTour()}
              className="flex h-9 items-center rounded-xl px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Pular
            </button>
          )}
          {beat.on === "continue" && (
            <button type="button" onClick={advanceTour} className={action}>
              Continuar
            </button>
          )}
          {beat.on === "end" && (
            <button type="button" onClick={() => endTour(true)} className={action}>
              Começar a usar
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
