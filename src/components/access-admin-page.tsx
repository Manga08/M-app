"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Clock3, KeyRound, LoaderCircle, MailPlus, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";

export type AccessRole = "admin" | "member";
export type AuthorizedUser = { email: string; role: AccessRole; enabled: boolean; createdAt: string; hasSignedIn: boolean };
type PendingAccessChange = { user: AuthorizedUser; nextRole: AccessRole; enabled: boolean };

export type AccessChangeConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
};

export function getAccessChangeConfirmation(user: AuthorizedUser, nextRole: AccessRole, enabled: boolean): AccessChangeConfirmation {
  if (user.enabled && !enabled) {
    return {
      title: `¿Revocar el acceso de ${user.email}?`,
      description: "Este correo dejará de superar la lista privada y no podrá volver a entrar con Google. Sus datos financieros existentes no se borrarán.",
      confirmLabel: "Revocar acceso",
      destructive: true,
    };
  }

  if (nextRole === "admin") {
    return {
      title: `¿Convertir a ${user.email} en administrador?`,
      description: user.enabled
        ? "Podrá ver y gestionar esta lista: autorizar correos, cambiar roles y revocar accesos. Esto no le da acceso a los datos financieros de otras personas."
        : "El rol quedará preparado para cuando reactives este correo. Entonces podrá gestionar la lista de acceso, pero no verá los datos financieros de otras personas.",
      confirmLabel: "Dar rol de administrador",
      destructive: false,
    };
  }

  return {
    title: `¿Cambiar a ${user.email} a miembro?`,
    description: user.enabled
      ? "Dejará de administrar la lista de acceso. Mantendrá su entrada a Moneva y seguirá viendo únicamente su propio espacio financiero."
      : "El rol de miembro se aplicará cuando reactives este correo. No podrá administrar la lista de acceso.",
    confirmLabel: "Cambiar a miembro",
    destructive: user.role === "admin",
  };
}

export function AccessAdminPage({ initialUsers, initialError = null }: { initialUsers: AuthorizedUser[]; initialError?: string | null }) {
  const { profile } = useFinance();
  const [rows, setRows] = useState<AuthorizedUser[]>(initialUsers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccessRole>("member");
  const [loading, setLoading] = useState(false);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [announcement, setAnnouncement] = useState("");
  const [pendingChange, setPendingChange] = useState<PendingAccessChange | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const client = createClient();
    if (!client) {
      setError("No pudimos conectar con el servicio de acceso.");
      setLoading(false);
      return;
    }
    try {
      const { data, error: loadError } = await client.rpc("list_authorized_users");
      if (loadError) setError(loadError.message);
      else {
        setRows(Array.isArray(data) ? data as AuthorizedUser[] : []);
        setError(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pudimos cargar la lista de acceso.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function save(targetEmail: string, nextRole: AccessRole, enabled: boolean) {
    const client = createClient();
    if (!client) {
      const message = "No pudimos conectar con el servicio de acceso.";
      setAnnouncement(message);
      toast.error(message);
      return false;
    }

    setSavingEmail(targetEmail);
    setAnnouncement(`Guardando cambios para ${targetEmail}.`);
    try {
      const { error: saveError } = await client.rpc("upsert_authorized_user", {
        p_email: targetEmail,
        p_access_role: nextRole,
        p_enabled: enabled,
      });
      if (saveError) {
        const message = friendlyAccessError(saveError.message);
        setAnnouncement(message);
        toast.error(message);
        return false;
      }

      await load();
      setAnnouncement(`Cambios guardados para ${targetEmail}.`);
      return true;
    } catch (saveError) {
      const message = friendlyAccessError(saveError instanceof Error ? saveError.message : "No pudimos guardar el cambio de acceso.");
      setAnnouncement(message);
      toast.error(message);
      return false;
    } finally {
      setSavingEmail(null);
    }
  }

  async function addAuthorizedUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error("Escribe un correo válido.");
      return;
    }
    if (await save(cleanEmail, role, true)) {
      setEmail("");
      setRole("member");
      toast.success("Correo autorizado");
    }
  }

  function requestRoleChange(user: AuthorizedUser, nextRole: AccessRole) {
    if (nextRole === user.role) return;
    setPendingChange({ user, nextRole, enabled: user.enabled });
  }

  async function requestAccessChange(user: AuthorizedUser, enabled: boolean) {
    if (!enabled) {
      setPendingChange({ user, nextRole: user.role, enabled: false });
      return;
    }
    if (await save(user.email, user.role, true)) toast.success("Acceso reactivado");
  }

  async function confirmPendingChange() {
    if (!pendingChange) return;
    const { user, nextRole, enabled } = pendingChange;
    if (!await save(user.email, nextRole, enabled)) return;
    setPendingChange(null);
    toast.success(!enabled ? "Acceso revocado" : nextRole === "admin" ? "Rol de administrador asignado" : "Rol actualizado");
  }

  const pendingBusy = Boolean(pendingChange && savingEmail === pendingChange.user.email);
  const confirmation = pendingChange ? getAccessChangeConfirmation(pendingChange.user, pendingChange.nextRole, pendingChange.enabled) : null;

  return <>
    <PageHeader eyebrow="Solo administradores" title="Acceso privado" description="Decide qué correos de Google pueden entrar y quién puede administrar esta instalación de Moneva." />
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

    <section className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-16">
      <div className="min-w-0">
        <form onSubmit={addAuthorizedUser} className="grid gap-4 border-y py-6 sm:grid-cols-[minmax(220px,1fr)_180px_auto] sm:items-end" aria-describedby="new-access-impact">
          <div>
            <Label htmlFor="authorized-email">Correo de Google</Label>
            <Input id="authorized-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} className="mt-2 h-[52px] rounded-[14px] sm:h-11" placeholder="persona@gmail.com" required />
          </div>
          <div>
            <Label htmlFor="authorized-role">Permiso inicial</Label>
            <SelectControl id="authorized-role" value={role} onValueChange={(value) => setRole(value as AccessRole)} containerClassName="mt-2 sm:h-11">
              <option value="member">Miembro</option>
              <option value="admin">Administrador</option>
            </SelectControl>
          </div>
          <Button type="submit" className="h-[52px] rounded-full sm:h-11" disabled={Boolean(savingEmail)} aria-busy={Boolean(savingEmail)}>
            {savingEmail ? <LoaderCircle className="size-4 animate-spin" /> : <MailPlus className="size-4" />}
            {savingEmail ? "Guardando…" : "Autorizar"}
          </Button>
          <p id="new-access-impact" className="text-xs leading-5 text-muted-foreground sm:col-span-3">Un miembro solo accede a sus finanzas. Un administrador también puede gestionar esta lista de correos.</p>
        </form>

        <section className="mt-8" aria-labelledby="authorized-users-title">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id="authorized-users-title" className="text-xl font-medium tracking-tight">Personas autorizadas</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Revisa el impacto antes de cambiar un rol o revocar un acceso.</p>
            </div>
            <Badge variant="secondary" aria-label={`${rows.filter((row) => row.enabled).length} personas con acceso activo`}>{rows.filter((row) => row.enabled).length} activas</Badge>
          </div>

          {loading ? <div className="grid min-h-48 place-items-center text-muted-foreground" role="status" aria-label="Cargando personas autorizadas"><LoaderCircle className="size-5 animate-spin" /></div> : null}
          {error ? <div role="alert" className="border-y py-12 text-center"><p className="text-sm text-destructive">{friendlyAccessError(error)}</p><Button variant="outline" className="mt-4 min-h-11 rounded-full" onClick={() => { setLoading(true); setError(null); void load(); }}>Reintentar</Button></div> : null}
          {!loading && !error && !rows.length ? <div className="border-y py-12 text-center" role="status"><p className="text-sm font-medium">No hay correos autorizados para mostrar</p><p className="mt-1 text-xs text-muted-foreground">Autoriza el primer correo con el formulario anterior.</p></div> : null}
          {!loading && !error && rows.length ? <ul className="divide-y border-y" aria-busy={Boolean(savingEmail)}>{rows.map((row) => {
            const isSelf = row.email === profile?.email?.toLowerCase();
            const busy = savingEmail === row.email;
            return <li key={row.email} className="grid min-h-24 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-4 md:grid-cols-[minmax(0,1fr)_180px_140px]">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{row.email}</p>{isSelf ? <Badge variant="outline">Tú</Badge> : null}</div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{row.hasSignedIn ? <><CheckCircle2 className="size-3.5 text-positive" aria-hidden="true" />Ya inició sesión</> : <><Clock3 className="size-3.5" aria-hidden="true" />Invitación pendiente</>}</p>
              </div>

              <div className="col-span-2 row-start-2 md:col-span-1 md:row-auto">
                <Label htmlFor={`role-${row.email}`} className="sr-only">Rol de {row.email}</Label>
                <SelectControl id={`role-${row.email}`} value={row.role} disabled={busy || isSelf} aria-label={`Rol de ${row.email}`} onValueChange={(value) => requestRoleChange(row, value as AccessRole)} containerClassName="md:h-11">
                  <option value="member">Miembro</option>
                  <option value="admin">Administrador</option>
                </SelectControl>
              </div>

              <div className="col-start-2 row-start-1 flex min-h-11 items-center justify-end gap-2 md:col-auto md:row-auto">
                <span className="text-xs text-muted-foreground">{row.enabled ? "Activo" : "Revocado"}</span>
                {busy ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
                <Switch checked={row.enabled} disabled={isSelf || busy} onCheckedChange={(enabled) => void requestAccessChange(row, enabled)} aria-label={`${row.enabled ? "Revocar" : "Activar"} acceso de ${row.email}${isSelf ? "; no puedes cambiar tu propia cuenta" : ""}`} />
              </div>
            </li>;
          })}</ul> : null}
        </section>
      </div>

      <aside aria-labelledby="access-protections-title">
        <h2 id="access-protections-title" className="mb-3 text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">Cómo se protege el acceso</h2>
        <ul className="divide-y border-y xl:border-t-0">
          <SecurityNote icon={KeyRound} title="Google solamente" text="Se acepta una identidad confirmada de Google; Moneva no crea ni almacena contraseñas propias." />
          <SecurityNote icon={UserRound} title="Datos separados" text="Cada consulta valida al usuario autenticado y las reglas RLS impiden leer o modificar filas de otra persona." />
          <SecurityNote icon={ShieldCheck} title="Administración protegida" text="Solo un administrador activo puede cambiar esta lista y el sistema exige conservar al menos uno." />
        </ul>
      </aside>
    </section>

    <AlertDialog open={Boolean(pendingChange)} onOpenChange={(open) => { if (!open && !pendingBusy) setPendingChange(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className={confirmation?.destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}><ShieldAlert /></AlertDialogMedia>
          <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendingBusy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmation?.destructive ? "destructive" : "default"}
            disabled={pendingBusy}
            aria-busy={pendingBusy}
            onClick={(event) => { event.preventDefault(); void confirmPendingChange(); }}
          >
            {pendingBusy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {pendingBusy ? "Guardando…" : confirmation?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

function SecurityNote({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return <li className="py-5"><span className="grid size-10 place-items-center rounded-full bg-primary/12 text-primary"><Icon className="size-[18px]" aria-hidden="true" /></span><p className="mt-4 text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></li>;
}

function friendlyAccessError(message: string) {
  if (message.includes("current administrator")) return "No puedes revocar ni bajar el rol de tu propia cuenta.";
  if (message.includes("at least one")) return "Debe quedar al menos un administrador activo.";
  if (message.includes("administrator access")) return "Tu sesión ya no tiene permiso de administrador.";
  return message;
}
