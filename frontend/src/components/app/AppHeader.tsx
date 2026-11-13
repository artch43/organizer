import { motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  Bell,
  Keyboard,
  CalendarDays,
  CloudOff,
  Home,
  ListChecks,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  NotebookPen,
  Search,
  Settings,
  Sprout,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cloudEnabled } from "@/lib/supabase";
import { signOut, useSync } from "@/lib/sync";
import { alarmsBetween, CHANNEL, hhmm, untilLabel, type Alarm } from "@/lib/alarms";
import { SETTINGS_ROUTE, go, notify, openEvent, openModal, openNotes, openPeek, useStore } from "@/store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "../brand/Brand";
import { HeaderTrash } from "./TrashDropZone";
import { openLists } from "../lists/state";

const ICON_BTN =
  "relative flex size-9 shrink-0 items-center justify-center rounded-xl md:size-10 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-muted data-[state=open]:text-foreground [&_svg]:size-5";

/** The time now, refreshed every half minute. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * The top bar, the same on every page: logo, the pages as tabs, search, and on the right the alarms,
 * the trash, settings and the account. Phones have the same buttons; the pages are in the bottom bar.
 */
export function AppHeader() {
  const route = useStore((s) => s.ui.route);
  const pages = useStore((s) => s.ws.pages);
  const page = pages.find((p) => p.id === route);
  const id = (type: string) => pages.find((p) => p.type === type)?.id;
  const home = id("home"),
    cal = id("calendar"),
    habits = id("habits");
  const tabs = [
    { key: "home", label: "Início", icon: Home, active: page?.type === "home", run: () => home && go(home) },
    { key: "lists", label: "Listas", icon: ListChecks, active: page?.type === "db", run: openLists },
    { key: "cal", label: "Calendário", icon: CalendarDays, active: page?.type === "calendar", run: () => cal && go(cal) },
    { key: "habits", label: "Hábitos", icon: Sprout, active: page?.type === "habits", run: () => habits && go(habits) },
    { key: "notes", label: "Notas", icon: NotebookPen, active: route === "notes", run: () => openNotes() },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-chrome/95 px-4 backdrop-blur supports-backdrop-filter:bg-chrome/85 md:gap-4 md:px-5">
      <button
        type="button"
        onClick={() => home && go(home)}
        aria-label="Organizer, ir para o Início"
        className="flex shrink-0 items-center gap-2.5 rounded-lg py-1 pr-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Logo size={26} />
        <span className="text-[19px] font-extrabold tracking-tight max-lg:hidden max-md:inline">Organizer</span>
      </button>

      <nav aria-label="Páginas" className="max-md:hidden">
        <ul className="flex items-center gap-0.5 rounded-2xl border bg-card/50 p-1">
          {tabs.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={t.run}
                data-tour={t.key}
                aria-current={t.active ? "page" : undefined}
                title={t.label}
                className={cn(
                  "relative flex h-9 items-center gap-2 rounded-xl px-3 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:px-3.5",
                  t.active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.active && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="header-tab"
                    transition={{ type: "spring", duration: 0.32, bounce: 0.12 }}
                    className="absolute inset-0 rounded-xl bg-muted shadow-card"
                  />
                )}
                <t.icon className={cn("relative size-[18px] shrink-0", t.active && "text-primary-strong")} aria-hidden="true" />
                <span className="relative max-lg:sr-only">{t.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-0.5 md:gap-1.5">
        <button
          type="button"
          onClick={() => openModal("search")}
          aria-label="Buscar"
          className="flex size-9 items-center justify-center gap-2.5 md:h-10 md:w-auto md:min-w-10 rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none xl:mr-3 xl:w-[21rem] xl:justify-start xl:border xl:bg-card/50 xl:px-3"
        >
          <Search className="size-5 shrink-0 xl:size-[18px]" aria-hidden="true" />
          <span className="truncate text-[15px] max-xl:hidden">Buscar tarefas, notas e listas</span>
        </button>
        <AlarmsBell />
        <div className="flex items-center gap-1">
          <HeaderTrash onOpen={() => openModal("trash")} />
          <button
            type="button"
            onClick={() => openModal("settings")}
            aria-label="Configurações"
            title="Configurações"
            aria-current={route === SETTINGS_ROUTE ? "page" : undefined}
            className={cn(ICON_BTN, route === SETTINGS_ROUTE && "bg-muted text-foreground")}
          >
            <Settings aria-hidden="true" />
          </button>
        </div>
        <AccountMenu />
      </div>
    </header>
  );
}

/** The bell: the next alarms (and those sent today); a dot when one goes off within a day. */
function AlarmsBell() {
  const ws = useStore((s) => s.ws);
  const area = useStore((s) => s.ui.area);
  const now = useNow();
  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  const all = alarmsBetween(ws, area, startOfDay, now + 7 * 864e5);
  const sent = all.filter((a) => a.at < now - 60_000).reverse();
  const next = all.filter((a) => a.at >= now - 60_000);
  const soon = next.some((a) => a.at - now < 864e5);
  const open = (a: Alarm) => (a.kind === "task" ? openPeek(a.id) : openEvent(a.id, a.day));
  const row = (a: Alarm, done: boolean) => {
    const Icon = a.channel === "whatsapp" ? MessageCircle : Mail;
    return (
      <li key={a.kind + a.id + a.at}>
        <button
          type="button"
          onClick={() => open(a)}
          className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
              done ? "bg-muted text-muted-foreground" : "bg-primary/14 text-primary-strong",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{a.title}</span>
            <span className="text-xs text-muted-foreground">
              {done ? `Enviado às ${hhmm(a.at)}` : `${CHANNEL[a.channel]} às ${hhmm(a.at)} · ${untilLabel(a.at, now)}`}
            </span>
          </span>
        </button>
      </li>
    );
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={soon ? "Alarmes (há um alarme nas próximas 24 horas)" : "Alarmes"} className={ICON_BTN}>
          <Bell aria-hidden="true" />
          {soon && (
            <span className="absolute top-2 right-2 size-2 rounded-full bg-primary ring-2 ring-background" aria-hidden="true" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="px-2.5 pt-1.5 pb-1 text-sm font-semibold">Próximos alarmes</p>
        {next.length ? (
          <ul className="flex flex-col">{next.slice(0, 6).map((a) => row(a, false))}</ul>
        ) : (
          <p className="px-2.5 pb-2 text-sm text-muted-foreground">
            Nenhum alarme nos próximos 7 dias. Marque um numa tarefa ou evento.
          </p>
        )}
        {sent.length > 0 && (
          <>
            <p className="mt-1 border-t px-2.5 pt-2.5 pb-1 text-sm font-semibold">Enviados hoje</p>
            <ul className="flex flex-col">{sent.slice(0, 4).map((a) => row(a, true))}</ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The round initial: the account (e-mail, Sair) and settings. */
function AccountMenu() {
  const user = useSync((s) => s.user);
  const status = useSync((s) => s.status);
  const name = useStore((s) => s.ws.settings.name);
  const initial = (name || user?.email || "").trim().charAt(0).toUpperCase();
  const problem = cloudEnabled && (status === "offline" || status === "error");
  const saving = cloudEnabled && status === "saving";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Conta${problem ? (status === "offline" ? " (sem conexão)" : " (tentando salvar)") : saving ? " (salvando)" : ""}`}
          className="relative ml-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold ring-1 ring-border transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {initial || <UserRound className="size-[18px]" aria-hidden="true" />}
          {/* Saving state, only while it matters (saved is the quiet default). */}
          {(saving || problem) && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-background",
                problem ? "text-warning" : "text-muted-foreground",
              )}
            >
              {problem ? <CloudOff className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{name || "Sua conta"}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {cloudEnabled ? (user?.email ?? "") : "Dados salvos neste navegador"}
          </span>
          {problem && (
            <span className="text-xs font-normal text-warning">{status === "offline" ? "Sem conexão" : "Tentando salvar"}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => openModal("settings")}>
            <Settings />
            Configurações
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openModal("shortcuts")} className="max-md:hidden">
            <Keyboard />
            Atalhos do teclado
            <span className="ml-auto text-xs text-muted-foreground">?</span>
          </DropdownMenuItem>
          {cloudEnabled && (
            <DropdownMenuItem
              onSelect={() =>
                signOut().catch((e: Error) => notify(e.message, { label: "Sair e descartar", onClick: () => void signOut(true) }))
              }
            >
              <LogOut />
              Sair
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
