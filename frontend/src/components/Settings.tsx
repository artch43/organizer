import { Logo, Mascot } from "./brand/Brand";
import { useState } from "react";
import { motion } from "motion/react";
import {
  Bell,
  CalendarClock,
  Database,
  Download,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  Palette,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { alarmsBetween } from "@/lib/alarms";
import type { AreaColor, Settings as S, Workspace } from "@/lib/types";
import { CustomAlert, NONE, WhatsAppNumber } from "./calendar/AlertPicker";
import { alertPresets, whenLabel } from "@/lib/events";
import { downloadBackup, parseBackup } from "@/lib/backup";
import { cloudEnabled, supabase } from "@/lib/supabase";
import { deleteAllMyData, signOut, useSync } from "@/lib/sync";
import { addArea, deleteArea, exampleData, notify, removeExamples, replaceWorkspace, toast, updateArea, useStore } from "@/store";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AreaSwatches, areaVar, useAreas } from "./common";
import { AppearanceTab } from "./AppearanceTab";
import { PasswordInput } from "./Auth";
import { passwordProblem } from "@/lib/password";
import { PasswordRules } from "./PasswordRules";

type Tab = "conta" | "aparencia" | "areas" | "alertas" | "dados";
const TABS: { id: Tab; label: string; icon: typeof UserRound }[] = [
  { id: "conta", label: "Conta", icon: UserRound },
  { id: "aparencia", label: "Aparência", icon: Palette },
  { id: "areas", label: "Áreas", icon: Tag },
  { id: "alertas", label: "Alertas", icon: Bell },
  { id: "dados", label: "Dados", icon: Database },
];
const TAB_KEY = "organizer:settings-tab";

/** A block of settings: a card with an icon and a title (and an optional control on the right). */
function SCard({
  icon: Icon,
  title,
  action,
  className,
  children,
}: {
  icon?: typeof UserRound;
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card md:p-6", className)}>
      {title && (
        <div className="flex items-center gap-3">
          {Icon && <Icon className="size-5 shrink-0" aria-hidden="true" />}
          <h2 className="text-lg font-bold">{title}</h2>
          {action && <div className="ml-auto">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Configurações: a page with tabs (Conta, Aparência, Áreas, Alertas, Dados). */
export function SettingsPage() {
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      const t = sessionStorage.getItem(TAB_KEY) as Tab | null;
      return t && TABS.some((x) => x.id === t) ? t : "conta";
    } catch {
      return "conta";
    }
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-6 pb-28 md:px-8 md:py-8">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Configurações</h1>
        <div
          role="tablist"
          aria-label="Seções"
          className="no-scrollbar flex max-w-full gap-0.5 overflow-x-auto rounded-2xl border bg-card/50 p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={"set-tab-" + t.id}
              aria-selected={tab === t.id}
              aria-controls="set-panel"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab === t.id && (
                <motion.span
                  aria-hidden="true"
                  layoutId="settings-tab"
                  transition={{ type: "spring", duration: 0.3, bounce: 0.1 }}
                  className="absolute inset-0 rounded-xl bg-muted shadow-card"
                />
              )}
              <t.icon className={cn("relative size-[18px]", tab === t.id && "text-primary-strong")} aria-hidden="true" />
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div id="set-panel" role="tabpanel" aria-labelledby={"set-tab-" + tab} key={tab} className="page-enter">
        {tab === "conta" && <AccountTab />}
        {tab === "aparencia" && (
          <SCard className="max-w-3xl">
            <AppearanceTab />
          </SCard>
        )}
        {tab === "areas" && (
          <SCard className="max-w-3xl">
            <AreasTab />
          </SCard>
        )}
        {tab === "alertas" && <AlertsTab />}
        {tab === "dados" && <DataTab />}
      </div>
    </div>
  );
}

/** Alertas: what the alarms are, the switches, and a preview of the e-mail that arrives. */
function AlertsTab() {
  const [draggedPreset, setDraggedPreset] = useState<number | null>(null);
  const ws = useStore((s) => s.ws);
  const mut = useStore((s) => s.mut);
  const user = useSync((s) => s.user);
  const st = ws.settings;
  const presets = alertPresets(st.alertPresets);
  const removePreset = (minutes: number) => {
    mut((w) => {
      w.settings.alertPresets = alertPresets(w.settings.alertPresets)
        .filter((p) => p.minutes !== minutes).map((p) => p.minutes);
      w.settings.defaultAlerts = w.settings.defaultAlerts.filter((m) => m !== minutes);
    });
    setDraggedPreset(null);
  };
  const set = <K extends keyof S>(k: K, v: S[K]) =>
    mut((w) => {
      w.settings[k] = v;
    });
  const now = Date.now();
  const next = alarmsBetween(ws, "all", now, now + 30 * 864e5)[0];
  const sample = next
    ? { title: next.title, when: whenLabel({ date: next.day, allDay: false, start: next.start }) }
    : { title: "Enviar relatório semanal", when: "hoje, às 17:00" };
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex items-center gap-5 rounded-2xl border border-primary-strong/40 bg-primary/12 p-5 md:gap-7 md:p-7">
          <Mascot pose="email" size={88} className="mascot-pop shrink-0 max-sm:hidden" />
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Eu te aviso na hora certa.</h2>
            <p className="max-w-xl text-base text-foreground/85">
              Escolha um alarme numa tarefa ou evento e o aviso chega no seu e-mail ou no WhatsApp.
            </p>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <SCard
            icon={Mail}
            title="Avisos de eventos e tarefas"
            action={
              <Switch
                id="set-email"
                aria-label="Avisos de eventos e tarefas"
                checked={st.emailAlerts}
                onCheckedChange={(v) => set("emailAlerts", v)}
              />
            }
          >
            <p className="text-[15px] text-muted-foreground">
              {cloudEnabled
                ? "Chegam no e-mail da sua conta ou no WhatsApp, conforme você escolher em cada evento ou tarefa."
                : "Precisa de uma conta. Com o site salvando só neste navegador, nenhum aviso é enviado."}
            </p>
            {cloudEnabled && (
              <Field>
                <FieldLabel htmlFor="set-account-email">E-mail da conta</FieldLabel>
                <Input id="set-account-email" readOnly value={user?.email ?? ""} />
              </Field>
            )}
          </SCard>
          <SCard icon={MessageCircle} title="Número do WhatsApp">
            <p className="text-[15px] text-muted-foreground">Usado nos avisos marcados como WhatsApp.</p>
            <Field>
              <FieldLabel>Número</FieldLabel>
              <WhatsAppNumber phone={st.whatsapp} />
            </Field>
          </SCard>
        </div>
        <SCard icon={CalendarClock} title="Opções de horários predefinidos em eventos">
          <p className="text-sm text-muted-foreground">
            Disponíveis nos avisos de tarefas e eventos. Marque os horários que deseja ativar em novos eventos.
            Para remover uma opção, arraste para a lixeira abaixo.
          </p>
          <ToggleGroup
            type="multiple"
            variant="outline"
            spacing={2}
            aria-label="Opções de horários predefinidos em eventos"
            className="flex-wrap"
            value={st.defaultAlerts.length ? st.defaultAlerts.map(String) : [NONE]}
            onValueChange={(v) =>
              set(
                "defaultAlerts",
                v.includes(NONE) && st.defaultAlerts.length
                  ? []
                  : v
                      .filter((x) => x !== NONE)
                      .map(Number)
                      .sort((a, b) => a - b),
              )
            }
          >
            <ToggleGroupItem value={NONE} className={PILL}>
              Sem alarme
            </ToggleGroupItem>
            {presets.map((p) => (
              <div key={p.minutes} className="flex items-center gap-1" draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-organizer-alert-preset", String(p.minutes));
                  e.dataTransfer.effectAllowed = "move";
                  setDraggedPreset(p.minutes);
                }}
                onDragEnd={() => setDraggedPreset(null)}>
                <ToggleGroupItem value={String(p.minutes)} className={PILL}>
                  {p.label}
                </ToggleGroupItem>
              </div>
            ))}
          </ToggleGroup>
          <div className="flex flex-wrap items-center gap-3">
            <CustomAlert what="evento ou tarefa" onAdd={(minutes) => {
              set("alertPresets", alertPresets([...presets.map((p) => p.minutes), minutes]).map((p) => p.minutes));
            }} />
            <div className={cn("flex min-h-11 items-center gap-2 rounded-xl border border-dashed px-4 py-2 text-sm text-muted-foreground", draggedPreset !== null && "border-destructive bg-destructive/10 text-destructive")}
              onDragOver={(e) => {
                if (draggedPreset !== null) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedPreset !== null) removePreset(draggedPreset);
              }}>
              <Trash2 className="size-4" aria-hidden="true" />
              Arraste um horário para excluir
            </div>
          </div>
        </SCard>
      </div>

      {/* How the e-mail arrives: a preview, and what the alarm looks like in a task or event. */}
      <section aria-labelledby="mail-preview" className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-card md:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-4">
          <h2 id="mail-preview" className="text-lg font-bold">
            Como o e-mail chega
          </h2>
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground sm:ml-auto">
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Lembrete: {sample.title}</span>
          </span>
        </div>
        <div aria-hidden="true" className="flex flex-col gap-5 rounded-2xl bg-white p-6 text-[#0b1d51] shadow-lift">
          <div className="flex items-center gap-2.5 text-sm text-[#4a5578]">
            <Logo size={24} />
            Lembrete do Organizer
          </div>
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-2xl leading-tight font-extrabold tracking-tight">{sample.title}</p>
              <p className="mt-1.5 text-base text-[#4a5578] first-letter:uppercase">{sample.when}</p>
            </div>
            <Mascot pose="email" size={72} className="shrink-0" />
          </div>
          <span className="w-fit rounded-xl bg-[#C6FF3D] px-5 py-3 text-base font-bold text-[#0a0a0a]">Abrir o calendário</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Você recebeu este e-mail porque ativou alertas para este item. Para parar, desligue os avisos nas Configurações.
        </p>
        <div className="flex flex-col gap-3 pt-2">
          <h3 className="text-base font-bold">Em cada tarefa ou evento</h3>
          <div aria-hidden="true" className="flex flex-col gap-4 rounded-2xl border bg-background/50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 font-semibold">
                <Bell className="size-4" />
                Alarme
              </span>
              <span className="ml-auto flex rounded-xl border p-0.5 text-sm">
                <span className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 font-medium">
                  <Mail className="size-3.5" />
                  E-mail
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 text-muted-foreground">
                  <MessageCircle className="size-3.5" />
                  WhatsApp
                </span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.slice(0, 5).map((p) => (
                <span
                  key={p.minutes}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm",
                    p.minutes === 30 && "border-primary-strong bg-primary/14 font-medium text-foreground",
                  )}
                >
                  {p.label}
                </span>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Abra uma tarefa ou evento e escolha quando e por onde ser avisado.</p>
        </div>
      </section>
    </div>
  );
}

const PILL =
  "h-10 rounded-full! border px-4 text-[15px] data-[state=on]:border-primary-strong data-[state=on]:bg-primary/14 data-[state=on]:text-foreground";

/** Starter examples: listed, removed only after confirming, and recoverable (Desfazer, and the Lixeira with an account). */
function ExamplesField() {
  const ws = useStore((s) => s.ws);
  const ex = exampleData(ws);
  const parts = [
    ex.items.length && `${ex.items.length} ${ex.items.length === 1 ? "tarefa" : "tarefas"}`,
    ex.events.length && `${ex.events.length} ${ex.events.length === 1 ? "evento" : "eventos"}`,
  ].filter(Boolean);
  const [ask, setAsk] = useState(false);
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel>Exemplos do início</FieldLabel>
        <FieldDescription>
          {parts.length
            ? `Ainda há ${parts.join(", ")} marcados como exemplo. O guia “Comece por aqui” e o que você criou ficam.`
            : "Não há mais exemplos. Tudo o que está aqui é seu."}
        </FieldDescription>
      </FieldContent>
      {parts.length > 0 && (
        <AlertDialog open={ask} onOpenChange={setAsk}>
          <Button variant="outline" onClick={() => setAsk(true)}>
            <Trash2 data-icon="inline-start" />
            Remover exemplos
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover os exemplos?</AlertDialogTitle>
              <AlertDialogDescription>
                Sai só o que veio de exemplo: {parts.join(", ")}. Você pode desfazer logo em seguida
                {cloudEnabled ? " ou recuperar pela Lixeira por 30 dias" : ""}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => removeExamples()}>Remover exemplos</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Field>
  );
}

function NameField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <Field>
      <FieldLabel htmlFor="set-name">Seu nome</FieldLabel>
      <Input
        id="set-name"
        placeholder="Como quer ser chamado?"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onSave(v.trim())}
      />
      <FieldDescription>Aparece na saudação do Início.</FieldDescription>
    </Field>
  );
}

function AreasTab() {
  const areas = useAreas();
  const [name, setName] = useState("");
  const [color, setColor] = useState<AreaColor>("amber");
  const create = () => {
    if (!name.trim()) return;
    addArea(name, color);
    setName("");
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        As áreas separam suas tarefas e eventos (por exemplo, pessoal e profissional). Escolha uma no topo da tela para ver só o
        que é dela.
      </p>
      {areas.map((a) => (
        <div key={a.id} style={areaVar(a)} className="area-stripe flex flex-col gap-3 rounded-lg border py-3 pr-3 pl-5">
          <div className="flex gap-2">
            <Input
              key={a.name}
              aria-label="Nome da área"
              defaultValue={a.name}
              onBlur={(e) => e.target.value.trim() && updateArea(a.id, { name: e.target.value.trim() })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Excluir ${a.name}`}
              disabled={areas.length <= 1}
              onClick={() => {
                deleteArea(a.id);
                toast(`Área “${a.name}” excluída. Os itens dela ficaram sem área.`);
              }}
            >
              <Trash2 />
            </Button>
          </div>
          <AreaSwatches value={a.color} onChange={(c) => updateArea(a.id, { color: c })} />
        </div>
      ))}
      <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
        <div className="flex gap-2">
          <Input
            aria-label="Nome da nova área"
            placeholder="Nova área, ex.: Saúde…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
          <Button onClick={create} disabled={!name.trim()}>
            <Plus data-icon="inline-start" />
            Criar
          </Button>
        </div>
        <AreaSwatches value={color} onChange={setColor} />
      </div>
    </div>
  );
}

/** Change the password: asks for the current one first (checked with the server), then the new one twice. */
function ChangePassword({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reset = () => {
    setCurrent("");
    setNext("");
    setAgain("");
    setError("");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const weak = passwordProblem(next);
    if (weak) return setError(weak);
    if (next !== again) return setError("As duas senhas novas não são iguais.");
    if (next === current) return setError("A nova senha precisa ser diferente da atual.");
    setBusy(true);
    // Confirms it's really you: the current password must be right.
    const check = await supabase!.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setBusy(false);
      return setError(
        check.error.message === "Invalid login credentials"
          ? "A senha atual está incorreta."
          : "Não foi possível confirmar sua senha agora. Tente de novo em instantes.",
      );
    }
    const { error: upd } = await supabase!.auth.updateUser({ password: next });
    setBusy(false);
    if (upd) {
      setError(
        /reauth|nonce/i.test(upd.message)
          ? "O servidor pede uma confirmação extra por e-mail para trocar a senha. Use “Esqueci a senha” na tela de entrada."
          : /different from the old/i.test(upd.message)
            ? "A nova senha precisa ser diferente da atual."
            : /weak|short|characters/i.test(upd.message)
              ? "Escolha uma senha mais forte: pelo menos 8 caracteres, com números."
              : "Não foi possível trocar a senha. Tente de novo.",
      );
      return;
    }
    reset();
    setOpen(false);
    notify("Senha alterada", undefined, "Use a nova senha da próxima vez que entrar.");
  };
  if (!open)
    return (
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel>Senha</FieldLabel>
          <FieldDescription>Troque a senha de entrada da sua conta.</FieldDescription>
        </FieldContent>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <KeyRound data-icon="inline-start" />
          Alterar senha
        </Button>
      </Field>
    );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border p-4" aria-labelledby="pw-title">
      <h3 id="pw-title" className="text-base font-semibold">
        Alterar senha
      </h3>
      {/* Lets password managers match the account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <Field>
        <FieldLabel htmlFor="pw-current">Senha atual</FieldLabel>
        <PasswordInput
          id="pw-current"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="pw-new">Nova senha</FieldLabel>
        <PasswordInput
          id="pw-new"
          autoComplete="new-password"
          minLength={8}
          aria-describedby="pw-new-rules"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <PasswordRules id="pw-new-rules" value={next} />
      </Field>
      <Field>
        <FieldLabel htmlFor="pw-again">Repita a nova senha</FieldLabel>
        <PasswordInput
          id="pw-again"
          autoComplete="new-password"
          minLength={8}
          required
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
      </Field>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 data-icon="inline-start" className="animate-spin" />}
          {busy ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </div>
    </form>
  );
}

/** Conta: name, the account (sign out, password) and the starter examples. */
function AccountTab() {
  const user = useSync((s) => s.user);
  const name = useStore((s) => s.ws.settings.name);
  const mut = useStore((s) => s.mut);
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <SCard icon={UserRound} title="Perfil">
        <NameField
          value={name}
          onSave={(v) =>
            mut((w) => {
              w.settings.name = v;
            })
          }
        />
      </SCard>
      <SCard icon={KeyRound} title="Conta">
        <FieldGroup>
          {cloudEnabled ? (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel>E-mail</FieldLabel>
                <FieldDescription>
                  Conectado como <b className="text-foreground">{user?.email}</b>. Seus dados ficam salvos na nuvem.
                </FieldDescription>
              </FieldContent>
              <Button
                variant="outline"
                onClick={() =>
                  signOut().catch((e: Error) =>
                    notify(e.message, { label: "Sair e descartar", onClick: () => void signOut(true) }),
                  )
                }
              >
                <LogOut data-icon="inline-start" />
                Sair
              </Button>
            </Field>
          ) : (
            <Alert>
              <AlertTitle>Sem conta</AlertTitle>
              <AlertDescription>
                Seus dados ficam salvos apenas neste navegador. Baixe um backup de vez em quando (em Dados).
              </AlertDescription>
            </Alert>
          )}
          {cloudEnabled && user && (
            <>
              <FieldSeparator />
              <ChangePassword email={user.email} />
            </>
          )}
        </FieldGroup>
      </SCard>
      <SCard icon={Sparkles} title="Exemplos do início" className="lg:col-span-2">
        <ExamplesField />
      </SCard>
    </div>
  );
}

/** Dados: backup, restore and erasing everything. */
function DataTab() {
  const [pending, setPending] = useState<Workspace | null>(null);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState("");
  const [erasing, setErasing] = useState(false);
  const onFile = async (f?: File) => {
    setErr("");
    setPending(null);
    if (!f) return;
    try {
      setPending(parseBackup(await f.text()));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <SCard icon={Database} title="Seus dados" className="max-w-3xl">
      <FieldGroup>
        <Field>
          <FieldLabel>Backup</FieldLabel>
          <FieldDescription>Uma cópia de tudo: listas, tarefas, eventos, anotações e hábitos.</FieldDescription>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadBackup(useStore.getState().ws)}>
              <Download data-icon="inline-start" />
              Baixar backup
            </Button>
            <Button variant="outline" asChild>
              <label htmlFor="backup-file" className="cursor-pointer">
                <Upload data-icon="inline-start" />
                Restaurar backup
              </label>
            </Button>
            <input
              id="backup-file"
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          {pending && (
            <Alert>
              <AlertTitle>Substituir tudo pelo backup?</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                {pending.pages.length} páginas e {Object.keys(pending.items).length} tarefas. O que está no site agora será
                trocado.
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      replaceWorkspace(pending);
                      setPending(null);
                      toast("Backup restaurado");
                    }}
                  >
                    Substituir
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPending(null)}>
                    Cancelar
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </Field>
        {cloudEnabled && (
          <>
            <FieldSeparator />
            <Field>
              <FieldLabel htmlFor="erase">Apagar todos os meus dados</FieldLabel>
              <FieldDescription>
                Apaga para sempre a sua conta e tudo o que está nela (listas, tarefas, eventos, anotações, anexos e
                alarmes) e limpa este aparelho. Digite APAGAR para confirmar.
              </FieldDescription>
              <div className="flex gap-2">
                <Input id="erase" className="max-w-40" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                <Button
                  variant="destructive"
                  disabled={erasing || confirm.trim().toUpperCase() !== "APAGAR"}
                  onClick={() => {
                    setErasing(true);
                    deleteAllMyData().catch((e: Error) => {
                      setErr(e.message);
                      setErasing(false);
                    });
                  }}
                >
                  {erasing && <Loader2 data-icon="inline-start" className="animate-spin" />}
                  {erasing ? "Apagando…" : "Apagar tudo"}
                </Button>
              </div>
            </Field>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          <a className="underline underline-offset-2" href="/privacidade.html" target="_blank" rel="noopener">
            Privacidade e termos de uso
          </a>
        </p>
      </FieldGroup>
    </SCard>
  );
}
