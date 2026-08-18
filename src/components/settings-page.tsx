"use client";

import Link from "next/link";
import { Check, ChevronRight, Cloud, Download, KeyRound, Laptop, LogOut, Moon, Palette, RefreshCw, ShieldCheck, Smartphone, Sun, Target, UserRound, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/lib/finance/calculations";
import type { ColorTheme, FinanceProfile, ProfileInput, ThemeMode } from "@/lib/finance/types";
import { clearLocalFinanceData } from "@/lib/offline-db";
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
  const { profile, accounts, categories, groupAllocations, updateProfile, exportTransactions, online, pendingCount, syncError, syncNow } = useFinance();
  const activeGroups = groupAllocations.filter((group) => !group.archived);
  const activeCategories = categories.filter((category) => category.kind === "expense" && !category.archived);

  async function saveAppearance(patch: Partial<Pick<FinanceProfile, "themeMode" | "colorTheme">>) {
    if (!profile) return;
    await updateProfile({ ...profileInput(profile), ...patch });
  }

  async function exportData() {
    try {
      const transactions = await exportTransactions();
      const blob = new Blob(["\ufeff", toCsv(transactions, accounts, categories)], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "moneva-datos.csv";
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`${transactions.length} movimientos exportados`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos exportar tus datos.");
    }
  }

  async function signOut() {
    if (pendingCount > 0) {
      if (!online) {
        toast.error("Tienes cambios sin sincronizar. Conéctate antes de cerrar sesión para no perderlos.");
        return;
      }
      await syncNow();
      toast.info("Revisamos los cambios pendientes. Vuelve a cerrar sesión cuando el contador llegue a cero.");
      return;
    }
    const client = createClient();
    if (client) {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) {
        toast.error("No pudimos cerrar la sesión de forma segura. Inténtalo de nuevo.");
        return;
      }
      if (profile?.id) await clearLocalFinanceData(profile.id);
      router.push("/login");
      router.refresh();
    } else toast.info("Estás usando el modo demo local");
  }

  return <>
    <PageHeader eyebrow="Tu espacio" title="Ajustes" description="Cuenta, apariencia, estructura y datos organizados en un solo lugar." />
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-14">
      <div className="min-w-0 space-y-11">
        <SettingsGroup title="Cuenta" description="Tu identidad y quién puede acceder a esta instalación.">
          <div className="divide-y border-y">
            <SettingsLink href="/perfil" icon={UserRound} title={profile?.displayName ?? "Tu perfil"} detail={profile?.email ?? "Nombre, moneda y zona horaria"} />
            {isAdmin ? <SettingsLink href="/ajustes/acceso" icon={KeyRound} title="Acceso privado" detail="Correos autorizados y administradores" /> : null}
          </div>
        </SettingsGroup>

        <SettingsGroup title="Apariencia" description="El modo controla la luminosidad; la paleta define el color y se sincroniza con tu usuario.">
          <div className="grid grid-cols-3 gap-2 border-y py-4">{([{ value: "light", label: "Claro", icon: Sun }, { value: "dark", label: "Oscuro", icon: Moon }, { value: "system", label: "Sistema", icon: Laptop }] as const).map(({ value, label, icon: Icon }) => <button type="button" key={value} onClick={() => saveAppearance({ themeMode: value as ThemeMode })} className={cn("relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl text-xs text-muted-foreground transition-[color,background-color,transform] active:scale-[.98]", profile?.themeMode === value ? "bg-primary/10 text-primary" : "hover:bg-secondary")}><Icon className="size-5" />{label}{profile?.themeMode === value ? <Check className="absolute right-2 top-2 size-3.5" /> : null}</button>)}</div>
          <div className="mt-3 grid gap-x-5 sm:grid-cols-2">{colorThemes.map((item) => <button type="button" key={item.value} onClick={() => saveAppearance({ colorTheme: item.value })} className={cn("group flex min-h-16 items-center gap-3 border-b py-3 text-left transition-colors hover:text-primary", profile?.colorTheme === item.value && "text-primary")}><span className="flex -space-x-2">{item.colors.map((color) => <i key={color} className="size-7 rounded-full border-2 border-background" style={{ backgroundColor: color }} />)}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="block truncate text-xs text-muted-foreground">{item.description}</span></span>{profile?.colorTheme === item.value ? <Check className="size-4" /> : <Palette className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}</button>)}</div>
        </SettingsGroup>

        <SettingsGroup title="Organización y datos" description="Configura tu plan o descarga una copia de todo tu historial.">
          <div className="divide-y border-y">
            <SettingsLink href="/presupuestos" icon={Target} title="Plan financiero" detail={`${activeGroups.length} grupos · ${activeCategories.length} subcategorías · distribución del 100%`} />
            <button type="button" onClick={() => void exportData()} className="flex min-h-16 w-full items-center gap-3 py-3 text-left transition-colors hover:text-primary"><span className="grid size-10 place-items-center rounded-xl bg-secondary"><Download className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Exportar mis datos</span><span className="block truncate text-xs text-muted-foreground">Descargar todos los movimientos en CSV</span></span><ChevronRight className="size-4 text-muted-foreground" /></button>
          </div>
        </SettingsGroup>
      </div>

      <aside className="order-first border-b pb-8 xl:order-none xl:border-b-0 xl:border-l xl:pb-0 xl:pl-9">
        <p className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">Estado</p>
        <StatusRow icon={syncError ? WifiOff : online ? Cloud : WifiOff} title={syncError ? "Requiere atención" : online ? "Datos sincronizados" : "Modo sin conexión"} text={syncError ?? (online ? pendingCount ? `${pendingCount} cambios esperan sincronización.` : "La nube y este dispositivo están al día." : "Puedes seguir trabajando; se sincronizará al volver.")} tone={syncError ? "text-destructive" : online ? "text-primary" : "text-amber-400"} />
        {online && (pendingCount > 0 || syncError) ? <Button variant="outline" className="my-3 w-full rounded-full" onClick={syncNow}><RefreshCw className="size-4" />Sincronizar ahora</Button> : null}
        <StatusRow icon={ShieldCheck} title="Privacidad por diseño" text="Google, lista privada, RLS por usuario, TLS y caché local cifrada." tone="text-sky-400" />
        <StatusRow icon={Smartphone} title="PWA instalable" text="Instálala desde el menú del navegador para abrirla como una app." tone="text-violet-400" />
        <button type="button" className="mt-4 flex min-h-12 w-full items-center gap-3 border-t pt-4 text-sm text-destructive" onClick={signOut}><LogOut className="size-4" />Cerrar sesión</button>
      </aside>
    </div>
  </>;
}

function SettingsGroup({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section><div className="mb-4"><h2 className="text-xl font-medium tracking-tight">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{children}</section>;
}

function SettingsLink({ href, icon: Icon, title, detail }: { href: string; icon: typeof UserRound; title: string; detail: string }) {
  return <Link href={href} className="flex min-h-16 items-center gap-3 py-3 transition-colors hover:text-primary"><span className="grid size-10 place-items-center rounded-xl bg-secondary"><Icon className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{title}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span><ChevronRight className="size-4 text-muted-foreground" /></Link>;
}

function StatusRow({ icon: Icon, title, text, tone }: { icon: typeof Cloud; title: string; text: string; tone: string }) {
  return <div className="border-b py-5"><div className="flex items-center gap-2"><Icon className={cn("size-[18px]", tone)} /><p className="text-sm font-medium">{title}</p></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p></div>;
}

function profileInput(profile: FinanceProfile): ProfileInput {
  return { displayName: profile.displayName, currencyCode: profile.currencyCode, timezone: profile.timezone, weekStartsOn: profile.weekStartsOn, monthStartsOn: profile.monthStartsOn, themeMode: profile.themeMode, colorTheme: profile.colorTheme };
}
