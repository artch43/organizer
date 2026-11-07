/**
 * A burst of little pixel squares from a point on the screen (when the day's last task is done).
 * Plain DOM so it works from anywhere; skipped when the person asks for less motion.
 */
const COLORS = ["var(--primary)", "#ff5fa2", "#8fa9ff", "#ffd166", "#ffffff"];

export function pixelBurst(x: number, y: number, count = 22) {
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.className = "pixel-burst";
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 40 + Math.random() * 70;
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist - 30}px`);
    s.style.setProperty("--size", `${4 + Math.round(Math.random() * 3) * 2}px`);
    s.style.background = COLORS[i % COLORS.length];
    s.style.animationDelay = `${Math.random() * 60}ms`;
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1100);
}

/** The center of the focused element (where a click just happened), or the middle of the screen. */
export function focusPoint(): [number, number] {
  const el = document.activeElement as HTMLElement | null;
  const b = el && el !== document.body ? el.getBoundingClientRect() : null;
  return b ? [b.left + b.width / 2, b.top + b.height / 2] : [innerWidth / 2, innerHeight / 2];
}
