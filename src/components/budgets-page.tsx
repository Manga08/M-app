"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus, RotateCcw, Scale } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { categorySpend, currencyFormatter, groupBudgetSummary, monthLabel, monthTotals } from "@/lib/finance/calculations";
import type { ExpenseGroup, GroupAllocation } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const groupNames: Record<ExpenseGroup, string> = { needs: "Necesidades", wants: "Gustos", savings: "Ahorros", investments: "Inversiones", debts: "Deudas" };
const groupColors: Record<ExpenseGroup, string> = { needs: "bg-sky-400", wants: "bg-rose-400", savings: "bg-emerald-400", investments: "bg-violet-400", debts: "bg-orange-400" };
const defaultAllocation: Record<ExpenseGroup, number> = { needs: 50, wants: 30, savings: 10, investments: 10, debts: 0 };
const PAGE_SIZE = 8;

export function BudgetsPage() {
  const { profile, categories, budgets, transactions, groupAllocations, currentMonth, updateBudget, updateGroupAllocations } = useFinance();
  const [selectedGroup, setSelectedGroup] = useState<ExpenseGroup>("needs");
  const [page, setPage] = useState(1);
  const groups = useMemo(() => groupBudgetSummary(categories, budgets, transactions, currentMonth), [categories, budgets, transactions, currentMonth]);
  const totals = monthTotals(transactions, currentMonth);
  const money = currencyFormatter(profile?.currencyCode);
  const totalBudget = groups.reduce((sum, group) => sum + group.budget, 0);
  const visible = categories.filter((category) => category.group === selectedGroup && category.kind === "expense");
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visiblePage = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const allocationKey = groupAllocations.map((allocation) => `${allocation.group}:${allocation.targetPercent}`).join("|") || "defaults";

  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Presupuestos" description="Define cuánto de tu ingreso quieres dedicar a cada grupo y distribúyelo entre tus categorías." />

    <AllocationEditor key={allocationKey} allocations={groupAllocations} income={totals.income} money={money} onSave={updateGroupAllocations} />

    <section className="grid gap-8 border-b py-9 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
      <div><div className="mb-6 flex items-end justify-between"><div><p className="text-sm text-muted-foreground">Ingreso del mes</p><p className="mt-1 text-3xl font-medium tracking-[-0.045em]">{money.format(totals.income)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Presupuestado</p><p className={cn("mt-1 text-lg font-medium", totalBudget > totals.income && "text-destructive")}>{Math.round((totalBudget / Math.max(totals.income, 1)) * 100)}%</p></div></div><div className="flex h-3 overflow-hidden rounded-full bg-muted">{groups.map((group) => <span key={group.group} className={groupColors[group.group]} style={{ width: `${(group.budget / Math.max(totals.income, 1)) * 100}%` }} />)}</div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{money.format(totalBudget)} presupuestados</span><span>{money.format(totals.income - totalBudget)} sin asignar</span></div></div>
      <div className="rounded-2xl bg-secondary/65 p-5"><div className="flex gap-3"><Scale className="mt-0.5 size-5 text-primary" /><div><p className="font-medium">Tu regla, no una regla ajena</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Necesidades, gustos, ahorros, inversiones y deudas son grupos de gasto independientes. Un grupo puede quedar en 0%; entre todos deben sumar 100%.</p></div></div></div>
    </section>

    <section className="pt-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-xl font-medium tracking-tight">Detalle por categoría</h2><p className="mt-1 text-sm text-muted-foreground">Edita con controles rápidos o escribe un monto.</p></div><div className="flex gap-2 overflow-x-auto pb-1">{groups.map((group) => <Button key={group.group} variant={selectedGroup === group.group ? "secondary" : "ghost"} size="sm" className={cn("shrink-0 rounded-full", selectedGroup === group.group && "text-primary")} onClick={() => { setSelectedGroup(group.group); setPage(1); }}>{groupNames[group.group]}</Button>)}</div></div>
      <div>{visiblePage.map((category) => { const budget = budgets.find((item) => item.categoryId === category.id && item.month === currentMonth); const spent = categorySpend(transactions, category.id, currentMonth); const percent = budget?.amount ? Math.round((spent / budget.amount) * 100) : 0; return <div key={category.id} className="grid min-h-[82px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b py-3 md:grid-cols-[minmax(150px,0.8fr)_minmax(180px,1fr)_160px_130px]"><div><p className="text-sm font-medium">{category.name}</p><p className="mt-1 text-xs text-muted-foreground">{money.format(spent)} usados</p></div><div className="hidden h-1.5 overflow-hidden rounded-full bg-muted md:block"><span className={cn("block h-full rounded-full", percent > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(percent, 100)}%` }} /></div><BudgetEditor key={`${budget?.id ?? category.id}:${budget?.amount ?? 0}`} amount={budget?.amount ?? 0} onSave={async (amount) => { await updateBudget(category.id, amount); toast.success("Presupuesto actualizado"); }} /><div className="hidden text-right md:block"><p className={cn("text-sm font-medium", percent > 100 && "text-destructive")}>{percent}%</p><p className="text-xs text-muted-foreground">{money.format((budget?.amount ?? 0) - spent)} libres</p></div></div>; })}</div>
      {!visible.length ? <div className="py-14 text-center text-sm text-muted-foreground">Todavía no hay categorías dentro de {groupNames[selectedGroup].toLocaleLowerCase("es")}.</div> : null}
      <PaginationControls page={safePage} pageCount={pageCount} onPageChange={setPage} total={visible.length} label="categorías" />
    </section>
  </>;
}

function AllocationEditor({ allocations, income, money, onSave }: { allocations: GroupAllocation[]; income: number; money: Intl.NumberFormat; onSave: (items: Array<Pick<GroupAllocation, "group" | "targetPercent">>) => Promise<void> }) {
  const saved = { ...defaultAllocation, ...Object.fromEntries(allocations.map((allocation) => [allocation.group, allocation.targetPercent])) };
  const [draft, setDraft] = useState<Record<ExpenseGroup, number>>(saved);
  const total = Object.values(draft).reduce((sum, value) => sum + value, 0);
  const changed = (Object.keys(defaultAllocation) as ExpenseGroup[]).some((group) => draft[group] !== saved[group]);

  async function save() {
    if (total !== 100) { toast.error("Los cinco porcentajes deben sumar exactamente 100%."); return; }
    await onSave((Object.keys(draft) as ExpenseGroup[]).map((group) => ({ group, targetPercent: draft[group] })));
    toast.success("Distribución principal actualizada");
  }

  return <section className="border-b pb-9">
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-xl font-medium tracking-tight">Distribución principal</h2><p className="mt-1 text-sm text-muted-foreground">Las cinco categorías base se mantienen; tú decides sus porcentajes.</p></div><div className="flex items-center gap-2"><Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => setDraft(defaultAllocation)}><RotateCcw className="size-4" />50 / 30 / 10 / 10</Button><Button type="button" size="sm" className="rounded-full" disabled={!changed || total !== 100} onClick={save}>Guardar distribución</Button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{(Object.keys(groupNames) as ExpenseGroup[]).map((group) => <div key={group} className="border-b py-4 xl:border-b-0 xl:border-r xl:pr-4 last:border-r-0"><div className="flex items-center gap-2"><i className={cn("size-2.5 rounded-full", groupColors[group])} /><p className="text-sm font-medium">{groupNames[group]}</p></div><div className="mt-4 flex items-center gap-2"><input aria-label={`Porcentaje para ${groupNames[group]}`} type="number" min={0} max={100} step={1} value={draft[group]} onChange={(event) => setDraft({ ...draft, [group]: Math.min(100, Math.max(0, Number(event.target.value))) })} className="h-11 min-w-0 flex-1 rounded-xl border bg-transparent px-3 text-right text-xl font-medium tabular-nums outline-none focus:ring-2 focus:ring-ring" /><span className="text-sm text-muted-foreground">%</span></div><p className="mt-2 text-xs text-muted-foreground">{money.format((income * draft[group]) / 100)} objetivo</p></div>)}</div>
    <div className={cn("mt-5 flex items-center justify-between rounded-xl px-4 py-3 text-sm", total === 100 ? "bg-primary/8 text-primary" : "bg-destructive/8 text-destructive")}><span>Total asignado</span><strong className="tabular-nums">{total}%</strong></div>
  </section>;
}

function BudgetEditor({ amount, onSave }: { amount: number; onSave: (amount: number) => void }) {
  const [value, setValue] = useState(amount);
  return <div className="flex items-center justify-end gap-1"><Button type="button" variant="outline" size="icon-sm" aria-label="Reducir presupuesto" onClick={() => setValue(Math.max(0, value - 50000))}><Minus className="size-3.5" /></Button><input aria-label="Monto presupuestado" className="h-8 w-24 rounded-lg border bg-transparent px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring" inputMode="numeric" value={value} onChange={(event) => setValue(Number(event.target.value.replace(/\D/g, "")))} /><Button type="button" variant="outline" size="icon-sm" aria-label="Aumentar presupuesto" onClick={() => setValue(value + 50000)}><Plus className="size-3.5" /></Button>{value !== amount ? <Button type="button" size="icon-sm" aria-label="Guardar presupuesto" onClick={() => onSave(value)}><Check className="size-3.5" /></Button> : null}</div>;
}
