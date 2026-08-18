"use client";

import { useState } from "react";
import { AtSign, Check, Globe2, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
            <div><Label htmlFor="profile-email">Correo</Label><div className="relative mt-2"><AtSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="profile-email" value={profile.email} readOnly className="h-11 bg-secondary/45 pl-9 text-muted-foreground" /></div><p className="mt-2 text-xs text-muted-foreground">Para cambiarlo debes usar otra identidad de Google.</p></div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 border-b py-10 md:grid-cols-[220px_minmax(0,1fr)]">
        <div><h2 className="text-lg font-medium">Región</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Ajusta formatos, zona horaria y el inicio de tus periodos.</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField label="Moneda" value={form.currencyCode} onChange={(value) => setForm({ ...form, currencyCode: value })} options={currencies} />
          <SelectField label="Zona horaria" value={form.timezone} onChange={(value) => setForm({ ...form, timezone: value })} options={timezones.map((value) => ({ value, label: value.replaceAll("_", " ") }))} icon={<Globe2 className="size-4" />} />
          <SelectField label="La semana comienza" value={String(form.weekStartsOn)} onChange={(value) => setForm({ ...form, weekStartsOn: Number(value) })} options={[{ value: "1", label: "Lunes" }, { value: "0", label: "Domingo" }]} />
          <div><Label htmlFor="month-start">Día de inicio del mes</Label><Input id="month-start" type="number" min={1} max={28} value={form.monthStartsOn} onChange={(event) => setForm({ ...form, monthStartsOn: Math.min(28, Math.max(1, Number(event.target.value))) })} className="mt-2 h-11" /><p className="mt-2 text-xs text-muted-foreground">Entre 1 y 28 para que exista en todos los meses.</p></div>
        </div>
      </section>

      <div className="sticky bottom-20 flex justify-end gap-3 bg-background py-5 lg:bottom-0">
        {changed ? <p className="mr-auto self-center text-xs text-muted-foreground">Tienes cambios sin guardar</p> : <p className="mr-auto flex items-center gap-1.5 self-center text-xs text-muted-foreground"><Check className="size-3.5 text-primary" />Todo está al día</p>}
        <Button type="submit" disabled={!changed || saving} className="min-w-36 rounded-full">{saving ? "Guardando…" : "Guardar cambios"}</Button>
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
  return <div><Label htmlFor={id}>{label}</Label><div className="relative mt-2">{icon ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span> : null}<select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={`h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${icon ? "pl-9" : ""}`}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></div>;
}
