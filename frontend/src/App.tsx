import { Suspense, lazy, useEffect, useState } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { checkReviews, closePeek, openModal, openNotes, scrollToTop, useStore } from "./store";
import { GUIDE_ID, GUIDE_SEEN_KEY } from "./lib/template";
import { authLink, clearAuthLink, cloudEnabled, supabase } from "./lib/supabase";
import { installLocalTrash, startCloud, useSync } from "./lib/sync";
import { installDeleteShortcut } from "./lib/shortcuts";
import { installTouchDnd } from "./lib/touchDnd";
import { installNativeBars } from "./lib/native";
import { useBackToClose } from "./lib/backClose";
import { applyAccent, applySidebarStyle, applyWallpaper } from "./lib/appearance";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "./components/app/AppSidebar";
import { Topbar } from "./components/app/Topbar";
import { MobileNav } from "./components/app/MobileNav";
import { TrashDrops } from "./components/app/TrashDropZone";
import { BoardDialog } from "./components/app/BoardDialog";
import { Search } from "./components/Search";
import { Settings } from "./components/Settings";
import { Trash } from "./components/Trash";
import { Auth, ChooseStart, Loading, NewPassword } from "./components/Auth";
import { LoadBoundary } from "./components/LoadBoundary";
import { Home } from "./components/Home";
import { Habits } from "./components/Habits";
import { DbPage } from "./components/tasks/DbPage";
import { TaskSheet } from "./components/tasks/TaskSheet";
import { StatusDialog } from "./components/tasks/StatusDialog";
import { CalendarPage } from "./components/calendar/CalendarPage";
import { EventDialog } from "./components/calendar/EventDialog";
import { NotebookPen } from "lucide-react";
import { Glyph } from "./components/icons";

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
  if (id && ws.pages.some((p) => p.id === id))
    setUi((u) => {
      u.route = id;
      u.peek = null;
    });
  return !!id;
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        {cloudEnabled ? <CloudGate /> : <Workspace />}
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </ThemeProvider>
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
    const begin = (user: Parameters<typeof startCloud>[0]) => startCloud(user).catch((e: Error) => setError(e.message));
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

/** Keeps the light/dark choice, the accent color and the wallpaper from Settings on the page. */
function ThemeSync() {
  const theme = useStore((s) => s.ws.settings.theme);
  const accent = useStore((s) => s.ws.settings.accent);
  const wallpaper = useStore((s) => s.ws.settings.wallpaper);
  const { setTheme } = useTheme();
  useEffect(() => setTheme(theme), [theme]);
  const sidebarStyle = useStore((s) => s.ws.settings.sidebarStyle);
  useEffect(() => applyAccent(accent), [accent]);
  useEffect(() => applySidebarStyle(sidebarStyle), [sidebarStyle]);
  useEffect(() => {
    void applyWallpaper(wallpaper);
  }, [wallpaper?.kind, wallpaper?.preset, wallpaper?.strength]);
  return null;
}

function Workspace() {
  const route = useStore((s) => s.ui.route);
  const modal = useStore((s) => s.ui.modal);
  const page = useStore((s) => s.ws.pages.find((p) => p.id === s.ui.route));
  const note = useStore((s) => (s.ui.route === "notes" && s.ui.noteId ? s.ws.notes[s.ui.noteId] : undefined));
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
    // First time on this device: the guide ("Comece por aqui") opens instead of the start page.
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
      try {
        localStorage.setItem(GUIDE_SEEN_KEY, "1");
      } catch {
        /* private mode */
      }
      if (!location.hash) history.replaceState(history.state, "", "#/" + startPage());
      openNotes(GUIDE_ID);
      // Opens ready to read (Editar is one click away).
      setUi((u) => void (u.noteMode = "read"));
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

  const title =
    route === "notes" ? (
      <span className="flex items-center gap-2">
        <NotebookPen className="size-4 text-primary-strong" aria-hidden="true" />
        Anotações{note ? <span className="text-muted-foreground"> / {note.title}</span> : null}
      </span>
    ) : page ? (
      <span className="flex items-center gap-2">
        <Glyph icon={page.icon} size="xs" />
        {page.title || "Sem título"}
      </span>
    ) : null;
  const current = page ?? (route === "notes" ? null : useStore.getState().ws.pages.find((p) => p.type === "home"));

  return (
    <SidebarProvider defaultOpen={wideScreen}>
      <ThemeSync />
      <AppSidebar />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>
      <SidebarInset className="min-w-0" id="conteudo">
        {/* Pages show their own big title; only Notes keeps the path in the top bar. */}
        <Topbar title={route === "notes" ? title : null} showAreas={route !== "notes" && current?.type !== "habits"} />
        {route === "notes" ? (
          <LoadBoundary>
            <Suspense fallback={<Loading text="Abrindo anotações…" />}>
              <NotesView />
            </Suspense>
          </LoadBoundary>
        ) : (
          <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
            <div key={current?.id} className="page-enter">
              {current?.type === "home" && <Home />}
              {current?.type === "calendar" && <CalendarPage />}
              {current?.type === "habits" && <Habits />}
              {current?.type === "db" && <DbPage key={current.id} page={current} />}
            </div>
          </div>
        )}
        <MobileNav />
        <TrashDrops />
      </SidebarInset>
      <TaskSheet />
      <EventDialog />
      <StatusDialog />
      {modal === "search" && <Search />}
      {modal === "settings" && <Settings />}
      {modal === "trash" && <Trash />}
      {modal === "newBoard" && <BoardDialog open onOpenChange={(o) => !o && openModal(null)} />}
      <EscToClose />
    </SidebarProvider>
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

// Tablets start with the menu closed so the page gets the room; it opens from the button in the top bar.
const wideScreen = typeof matchMedia === "undefined" || matchMedia("(min-width: 1024px)").matches;
