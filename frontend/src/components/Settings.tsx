import { useState } from "react";
import { Download, KeyRound, Loader2, LogOut, Plus, Trash2, Upload } from "lucide-react";
import type { AreaColor, Settings as S, Workspace } from "@/lib/types";
import { NONE, WhatsAppNumber } from "./calendar/AlertPicker";
import { ALERT_PRESETS } from "@/lib/events";
import { downloadBackup, parseBackup } from "@/lib/backup";
import { cloudEnabled, supabase } from "@/lib/supabase";
import { deleteAllMyData, signOut, useSync } from "@/lib/sync";
import { addArea, deleteArea, exampleData, notify, removeExamples, replaceWorkspace, toast, updateArea, useStore } from "@/store";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
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

export function Settings() {
  const ws = useStore((s) => s.ws);
  const setUi = useStore((s) => s.setUi);
  const mut = useStore((s) => s.mut);
  const st = ws.settings;
  const set = <K extends keyof S>(k: K, v: S[K]) =>
    mut((w) => {
      w.settings[k] = v;
    });
  const close = () =>
    setUi((u) => {
      u.modal = null;
    });
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>Ajuste o site do seu jeito.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="geral" className="gap-5">
          <TabsList className="w-full">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="aparencia">Aparência</TabsTrigger>
            <TabsTrigger value="areas">Áreas</TabsTrigger>
            <TabsTrigger value="alertas">Alertas</TabsTrigger>
            <TabsTrigger value="conta">Conta</TabsTrigger>
          </TabsList>

          <TabsContent value="geral">
            <FieldGroup>
              <NameField value={st.name} onSave={(v) => set("name", v)} />
              <p className="text-sm text-muted-foreground">Tema, cores e papel de parede ficam em Aparência.</p>
              <ExamplesField />
            </FieldGroup>
          </TabsContent>

          <TabsContent value="aparencia">
            <AppearanceTab />
          </TabsContent>

          <TabsContent value="areas">
            <AreasTab />
          </TabsContent>

          <TabsContent value="alertas">
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="set-email">Avisos de eventos e tarefas</FieldLabel>
                  <FieldDescription>
                    {cloudEnabled
                      ? "Chegam no e-mail da sua conta ou no WhatsApp, conforme você escolher em cada evento ou tarefa."
                      : "Precisa de uma conta. Com o site salvando só neste navegador, nenhum aviso é enviado."}
                  </FieldDescription>
                </FieldContent>
                <Switch id="set-email" checked={st.emailAlerts} onCheckedChange={(v) => set("emailAlerts", v)} />
              </Field>
              <FieldSeparator />
              <Field>
                <FieldLabel>Número do WhatsApp</FieldLabel>
                <FieldDescription>Usado nos avisos marcados como WhatsApp.</FieldDescription>
                <WhatsAppNumber phone={st.whatsapp} />
              </Field>
              <FieldSeparator />
              <FieldSet>
                <FieldLegend variant="label">Alarme já marcado em eventos novos</FieldLegend>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  spacing={2}
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
                  <ToggleGroupItem value={NONE} className="px-2.5">
                    Sem alarme
                  </ToggleGroupItem>
                  {ALERT_PRESETS.map((p) => (
                    <ToggleGroupItem key={p.minutes} value={String(p.minutes)} className="px-2.5">
                      {p.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            </FieldGroup>
          </TabsContent>

          <TabsContent value="conta">
            <AccountTab onClose={close} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

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

function AccountTab({ onClose }: { onClose: () => void }) {
  const user = useSync((s) => s.user);
  const [pending, setPending] = useState<Workspace | null>(null);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState("");
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
    <FieldGroup>
      {cloudEnabled ? (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel>Conta</FieldLabel>
            <FieldDescription>
              Conectado como <b className="text-foreground">{user?.email}</b>. Seus dados ficam salvos na nuvem.
            </FieldDescription>
          </FieldContent>
          <Button
            variant="outline"
            onClick={() =>
              signOut().catch((e: Error) => notify(e.message, { label: "Sair e descartar", onClick: () => void signOut(true) }))
            }
          >
            <LogOut data-icon="inline-start" />
            Sair
          </Button>
        </Field>
      ) : (
        <Alert>
          <AlertTitle>Sem conta</AlertTitle>
          <AlertDescription>Seus dados ficam salvos apenas neste navegador. Baixe um backup de vez em quando.</AlertDescription>
        </Alert>
      )}
      {cloudEnabled && user && (
        <>
          <FieldSeparator />
          <ChangePassword email={user.email} />
        </>
      )}
      <FieldSeparator />
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
              {pending.pages.length} páginas e {Object.keys(pending.items).length} tarefas. O que está no site agora será trocado.
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    replaceWorkspace(pending);
                    setPending(null);
                    onClose();
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
              Apaga para sempre tudo o que está na nuvem e sai da conta. Digite APAGAR para confirmar.
            </FieldDescription>
            <div className="flex gap-2">
              <Input id="erase" className="max-w-40" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <Button
                variant="destructive"
                disabled={confirm.trim().toUpperCase() !== "APAGAR"}
                onClick={() => deleteAllMyData().catch((e: Error) => setErr(e.message))}
              >
                Apagar tudo
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
  );
}
