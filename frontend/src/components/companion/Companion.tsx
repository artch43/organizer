import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, useStore } from "@/store";
import { Mascot } from "../brand/Brand";
import { firstAppearance } from "./reactions";

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
 * The little 3D mascot in the corner (computers and tablets): quiet company. He breathes, blinks and
 * looks toward the pointer; waves when it comes near; hops when a task is done and cheers when the day
 * is cleared; does a rare stretch, look-around or yawn; dozes off after a while without activity.
 * He speaks only when clicked. Fades back while a window or panel is open. Can be hidden.
 */
export function Companion() {
  const enabled = useStore((s) => s.ws.settings.companion !== false);
  const mut = useStore((s) => s.mut);
  const busy = useStore((s) => !!(s.ui.modal || s.ui.peek || s.ui.eventDialog || s.ui.statusDialog));
  const wide = useMedia("(min-width: 768px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const [webgl] = useState(hasWebGL);
  const [assemble] = useState(firstAppearance);
  const anchor = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<string | null>(null);
  const lineTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(lineTimer.current), []);
  if (!enabled || !wide) return null;

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
      className={cn(
        "companion group/companion",
        busy && "companion-dim",
      )}
    >
      {line && (
        <p
          key={line}
          role="status"
          className={cn(
            "auth-bubble absolute bottom-[calc(100%+0.75rem)] w-max max-w-48 rounded-2xl bg-popover px-3 py-2 text-sm font-semibold text-foreground shadow-lift ring-1 ring-border",
            "right-10 rounded-br-sm",
          )}
        >
          {line}
        </p>
      )}
      <button
        type="button"
        onClick={hide}
        aria-label="Esconder o Clebinho"
        title="Esconder o Clebinho"
        className="absolute -top-1 -left-1 z-10 flex size-6 items-center justify-center rounded-full bg-card text-muted-foreground opacity-0 shadow-card ring-1 ring-border transition-opacity group-hover/companion:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-3.5" />
      </button>
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
