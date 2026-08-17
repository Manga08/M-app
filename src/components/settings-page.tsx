"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Cloud, Download, Laptop, Moon, Plus, ShieldCheck, Smartphone, Sun, WifiOff } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toCsv } from "@/lib/finance/calculations";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const activeTheme = mounted ? theme : undefined;
  const router = useRouter();
  const { accounts, categories, transactions, addCategory, online, pendingCount } = useFinance();
  const [newCategory, setNewCategory] = useState("");
  const expenseCategories = categories.filter((category) => category.kind === "expense");

  async function createCategory(event: React.FormEvent) {
    event.preventDefault(); if (!newCategory.trim()) return;
    await addCategory({ name: newCategory.trim(), group: "wants", color: "#fb7185", icon: "tag", kind: "expense", isDefault: false });
    setNewCategory(""); toast.success("Categoría creada");
  }

  function exportData() { const blob = new Blob(["\ufeff", toCsv(transactions, accounts, categories)], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "moneva-datos.csv"; link.click(); URL.revokeObjectURL(link.href); }

  return <>
    <PageHeader eyebrow="Tu espacio" title="Ajustes" description="Personaliza Moneva sin complicaciones. Tus preferencias se aplican a toda la experiencia." />
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-16">
      <div className="space-y-10">
        <SettingsSection title="Apariencia" description="Elige cómo se ve Moneva en este dispositivo."><div className="grid grid-cols-3 gap-3">{([{ value: "light", label: "Claro", icon: Sun }, { value: "dark", label: "Oscuro", icon: Moon }, { value: "system", label: "Sistema", icon: Laptop }] as const).map(({ value, label, icon: Icon }) => <button key={value} onClick={() => setTheme(value)} className={cn("relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-secondary/35 text-sm transition-colors hover:bg-secondary", activeTheme === value && "border-primary bg-primary/8 text-primary")}><Icon className="size-5" />{label}{activeTheme === value ? <Check className="absolute right-2 top-2 size-4" /> : null}</button>)}</div></SettingsSection>
        <SettingsSection title="Categorías" description="Agrega etiquetas propias. Las predeterminadas permanecen para conservar tus reportes."><form onSubmit={createCategory} className="mb-4 flex gap-2"><div className="flex-1"><Label htmlFor="new-category" className="sr-only">Nombre de categoría</Label><Input id="new-category" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} className="h-11" placeholder="Nueva categoría" /></div><Button type="submit" className="h-11"><Plus className="size-4" />Agregar</Button></form><div className="flex flex-wrap gap-2">{expenseCategories.map((category) => <span key={category.id} className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: `${category.color}70` }}>{category.name}</span>)}</div></SettingsSection>
        <SettingsSection title="Datos y portabilidad" description="Tus datos son tuyos. Descarga una copia cuando quieras."><div className="flex flex-col gap-3 sm:flex-row"><Button variant="outline" onClick={exportData} className="h-11 rounded-full"><Download className="size-4" />Exportar CSV</Button><Button variant="outline" className="h-11 rounded-full" onClick={() => toast.info("La importación guiada estará disponible en la siguiente versión")}>Importar movimientos</Button></div></SettingsSection>
      </div>
      <aside className="space-y-4">
        <StatusPanel icon={online ? Cloud : WifiOff} title={online ? "Datos protegidos" : "Modo sin conexión"} text={online ? pendingCount ? `${pendingCount} cambios esperan sincronización.` : "Los cambios locales están al día." : "Puedes seguir registrando movimientos. Se sincronizarán al volver."} tone={online ? "text-primary" : "text-amber-300"} />
        <StatusPanel icon={ShieldCheck} title="Privacidad por diseño" text="Acceso privado, políticas RLS y sesión segura con Google." tone="text-sky-300" />
        <StatusPanel icon={Smartphone} title="Instalable" text="Desde el menú del navegador puedes instalar Moneva como una app." tone="text-violet-300" />
        <Button variant="ghost" className="w-full justify-start text-destructive" onClick={async () => { const client = createClient(); if (client) { await client.auth.signOut(); router.push("/login"); router.refresh(); } else toast.info("Estás usando el modo demo local"); }}>Cerrar sesión</Button>
      </aside>
    </div>
  </>;
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="border-b pb-9"><div className="mb-5"><h2 className="text-xl font-medium tracking-tight">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>{children}</section>; }
function StatusPanel({ icon: Icon, title, text, tone }: { icon: typeof Cloud; title: string; text: string; tone: string }) { return <div className="rounded-2xl bg-secondary/55 p-5"><Icon className={cn("size-5", tone)} /><p className="mt-4 text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>; }
