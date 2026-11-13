import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { advanceTour, currentBeat, endTour, useTour, useTourSpot } from "./tour";

/** The lit element that is on screen now (the same button can exist twice: computer and phone). */
function findTarget(selector?: string): HTMLElement | null {
  if (!selector) return null;
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.getClientRects().length) return el;
  }
  return null;
}

/** Windows and menus opened from the lit element (name a folder, pick an icon): they work too. */
const POPUPS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';
/** A window open on top of the lit element (it has its own dimmed page behind it). */
function coveredBy(target: HTMLElement | null): Element | null {
  for (const d of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    if (d.getClientRects().length && !(target && d.contains(target))) return d;
  }
  return null;
}

type Box = { x: number; y: number; w: number; h: number };

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
/** Several rectangles as one. */
function union(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}
/** Tells the mascot what to stay clear of; only when it moved (this runs every frame). */
function publish(rect: Box | null, area: boolean) {
  const old = useTourSpot.getState();
  const same =
    old.area === area &&
    (old.rect === rect ||
      (!!old.rect && !!rect && (["x", "y", "w", "h"] as const).every((k) => Math.abs(old.rect![k] - rect[k]) < 0.5)));
  if (!same) useTourSpot.setState({ rect, area });
}

/**
 * While the tour runs: the page is dimmed, the thing to click (or the area to work in) is lit and
 * pulsing, and nothing else takes clicks or keys, only that, the mascot's bubble (`data-tour-ui`) and,
 * during a task, the windows it opens. Esc skips the tour.
 */
export function TourOverlay() {
  const at = useTour((s) => s.at);
  const settling = useTour((s) => s.settling);
  const beat = currentBeat(at);
  const active = !!beat;
  // `null` = nothing to light; "covered" = a window is open on top (no dimming of ours).
  const [box, setBox] = useState<Box | "covered" | null>(null);
  const spot = useRef<HTMLDivElement>(null);

  // Follow the lit element's place on screen.
  useLayoutEffect(() => {
    if (!beat) return;
    // To the next thing, the lit hole glides (while it follows the page, it doesn't lag behind).
    const el = spot.current;
    el?.classList.add("tour-spot-glide");
    const glide = setTimeout(() => el?.classList.remove("tour-spot-glide"), 340);
    // What is lit: the thing to click, or (a "continue" beat) what he talks about.
    const lit = beat.target ?? beat.look;
    // Every frame: the page under it changes (a scrollbar comes and goes, a panel slides in) without
    // any event to listen to. One rectangle read per frame; the state only changes when the place does.
    let frame = 0;
    let missingSince = 0;
    const measure = () => {
      frame = requestAnimationFrame(measure);
      const el = findTarget(lit);
      const cover = coveredBy(el);
      if (cover) {
        publish(boxOf(cover), false);
        return setBox("covered");
      }
      // The lit element and the menus it opened (pick an icon): he stays clear of all of them.
      const open = [...document.querySelectorAll(POPUPS)].filter((p) => p.getClientRects().length).map(boxOf);
      // While the target isn't on screen yet (its page is opening), he stays where he is instead of
      // walking back to his corner and out again.
      const clear = beat.keepClear ? findTarget(beat.keepClear) : null;
      if (el || !lit)
        publish(union([...(el ? [boxOf(el)] : []), ...(el && clear ? [boxOf(clear)] : []), ...open]), !!el && !!beat.area);
      if (lit && !el) {
        // Out of sight: bring it back (a closed panel), or move on when it isn't there at all.
        const now = performance.now();
        missingSince ||= now;
        if (now - missingSince > 900) {
          missingSince = now;
          if (beat.ensure) beat.ensure();
          else if (beat.optional && beat.target) advanceTour();
        }
        return setBox(null);
      }
      missingSince = 0;
      const r = el?.getBoundingClientRect();
      setBox((old) => {
        if (!r) return null;
        if (old && old !== "covered" && old.x === r.left && old.y === r.top && old.w === r.width && old.h === r.height)
          return old;
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
    };
    measure();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(glide);
      // The tour ended: back to his corner. (Between beats, the next one says where to go.)
      if (useTour.getState().at === null) publish(null, false);
    };
  }, [beat]);

  // Only the lit element, the bubble and (during a task) its windows work.
  useEffect(() => {
    if (!beat) return;
    const allowed = (t: EventTarget | null) => {
      if (!(t instanceof Element)) return false;
      if (t.closest("[data-tour-ui]")) return true;
      if (t.closest(POPUPS)) return true;
      // Between two beats nothing on the page takes a click (not even the one just clicked, twice).
      if (useTour.getState().settling) return false;
      const target = findTarget(beat.target);
      return !!target && target.contains(t);
    };
    const block = (e: Event) => {
      if (allowed(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      if (!allowed(e.target)) return block(e);
      // The element's own click still runs (it opens the page, picks the day); the tour moves on with it.
      // Only a click on the lit element itself: one inside a menu or window it opened doesn't count.
      if (beat.on === "click" && findTarget(beat.target)?.contains(e.target as Node)) advanceTour();
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // With a window or menu open, Esc closes it; otherwise it skips the tour.
        if ([...document.querySelectorAll(POPUPS)].some((d) => d.getClientRects().length)) return;
        e.stopPropagation();
        endTour();
      } else if (e.key !== "Tab" && !allowed(e.target)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const opts = { capture: true };
    const blocked = ["pointerdown", "mousedown", "touchstart", "dblclick", "contextmenu", "dragstart"] as const;
    for (const type of blocked) addEventListener(type, block, { capture: true, passive: false });
    addEventListener("click", click, opts);
    addEventListener("keydown", keydown, opts);
    return () => {
      for (const type of blocked) removeEventListener(type, block, opts);
      removeEventListener("click", click, opts);
      removeEventListener("keydown", keydown, opts);
    };
  }, [beat]);

  if (!active) return null;
  // One dimmed layer for the whole tour, with a hole over what is lit: it never blinks off and on
  // between beats. Nothing lit: the hole closes to a point in the middle (the page is all dimmed).
  // A window open on top: it dims the page itself, so ours fades away.
  const edge = 3;
  const lit = box && box !== "covered" ? box : null;
  const left = lit ? Math.max(edge, lit.x - 4) : innerWidth / 2;
  const top = lit ? Math.max(edge, lit.y - 4) : innerHeight / 2;
  return (
    <div
      ref={spot}
      aria-hidden="true"
      className={cn(
        "tour-spot",
        beat.area && "tour-spot-area",
        // Not a thing to click: no pulsing ring (nothing lit, between two beats, or only pointed at).
        (!lit || settling || !beat.target) && "tour-spot-still",
        box === "covered" && "tour-spot-off",
      )}
      style={{
        left,
        top,
        // A little larger than the element, but never past the window's edge (the phone's bar touches it).
        width: lit ? Math.min(innerWidth - edge, lit.x + lit.w + 4) - left : 0,
        height: lit ? Math.min(innerHeight - edge, lit.y + lit.h + 4) - top : 0,
      }}
    />
  );
}
