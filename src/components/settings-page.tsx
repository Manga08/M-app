"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Cloud, Download, Laptop, Moon, Palette, Plus, RefreshCw, ShieldCheck, Smartphone, Sun, UserRound, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toCsv } from "@/lib/finance/calculations";
import type { ColorTheme, ExpenseGroup, FinanceProfile, ProfileInput, ThemeMode } from "@/lib/finance/types";
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

const groupNames: Record<ExpenseGroup, string> = { needs: "Necesidades", wants: "Gustos", savings: "Ahorros", investments: "Inversiones", debts: "Deudas" };

export function SettingsPage() {
  const router = useRouter();
  const { profile, accounts, categories, transactions, addCategory, updateProfile, online, pendingCount, syncError, syncNow } = useFinance();
  const [newCategory, setNewCategory] = useState("");
  const [categoryGroup, setCategoryGroup] = useState<ExpenseGroup>("wants");
  const [categoryPage, setCategoryPage] = useState(1);
  const expenseCategories = useMemo(() => categories.filter((category) => category.kind === "expense"), [categories]);
  const categoryPageCount = Math.max(1, Math.ceil(expenseCategories.length / 12));
  const safeCategoryPage = Math.min(categoryPage, categoryPageCount);
  const visibleCategories = expenseCategories.slice((safeCategoryPage - 1) * 12, safeCategoryPage * 12);

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    if (categories.some((category) => category.kind === "expense" && category.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"))) {
      toast.error("Ya tienes una categoría con ese nombre.");
      return;
    }
    await addCategory({ name, group: categoryGroup, color: groupColor(categoryGroup), icon: "tag", kind: "expense", isDefault: false });
    setNewCategory("");
    toast.success("Categoría creada");
  }

  async function saveAppearance(patch: Partial<Pick<FinanceProfile, "themeMode" | "colorTheme">>) {
    if (!profile) return;
    await updateProfile({ ...profileInput(profile), ...patch });
  }

  function exportData() {
    const blob = new Blob(["\ufeff", toCsv(transactions, accounts, categories)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "moneva-datos.csv";
    link.click();
    URL.revokeObjectURL(link.href);
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
    <PageHeader eyebrow="Tu espacio" title="Ajustes" description="Apariencia, organización y control de tus datos. Estas preferencias viajan contigo a cualquier dispositivo." />
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-16">
      <div className="space-y-10">
        <SettingsSection title="Perfil" description="Nombre, correo de acceso, moneda, zona horaria y periodos.">
          <div className="flex flex-col gap-4 border-y py-5 sm:flex-row sm:items-center"><span className="grid size-11 place-items-center rounded-full bg-primary/12 text-primary"><UserRound className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{profile?.displayName ?? "Tu perfil"}</p><p className="truncate text-xs text-muted-foreground">{profile?.email}</p></div><Button asChild variant="outline" className="rounded-full"><Link href="/perfil">Editar perfil</Link></Button></div>
        </SettingsSection>

        <SettingsSection title="Apariencia" description="El modo controla luminosidad; la paleta controla la personalidad visual y se guarda en tu cuenta.">
          <div className="grid grid-cols-3 gap-3">{([{ value: "light", label: "Claro", icon: Sun }, { value: "dark", label: "Oscuro", icon: Moon }, { value: "system", label: "Sistema", icon: Laptop }] as const).map(({ value, label, icon: Icon }) => <button type="button" key={value} onClick={() => saveAppearance({ themeMode: value as ThemeMode })} className={cn("relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-secondary/35 text-sm transition-colors hover:bg-secondary", profile?.themeMode === value && "border-primary bg-primary/8 text-primary")}><Icon className="size-5" />{label}{profile?.themeMode === value ? <Check className="absolute right-2 top-2 size-4" /> : null}</button>)}</div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">{colorThemes.map((item) => <button type="button" key={item.value} onClick={() => saveAppearance({ colorTheme: item.value })} className={cn("group flex min-h-20 items-center gap-4 rounded-2xl border p-3 text-left transition-colors hover:bg-secondary/55", profile?.colorTheme === item.value && "border-primary bg-primary/7")}><span className="flex -space-x-2">{item.colors.map((color) => <i key={color} className="size-8 rounded-full border-2 border-background" style={{ backgroundColor: color }} />)}</span><span className="flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="block text-xs text-muted-foreground">{item.description}</span></span>{profile?.colorTheme === item.value ? <Check className="size-4 text-primary" /> : <Palette className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}</button>)}</div>
        </SettingsSection>

        <SettingsSection title="Categorías" description="Crea subcategorías dentro de uno de los cinco grupos principales. Los porcentajes de los grupos se administran en Presupuestos.">
          <form onSubmit={createCategory} className="mb-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]"><div><Label htmlFor="new-category" className="sr-only">Nombre de categoría</Label><Input id="new-category" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} maxLength={100} className="h-11" placeholder="Nueva categoría" /></div><select aria-label="Grupo principal" value={categoryGroup} onChange={(event) => setCategoryGroup(event.target.value as ExpenseGroup)} className="h-11 rounded-xl border bg-background px-3 text-sm">{Object.entries(groupNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button type="submit" className="h-11"><Plus className="size-4" />Agregar</Button></form>
          <div className="grid gap-2 sm:grid-cols-2">{visibleCategories.map((category) => <div key={category.id} className="flex items-center gap-3 border-b py-3"><i className="size-2.5 rounded-full" style={{ backgroundColor: category.color }} /><span className="min-w-0 flex-1 truncate text-sm">{category.name}</span><span className="text-xs text-muted-foreground">{groupNames[category.group as ExpenseGroup]}</span></div>)}</div>
          <PaginationControls page={safeCategoryPage} pageCount={categoryPageCount} onPageChange={setCategoryPage} total={expenseCategories.length} label="categorías" />
        </SettingsSection>

        <SettingsSection title="Datos y portabilidad" description="Tus datos son tuyos. Descarga una copia cuando quieras.">
          <div className="flex flex-col gap-3 sm:flex-row"><Button variant="outline" onClick={exportData} className="h-11 rounded-full"><Download className="size-4" />Exportar CSV</Button><Button variant="outline" className="h-11 rounded-full" onClick={() => toast.info("La importación guiada estará disponible en la siguiente versión")}>Importar movimientos</Button></div>
        </SettingsSection>
      </div>

      <aside className="space-y-4">
        <StatusPanel icon={syncError ? WifiOff : online ? Cloud : WifiOff} title={syncError ? "Requiere atención" : online ? "Datos sincronizados" : "Modo sin conexión"} text={syncError ?? (online ? pendingCount ? `${pendingCount} cambios esperan sincronización.` : "La nube y este dispositivo están al día." : "Puedes seguir registrando movimientos. Se cifran localmente y se sincronizarán al volver.")} tone={syncError ? "text-destructive" : online ? "text-primary" : "text-amber-300"} />
        {online && (pendingCount > 0 || syncError) ? <Button variant="outline" className="w-full rounded-full" onClick={syncNow}><RefreshCw className="size-4" />Sincronizar ahora</Button> : null}
        <StatusPanel icon={ShieldCheck} title="Privacidad por diseño" text="RLS por usuario, permisos mínimos, conexión TLS y caché local cifrado." tone="text-sky-300" />
        <StatusPanel icon={Smartphone} title="Instalable" text="Desde el menú del navegador puedes instalar Moneva como una app." tone="text-violet-300" />
        <Button variant="ghost" className="w-full justify-start text-destructive" onClick={signOut}>Cerrar sesión</Button>
      </aside>
    </div>
  </>;
}

function profileInput(profile: FinanceProfile): ProfileInput {
  return { displayName: profile.displayName, currencyCode: profile.currencyCode, timezone: profile.timezone, weekStartsOn: profile.weekStartsOn, monthStartsOn: profile.monthStartsOn, themeMode: profile.themeMode, colorTheme: profile.colorTheme };
}

function groupColor(group: ExpenseGroup) {
  return { needs: "#55a8f8", wants: "#fb7185", savings: "#34d399", investments: "#a78bfa", debts: "#fb923c" }[group];
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="border-b pb-9"><div className="mb-5"><h2 className="text-xl font-medium tracking-tight">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>{children}</section>; }
function StatusPanel({ icon: Icon, title, text, tone }: { icon: typeof Cloud; title: string; text: string; tone: string }) { return <div className="rounded-2xl bg-secondary/55 p-5"><Icon className={cn("size-5", tone)} /><p className="mt-4 text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>; }
