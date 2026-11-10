import { useEffect, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, BellRing, Eye, EyeOff, LayoutList, Loader2, MailCheck, Sprout } from "lucide-react";
import { clearAuthLink, supabase } from "@/lib/supabase";
import { clearFailures, fmtWait, recordFailure, triesLeft, waitLeft } from "@/lib/loginLimit";
import { seedAccount, useSync } from "@/lib/sync";
import { template } from "@/lib/template";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Logo, Mascot } from "./brand/Brand";
import { isNativeApp, SITE_URL } from "@/lib/native";
import { passwordProblem } from "@/lib/password";
import { PasswordRules } from "./PasswordRules";
import { Stage } from "./auth3d/Stage";
import { blurMood, celebrate, focusMood, setMood, useAuthMood } from "./auth3d/mood";

export type Mode = "signin" | "signup" | "forgot";

const ERRORS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "Confirme seu e-mail pelo link que enviamos antes de entrar.",
  "User already registered": "Já existe uma conta com este e-mail. Entre ou use “Esqueci a senha”.",
  "Signups not allowed for this instance": "Os cadastros estão fechados no momento.",
};
function msgOf(e: { message?: string; name?: string } | null) {
  if (!e) return "";
  const m = e.message ?? "";
  if (ERRORS[m]) return ERRORS[m];
  if (/fetch|network/i.test(m) || e.name === "AuthRetryableFetchError")
    return "Não foi possível conectar ao servidor. Verifique sua internet.";
  // The e-mail service refused to send (address not allowed or too many e-mails in the last hour).
  if (/email address not authorized|email rate limit|error sending|sending (confirmation|recovery)/i.test(m))
    return "Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.";
  if (/invalid.*email|email.*invalid|unable to validate email/i.test(m)) return "Confira o e-mail: ele parece inválido.";
  if (/password/i.test(m)) return "Escolha uma senha mais forte: pelo menos 8 caracteres, com números.";
  if (/rate limit/i.test(m)) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  return "Algo deu errado. Tente de novo em instantes.";
}

/** Computer-sized screen (the side-by-side layout), followed when the window is resized. */
function useWide() {
  const [wide, setWide] = useState(() => matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

const PERKS = [
  { icon: LayoutList, label: "Listas e quadros" },
  { icon: BellRing, label: "Alarme no e-mail e no WhatsApp" },
  { icon: Sprout, label: "Hábitos e notas" },
];

/**
 * The entrance: a showcase and the sign-in in one screen. On the left (top on phones), the headline,
 * what the app does and "Criar conta grátis", with the 3D mascot on his stage; on the right (below
 * on phones), the form. Shared by sign-in, new password and the first-run choice.
 */
function Shell({
  title,
  description,
  children,
  footer,
  tabs,
  onCta,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tabs?: React.ReactNode;
  /** "Criar conta grátis": switch the form to sign-up (only on the sign-in screen). */
  onCta?: () => void;
}) {
  const wide = useWide();
  return (
    <main className="auth-stage relative isolate min-h-dvh overflow-x-hidden text-white lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(26rem,1fr)]">
      <div aria-hidden="true" className="auth-dots pointer-events-none absolute inset-0 -z-10" />
      <section className="relative flex flex-col px-5 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-10 lg:min-h-dvh lg:py-9 lg:pr-0 lg:pl-14">
        <div className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight lg:text-xl">
          <Logo />
          Organizer
        </div>
        <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-center lg:gap-4">
          {/* Phones: the stage first, the words below it. Computers: words left, mascot right. */}
          <div className="auth-rise flex flex-col gap-5 max-lg:order-2 max-lg:pb-24 lg:gap-7">
            <h1 className="text-[2.35rem] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[4.1rem]">
              Seu dia inteiro, <span className="auth-highlight">num lugar só.</span>
            </h1>
            <p className="max-w-md text-base text-white/80 lg:text-lg">
              Tarefas, calendário, hábitos e notas, com aviso no seu e-mail ou WhatsApp na hora certa.
            </p>
            <ul className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:items-start lg:px-0">
              {PERKS.map((p) => (
                <li
                  key={p.label}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-sm font-semibold ring-1 ring-white/15 backdrop-blur-sm"
                >
                  <p.icon className="size-4 text-primary" aria-hidden="true" />
                  {p.label}
                </li>
              ))}
            </ul>
            {onCta && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={onCta}
                  className="auth-cta h-14 rounded-2xl bg-primary px-7 text-lg font-extrabold text-primary-foreground shadow-lift transition-transform duration-150 ease-out focus-visible:ring-4 focus-visible:ring-white/50 focus-visible:outline-none active:scale-[0.97]"
                >
                  Criar conta grátis
                </button>
                <span className="text-sm font-medium text-white/70">Grátis, sem cartão.</span>
              </div>
            )}
          </div>
          {/* One stage only (a WebGL canvas each): the big one beside the words, or the short one on top. */}
          {wide ? (
            <Stage className="h-[78vh] max-h-[46rem] min-h-[30rem]" />
          ) : (
            <Stage compact className="-mx-5 h-[34vh] min-h-56 max-lg:order-1 sm:-mx-10" />
          )}
        </div>
      </section>

      {/* The form: a sheet rising over the stage on phones, a frosted card on the right on computers. */}
      <section className="relative z-10 -mt-16 flex flex-col text-foreground lg:mt-0 lg:items-center lg:justify-center lg:p-8">
        <div className="auth-form flex flex-1 flex-col rounded-t-3xl bg-card px-5 pt-7 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl sm:px-10 lg:w-full lg:max-w-[28rem] lg:flex-none lg:rounded-3xl lg:bg-card/92 lg:px-9 lg:py-9 lg:ring-1 lg:ring-white/10 lg:backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6">
            {tabs}
            <header className="flex flex-col gap-1.5">
              <h2 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-3xl">{title}</h2>
              {/* Two lines reserved, so switching Entrar/Criar conta doesn't move the form. */}
              {description && <p className="min-h-[2lh] text-base text-muted-foreground">{description}</p>}
            </header>
            {children}
            {footer && <div className="flex flex-wrap justify-center gap-2 text-sm">{footer}</div>}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <PrivacyLink />
          </p>
        </div>
      </section>
    </main>
  );
}

const PrivacyLink = () => (
  <a className="underline underline-offset-4 hover:text-foreground" href="/privacidade.html" target="_blank" rel="noopener">
    Privacidade e termos
  </a>
);

/** Password field with a show/hide button. */
export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <InputGroup className="h-11">
      <InputGroupInput {...props} type={show ? "text" : "password"} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          size="icon-sm"
          aria-label={show ? "Esconder senha" : "Mostrar senha"}
          aria-pressed={show}
          onClick={() => setShow((v) => !v)}
        >
          {show ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** Re-renders every second while `active`, for countdowns. */
function useTick(active: boolean) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setT((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function Auth({ error: outer, startMode }: { error?: string; startMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(startMode ?? "signin");
  // Sign-in pause after too many wrong passwords, and a pause between reset e-mails.
  const [resendAt, setResendAt] = useState(0);
  const locked = mode === "signin" ? waitLeft() : mode === "forgot" ? Math.max(0, resendAt - Date.now()) : 0;
  useTick(locked > 0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(outer ?? "");
  const [info, setInfo] = useState("");
  const switchTo = (m: Mode) => {
    setMode(m);
    setError("");
    setInfo("");
  };
  // The mascot shakes his head at an error.
  useEffect(() => {
    if (error) setMood("error");
  }, [error]);
  // "Criar conta grátis": the sign-up form, ready to type.
  const startSignup = () => {
    switchTo("signup");
    requestAnimationFrame(() => {
      const el = document.getElementById("auth-email");
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  // A password problem doesn't make the e-mail field look wrong.
  const emailBad = !!error && !/^A senha|senha mais forte/.test(error);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setInfo("");
    // In the phone apps the page lives inside the app, which an e-mail link can't open: use the site.
    const redirect = isNativeApp ? SITE_URL + "/" : location.origin + location.pathname;
    if (mode === "signin") {
      if (waitLeft() > 0) return setBusy(false);
      // Signed in: the mascot cheers (the app opens right after his little jump).
      const { error } = await supabase.auth.signInWithPassword({ email, password }).then((r) => {
        if (!r.error) celebrate();
        return r;
      });
      if (!error) clearFailures();
      else if (error.message === "Invalid login credentials") {
        const pause = recordFailure();
        const left = triesLeft();
        setError(
          pause
            ? `Muitas tentativas erradas. Por segurança, espere ${fmtWait(pause)} para tentar de novo.`
            : `E-mail ou senha incorretos.${left <= 2 ? ` Mais ${left} ${left === 1 ? "tentativa" : "tentativas"} antes de uma pausa.` : ""}`,
        );
      } else setError(msgOf(error));
    } else if (mode === "signup") {
      const weak = passwordProblem(password);
      if (weak) {
        setError(weak);
        return setBusy(false);
      }
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
      if (error) setError(msgOf(error));
      else if (data.session) celebrate();
      else
        setInfo(`Enviamos um link de confirmação para ${email}. Abra o e-mail e clique nele para ativar a conta.`);
    } else {
      // ?tipo=recuperar tells the app, when the link opens, to ask for the new password.
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect + "?tipo=recuperar" });
      if (error) setError(msgOf(error));
      else {
        setResendAt(Date.now() + 60_000);
        setInfo(
          `Se existir uma conta com ${email}, você vai receber um link em instantes. Abra-o neste mesmo navegador. Não chegou? Olhe o spam.`,
        );
      }
    }
    setBusy(false);
  };

  const title = { signin: "Que bom te ver de novo", signup: "Crie sua conta", forgot: "Recuperar senha" }[mode];
  const description = {
    signin: "Entre para ver o seu dia.",
    signup: "Grátis. Seus dados ficam salvos e sincronizados entre aparelhos.",
    forgot: "Enviaremos um link para você criar uma nova senha.",
  }[mode];
  const action = { signin: "Entrar", signup: "Criar conta", forgot: "Enviar link" }[mode];
  return (
    <Shell
      title={title}
      description={description}
      onCta={startSignup}
      tabs={
        mode !== "forgot" && (
          <Tabs value={mode} onValueChange={(v) => switchTo(v as Mode)}>
            <TabsList className="grid h-11 w-full grid-cols-2">
              <TabsTrigger value="signin" className="text-[15px]">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="signup" className="text-[15px]">
                Criar conta
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )
      }
      footer={
        mode === "forgot" && (
          <Button variant="link" className="h-auto p-0" onClick={() => switchTo("signin")}>
            <ArrowLeft data-icon="inline-start" />
            Voltar para entrar
          </Button>
        )
      }
    >
      <form onSubmit={submit}>
        <FieldGroup>
          <Field data-invalid={emailBad}>
            <FieldLabel htmlFor="auth-email">E-mail</FieldLabel>
            <Input
              id="auth-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              // Computers: ready to type. Phones: no jump to the form (and no keyboard) over the showcase.
              autoFocus={matchMedia("(min-width: 1024px)").matches}
              spellCheck={false}
              required
              placeholder="clebinho@gmail.com"
              className="h-11"
              value={email}
              aria-invalid={emailBad}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => focusMood("email")}
              onBlur={blurMood}
            />
          </Field>
          {mode !== "forgot" && (
            <Field data-invalid={!!error}>
              <div className="flex h-6 items-center justify-between">
                <FieldLabel htmlFor="auth-pass">Senha</FieldLabel>
                {mode === "signin" && (
                  <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={() => switchTo("forgot")}>
                    Esqueci a senha
                  </Button>
                )}
              </div>
              <PasswordInput
                id="auth-pass"
                name="password"
                minLength={mode === "signup" ? 8 : undefined}
                required
                aria-invalid={!!error}
                aria-describedby={mode === "signup" ? "auth-pass-rules" : undefined}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => focusMood("password")}
                onBlur={blurMood}
              />
              {/* The hint's line is kept on both tabs (hidden when signing in), so the button below stays put. */}
              <PasswordRules
                id="auth-pass-rules"
                value={password}
                className={cn(mode !== "signup" && "invisible")}
                aria-hidden={mode !== "signup"}
              />
            </Field>
          )}
          {!error && mode === "signin" && locked > 0 && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                Muitas tentativas erradas. Por segurança, o login está pausado por alguns instantes.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {info && (
            <Alert role="status">
              <MailCheck />
              <AlertDescription>{info}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy || locked > 0}>
            {busy && <Loader2 data-icon="inline-start" className="animate-spin" />}
            {busy
              ? "Aguarde…"
              : locked > 0
                ? mode === "forgot"
                  ? `Enviar de novo em ${fmtWait(locked)}`
                  : `Tente de novo em ${fmtWait(locked)}`
                : action}
          </Button>
        </FieldGroup>
      </form>
    </Shell>
  );
}

export function NewPassword() {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const weak = passwordProblem(password);
    if (weak) return setError(weak);
    if (password !== again) return setError("As duas senhas não são iguais.");
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(
        /different from the old/i.test(error.message)
          ? "A nova senha precisa ser diferente da anterior."
          : /session/i.test(error.message)
            ? "O link expirou. Volte e peça um novo."
            : msgOf(error),
      );
      return;
    }
    clearFailures();
    clearAuthLink();
    useSync.setState({ recovery: false });
    toast.success("Senha alterada", { description: "Use a nova senha da próxima vez que entrar." });
  };
  return (
    <Shell title="Crie uma nova senha" description="Escolha uma senha que você não use em outros sites.">
      <form onSubmit={submit}>
        <FieldGroup>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="new-pass">Nova senha</FieldLabel>
            <PasswordInput
              id="new-pass"
              minLength={8}
              aria-describedby="new-pass-rules"
              required
              autoFocus
              autoComplete="new-password"
              aria-invalid={!!error}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => focusMood("password")}
              onBlur={blurMood}
            />
            <PasswordRules id="new-pass-rules" value={password} />
          </Field>
          <Field data-invalid={!!error && password !== again}>
            <FieldLabel htmlFor="new-pass-2">Repita a nova senha</FieldLabel>
            <PasswordInput
              id="new-pass-2"
              minLength={8}
              required
              autoComplete="new-password"
              aria-invalid={!!error && password !== again}
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              onFocus={() => focusMood("password")}
              onBlur={blurMood}
            />
          </Field>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {busy && <Loader2 data-icon="inline-start" className="animate-spin" />}
            {busy ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </FieldGroup>
      </form>
    </Shell>
  );
}

export function ChooseStart() {
  const candidate = useSync((s) => s.candidate)!;
  const pages = candidate.pages.length,
    items = Object.keys(candidate.items).length;
  return (
    <Shell
      title="Boas-vindas!"
      description={`Encontramos dados salvos neste navegador (${pages} páginas e ${items} tarefas). Quer levá-los para a sua conta? Em qualquer caso, eles saem deste navegador.`}
    >
      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={() => seedAccount(candidate)}>
          Levar meus dados para a conta
        </Button>
        <Button size="lg" variant="outline" onClick={() => seedAccount(template())}>
          Começar do zero
        </Button>
      </div>
    </Shell>
  );
}

/**
 * Waiting for the workspace: the shape of the app in soft placeholders (top bar, today's tasks and
 * the side blocks) instead of a bare message, so the screen doesn't jump when it arrives. The mascot
 * says what is happening (and cheers right after a sign-in). `inline`: a smaller placeholder inside a page.
 */
export function Loading({ text = "Carregando seu espaço…", inline }: { text?: string; inline?: boolean }) {
  const cheering = useAuthMood((s) => s.mood === "success");
  const status = (
    <div className="flex items-center gap-2.5 rounded-full bg-card/90 py-1.5 pr-4 pl-2 text-sm font-medium text-muted-foreground shadow-card ring-1 ring-border">
      <Mascot pose={cheering ? "comemora" : "anota"} size={30} className="mascot-pop" />
      {text}
    </div>
  );
  if (inline)
    return (
      <div role="status" className="flex min-h-full flex-1 flex-col gap-4 p-6 md:p-10">
        <Skeleton className="h-9 w-2/3 max-w-md rounded-xl" />
        <Skeleton className="h-4 w-1/3 max-w-xs" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-4 rounded-lg" style={{ width: `${90 - i * 9}%` }} />
        ))}
        <div className="mt-2 self-start">{status}</div>
      </div>
    );
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh w-full flex-col bg-background">
      <div className="flex h-16 items-center gap-4 border-b px-4 md:px-5">
        <Logo size={26} />
        <Skeleton className="h-6 w-28 max-md:hidden" />
        <Skeleton className="h-10 w-[26rem] rounded-2xl max-lg:hidden" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-xl xl:w-72" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col gap-5 px-4 pt-6 md:px-10">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-2xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-64 max-w-[60vw] rounded-lg" />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(20rem,1fr)]">
          <div className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 py-1.5">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-5 flex-1 rounded-lg" style={{ maxWidth: `${70 - i * 8}%` }} />
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-5 max-lg:hidden">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        </div>
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-8 flex justify-center">{status}</div>
    </div>
  );
}
