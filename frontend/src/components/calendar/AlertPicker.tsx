import { useState } from "react";
import { BellOff, BellRing, Mail, MessageCircle, Plus, X } from "lucide-react";
import type { AlertChannel } from "@/lib/types";
import { formatPhone, normalizePhone } from "@/lib/util";
import { ALERT_PRESETS, alertLabel } from "@/lib/events";
import { cloudEnabled } from "@/lib/supabase";
import { celebrate, useStore } from "@/store";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The "Sem alarme" choice (no times picked): the default, so nothing is sent unless chosen. */
export const NONE = "none";

/** "Alarme": when to warn (presets plus custom, in minutes before the start) and where (e-mail or WhatsApp). Used by events and tasks. */
export function AlertPicker({
  value,
  onChange,
  channel = "email",
  onChannelChange,
  allDay,
  what = "evento",
}: {
  value: number[];
  onChange: (v: number[]) => void;
  channel?: AlertChannel;
  onChannelChange?: (c: AlertChannel) => void;
  allDay: boolean;
  what?: string;
}) {
  const emailAlerts = useStore((s) => s.ws.settings.emailAlerts);
  const phone = useStore((s) => s.ws.settings.whatsapp);
  const presets = ALERT_PRESETS.map((p) => String(p.minutes));
  const custom = value.filter((m) => !ALERT_PRESETS.some((p) => p.minutes === m));
  const hint = !cloudEnabled
    ? "Os avisos precisam de uma conta. Você pode escolher agora; eles começam a valer quando você entrar."
    : !emailAlerts
      ? "Os avisos estão desligados nas Configurações."
      : allDay
        ? `Sem horário definido, o aviso usa 9:00 do dia como referência.`
        : "Você pode escolher mais de um horário.";
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <FieldSet className="gap-3">
        <FieldLegend variant="label" className="flex items-center gap-1.5">
          <BellRing className="size-4" aria-hidden="true" />
          Alarme
        </FieldLegend>
        <FieldDescription>{hint}</FieldDescription>
        {onChannelChange && value.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Receber em</span>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={2}
              aria-label="Onde receber o aviso"
              value={channel}
              onValueChange={(v) => v && onChannelChange(v as AlertChannel)}
            >
              <ToggleGroupItem value="email" className="gap-2 px-3.5">
                <Mail aria-hidden="true" />
                E-mail
              </ToggleGroupItem>
              <ToggleGroupItem
                value="whatsapp"
                className="gap-2 px-3.5 data-[state=on]:border-[#25D366] data-[state=on]:bg-[#25D366]/12"
              >
                <MessageCircle aria-hidden="true" />
                WhatsApp
              </ToggleGroupItem>
            </ToggleGroup>
            {channel === "whatsapp" && <WhatsAppNumber phone={phone} />}
          </div>
        )}
        <span className="text-sm font-medium">Quando</span>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          spacing={2}
          className="flex-wrap"
          aria-label={`Quando avisar sobre este ${what}`}
          value={value.length ? value.map(String).filter((v) => presets.includes(v)) : [NONE]}
          onValueChange={(v) =>
            // "Sem alarme" clears the rest; picking a time takes "Sem alarme" away.
            v.includes(NONE) && value.length
              ? onChange([])
              : onChange([...v.filter((x) => x !== NONE).map(Number), ...custom].sort((a, b) => a - b))
          }
        >
          <ToggleGroupItem value={NONE} className="px-2.5">
            <BellOff aria-hidden="true" />
            Sem alarme
          </ToggleGroupItem>
          {ALERT_PRESETS.map((p) => (
            <ToggleGroupItem key={p.minutes} value={String(p.minutes)} className="px-2.5">
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex flex-wrap items-center gap-2">
          {custom.map((m) => (
            <Badge key={m} variant="secondary" className="gap-1 pr-1">
              {alertLabel(m)}
              <button
                type="button"
                aria-label={`Tirar ${alertLabel(m)}`}
                className="rounded-full p-0.5 hover:bg-background"
                onClick={() => onChange(value.filter((x) => x !== m))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <CustomAlert what={what} onAdd={(m) => onChange([...new Set([...value, m])].sort((a, b) => a - b))} />
        </div>
      </FieldSet>
    </div>
  );
}

/** The number WhatsApp alerts go to (one for the whole account), asked for the first time it's needed. */
export function WhatsAppNumber({ phone }: { phone?: string }) {
  const [editing, setEditing] = useState(!phone);
  const [v, setV] = useState(phone ? formatPhone(phone) : "");
  const [bad, setBad] = useState(false);
  const save = () => {
    const n = normalizePhone(v);
    if (!n) return setBad(true);
    useStore.getState().mut((w) => {
      w.settings.whatsapp = n;
    });
    setBad(false);
    setEditing(false);
    celebrate("WhatsApp salvo", `Os avisos vão para ${formatPhone(n)}`, "💬");
  };
  if (!editing && phone)
    return (
      <p className="text-sm text-muted-foreground">
        Vai para <b className="font-medium text-foreground tabular-nums">{formatPhone(phone)}</b>.{" "}
        <button type="button" className="text-primary-strong underline-offset-4 hover:underline" onClick={() => setEditing(true)}>
          Trocar número
        </button>
      </p>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          aria-label="Seu número de WhatsApp"
          aria-invalid={bad || undefined}
          placeholder="(11) 98765-4321"
          value={v}
          onChange={(e) => {
            setV(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
        />
        <Button type="button" onClick={save}>
          Salvar
        </Button>
      </div>
      <p className={bad ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {bad ? "Confira o número: DDD e celular, ou +código do país." : "Com DDD. De outro país, comece com + e o código."}
      </p>
    </div>
  );
}

function CustomAlert({ onAdd, what }: { onAdd: (minutes: number) => void; what: string }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState("2");
  const [unit, setUnit] = useState("60");
  const add = () => {
    const v = Math.round(Number(n));
    if (v > 0) {
      onAdd(v * Number(unit));
      setOpen(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Plus data-icon="inline-start" />
          Personalizado
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-3" align="start">
        <span className="text-sm font-medium">Avisar antes do {what}</span>
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label="Quantidade"
            className="w-20"
            value={n}
            onChange={(e) => setN(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger aria-label="Unidade" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="1">minutos</SelectItem>
                <SelectItem value="60">horas</SelectItem>
                <SelectItem value="1440">dias</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={add}>
          Adicionar alerta
        </Button>
      </PopoverContent>
    </Popover>
  );
}
