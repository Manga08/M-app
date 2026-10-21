"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, FileText, KeyRound, LoaderCircle, Pencil, Plus, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialogActions, FormDialogBody, FormDialogContent } from "@/components/ui/form-dialog";
import { DateControl, InputControl, SelectControl } from "@/components/ui/form-control";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { downloadBlob } from "@/lib/download";
import { connectionState, integrationPermissions, type IntegrationConnection, type IntegrationPermission } from "@/lib/integrations/contract";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Issued = { data: IntegrationConnection; token: string; apiUrl: string };
type Activity = { id: string; operation: string; command_count: number; created_at: string };
class ConnectionError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function connectionsRequest(action?: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/connections", { method: action ? "POST" : "GET", cache: "no-store", signal,
    ...(action ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) } : {}) });
  const payload = await response.json();
  if (!response.ok) throw new ConnectionError(payload.error?.message ?? "No pudimos gestionar tus conexiones.", response.status);
  return payload;
}

export function ConnectionsSection({ online, timezone = "America/Bogota" }: { online: boolean; timezone?: string }) {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<IntegrationPermission>("read");
  const [duration, setDuration] = useState("7d");
  const [date, setDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [visible, setVisible] = useState(false);
  const [revoke, setRevoke] = useState<IntegrationConnection | "all" | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [activity, setActivity] = useState<Record<string, Activity[]>>({});
  const alive = useRef(true);

  const load = useCallback((signal?: AbortSignal) => {
    if (!online) return Promise.resolve();
    return connectionsRequest(undefined, signal).then(
      (result) => { if (!signal?.aborted && alive.current) { setConnections(result.data); setError(null); } },
      (reason: unknown) => { if (!signal?.aborted && alive.current) setError(reason instanceof Error ? reason.message : "No pudimos cargar las conexiones."); },
    ).finally(() => { if (!signal?.aborted && alive.current) setLoading(false); });
  }, [online]);
  useEffect(() => { alive.current = true; const controller = new AbortController(); void load(controller.signal); return () => { alive.current = false; controller.abort(); }; }, [load]);

  const formatDate = (value: string) => new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
  const active = connections.filter((c) => connectionState(c) === "Activa");

  async function issue(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFormError(null); setReauth(false);
    try {
      const expires = duration === "custom" ? customExpiry(date, timezone) : new Date(Date.now() + ({ "1h": 3_600_000, "1d": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000, "90d": 7_776_000_000 }[duration] ?? 604_800_000));
      if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) throw new Error("Elige una fecha futura.");
      const result = await connectionsRequest({ action: "create", name, permission, expiresAt: expires.toISOString() });
      if (alive.current) { setIssued(result); setConnections((current) => [result.data, ...current]); }
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "No pudimos crear la conexión.");
      setReauth(reason instanceof ConnectionError && reason.status === 401);
    } finally { setBusy(false); }
  }

  async function verifyIdentity() {
    const client = createClient(); if (!client) return;
    const callback = new URL("/auth/callback", window.location.origin); callback.searchParams.set("next", "/ajustes#conexiones");
    const result = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } } });
    if (result.error) setFormError("No pudimos abrir Google. Inténtalo de nuevo.");
  }

  async function copy(text: string, message: string) {
    try { await navigator.clipboard.writeText(text); toast.success(message); }
    catch { toast.error("El navegador no permitió copiar. Puedes descargar el archivo."); }
  }

  async function guide(download: boolean) {
    try {
      const response = await fetch("/api/v1/guide", { cache: "no-store" });
      if (!response.ok) throw new Error("No pudimos preparar la guía. Inténtalo de nuevo.");
      const text = await response.text();
      if (download) downloadBlob(new Blob([text], { type: "text/markdown;charset=utf-8" }), "MONEVA_AGENT.md");
      else await copy(text, "Instrucciones copiadas sin credenciales");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "No pudimos preparar la guía."); }
  }

  async function confirmRevoke() {
    if (!revoke || busy) return;
    setBusy(true);
    try {
      await connectionsRequest(revoke === "all" ? { action: "revoke_all" } : { action: "revoke", id: revoke.id });
      setConnections((current) => current.map((c) => revoke === "all" || c.id === revoke.id ? { ...c, revoked_at: new Date().toISOString() } : c));
      setRevoke(null); toast.success("Acceso revocado");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "No pudimos revocar el acceso."); }
    finally { setBusy(false); }
  }

  async function saveName(event: React.FormEvent, id: string) {
    event.preventDefault(); setBusy(true);
    try { await connectionsRequest({ action: "rename", id, name: renameValue }); setConnections((current) => current.map((c) => c.id === id ? { ...c, name: renameValue.trim() } : c)); setRenaming(null); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "No pudimos guardar el nombre."); }
    finally { setBusy(false); }
  }

  async function loadActivity(id: string) {
    if (activity[id]) return;
    try { const response = await fetch(`/api/connections?activity=${encodeURIComponent(id)}`, { cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message); setActivity((current) => ({ ...current, [id]: payload.data })); }
    catch { toast.error("No pudimos consultar la actividad. Cierra y vuelve a abrir el detalle para reintentar."); }
  }

  function resetForm() { setIssued(null); setVisible(false); setName(""); setPermission("read"); setDuration("7d"); setDate(""); setFormError(null); setReauth(false); }

  return <section id="conexiones" className="scroll-mt-24" aria-labelledby="connections-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1"><h2 id="connections-heading" className="text-xl font-medium tracking-tight">Conexiones</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Deja que tu asistente consulte o gestione tus finanzas con el acceso que tú elijas.</p></div>
      <Button variant="outline" className="min-h-11 rounded-full" onClick={() => { resetForm(); setOpen(true); }} disabled={!online || active.length >= 10}><Plus className="size-4" />Crear conexión</Button>
    </div>
    {!online ? <p className="mt-5 text-sm text-muted-foreground">Conéctate a internet para crear, consultar o revocar accesos.</p> : loading ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Consultando conexiones…</p> : error ? <div className="mt-5 space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="ghost" className="min-h-11" onClick={() => void load()}><RefreshCw className="size-4" />Reintentar</Button></div> : connections.length === 0 ? <div className="mt-5 flex items-start gap-3 rounded-2xl bg-secondary/45 p-4"><KeyRound className="mt-1 size-5 shrink-0 text-primary" /><div><p className="text-sm font-medium">Tú decides quién puede entrar</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Crea un token con vencimiento, configura tu agente y revócalo cuando quieras. No necesitas mantener Moneva abierta.</p></div></div> : <ul className="mt-5 space-y-5">{connections.map((connection) => {
      const state = connectionState(connection);
      return <li key={connection.id} className="min-w-0 rounded-2xl bg-secondary/35 px-4 py-4">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound className="size-[18px]" /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{connection.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{integrationPermissions.find((p) => p.value === connection.permission)?.label} · {state}</p><p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{state === "Revocada" ? `Revocada el ${formatDate(connection.revoked_at!)}` : `Vence el ${formatDate(connection.expires_at)}`} · {connection.last_used_at ? `Último uso: ${formatDate(connection.last_used_at)}` : "Todavía sin usar"}</p></div></div>
        <div className="mt-3 flex flex-wrap gap-1 pl-0 sm:pl-13"><Button size="sm" variant="ghost" className="min-h-11" onClick={() => { setRenaming(connection.id); setRenameValue(connection.name); }} disabled={!online || busy}><Pencil className="size-3.5" />Renombrar</Button>{state === "Activa" ? <Button size="sm" variant="ghost" className="min-h-11 text-destructive" disabled={!online || busy} onClick={() => setRevoke(connection)}><Unplug className="size-3.5" />Revocar</Button> : null}</div>
        {renaming === connection.id ? <form className="mt-3 space-y-3" onSubmit={(event) => void saveName(event, connection.id)}><Label htmlFor={`rename-${connection.id}`}>Nombre de la conexión</Label><InputControl id={`rename-${connection.id}`} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} required maxLength={80} /><div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={busy}>Guardar nombre</Button><Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancelar</Button></div></form> : null}
        <details className="mt-2 text-xs" onToggle={(event) => { if (event.currentTarget.open) void loadActivity(connection.id); }}><summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">Ver actividad de esta conexión</summary><p className="mb-2 font-mono text-muted-foreground">{connection.token_prefix}…</p>{activity[connection.id] ? activity[connection.id].length ? <ul className="space-y-2 text-muted-foreground">{activity[connection.id].map((entry) => <li key={entry.id}>{entry.command_count} cambios · {formatDate(entry.created_at)}</li>)}</ul> : <p className="text-muted-foreground">No hay cambios recientes registrados desde esta conexión.</p> : <p className="text-muted-foreground">Consultando actividad…</p>}</details>
      </li>;
    })}</ul>}
    <div className="mt-4 flex flex-wrap gap-1"><Button variant="ghost" size="sm" className="min-h-11" onClick={() => void guide(false)} disabled={!online}><Copy className="size-4" />Copiar instrucciones</Button><Button variant="ghost" size="sm" className="min-h-11" onClick={() => void guide(true)} disabled={!online}><FileText className="size-4" />Guía .md</Button><Button asChild variant="ghost" size="sm" className="min-h-11"><a href="/integrations/moneva-client.mjs" download><Download className="size-4" />Cliente local</a></Button>{active.length > 1 ? <Button variant="ghost" size="sm" className="min-h-11 text-destructive" disabled={!online || busy} onClick={() => setRevoke("all")}>Revocar todas</Button> : null}</div>
    <details className="mt-2 text-sm text-muted-foreground"><summary className="min-h-11 cursor-pointer py-3">¿Cómo lo uso con mi asistente?</summary><ol className="ml-5 list-decimal space-y-2 pb-3 leading-6"><li>Crea una conexión con el permiso y vencimiento que necesites.</li><li>Descarga la credencial privada e instálala con el cliente local. Guárdala fuera de repositorios y carpetas compartidas.</li><li>Entrega a tu agente la guía .md y la ruta de la configuración. El token no necesita pegarse en el chat.</li></ol><p className="pb-3 leading-6">El agente necesita herramientas HTTP o terminal. Tu proveedor de IA puede procesar los datos que le autorices consultar. Moneva no ejecuta un modelo ni almacena conversaciones.</p></details>

    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <FormDialogContent className="[&_[data-slot=dialog-header]]:pr-12" onExitComplete={resetForm}>
        <FormDialogBody><DialogHeader><DialogTitle>{issued ? "Tu conexión está lista" : "Crear conexión"}</DialogTitle><DialogDescription>{issued ? "Guarda la credencial privada antes de cerrar. Solo la mostramos esta vez." : "Elige qué podrá hacer tu asistente y hasta cuándo tendrá acceso."}</DialogDescription></DialogHeader>
          {issued ? <div className="mt-6 space-y-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-1 size-5 shrink-0 text-positive" /><div><p className="break-words font-medium">{issued.data.name}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{integrationPermissions.find((p) => p.value === issued.data.permission)?.label} · Vence el {formatDate(issued.data.expires_at)}</p></div></div><div className="space-y-2"><Label htmlFor="connection-token">Token privado</Label><div className="flex gap-2"><InputControl id="connection-token" type={visible ? "text" : "password"} value={issued.token} readOnly autoComplete="off" spellCheck={false} className="font-mono text-xs" /><Button variant="outline" size="icon" className="size-13 shrink-0" aria-label={visible ? "Ocultar token" : "Mostrar token"} onClick={() => setVisible((v) => !v)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div><p className="text-xs leading-5 text-muted-foreground">No lo compartas en chats ni repositorios. Si lo pierdes, crea otra conexión.</p></div><div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" className="min-h-12" onClick={() => void copy(issued.token, "Token copiado; guárdalo en un lugar privado")}><Copy className="size-4" />Copiar token</Button><Button variant="outline" className="min-h-12" onClick={() => downloadBlob(new Blob([JSON.stringify({ version: 1, apiUrl: issued.apiUrl, connectionId: issued.data.id, expiresAt: issued.data.expires_at, token: issued.token }, null, 2)], { type: "application/json" }), "moneva-credential.private.json")}><Download className="size-4" />Credencial privada</Button></div><p className="rounded-xl bg-secondary/60 p-4 text-sm leading-6 text-muted-foreground">La guía se comparte con tu agente; la credencial se guarda en tu computador. Descargarla no la cifra: usa el cliente local para instalarla con permisos restringidos y elimina la copia de Descargas.</p><div className="flex flex-wrap gap-2"><Button variant="ghost" className="min-h-11" onClick={() => void guide(false)}><Copy className="size-4" />Copiar instrucciones</Button><Button variant="ghost" className="min-h-11" onClick={() => void guide(true)}><FileText className="size-4" />Descargar guía .md</Button></div></div> : <form id="create-connection" onSubmit={(event) => void issue(event)} className="mt-6 space-y-5">
            <div className="space-y-2"><Label htmlFor="connection-name">Nombre</Label><InputControl id="connection-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Asistente de mi computador" maxLength={80} required disabled={busy} /></div>
            <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Permisos</legend>{integrationPermissions.map((option) => <label key={option.value} className={cn("flex min-h-16 cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-transparent", permission === option.value ? "bg-primary/10 ring-primary/45" : "bg-secondary/35")}><input type="radio" name="connection-permission" value={option.value} checked={permission === option.value} onChange={() => setPermission(option.value)} disabled={busy} className="mt-1 size-4 accent-primary" /><span className="min-w-0"><span className="block text-sm font-medium">{option.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span></span></label>)}</fieldset>
            {permission === "full" ? <p className="flex items-start gap-2 text-sm leading-6 text-warning"><ShieldCheck className="mt-1 size-4 shrink-0" />Podrá eliminar movimientos y archivar datos financieros. Las reglas de seguridad y contabilidad siguen vigentes.</p> : null}
            <div className="space-y-2"><Label htmlFor="connection-expiry">Vence en</Label><SelectControl id="connection-expiry" value={duration} onValueChange={setDuration} disabled={busy}><option value="1h">Una hora</option><option value="1d">Un día</option><option value="7d">Siete días</option><option value="30d">Treinta días</option><option value="90d">Noventa días</option><option value="custom">Elegir fecha</option></SelectControl></div>
            {duration === "custom" ? <div className="space-y-2"><Label htmlFor="connection-custom-date">Fecha de vencimiento</Label><DateControl id="connection-custom-date" value={date} onValueChange={setDate} required /><p className="text-xs leading-5 text-muted-foreground">Vence al finalizar ese día en {timezone}. Máximo noventa días.</p></div> : null}
            {formError ? <div className="space-y-2"><p role="alert" className="text-sm leading-6 text-destructive">{formError}</p>{reauth ? <Button type="button" variant="outline" className="min-h-11" onClick={() => void verifyIdentity()}>Verificar con Google</Button> : null}</div> : null}
          </form>}
        </FormDialogBody><FormDialogActions>{issued ? <Button className="min-h-12" onClick={() => setOpen(false)}><Check className="size-4" />Listo, guardé mi conexión</Button> : <Button type="submit" form="create-connection" className="min-h-12" disabled={busy || !online} aria-busy={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}{busy ? "Creando conexión…" : "Crear token"}</Button>}</FormDialogActions>
      </FormDialogContent>
    </Dialog>
    <AlertDialog open={Boolean(revoke)} onOpenChange={(value) => { if (!value && !busy) setRevoke(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{revoke === "all" ? "¿Revocar todas las conexiones?" : `¿Revocar ${revoke?.name ?? "esta conexión"}?`}</AlertDialogTitle><AlertDialogDescription>El asistente perderá el acceso cuando se confirme. Los cambios que ya guardó permanecen en tu historial. Puedes crear otra conexión cuando quieras.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} className="bg-destructive text-destructive-foreground" onClick={(event) => { event.preventDefault(); void confirmRevoke(); }}>{busy ? "Revocando…" : "Revocar acceso"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

/** End of selected calendar day in the profile timezone, independent of the
 * computer timezone. Iterate offset to also cover DST transitions. */
function customExpiry(date: string, timezone: string) {
  const target = new Date(`${date}T23:59:59.000Z`);
  if (!Number.isFinite(target.getTime())) return target;
  let instant = target.getTime();
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
    const rendered = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    instant += target.getTime() - rendered;
  }
  return new Date(instant);
}
