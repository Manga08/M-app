"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Minus, Plus, Scale, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { categorySpend, currencyFormatter, groupBudgetSummary, monthLabel, monthTotals } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

export function BudgetsPage() {
  const { profile, categories, budgets, transactions, groupAllocations, currentMonth, updateBudget } = useFinance();
  const activeGroups = useMemo(() => groupAllocations.filter((group) => !group.archived).sort((a, b) => a.sortOrder - b.sortOrder), [groupAllocations]);
  const [selectedGroup, setSelectedGroup] = useState(() => activeGroups[0]?.group ?? "");
  const [page, setPage] = useState(1);
  const groups = useMemo(() => groupBudgetSummary(categories, budgets, transactions, groupAllocations, currentMonth), [categories, budgets, transactions, groupAllocations, currentMonth]);
  const selected = activeGroups.find((group) => group.group === selectedGroup) ?? activeGroups[0];
  const totals = monthTotals(transactions, currentMonth);
  const money = currencyFormatter(profile?.currencyCode);
  const totalBudget = groups.reduce((sum, group) => sum + group.budget, 0);
  const unassignedBudget = totals.income - totalBudget;
  const visible = categories.filter((category) => !category.archived && category.group === selected?.group && category.kind === "expense");
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visiblePage = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Presupuestos" description="Asigna montos mensuales a tus subcategorías. La forma de tu plan se administra por separado para que aquí solo trabajes con cifras." action={<Button asChild variant="outline" className="h-11 rounded-full"><Link href="/estructura"><SlidersHorizontal className="size-4" />Configurar estructura</Link></Button>} />

    <section className="grid gap-8 border-b pb-9 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
      <div><div className="mb-6 flex items-end justify-between"><div><p className="text-sm text-muted-foreground">Ingreso del mes</p><p className="mt-1 text-3xl font-medium tracking-[-0.045em]">{money.format(totals.income)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Presupuestado</p><p className={cn("mt-1 text-lg font-medium", totalBudget > totals.income && "text-destructive")}>{Math.round((totalBudget / Math.max(totals.income, 1)) * 100)}%</p></div></div><div className="flex h-3 overflow-hidden rounded-full bg-muted">{groups.map((group) => <span key={group.group} style={{ width: `${(group.budget / Math.max(totals.income, 1)) * 100}%`, backgroundColor: group.color }} />)}</div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{money.format(totalBudget)} presupuestados</span><span className={cn(unassignedBudget < 0 && "text-destructive")}>{unassignedBudget >= 0 ? `${money.format(unassignedBudget)} sin asignar` : `${money.format(Math.abs(unassignedBudget))} por encima del ingreso`}</span></div></div>
      <div className="rounded-2xl bg-secondary/65 p-5"><div className="flex gap-3"><Scale className="mt-0.5 size-5 text-primary" /><div><p className="font-medium">Una estructura que se adapta a ti</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Tienes {activeGroups.length} {activeGroups.length === 1 ? "grupo principal" : "grupos principales"}. Puedes crear, renombrar, ordenar o sacar cualquiera del porcentaje desde Estructura.</p><Button asChild variant="link" className="mt-2 h-auto p-0 text-xs"><Link href="/estructura">Editar grupos y porcentajes</Link></Button></div></div></div>
    </section>

    <section className="pt-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-xl font-medium tracking-tight">Detalle por subcategoría</h2><p className="mt-1 text-sm text-muted-foreground">Edita con controles rápidos o escribe un monto.</p></div><div className="flex gap-2 overflow-x-auto pb-1">{activeGroups.map((group) => <Button key={group.group} variant={selected?.group === group.group ? "secondary" : "ghost"} size="sm" className={cn("shrink-0 rounded-full", selected?.group === group.group && "text-primary")} onClick={() => { setSelectedGroup(group.group); setPage(1); }}><i className="size-2 rounded-full" style={{ backgroundColor: group.color }} />{group.name}</Button>)}</div></div>
      <div>{visiblePage.map((category) => { const budget = budgets.find((item) => item.categoryId === category.id && item.month === currentMonth); const spent = categorySpend(transactions, category.id, currentMonth); const percent = budget?.amount ? Math.round((spent / budget.amount) * 100) : 0; return <div key={category.id} className="grid min-h-[82px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b py-3 md:grid-cols-[minmax(150px,0.8fr)_minmax(180px,1fr)_160px_130px]"><div><p className="text-sm font-medium">{category.name}</p><p className="mt-1 text-xs text-muted-foreground">{money.format(spent)} usados</p></div><div className="hidden h-1.5 overflow-hidden rounded-full bg-muted md:block"><span className={cn("block h-full rounded-full", percent > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(percent, 100)}%` }} /></div><BudgetEditor key={`${budget?.id ?? category.id}:${budget?.amount ?? 0}`} amount={budget?.amount ?? 0} onSave={async (amount) => { await updateBudget(category.id, amount); toast.success("Presupuesto actualizado"); }} /><div className="hidden text-right md:block"><p className={cn("text-sm font-medium", percent > 100 && "text-destructive")}>{percent}%</p><p className="text-xs text-muted-foreground">{money.format((budget?.amount ?? 0) - spent)} libres</p></div></div>; })}</div>
      {!visible.length && selected ? <div className="py-14 text-center text-sm text-muted-foreground">Todavía no hay subcategorías dentro de {selected.name.toLocaleLowerCase("es")}. <Link href="/estructura" className="text-primary hover:underline">Crear una</Link></div> : null}
      {!activeGroups.length ? <div className="py-14 text-center text-sm text-muted-foreground">Crea un grupo principal para empezar a presupuestar.</div> : null}
      <PaginationControls page={safePage} pageCount={pageCount} onPageChange={setPage} total={visible.length} label="subcategorías" />
    </section>
  </>;
}

function BudgetEditor({ amount, onSave }: { amount: number; onSave: (amount: number) => void }) {
  const [value, setValue] = useState(amount);
  return <div className="flex items-center justify-end gap-1"><Button type="button" variant="outline" size="icon-sm" aria-label="Reducir presupuesto" onClick={() => setValue(Math.max(0, value - 50000))}><Minus className="size-3.5" /></Button><input aria-label="Monto presupuestado" className="h-8 w-24 rounded-lg border bg-transparent px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring" inputMode="numeric" value={value} onChange={(event) => setValue(Number(event.target.value.replace(/\D/g, "")))} /><Button type="button" variant="outline" size="icon-sm" aria-label="Aumentar presupuesto" onClick={() => setValue(value + 50000)}><Plus className="size-3.5" /></Button>{value !== amount ? <Button type="button" size="icon-sm" aria-label="Guardar presupuesto" onClick={() => onSave(value)}><Check className="size-3.5" /></Button> : null}</div>;
}
