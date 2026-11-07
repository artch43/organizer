import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AreaDot, NewAreaButton, areaVar, useAreas } from "../common";

export function AreaSwitcher({ className }: { className?: string }) {
  const areas = useAreas();
  const area = useStore((s) => s.ui.area);
  const setUi = useStore((s) => s.setUi);
  const select = (id: string) =>
    setUi((u) => {
      u.area = id;
    });
  // When the chips don't fit, they scroll sideways (no scrollbar line) and the edges fade out
  // on the side where there is more, so it's clear there is more to swipe to.
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const left = el.scrollLeft > 2,
      right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);
  useEffect(() => {
    measure();
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, areas.length]);
  // The chosen chip is brought into view (e.g. "Estudos" chosen from elsewhere).
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("[data-state=on]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [area]);
  // Measured again once the chip frame has glided into place (it can stick out while it moves,
  // e.g. arriving from the chips in Início), so no fade is left behind when everything fits.
  useEffect(() => {
    const t = setTimeout(measure, 450);
    return () => clearTimeout(t);
  }, [measure, area]);
  return (
    <div className={cn("flex max-w-full items-center gap-1.5", className)}>
      <div
        ref={box}
        onScroll={measure}
        data-fade-left={edges.left || undefined}
        data-fade-right={edges.right || undefined}
        className="edge-fade no-scrollbar -my-1 min-w-0 snap-x snap-proximity overflow-x-auto scroll-px-2 px-0.5 py-1"
      >
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="Mostrar a área"
          className="w-max [&>*]:snap-start"
          value={area}
          onValueChange={(v) => v && select(v)}
        >
          <ToggleGroupItem value="all" className={CHIP}>
            {area === "all" && <ChipHighlight className="border-primary-strong/60 bg-primary/10" />}
            <span className="relative">Todas</span>
          </ToggleGroupItem>
          {areas.map((a) => (
            <ToggleGroupItem key={a.id} value={a.id} style={areaVar(a)} className={cn(CHIP, "data-[state=on]:text-foreground")}>
              {area === a.id && <ChipHighlight className="border-(--area) bg-(--area)/12" />}
              <span className="relative flex items-center gap-1.5">
                <AreaDot area={a} />
                {a.name}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <NewAreaButton onCreated={select} className="shrink-0" />
    </div>
  );
}

/** Area chips: the chosen one's frame glides to the next chip instead of jumping. */
const CHIP = "relative rounded-full! px-3.5 data-[state=on]:border-transparent data-[state=on]:bg-card";
function ChipHighlight({ className }: { className: string }) {
  return (
    <motion.span
      aria-hidden="true"
      layoutId="area-chip"
      transition={{ type: "spring", duration: 0.3, bounce: 0.1 }}
      className={cn("pointer-events-none absolute -inset-px rounded-full border", className)}
    />
  );
}
