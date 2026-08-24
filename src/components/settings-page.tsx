"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ChevronRight, Cloud, Download, FileUp, KeyRound, Laptop, LogOut, Moon, Palette, RefreshCw, ShieldCheck, Smartphone, Sun, Target, UserRound, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { ImportDataDialog } from "@/components/import-data-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/lib/finance/calculations";
import { downloadBlob } from "@/lib/download";
import { announceMutation } from "@/lib/finance/mutation-feedback";
import type { ColorTheme, FinanceProfile, ProfileInput, ThemeMode } from "@/lib/finance/types";
import { clearLocalFinanceData } from "@/lib/offline-db";
import { pwaAssetPath } from "@/lib/pwa-theme";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const colorThemes: Array<{ value: ColorTheme; label: string; description: string; colors: [string, string, string] }> = [
  { value: "moneva", label: "Moneva", description: "Verde sereno", colors: ["#36d399", "#183d32", "#e9f8f2"] },
  { value: "crimson", label: "Crimson", description: "Rojo profundo", colors: ["#f0445c", "#46131d", "#fff0f1"] },
  { value: "ocean", label: "Océano", description: "Azul nítido", colors: ["#38a6f2", "#15334c", "#edf7ff"] },
  { value: "violet", label: "Violeta", description: "Púrpura sobrio", colors: ["#9b78f2", "#30204f", "#f5f0ff"] },
  { value: "amber", label: "Ámbar", description: "Dorado cálido", colors: ["#ed9f2f", "#463018", "#fff6e8"] },
];

export function SettingsPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter();
  const { profile, accounts, categories, groupAllocations, mutate, exportTransactions, online, pendingCount, syncError, syncNow, syncing: financeSyncing, dataSource, prepareSignOut, cancelPreparedSignOut, completeSignOut } = useFinance();
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const activeGroups = groupAllocations.filter((group) => !group.archived);
  const activeCategories = categories.filter((category) => category.kind === "expense" && !category.archived);

  async function saveAppearance(patch: Partial<Pick<FinanceProfile, "themeMode" | "colorTheme">>) {
    if (!profile || appearanceSaving) return;
    setAppearanceSaving(true);
    try {
      const result = await mutate.updateProfile({ ...profileInput(profile), ...patch });
      announceMutation(result, "Apariencia actualizada", { silentWhenSaved: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar la apariencia.");
    } finally {
      setAppearanceSaving(false);
    }
  }

  async function synchronize() {
    if (manualSyncing || financeSyncing) return;
    setManualSyncing(true);
    try {
      const result = await syncNow();
      if (result.status === "synced") toast.success("Todos los cambios están sincronizados.");
      else if (result.status === "local") toast.info("Este entorno guarda los cambios únicamente en el dispositivo.");
      else toast.error(result.error ?? `${result.pendingCount} cambios siguen pendientes.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos sincronizar ahora.");
    }
    finally { setManualSyncing(false); }
  }

  async function exportData() {
    try {
      const transactions = await exportTransactions();
      const blob = new Blob(["\ufeff", toCsv(transactions, accounts, categories)], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, "moneva-datos.csv");
      toast.success(`${transactions.length} movimientos exportados`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos exportar tus datos.");
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    let prepared = false;
    try {
      const durablePending = await prepareSignOut();
      prepared = true;
      if (durablePending > 0) {
        if (!online) {
          toast.error("Tienes cambios sin sincronizar. Conéctate antes de cerrar sesión para no perderlos.");
          await cancelPreparedSignOut();
          return;
        }
        const result = await syncNow({ flushOnly: true });
        if (result.pendingCount > 0 || result.status === "pending" || result.status === "offline") {
          toast.error(result.error ?? "Todavía hay cambios pendientes. No cerramos la sesión para protegerlos.");
          await cancelPreparedSignOut();
          return;
        }
      }
      const client = createClient();
      if (!client) {
        await cancelPreparedSignOut();
        toast.info("Estás usando el modo demo local");
        return;
      }
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) {
        await cancelPreparedSignOut();
        toast.error("No pudimos cerrar la sesión de forma segura. Inténtalo de nuevo.");
        return;
      }
      if (profile?.id) {
        try { await clearLocalFinanceData(profile.id); }
        catch { toast.warning("La sesión se cerró, pero el navegador no permitió limpiar toda la caché local."); }
      }
      completeSignOut();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      if (prepared) await cancelPreparedSignOut();
      toast.error(error instanceof Error ? error.message : "No pudimos preparar el cierre de sesión de forma segura.");
    } finally {
      setSigningOut(false);
    }
  }

  return <>
    <PageHeader eyebrow="Tu espacio" title="Ajustes" description="Cuenta, apariencia, estructura y datos organizados en un solo lugar." />
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_304px] xl:gap-16">
      <div className="min-w-0 space-y-11">
        <SettingsGroup title="Cuenta" description="Tu identidad y quién puede acceder a esta instalación.">
          <div className="space-y-1 sm:divide-y sm:border-y sm:space-y-0">
            <SettingsLink href="/perfil" icon={UserRound} title={profile?.displayName ?? "Tu perfil"} detail={profile?.email ?? "Nombre, moneda y zona horaria"} />
            {isAdmin ? <SettingsLink href="/ajustes/acceso" icon={KeyRound} title="Acceso privado" detail="Correos autorizados y administradores" /> : null}
          </div>
        </SettingsGroup>

        <SettingsGroup title="Apariencia" description="El modo controla la luminosidad; la paleta personaliza la interfaz, el navegador y el icono de instalación.">
          <div className="grid grid-cols-3 gap-2 py-2 sm:border-y sm:py-4" role="group" aria-label="Modo de apariencia" aria-busy={appearanceSaving}>{([{ value: "light", label: "Claro", icon: Sun }, { value: "dark", label: "Oscuro", icon: Moon }, { value: "system", label: "Sistema", icon: Laptop }] as const).map(({ value, label, icon: Icon }) => <button type="button" key={value} onClick={() => saveAppearance({ themeMode: value as ThemeMode })} aria-pressed={profile?.themeMode === value} disabled={appearanceSaving} className={cn("relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl text-xs text-muted-foreground transition-[color,background-color,transform] active:scale-[.98] disabled:opacity-65", profile?.themeMode === value ? "bg-primary/10 text-primary" : "hover:bg-secondary")}><Icon className="size-5" />{label}{profile?.themeMode === value ? <Check className="absolute right-2 top-2 size-3.5" /> : null}</button>)}</div>
          <div className="mt-3 grid gap-x-5 sm:grid-cols-2" role="group" aria-label="Paleta de color" aria-busy={appearanceSaving}>{colorThemes.map((item) => <button type="button" key={item.value} onClick={() => saveAppearance({ colorTheme: item.value })} aria-pressed={profile?.colorTheme === item.value} disabled={appearanceSaving} className={cn("group flex min-h-16 items-center gap-3 py-3 text-left transition-colors hover:text-primary active:bg-secondary/55 disabled:opacity-65 sm:border-b", profile?.colorTheme === item.value && "text-primary")}><span className="relative size-11 shrink-0" aria-hidden="true"><Image src={pwaAssetPath(item.value, "icon")} alt="" fill sizes="44px" unoptimized className="rounded-[11px]" /><span className="absolute -bottom-1 -right-1 flex -space-x-1 rounded-full border-2 border-background bg-background">{item.colors.slice(0, 2).map((color) => <i key={color} className="size-3 rounded-full" style={{ backgroundColor: color }} />)}</span></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="block truncate text-xs text-muted-foreground">{item.description}</span></span>{profile?.colorTheme === item.value ? <Check className="size-4" /> : <Palette className="size-4 text-muted-foreground opacity-35 transition-opacity group-hover:opacity-100 sm:opacity-0" />}</button>)}</div>
          <p className="sr-only" aria-live="polite">{appearanceSaving ? "Guardando apariencia" : ""}</p>
        </SettingsGroup>

        <SettingsGroup title="Organización y datos" description="Configura tu plan, exporta una copia o trae tu historial desde una plantilla compatible.">
          <div className="space-y-1 sm:divide-y sm:border-y sm:space-y-0">
            <SettingsLink href="/presupuestos" icon={Target} title="Plan financiero" detail={`${activeGroups.length} categorías principales · ${activeCategories.length} subcategorías · distribución del 100%`} />
            <button type="button" onClick={() => void exportData()} className="flex min-h-16 w-full items-center gap-3 py-3 text-left transition-colors hover:text-primary active:bg-secondary/55"><span className="grid size-10 place-items-center rounded-xl bg-secondary"><Download className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Exportar mis datos</span><span className="block truncate text-xs text-muted-foreground">Descargar todos los movimientos en CSV</span></span><ChevronRight className="size-4 text-muted-foreground" /></button>
            <button type="button" onClick={() => setImportOpen(true)} className="flex min-h-16 w-full items-center gap-3 py-3 text-left transition-colors hover:text-primary active:bg-secondary/55"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FileUp className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Importar mis datos</span><span className="block truncate text-xs text-muted-foreground">Traer gastos, ingresos y categorías desde XLSX 2025 o 2026</span></span><ChevronRight className="size-4 text-muted-foreground" /></button>
          </div>
        </SettingsGroup>
      </div>

      <aside id="estado" className="order-last scroll-mt-20 xl:order-none xl:self-start">
        <div className="xl:sticky xl:top-24">
          <p className="mb-3 text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">Estado</p>
          <div className="space-y-1">
            <StatusRow icon={syncError ? WifiOff : online ? Cloud : WifiOff} title={syncError ? "Requiere atención" : pendingCount > 0 ? "Cambios pendientes" : online && (financeSyncing || dataSource === "local") ? "Comprobando la nube" : online ? "Datos sincronizados" : "Modo sin conexión"} text={syncError ?? (pendingCount > 0 ? `${pendingCount} cambios esperan sincronización.` : online && (financeSyncing || dataSource === "local") ? "Verificando que esta copia coincida con la versión más reciente." : online ? "La nube y este dispositivo están al día." : "Puedes seguir trabajando; se sincronizará al volver.")} tone={syncError ? "text-destructive" : pendingCount > 0 ? "text-warning" : online ? "text-primary" : "text-warning"} />
            {online && (pendingCount > 0 || syncError) ? <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3"><Button variant="outline" className="col-start-2 w-full rounded-full" onClick={() => void synchronize()} disabled={manualSyncing || financeSyncing} aria-busy={manualSyncing || financeSyncing}>{manualSyncing || financeSyncing ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{manualSyncing || financeSyncing ? "Sincronizando…" : "Sincronizar ahora"}</Button></div> : null}
            <StatusRow icon={ShieldCheck} title="Privacidad por diseño" text="Google, lista privada, acceso aislado por usuario, conexión cifrada y caché local protegida." tone="text-info" />
            <StatusRow icon={Smartphone} title="PWA instalable" text="El icono y la barra del navegador siguen tu paleta. Si ya estaba instalada, reinstálala para renovar el icono del sistema." tone="text-primary" />
          </div>
          <Button type="button" variant="ghost" className="mt-5 h-11 w-full justify-start rounded-xl px-3 text-destructive hover:bg-destructive/8 hover:text-destructive" onClick={signOut} disabled={signingOut} aria-busy={signingOut}>{signingOut ? <RefreshCw className="size-4 animate-spin" /> : <LogOut className="size-4" />}{signingOut ? "Cerrando sesión…" : "Cerrar sesión"}</Button>
        </div>
      </aside>
    </div>
    <ImportDataDialog open={importOpen} onOpenChange={setImportOpen} />
  </>;
}

function SettingsGroup({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section><div className="mb-4"><h2 className="text-xl font-medium tracking-tight">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{children}</section>;
}

function SettingsLink({ href, icon: Icon, title, detail }: { href: string; icon: typeof UserRound; title: string; detail: string }) {
  return <Link href={href} className="flex min-h-16 items-center gap-3 py-3 transition-colors hover:text-primary active:bg-secondary/55"><span className="grid size-10 place-items-center rounded-xl bg-secondary"><Icon className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{title}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span><ChevronRight className="size-4 text-muted-foreground" /></Link>;
}

function StatusRow({ icon: Icon, title, text, tone }: { icon: typeof Cloud; title: string; text: string; tone: string }) {
  return <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-3"><span className="grid size-9 place-items-center rounded-full bg-secondary/65"><Icon className={cn("size-[18px]", tone)} /></span><div className="min-w-0 pt-1"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div></div>;
}

function profileInput(profile: FinanceProfile): ProfileInput {
  return { displayName: profile.displayName, currencyCode: profile.currencyCode, timezone: profile.timezone, weekStartsOn: profile.weekStartsOn, monthStartsOn: profile.monthStartsOn, themeMode: profile.themeMode, colorTheme: profile.colorTheme };
}
