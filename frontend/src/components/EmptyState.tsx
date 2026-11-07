import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Mascot, type MascotPose } from "./brand/Brand";

/**
 * An empty spot that says what goes there and how to start: the mascot in a fitting pose, a short
 * title, one line of help and (optionally) the button that fills it.
 */
export function EmptyState({
  pose,
  title,
  text,
  action,
  compact,
  className,
}: {
  pose: MascotPose;
  title: string;
  text?: string;
  action?: { label: string; run: () => void; icon?: React.ReactNode };
  /** Smaller, for blocks and side panels. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center text-center text-balance", compact ? "gap-1.5 py-3" : "gap-2 py-8", className)}
    >
      <Mascot pose={pose} size={compact ? 52 : 76} className="mascot-pop" />
      <p className={cn("font-semibold", compact ? "text-[15px]" : "text-base")}>{title}</p>
      {text && <p className="max-w-xs text-sm text-muted-foreground">{text}</p>}
      {action && (
        <Button variant="outline" size={compact ? "sm" : "default"} className="mt-1.5 rounded-xl" onClick={action.run}>
          {action.icon}
          {action.label}
        </Button>
      )}
    </div>
  );
}
