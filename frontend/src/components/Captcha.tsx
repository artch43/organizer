import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile, the check that the person isn't a script. Supabase Auth verifies the token on
 * sign-up, sign-in and password reset (Authentication → Attack Protection), so one script can't create
 * thousands of accounts and multiply every per-account limit. Most people never see a puzzle.
 *
 * Without VITE_TURNSTILE_SITE_KEY the check is off and nothing is shown (local development).
 * Each token works once: call the reset (bump `resetKey`) after every attempt.
 */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || "";
export const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<void> | null = null;
/** Loads Cloudflare's script once, only on the screens that need it. */
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("captcha script failed to load"));
    };
    document.head.append(s);
  });
  return loading;
}

export function Captcha({
  onToken,
  resetKey = 0,
  siteKey = TURNSTILE_SITE_KEY,
}: {
  /** The token once the check passes; null when it expires, fails or is reset. */
  onToken: (token: string | null) => void;
  resetKey?: number;
  siteKey?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const report = useRef(onToken);
  report.current = onToken;

  useEffect(() => {
    if (!siteKey) return;
    let gone = false;
    loadScript()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          theme: "auto",
          language: "pt-br",
          size: "flexible",
          callback: (t: string) => report.current(t),
          "expired-callback": () => report.current(null),
          "error-callback": () => report.current(null),
        });
      })
      .catch(() => report.current(null));
    return () => {
      gone = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!resetKey || !widget.current) return;
    window.turnstile?.reset(widget.current);
    report.current(null);
  }, [resetKey]);

  if (!siteKey) return null;
  return <div ref={box} className="min-h-[65px] w-full" />;
}
