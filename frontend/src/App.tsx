import { Suspense, lazy, useEffect, useState } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { MotionConfig } from "motion/react";
import { SETTINGS_ROUTE, checkReviews, closePeek, openModal, scrollToTop, useStore } from "./store";
import { GUIDE_ID, GUIDE_SEEN_KEY } from "./lib/template";
import { authLink, clearAuthLink, cloudEnabled, supabase } from "./lib/supabase";
import { NOTICE_KEY, installLocalTrash, startCloud, useSync } from "./lib/sync";
import { toast } from "sonner";
import { installDeleteShortcut } from "./lib/shortcuts";
import { installTouchDnd } from "./lib/touchDnd";
import { installNativeBars } from "./lib/native";
import { useBackToClose } from "./lib/backClose";
import { applyAccent, applyWallpaper, pruneWallpaperCache, wallpaperShown } from "./lib/appearance";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "./components/app/AppHeader";
import { AppBackdrop } from "./components/app/AppBackdrop";
import { Companion } from "./components/companion/Companion";
import { TourOverlay } from "./components/companion/TourOverlay";
import { startTour } from "./components/companion/tour";
import { ShortcutsDialog, useKeyboardShortcuts } from "./components/app/Shortcuts";
import { GlobalNewTask } from "./components/app/CreateButton";
import { ListsPanel, ListsSheet } from "./components/lists/ListsPanel";
import { rememberList } from "./components/lists/state";
import { MobileNav } from "./components/app/MobileNav";
import { TrashDrops } from "./components/app/TrashDropZone";
import { BoardDialog } from "./components/app/BoardDialog";
import { Search } from "./components/Search";
import { SettingsPage } from "./components/Settings";
import { Trash } from "./components/Trash";
import { Auth, ChooseStart, Loading, NewPassword } from "./components/Auth";
import { LoadBoundary } from "./components/LoadBoundary";
import { afterCelebration } from "./components/auth3d/mood";
import { Home } from "./components/Home";
import { Habits } from "./components/Habits";
import { DbPage } from "./components/tasks/DbPage";
import { TaskSheet } from "./components/tasks/TaskSheet";
import { StatusDialog } from "./components/tasks/StatusDialog";
import { CalendarPage } from "./components/calendar/CalendarPage";
import { EventDialog } from "./components/calendar/EventDialog";

const NotesView = lazy(() => import("./components/notes/NotesView"));
/** The page shown on opening: always Início (the old "Abrir em" setting is no longer offered). */
function startPage() {
  const { ws } = useStore.getState();
  return ws.pages.find((p) => p.type === "home")?.id ?? "home";
}

function routeFromHash() {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const { ws, setUi } = useStore.getState();
  if (id === "notas" || id.startsWith("notas/")) {
    const rest = id.slice(6);
    setUi((u) => {
      u.route = "notes";
      u.peek = null;
      if (rest && ws.notes[rest]) u.noteId = rest;
      u.notesTab = rest ? "note" : "list";
    });
    return true;
  }
  if (id === SETTINGS_ROUTE) {
    setUi((u) => {
      u.route = id;
      u.peek = null;
    });
    return true;
  }
  if (id && ws.pages.some((p) => p.id === id))
    setUi((u) => {
      u.route = id;
      u.peek = null;
    });
  return !!id;
}

export default function App() {
  // A message left by the page before it reloaded (signing out, erasing the account).
  useEffect(() => {
    try {
      const notice = sessionStorage.getItem(NOTICE_KEY);
      if (!notice) return;
      sessionStorage.removeItem(NOTICE_KEY);
      toast(notice, { duration: 10_000 });
    } catch {
      /* storage blocked */
    }
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider>
          {cloudEnabled ? <CloudGate /> : <Workspace />}
          <Toaster position="bottom-center" />
        </TooltipProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}

const LINK_EXPIRED = "Este link expirou ou já foi usado. Peça um novo abaixo.";

/** With a backend configured: sign in first, then load the person's data, then show the workspace. */
function CloudGate() {
  const phase = useSync((s) => s.phase);
  const recovery = useSync((s) => s.recovery);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // After signing in here, the mascot's little celebration plays out before the app opens.
    const begin = (user: Parameters<typeof startCloud>[0]) =>
      afterCelebration()
        .then(() => startCloud(user))
        .catch((e: Error) => setError(e.message));
    (async () => {
      // A password-reset link that works on any device (token in the link, no code kept in this browser).
      if (authLink.tokenHash) {
        const { error } = await supabase!.auth.verifyOtp({ token_hash: authLink.tokenHash, type: "recovery" });
        if (error) setError(LINK_EXPIRED);
      }
      // getSession waits until the link in the URL was handled, so the result here is final.
      const { data } = await supabase!.auth.getSession();
      if (authLink.error) setError(LINK_EXPIRED);
      else if (authLink.recovery && data.session) useSync.setState({ recovery: true });
      else if (authLink.recovery && !authLink.tokenHash)
        setError("Abra o link no mesmo navegador em que pediu a nova senha, ou peça outro link abaixo.");
      if (authLink.error || (authLink.recovery && !data.session)) clearAuthLink();
      setChecked(true);
      if (data.session) begin(data.session.user);
    })();
    const { data } = supabase!.auth.onAuthStateChange((event, session) => {
      // (Usually fired before this listener exists; the URL check above covers that case.)
      if (event === "PASSWORD_RECOVERY") useSync.setState({ recovery: true });
      if (event === "SIGNED_IN" && session) begin(session.user);
      if (event === "SIGNED_OUT") useSync.setState({ phase: "auth", user: null });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!checked) return <Loading text="Abrindo…" />;
  if (recovery) return <NewPassword />;
  if (phase === "auth") return <Auth error={error} startMode={authLink.recovery || authLink.error ? "forgot" : undefined} />;
  if (phase === "loading") return <Loading />;
  if (phase === "choose") return <ChooseStart />;
  return <Workspace />;
}

/** Keeps the selected theme, accent and custom image on the page. */
function ThemeSync() {
  const theme = useStore((s) => s.ws.settings.theme);
  const accent = useStore((s) => s.ws.settings.accent);
  const accentDark = useStore((s) => s.ws.settings.accentDark);
  const wallpaper = useStore((s) => s.ws.settings.wallpaper);
  const { setTheme, resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  useEffect(() => setTheme(theme), [theme]);
  useEffect(() => applyAccent(dark ? accentDark ?? accent : accent), [accent, accentDark, dark]);
  useEffect(() => {
    void applyWallpaper(wallpaper, dark);
    const retry = () => {
      if (!wallpaperShown.get()) void applyWallpaper(useStore.getState().ws.settings.wallpaper, dark);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [wallpaper, dark]);
  useEffect(() => { void pruneWallpaperCache(wallpaper); }, [wallpaper]);
  // The phone's status bar follows the theme chosen here, not only the system's (index.html has the defaults).
  useEffect(() => {
    if (!resolvedTheme) return;
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((m) => (m.content = dark ? "#08090A" : "#FFFFFF"));
  }, [dark, resolvedTheme]);
  return null;
}

function Workspace() {
  const route = useStore((s) => s.ui.route);
  const modal = useStore((s) => s.ui.modal);
  const page = useStore((s) => s.ws.pages.find((p) => p.id === s.ui.route));
  const setUi = useStore((s) => s.setUi);
  // Back closes the open window, the task panel or the event dialog before changing page.
  const peek = useStore((s) => s.ui.peek);
  const eventDialog = useStore((s) => !!s.ui.eventDialog);
  useBackToClose(!!modal, () => setUi((u) => void (u.modal = null)));
  useBackToClose(!!peek, closePeek);
  useBackToClose(eventDialog, () => setUi((u) => void (u.eventDialog = null)));

  useEffect(() => {
    // Opened without an address: show the start page and write it in the address (replacing, so
    // Back from the next page comes here instead of to a blank entry).
    const toStart = () => {
      const start = startPage();
      setUi((u) => {
        u.route = start;
        u.peek = null;
      });
      history.replaceState(history.state, "", "#/" + start);
    };
    // First time on this device: the mascot gives the tour of the pages (the guide note stays in Notas).
    const seen = (() => {
      try {
        return !!localStorage.getItem(GUIDE_SEEN_KEY);
      } catch {
        return true;
      }
    })();
    // Only when arriving at the start (a link straight to a page still opens that page).
    const atStart = !location.hash || location.hash === "#/" || location.hash === "#/" + startPage();
    if (!seen && atStart && useStore.getState().ws.notes[GUIDE_ID]) {
      // Marked as seen when the tour ends (or is skipped): a reload in the middle doesn't lose it.
      toStart();
      startTour();
    } else if (!routeFromHash()) toStart();
    checkReviews();
    const onHash = () => {
      if (!routeFromHash()) toStart();
    };
    const onVis = () => {
      if (!document.hidden) checkReviews();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setUi((u) => {
          u.modal = u.modal === "search" ? null : "search";
        });
      }
    };
    addEventListener("hashchange", onHash);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("keydown", onKey);
    return () => {
      removeEventListener("hashchange", onHash);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // A new page starts at its top (whichever way it was opened: menu, bottom bar, link or back button).
  const noteId = useStore((s) => s.ui.noteId);
  useEffect(() => scrollToTop(), [route, route === "notes" ? noteId : null]);

  const settings = route === SETTINGS_ROUTE;
  const current = page ?? (route === "notes" || settings ? null : useStore.getState().ws.pages.find((p) => p.type === "home"));
  useKeyboardShortcuts();
  // The folders and lists show beside a list only; the other pages use the tabs in the top bar.
  const onList = current?.type === "db";
  useEffect(() => {
    if (onList && current) rememberList(current.id);
  }, [onList, current?.id]);

  return (
    <div data-app-root className="flex min-h-svh w-full flex-col">
      <ThemeSync />
      <AppBackdrop />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>
      <AppHeader />
      <main id="conteudo" className="flex min-w-0 flex-1">
        {onList && <ListsPanel />}
        {route === "notes" ? (
          // Notes scroll inside their own columns: the area is exactly the window below the top bar.
          <div className="flex h-[calc(100dvh-4rem)] min-w-0 flex-1 max-md:h-[calc(100dvh-4rem-var(--mobile-nav-h)-1px-env(safe-area-inset-bottom))]">
            <LoadBoundary>
              <Suspense fallback={<Loading text="Abrindo notas…" inline />}>
                <NotesView />
              </Suspense>
            </LoadBoundary>
          </div>
        ) : (
          <div data-scroll className="min-w-0 flex-1">
            <div key={settings ? route : current?.id} className="page-enter">
              {settings && <SettingsPage />}
              {current?.type === "home" && <Home />}
              {current?.type === "calendar" && <CalendarPage />}
              {current?.type === "habits" && <Habits />}
              {current?.type === "db" && <DbPage key={current.id} page={current} />}
            </div>
          </div>
        )}
      </main>
      <MobileNav />
      <Companion />
      <TourOverlay />
      <ListsSheet />
      <TrashDrops />
      <TaskSheet />
      <EventDialog />
      <StatusDialog />
      <GlobalNewTask />
      <ShortcutsDialog />
      {modal === "search" && <Search />}
      {modal === "trash" && <Trash />}
      {modal === "newBoard" && <BoardDialog open onOpenChange={(o) => !o && openModal(null)} />}
      <EscToClose />
    </div>
  );
}

/** Esc closes the task panel when no dialog is open (dialogs handle Esc themselves); Ctrl/⌘+Delete deletes. */
function EscToClose() {
  useEffect(() => installDeleteShortcut(), []);
  // Without an account, deletions go to a trash kept on this device.
  useEffect(() => (cloudEnabled ? undefined : installLocalTrash()), []);
  // Long-press and drag on phones and tablets (cards, calendar entries, lists and folders).
  useEffect(() => installTouchDnd(), []);
  useEffect(() => {
    const stop = installNativeBars();
    return () => void stop.then((f) => f());
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const { ui } = useStore.getState();
      if (ui.peek && !ui.modal && !ui.eventDialog && !ui.statusDialog) closePeek();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
