import { useEffect, useState, useSyncExternalStore } from "react";
import { useStore } from "@/store";
import { backdropMode, wallpaperShown } from "@/lib/appearance";

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

/** The selected background stays visible until a custom image is available. */
export function AppBackdrop() {
  const mode = useStore((s) => backdropMode(s.ws.settings.backdrop));
  const wallpaper = useSyncExternalStore(wallpaperShown.subscribe, wallpaperShown.get);
  const reduced = useReducedMotion();
  useEffect(() => {
    document.documentElement.dataset.backdrop = wallpaper ? "wallpaper" : mode;
  }, [mode, wallpaper]);
  if (mode === "plain" || wallpaper) return null;
  return (
    <div aria-hidden="true" className="app-backdrop" data-mode={mode}>
      {mode === "sweep" && <div className="backdrop-sweep" />}
      {mode === "dots" && <Dots still={reduced} />}
    </div>
  );
}
