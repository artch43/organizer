import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/store";

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

/**
 * The page's background: a liquid gradient in the brand palette (ShaderGradient), over a plain
 * gradient in the same colors that shows while it loads or where WebGL isn't available.
 * Settings → Aparência → Fundo: animated (default), still, or plain. A wallpaper replaces it.
 */
export function AppBackdrop() {
  const mode = useStore((s) => s.ws.settings.backdrop ?? "animated");
  const wallpaper = useStore((s) => (s.ws.settings.wallpaper?.kind ?? "none") !== "none");
  const reduced = useReducedMotion();
  const [webgl] = useState(hasWebGL);
  if (mode === "plain" || wallpaper) return null;
  return (
    <div aria-hidden="true" className="app-backdrop">
      {webgl && (
        <Quiet>
          <Suspense fallback={null}>
            <ShaderBackdrop animate={mode === "animated" && !reduced} />
          </Suspense>
        </Quiet>
      )}
    </div>
  );
}
