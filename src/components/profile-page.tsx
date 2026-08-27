"use client";

import { useRef, useState } from "react";
import { AtSign, BadgeDollarSign, Check, Globe2, ShieldCheck, UserRound } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { InputControl, SelectControl } from "@/components/ui/form-control";
import { Label } from "@/components/ui/label";
import { announceMutation } from "@/lib/finance/mutation-feedback";
import type { FinanceMutationResult } from "@/lib/finance/mutation-result";
import type { FinanceProfile, ProfileInput } from "@/lib/finance/types";

const timezones = [
  "America/Bogota",
  "America/Mexico_City",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "Europe/Madrid",
] as const;

export function ProfilePage() {
  const { profile, mutate } = useFinance();
  if (!profile) return <div className="py-24 text-center text-sm text-muted-foreground">Preparando tu perfil…</div>;
  return <ProfileForm key={JSON.stringify(profile)} profile={profile} updateProfile={mutate.updateProfile} />;
}

function ProfileForm({ profile, updateProfile }: { profile: FinanceProfile; updateProfile: (input: ProfileInput) => Promise<FinanceMutationResult> }) {
  const [form, setForm] = useState<ProfileInput>(() => profileInput(profile));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const changed = JSON.stringify(form) !== JSON.stringify(profileInput(profile));
  const initials = profile.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (form.displayName.trim().length < 2) {
      setFormError("Escribe un nombre de al menos 2 caracteres.");
      nameRef.current?.focus();
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const result = await updateProfile({ ...form, displayName: form.displayName.trim() });
      announceMutation(result, "Perfil actualizado");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No pudimos guardar el perfil.");
    } finally {
      setSaving(false);
    }
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
            <div><Label htmlFor="profile-name">Nombre visible</Label><InputControl ref={nameRef} id="profile-name" value={form.displayName} onChange={(event) => { setForm({ ...form, displayName: event.target.value }); setFormError(null); }} minLength={2} maxLength={80} autoComplete="name" aria-invalid={Boolean(formError && form.displayName.trim().length < 2)} aria-describedby={formError ? "profile-form-error" : undefined} containerClassName="mt-2" /></div>
            <div><Label htmlFor="profile-email">Correo</Label><InputControl id="profile-email" value={profile.email} readOnly leading={<AtSign />} containerClassName="mt-2 bg-secondary/45" className="text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Para cambiarlo debes usar otra identidad de Google.</p></div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 border-b py-10 md:grid-cols-[220px_minmax(0,1fr)]">
        <div><h2 className="text-lg font-medium">Región</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Define cómo se muestran el dinero y las fechas actuales.</p></div>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <div><Label htmlFor="profile-reporting-currency">Moneda contable</Label><InputControl id="profile-reporting-currency" value="Peso colombiano (COP)" readOnly leading={<BadgeDollarSign className="size-4" />} containerClassName="mt-2 bg-secondary/45" className="text-muted-foreground" /><p className="mt-2 text-xs leading-5 text-muted-foreground">Reportes y presupuestos usan COP. Cada cuenta puede conservar su saldo exacto en COP o USD.</p></div>
          <SelectField label="Zona horaria" value={form.timezone} onChange={(value) => setForm({ ...form, timezone: value })} options={timezones.map((value) => ({ value, label: value.replaceAll("_", " ") }))} icon={<Globe2 className="size-4" />} />
        </div>
      </section>

      {formError ? <p id="profile-form-error" role="alert" className="mt-5 rounded-xl border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm text-destructive">{formError}</p> : null}

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
    customThemeColor: profile.customThemeColor,
  };
}

function SelectField({ label, value, onChange, options, icon }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<{ value: string; label: string }>; icon?: React.ReactNode }) {
  const id = `profile-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <div className="min-w-0"><Label htmlFor={id}>{label}</Label><SelectControl id={id} value={value} onValueChange={onChange} leading={icon} containerClassName="mt-2">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectControl></div>;
}
