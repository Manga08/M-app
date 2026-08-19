"use client";

import { useState } from "react";
import { AtSign, Check, Globe2, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { InputControl, SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FinanceProfile, ProfileInput } from "@/lib/finance/types";

const currencies = [
  { value: "COP", label: "Peso colombiano (COP)" },
  { value: "USD", label: "Dólar estadounidense (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "MXN", label: "Peso mexicano (MXN)" },
] as const;

const timezones = [
  "America/Bogota",
  "America/Mexico_City",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "Europe/Madrid",
] as const;

export function ProfilePage() {
  const { profile, updateProfile } = useFinance();
  if (!profile) return <div className="py-24 text-center text-sm text-muted-foreground">Preparando tu perfil…</div>;
  return <ProfileForm key={JSON.stringify(profile)} profile={profile} updateProfile={updateProfile} />;
}

function ProfileForm({ profile, updateProfile }: { profile: FinanceProfile; updateProfile: (input: ProfileInput) => Promise<void> }) {
  const [form, setForm] = useState<ProfileInput>(() => profileInput(profile));
  const [saving, setSaving] = useState(false);

  const changed = JSON.stringify(form) !== JSON.stringify(profileInput(profile));
  const initials = profile.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (form.displayName.trim().length < 2) {
      toast.error("Escribe un nombre de al menos 2 caracteres.");
      return;
    }
    setSaving(true);
    await updateProfile({ ...form, displayName: form.displayName.trim() });
    setSaving(false);
    toast.success("Perfil actualizado");
  }

  return <>
    <PageHeader eyebrow="Identidad y preferencias" title="Tu perfil" description="La información que identifica tu espacio y define cómo Moneva interpreta fechas y dinero." />
    <form onSubmit={save} className="mx-auto max-w-4xl">
      <section className="grid gap-8 border-b pb-10 md:grid-cols-[220px_minmax(0,1fr)]">
        <div><h2 className="text-lg font-medium">Identidad</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Tu nombre sí se puede personalizar. El correo y la foto provienen de la cuenta de Google utilizada para entrar.</p></div>
        <div>
          <div className="mb-7 flex items-center gap-4">
            <Avatar className="size-16 border"><AvatarImage src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" /><AvatarFallback className="bg-primary/12 text-primary">{initials || <UserRound className="size-5" />}</AvatarFallback></Avatar>
            <div><p className="font-medium">{profile.displayName}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-primary" />Identidad verificada con Google</p></div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div><Label htmlFor="profile-name">Nombre visible</Label><Input id="profile-name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} minLength={2} maxLength={80} autoComplete="name" className="mt-2 h-11" /></div>
            <div><Label htmlFor="profile-email">Correo</Label><InputControl id="profile-email" value={profile.email} readOnly leading={<AtSign />} containerClassName="mt-2 bg-secondary/45" className="text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Para cambiarlo debes usar otra identidad de Google.</p></div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 border-b py-10 md:grid-cols-[220px_minmax(0,1fr)]">
        <div><h2 className="text-lg font-medium">Región</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Ajusta formatos, zona horaria y el inicio de tus periodos.</p></div>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <SelectField label="Moneda" value={form.currencyCode} onChange={(value) => setForm({ ...form, currencyCode: value })} options={currencies} />
          <SelectField label="Zona horaria" value={form.timezone} onChange={(value) => setForm({ ...form, timezone: value })} options={timezones.map((value) => ({ value, label: value.replaceAll("_", " ") }))} icon={<Globe2 className="size-4" />} />
          <SelectField label="La semana comienza" value={String(form.weekStartsOn)} onChange={(value) => setForm({ ...form, weekStartsOn: Number(value) })} options={[{ value: "1", label: "Lunes" }, { value: "0", label: "Domingo" }]} />
          <div className="min-w-0"><Label htmlFor="month-start">Día de inicio del mes</Label><Input id="month-start" type="number" min={1} max={28} value={form.monthStartsOn} onChange={(event) => setForm({ ...form, monthStartsOn: Math.min(28, Math.max(1, Number(event.target.value))) })} className="mt-2 h-11" /><p className="mt-2 text-xs text-muted-foreground">Entre 1 y 28 para que exista en todos los meses.</p></div>
        </div>
      </section>

      <div className="sticky bottom-20 flex flex-col justify-end gap-2 border-t bg-background py-4 min-[360px]:flex-row min-[360px]:items-center min-[360px]:gap-3 lg:bottom-0">
        {changed ? <p className="mr-auto hidden self-center text-xs text-muted-foreground min-[360px]:block">Tienes cambios sin guardar</p> : <p className="mr-auto hidden items-center gap-1.5 self-center text-xs text-muted-foreground min-[360px]:flex"><Check className="size-3.5 text-primary" />Todo está al día</p>}
        <Button type="submit" disabled={!changed || saving} className="h-12 w-full rounded-2xl min-[360px]:h-11 min-[360px]:w-auto min-[360px]:min-w-36 min-[360px]:rounded-full">{saving ? "Guardando…" : "Guardar cambios"}</Button>
      </div>
    </form>
  </>;
}

function profileInput(profile: FinanceProfile): ProfileInput {
  return {
    displayName: profile.displayName,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
    weekStartsOn: profile.weekStartsOn,
    monthStartsOn: profile.monthStartsOn,
    themeMode: profile.themeMode,
    colorTheme: profile.colorTheme,
  };
}

function SelectField({ label, value, onChange, options, icon }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<{ value: string; label: string }>; icon?: React.ReactNode }) {
  const id = `profile-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <div className="min-w-0"><Label htmlFor={id}>{label}</Label><SelectControl id={id} value={value} onChange={(event) => onChange(event.target.value)} leading={icon} containerClassName="mt-2">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectControl></div>;
}
