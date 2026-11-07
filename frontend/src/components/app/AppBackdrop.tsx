import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { useStore } from "@/store";
import { backdropMode, showsWallpaper, wallpaperFor } from "@/lib/appearance";
import { useCompanion } from "../companion/reactions";

// The animated gradient (WebGL) only loads on the app's pages, in its own file.
const ShaderBackdrop = lazy(() => import("./ShaderBackdrop"));

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** If the shader fails (old GPU, lost context), the plain gradient underneath simply stays. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Brand palette: lime, pink, blue, cream. Fixed spots so they never jump around between visits.
const CUBES = [
  { x: 6, s: 10, c: "var(--primary)", d: 58, delay: -4, sway: 18, o: 0.28 },
  { x: 17, s: 7, c: "#ff5fa2", d: 72, delay: -40, sway: -14, o: 0.25 },
  { x: 29, s: 13, c: "#6b8cff", d: 66, delay: -22, sway: 22, o: 0.23 },
  { x: 43, s: 8, c: "var(--primary)", d: 80, delay: -60, sway: -20, o: 0.23 },
  { x: 57, s: 11, c: "var(--cube-neutral)", d: 62, delay: -12, sway: 16, o: 0.17 },
  { x: 68, s: 7, c: "#ff5fa2", d: 76, delay: -50, sway: 12, o: 0.25 },
  { x: 79, s: 12, c: "var(--primary)", d: 70, delay: -32, sway: -18, o: 0.25 },
  { x: 91, s: 9, c: "#6b8cff", d: 64, delay: -2, sway: 14, o: 0.23 },
];

/** Little pixel cubes drifting up, and a glow when a task is done (only while the background moves). */
function BackdropFx() {
  const beat = useCompanion((s) => s.beat);
  const kind = useCompanion((s) => s.reaction);
  return (
    <>
      {CUBES.map((q, i) => (
        <span
          key={i}
          className="backdrop-cube"
          style={
            {
              left: `${q.x}%`,
              "--s": `${q.s}px`,
              "--c": q.c,
              "--d": `${q.d}s`,
              "--delay": `${q.delay}s`,
              "--sway": `${q.sway}px`,
              "--o": q.o,
            } as CSSProperties
          }
        />
      ))}
      {beat > 0 && <div key={beat} className="backdrop-pulse" data-kind={kind ?? "hop"} />}
    </>
  );
}

/** The default background: a grid of dots in the palette, with soft lights drifting slowly through it. */
function Dots({ still }: { still: boolean }) {
  return (
    <div className="backdrop-dots" data-still={still || undefined}>
      <div className="backdrop-dots-light">
        <span className="backdrop-dots-blob backdrop-dots-blob-1" />
        <span className="backdrop-dots-blob backdrop-dots-blob-2" />
        <span className="backdrop-dots-blob backdrop-dots-blob-3" />
      </div>
    </div>
  );
}

/**
 * The page's background (Settings → Aparência → Fundo):
 * - "dots" (default): the dotted grid, lightly animated;
 * - "animated": a liquid gradient in the brand palette (ShaderGradient), over a plain gradient in the same
 *   colors that shows while it loads or where WebGL isn't available;
 * - "plain": just the page color.
 * A wallpaper of the current mode (light/dark) replaces it.
 */
export function AppBackdrop() {
  const mode = useStore((s) => backdropMode(s.ws.settings.backdrop));
  const wp = useStore((s) => s.ws.settings.wallpaper);
  const { resolvedTheme } = useTheme();
  const wallpaper = showsWallpaper(wallpaperFor(wp, resolvedTheme === "dark"));
  const reduced = useReducedMotion();
  const [webgl] = useState(hasWebGL);
  // Lets the page style itself for the background in use (e.g. cards see-through only over the gradient).
  useEffect(() => {
    document.documentElement.dataset.backdrop = wallpaper ? "wallpaper" : mode;
  }, [mode, wallpaper]);
  if (mode === "plain" || wallpaper) return null;
  const shader = mode === "animated" && webgl;
  return (
    <div aria-hidden="true" className="app-backdrop" data-mode={mode}>
      {mode === "dots" && <Dots still={reduced} />}
      {shader && (
        <Quiet>
          <Suspense fallback={null}>
            <ShaderBackdrop animate={!reduced} />
          </Suspense>
        </Quiet>
      )}
      {!reduced && <BackdropFx />}
    </div>
  );
}
