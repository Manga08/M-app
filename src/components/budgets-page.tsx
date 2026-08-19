"use client";

import { useMemo, useState } from "react";
import { Check, LoaderCircle, Minus, Plus, Scale } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { categorySpend, currencyFormatter, groupBudgetSummary, monthLabel, monthTotals } from "@/lib/finance/calculations";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

export function BudgetsPage({ embedded = false }: { embedded?: boolean }) {
  const { profile, categories, budgets, transactions, groupAllocations, snapshot, currentMonth, updateBudget } = useFinance();
  const activeGroups = useMemo(() => groupAllocations.filter((group) => !group.archived).sort((a, b) => a.sortOrder - b.sortOrder), [groupAllocations]);
  const [selectedGroup, setSelectedGroup] = useState(() => activeGroups[0]?.group ?? "");
  const [page, setPage] = useState(1);
  const groups = useMemo(() => groupBudgetSummary(categories, budgets, transactions, groupAllocations, currentMonth, snapshot), [categories, budgets, transactions, groupAllocations, currentMonth, snapshot]);
  const selected = activeGroups.find((group) => group.group === selectedGroup) ?? activeGroups[0];
  const totals = monthTotals(transactions, currentMonth, snapshot);
  const money = currencyFormatter(profile?.currencyCode);
  const totalBudget = groups.reduce((sum, group) => sum + group.budget, 0);
  const unassignedBudget = totals.income - totalBudget;
  const visible = categories.filter((category) => !category.archived && category.group === selected?.group && category.kind === "expense");
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visiblePage = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return <>
    {!embedded ? <PageHeader eyebrow={monthLabel(currentMonth)} title="Plan" description="Distribuye el 100% entre tus grupos y asigna montos mensuales a cada subcategoría desde un solo lugar." /> : <div className="mb-6"><h2 className="text-2xl font-medium tracking-[-.035em]">Montos del mes</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Convierte tu estructura en límites concretos para {monthLabel(currentMonth).toLocaleLowerCase("es")}.</p></div>}

    <section className="grid gap-8 border-b pb-9 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
      <div><div className="mb-6 flex items-end justify-between"><div><p className="text-sm text-muted-foreground">Ingreso del mes</p><p className="mt-1 text-3xl font-medium tracking-[-0.045em]">{money.format(totals.income)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Presupuestado</p><p className={cn("mt-1 text-lg font-medium", totalBudget > totals.income && "text-destructive")}>{Math.round((totalBudget / Math.max(totals.income, 1)) * 100)}%</p></div></div><div className="flex h-3 overflow-hidden rounded-full bg-muted">{groups.map((group) => <span key={group.group} style={{ width: `${(group.budget / Math.max(totals.income, 1)) * 100}%`, backgroundColor: group.color }} />)}</div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{money.format(totalBudget)} presupuestados</span><span className={cn(unassignedBudget < 0 && "text-destructive")}>{unassignedBudget >= 0 ? `${money.format(unassignedBudget)} sin asignar` : `${money.format(Math.abs(unassignedBudget))} por encima del ingreso`}</span></div></div>
      <div className="rounded-2xl bg-secondary/65 p-5"><div className="flex gap-3"><Scale className="mt-0.5 size-5 text-primary" /><div><p className="font-medium">Un solo plan, dos niveles</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Tus {activeGroups.length} {activeGroups.length === 1 ? "grupo principal define" : "grupos principales definen"} el 100%; aquí repartes ese objetivo entre subcategorías sin duplicar configuraciones.</p></div></div></div>
    </section>

    <section className="pt-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-xl font-medium tracking-tight">Detalle por subcategoría</h2><p className="mt-1 text-sm text-muted-foreground">Edita con controles rápidos o escribe un monto.</p></div><div className="mobile-scroll-x -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">{activeGroups.map((group) => <Button key={group.group} variant={selected?.group === group.group ? "secondary" : "ghost"} size="sm" className={cn("shrink-0 rounded-full", selected?.group === group.group && "text-primary")} onClick={() => { setSelectedGroup(group.group); setPage(1); }}><i className="size-2 rounded-full" style={{ backgroundColor: group.color }} />{group.name}</Button>)}</div></div>
      <div>{visiblePage.map((category) => { const budget = budgets.find((item) => item.categoryId === category.id && item.month === currentMonth); const spent = categorySpend(transactions, category.id, currentMonth, snapshot); const percent = budget?.amount ? Math.round((spent / budget.amount) * 100) : 0; return <div key={category.id} className="grid min-h-[82px] grid-cols-1 gap-3 border-b py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:py-3 md:grid-cols-[minmax(150px,0.8fr)_minmax(180px,1fr)_190px_130px]"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><FinanceIcon name={category.icon} className="size-[18px]" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{category.name}</span><span className="mt-1 block text-xs text-muted-foreground">{money.format(spent)} usados</span></span></div><div className="hidden h-1.5 overflow-hidden rounded-full bg-muted md:block"><span className={cn("block h-full rounded-full", percent > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(percent, 100)}%` }} /></div><BudgetEditor key={`${budget?.id ?? category.id}:${budget?.amount ?? 0}`} amount={budget?.amount ?? 0} onSave={async (amount) => { await updateBudget(category.id, amount); toast.success("Presupuesto actualizado"); }} /><div className="hidden text-right md:block"><p className={cn("text-sm font-medium", percent > 100 && "text-destructive")}>{percent}%</p><p className="text-xs text-muted-foreground">{money.format((budget?.amount ?? 0) - spent)} libres</p></div></div>; })}</div>
      {!visible.length && selected ? <div className="py-14 text-center text-sm text-muted-foreground">Todavía no hay subcategorías dentro de {selected.name.toLocaleLowerCase("es")}. Créala en la pestaña Estructura.</div> : null}
      {!activeGroups.length ? <div className="py-14 text-center text-sm text-muted-foreground">Crea un grupo principal para empezar a presupuestar.</div> : null}
      <PaginationControls page={safePage} pageCount={pageCount} onPageChange={setPage} total={visible.length} label="subcategorías" />
    </section>
  </>;
}

function BudgetEditor({ amount, onSave }: { amount: number; onSave: (amount: number) => Promise<void> | void }) {
  const [value, setValue] = useState(amount);
  const [saving, setSaving] = useState(false);
  const changed = value !== amount;
  async function save() { if (!changed || saving) return; setSaving(true); try { await onSave(value); } finally { setSaving(false); } }
  return <div className="grid w-full grid-cols-[44px_minmax(0,1fr)_44px_44px] items-center gap-2 sm:w-auto sm:grid-cols-[28px_96px_28px_28px] sm:gap-1"><Button type="button" variant="outline" size="icon-sm" aria-label="Reducir presupuesto" disabled={saving} onClick={() => setValue((current) => Math.max(0, current - 50000))}><Minus className="size-[18px] sm:size-3.5" /></Button><input aria-label="Monto presupuestado" className="h-11 min-w-0 rounded-xl border bg-secondary/20 px-3 text-right text-base tabular-nums outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-3 focus:ring-ring/30 sm:h-8 sm:rounded-lg sm:px-2 sm:text-sm" inputMode="numeric" value={value} disabled={saving} onChange={(event) => setValue(Number(event.target.value.replace(/\D/g, "")))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } }} /><Button type="button" variant="outline" size="icon-sm" aria-label="Aumentar presupuesto" disabled={saving} onClick={() => setValue((current) => current + 50000)}><Plus className="size-[18px] sm:size-3.5" /></Button><Button type="button" size="icon-sm" aria-label="Guardar presupuesto" aria-hidden={!changed} tabIndex={changed ? 0 : -1} className={cn("transition-[opacity,transform]", !changed && "invisible opacity-0")} disabled={!changed || saving} onClick={() => void save()}>{saving ? <LoaderCircle className="size-[18px] animate-spin sm:size-3.5" /> : <Check className="size-[18px] sm:size-3.5" />}</Button></div>;
}
