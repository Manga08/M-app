"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus, Scale } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { categorySpend, groupBudgetSummary } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const groupNames = { needs: "Necesidades", wants: "Gustos", savings: "Ahorros", investments: "Inversiones", debts: "Deudas", income: "Ingresos" } as const;

export function BudgetsPage() {
  const { categories, budgets, transactions, updateBudget } = useFinance();
  const [selectedGroup, setSelectedGroup] = useState<keyof typeof groupNames>("needs");
  const groups = useMemo(() => groupBudgetSummary(categories, budgets, transactions), [categories, budgets, transactions]);
  const totalBudget = groups.reduce((sum, group) => sum + group.budget, 0);
  const income = transactions.filter((transaction) => transaction.kind === "income" && transaction.occurredOn.startsWith("2026-08")).reduce((sum, transaction) => sum + transaction.amount, 0);
  const visible = categories.filter((category) => category.group === selectedGroup && category.kind === "expense");

  return <>
    <PageHeader eyebrow="Plan mensual" title="Presupuestos" description="Distribuye tu ingreso con intención. Ajusta una cifra y Moneva recalcula el disponible sin hacerte saltar entre pantallas." />
    <section className="grid gap-8 border-b pb-9 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
      <div><div className="mb-6 flex items-end justify-between"><div><p className="text-sm text-muted-foreground">Ingreso mensual</p><p className="mt-1 text-3xl font-medium tracking-[-0.045em]">{money.format(income)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Asignado</p><p className={cn("mt-1 text-lg font-medium", totalBudget > income && "text-destructive")}>{Math.round((totalBudget / Math.max(income, 1)) * 100)}%</p></div></div><div className="flex h-3 overflow-hidden rounded-full bg-muted">{groups.map((group) => <span key={group.group} className={cn(group.group === "needs" && "bg-sky-400", group.group === "wants" && "bg-rose-400", group.group === "savings" && "bg-emerald-400", group.group === "investments" && "bg-violet-400", group.group === "debts" && "bg-orange-400")} style={{ width: `${(group.budget / Math.max(income, 1)) * 100}%` }} />)}</div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{money.format(totalBudget)} asignados</span><span>{money.format(income - totalBudget)} sin asignar</span></div></div>
      <div className="rounded-2xl bg-secondary/65 p-5"><div className="flex gap-3"><Scale className="mt-0.5 size-5 text-primary" /><div><p className="font-medium">Guía 50 / 30 / 20</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Usa 50% para necesidades, 30% para gustos y 20% para ahorro o inversión. Es una guía, no una regla.</p></div></div></div>
    </section>
    <section className="pt-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-xl font-medium tracking-tight">Detalle por categoría</h2><p className="mt-1 text-sm text-muted-foreground">Edita con controles rápidos o escribe un monto.</p></div><div className="flex gap-2 overflow-x-auto pb-1">{groups.map((group) => <Button key={group.group} variant={selectedGroup === group.group ? "secondary" : "ghost"} size="sm" className={cn("shrink-0 rounded-full", selectedGroup === group.group && "text-primary")} onClick={() => setSelectedGroup(group.group)}>{groupNames[group.group]}</Button>)}</div></div>
      <div>{visible.map((category) => { const budget = budgets.find((item) => item.categoryId === category.id && item.month === "2026-08-01"); const spent = categorySpend(transactions, category.id); const percent = budget?.amount ? Math.round((spent / budget.amount) * 100) : 0; return <div key={category.id} className="grid min-h-[82px] grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b py-3 md:grid-cols-[minmax(150px,0.8fr)_minmax(180px,1fr)_160px_130px]"><div><p className="text-sm font-medium">{category.name}</p><p className="mt-1 text-xs text-muted-foreground">{money.format(spent)} usados</p></div><div className="hidden h-1.5 overflow-hidden rounded-full bg-muted md:block"><span className={cn("block h-full rounded-full", percent > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(percent, 100)}%` }} /></div><BudgetEditor amount={budget?.amount ?? 0} onSave={async (amount) => { await updateBudget(category.id, amount); toast.success("Presupuesto actualizado"); }} /><div className="hidden text-right md:block"><p className={cn("text-sm font-medium", percent > 100 && "text-destructive")}>{percent}%</p><p className="text-xs text-muted-foreground">{money.format((budget?.amount ?? 0) - spent)} libres</p></div></div>; })}</div>
    </section>
  </>;
}

function BudgetEditor({ amount, onSave }: { amount: number; onSave: (amount: number) => void }) {
  const [value, setValue] = useState(amount);
  return <div className="flex items-center justify-end gap-1"><Button type="button" variant="outline" size="icon-sm" aria-label="Reducir presupuesto" onClick={() => setValue(Math.max(0, value - 50000))}><Minus className="size-3.5" /></Button><input aria-label="Monto presupuestado" className="h-8 w-24 rounded-lg border bg-transparent px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring" inputMode="numeric" value={value} onChange={(event) => setValue(Number(event.target.value.replace(/\D/g, "")))} /><Button type="button" variant="outline" size="icon-sm" aria-label="Aumentar presupuesto" onClick={() => setValue(value + 50000)}><Plus className="size-3.5" /></Button>{value !== amount && <Button type="button" size="icon-sm" aria-label="Guardar presupuesto" onClick={() => onSave(value)}><Check className="size-3.5" /></Button>}</div>;
}
