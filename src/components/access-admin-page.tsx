"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, MailPlus, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";

type AccessRole = "admin" | "member";
export type AuthorizedUser = { email: string; role: AccessRole; enabled: boolean; createdAt: string; hasSignedIn: boolean };

export function AccessAdminPage({ initialUsers, initialError = null }: { initialUsers: AuthorizedUser[]; initialError?: string | null }) {
  const { profile } = useFinance();
  const [rows, setRows] = useState<AuthorizedUser[]>(initialUsers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccessRole>("member");
  const [loading, setLoading] = useState(false);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  const load = useCallback(async () => {
    const client = createClient();
    if (!client) return;
    const { data, error: loadError } = await client.rpc("list_authorized_users");
    if (loadError) setError(loadError.message);
    else setRows(Array.isArray(data) ? data as AuthorizedUser[] : []);
    setLoading(false);
  }, []);

  async function save(targetEmail: string, nextRole: AccessRole, enabled: boolean) {
    const client = createClient();
    if (!client) return false;
    setSavingEmail(targetEmail);
    const { error: saveError } = await client.rpc("upsert_authorized_user", { p_email: targetEmail, p_access_role: nextRole, p_enabled: enabled });
    setSavingEmail(null);
    if (saveError) {
      toast.error(friendlyAccessError(saveError.message));
      return false;
    }
    await load();
    return true;
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

  return <>
    <PageHeader eyebrow="Solo administradores" title="Acceso privado" description="Esta lista es la puerta de entrada a Moneva. Autenticar con Google no basta: el correo también debe estar activo aquí." />
    <section className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-16">
      <div>
        <form onSubmit={addAuthorizedUser} className="grid gap-4 border-y py-6 sm:grid-cols-[minmax(220px,1fr)_160px_auto] sm:items-end">
          <div><Label htmlFor="authorized-email">Correo de Google</Label><Input id="authorized-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} className="mt-2 h-11" placeholder="persona@gmail.com" required /></div>
          <div><Label htmlFor="authorized-role">Permiso</Label><SelectControl id="authorized-role" value={role} onChange={(event) => setRole(event.target.value as AccessRole)} containerClassName="mt-2"><option value="member">Miembro</option><option value="admin">Administrador</option></SelectControl></div>
          <Button type="submit" className="h-11 rounded-full" disabled={Boolean(savingEmail)}>{savingEmail ? <LoaderCircle className="size-4 animate-spin" /> : <MailPlus className="size-4" />}Autorizar</Button>
        </form>

        <div className="mt-7"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-medium">Personas autorizadas</h2><p className="mt-1 text-xs text-muted-foreground">Los cambios se aplican inmediatamente, incluso a sesiones que ya estaban abiertas.</p></div><Badge variant="secondary">{rows.filter((row) => row.enabled).length} activas</Badge></div>
          {loading ? <div className="grid min-h-48 place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /></div> : null}
          {error ? <div role="alert" className="border-y py-12 text-center"><p className="text-sm text-destructive">{error}</p><Button variant="outline" className="mt-4 rounded-full" onClick={() => { setLoading(true); setError(null); void load(); }}>Reintentar</Button></div> : null}
          {!loading && !error ? <div>{rows.map((row) => {
            const isSelf = row.email === profile?.email?.toLowerCase();
            const busy = savingEmail === row.email;
            return <div key={row.email} className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b py-4 md:grid-cols-[minmax(0,1fr)_150px_110px]">
              <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{row.email}</p>{isSelf ? <Badge variant="outline">Tú</Badge> : null}</div><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{row.hasSignedIn ? <><CheckCircle2 className="size-3.5 text-emerald-500" />Ya inició sesión</> : <>Invitación pendiente</>}</p></div>
              <SelectControl value={row.role} disabled={busy || isSelf} aria-label={`Rol de ${row.email}`} onChange={(event) => void save(row.email, event.target.value as AccessRole, row.enabled)} containerClassName="col-span-2 row-start-2 md:hidden"><option value="member">Miembro</option><option value="admin">Administrador</option></SelectControl>
              <select value={row.role} disabled={busy || isSelf} aria-label={`Rol de ${row.email}`} onChange={(event) => void save(row.email, event.target.value as AccessRole, row.enabled)} className="hidden h-9 rounded-lg border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55 md:block"><option value="member">Miembro</option><option value="admin">Administrador</option></select>
              <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 md:col-auto md:row-auto"><span className="text-xs text-muted-foreground">{row.enabled ? "Activo" : "Revocado"}</span>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Switch checked={row.enabled} disabled={isSelf} onCheckedChange={(enabled) => void save(row.email, row.role, enabled)} aria-label={`${row.enabled ? "Revocar" : "Activar"} acceso de ${row.email}`} />}</div>
            </div>;
          })}</div> : null}
        </div>
      </div>

      <aside className="space-y-5"><SecurityNote icon={KeyRound} title="Google solamente" text="Se acepta una identidad confirmada de Google; no se usan ni almacenan contraseñas de Moneva." /><SecurityNote icon={UserRound} title="Datos separados" text="Cada tabla combina lista privada, usuario autenticado y RLS. Un miembro no puede consultar ni modificar filas de otra persona." /><SecurityNote icon={ShieldCheck} title="Administración protegida" text="La lista vive en un esquema privado. Solo un administrador activo puede verla o cambiarla, y nunca puede eliminar al último administrador." /></aside>
    </section>
  </>;
}

function SecurityNote({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) { return <div className="border-b pb-5"><span className="grid size-9 place-items-center rounded-full bg-primary/12 text-primary"><Icon className="size-4" /></span><p className="mt-4 text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>; }
function friendlyAccessError(message: string) { if (message.includes("current administrator")) return "No puedes revocar ni bajar el rol de tu propia cuenta."; if (message.includes("at least one")) return "Debe quedar al menos un administrador activo."; if (message.includes("administrator access")) return "Tu sesión ya no tiene permiso de administrador."; return message; }
