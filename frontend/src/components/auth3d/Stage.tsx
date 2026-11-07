import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Mascot } from "../brand/Brand";
import { useAuthMood, type Mood } from "./mood";

// The 3D scene (three.js) only loads on this screen, in its own file.
const MascotScene = lazy(() => import("./MascotScene"));

const LINES: Record<Mood, string> = {
  idle: "Oi! Eu sou o Clebinho.",
  email: "Prazer! Eu guardo tudo pra você.",
  password: "Não estou olhando! 🙈",
  error: "Ops… confere e tenta de novo?",
  success: "Bora organizar!",
};

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

/** If the 3D scene fails for any reason (old GPU, driver), the flat mascot takes its place. */
class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The mascot's stage on the sign-in screen: the 3D voxel mascot when the device can draw it (the
 * flat pixel-art one while it loads, or without WebGL), with a speech bubble that follows the form.
 */
export function Stage({ compact, className }: { compact?: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const [webgl] = useState(hasWebGL);
  const mood = useAuthMood((s) => s.mood);
  // The bubble shows up once he has landed, and says hello first (even if a field already has focus).
  const [ready, setReady] = useState(false);
  const [greeted, setGreeted] = useState(false);
  useEffect(() => {
    if (!ready && webgl) return;
    const t = setTimeout(() => setGreeted(true), 3200);
    return () => clearTimeout(t);
  }, [ready, webgl]);
  const line = greeted || mood === "error" || mood === "success" ? LINES[mood] : LINES.idle;
  const flat = (
    <div className="flex size-full items-center justify-center pt-[12%]">
      <Mascot
        pose={mood === "success" ? "comemora" : mood === "password" ? "dorme" : "acena"}
        size={compact ? 120 : 200}
        className="mascot-pop"
      />
    </div>
  );
  const showBubble = ready || !webgl;
  return (
    <div className={cn("relative", className)} aria-hidden="true">
      {webgl ? (
        <Fallback fallback={flat}>
          <Suspense fallback={flat}>
            <MascotScene reduced={reduced} compact={compact} onReady={() => setReady(true)} />
          </Suspense>
        </Fallback>
      ) : (
        flat
      )}
      {/* Speech bubble: what he says follows the form (decorative; the form speaks for itself). */}
      <div
        className={cn(
          "pointer-events-none absolute transition-[opacity,translate] duration-300 ease-out",
          compact ? "top-[6%] left-[56%] max-w-[11rem]" : "top-[10%] left-[58%] max-w-[15rem]",
          showBubble ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <p
          key={line}
          className={cn(
            "auth-bubble rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 font-bold text-[#0b1d51] shadow-lift",
            compact ? "text-sm" : "text-base",
          )}
        >
          {line}
        </p>
      </div>
    </div>
  );
}
