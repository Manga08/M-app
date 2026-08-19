"use client";

import Link from "next/link";
import { ChevronRight, CircleDollarSign, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { currencyFormatter, groupBudgetSummary, monthLabel, monthTotals } from "@/lib/finance/calculations";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import type { Transaction } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const { profile, transactions, categories, budgets, groupAllocations, snapshot, currentMonth } = useFinance();
  const money = currencyFormatter(profile?.currencyCode);
  const totals = monthTotals(transactions, currentMonth, snapshot);
  const available = totals.income - totals.expense;
  const groups = groupBudgetSummary(categories, budgets, transactions, groupAllocations, currentMonth, snapshot);
  const recent = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(0, daysInMonth - today.getDate());
  const shortMonth = monthLabel(currentMonth, "short").replace(/ de \d{4}/, "");

  return <>
    <section className="relative overflow-hidden border-b pb-8 lg:pb-10">
      <div className="pointer-events-none absolute -right-28 top-0 size-80 rounded-full bg-primary/7 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-8 xl:flex-row xl:items-end">
        <div><p className="mb-2 text-sm text-muted-foreground">Hola, {profile?.displayName.split(" ")[0] || "hola"} <span aria-hidden="true">👋</span></p><h1 className="text-balance text-[clamp(1.9rem,4vw,3.3rem)] font-medium leading-[1.04] tracking-[-0.055em]">Tu dinero, en calma.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Tienes {daysRemaining} {daysRemaining === 1 ? "día" : "días"} para cerrar {shortMonth}. Cada cifra de esta vista sale de tus propios movimientos.</p></div>
        <Button onClick={() => window.dispatchEvent(new Event("moneva:quick-add"))} className="h-12 w-full gap-2 rounded-full px-6 text-[15px] shadow-[0_10px_28px_-12px_var(--primary)] sm:w-fit"><Plus className="size-[18px]" /> Registrar movimiento</Button>
      </div>
      <div className="relative mt-9 grid gap-7 md:grid-cols-[minmax(0,1.5fr)_1fr_1fr] md:gap-0">
        <div className="md:pr-8"><p className="text-xs text-muted-foreground">Disponible este mes</p><p className="mt-1 text-[clamp(2rem,10vw,4.5rem)] font-medium leading-none tracking-[-0.06em] tabular-nums">{money.format(available)}</p><div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, Math.round((available / Math.max(totals.income, 1)) * 100)))}%` }} /></span>{Math.round((available / Math.max(totals.income, 1)) * 100)}% del ingreso disponible</div></div>
        <Metric label="Ingresos" value={money.format(totals.income)} note="Nómina y otros" positive />
        <Metric label="Salidas" value={money.format(totals.expense)} note={`${Math.round((totals.expense / Math.max(totals.income, 1)) * 100)}% de tus ingresos`} />
      </div>
    </section>

    <section className="grid gap-10 py-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] xl:gap-14">
      <div>
        <div className="mb-6 flex items-end justify-between"><div><h2 className="text-lg font-medium tracking-tight">Presupuesto en marcha</h2><p className="mt-1 text-sm text-muted-foreground">{money.format(groups.reduce((sum, group) => sum + group.budget, 0))} asignados · {money.format(groups.reduce((sum, group) => sum + group.spent, 0))} usados</p></div><Link href="/presupuestos" className="hidden items-center gap-1 text-xs font-medium text-primary sm:flex">Ver presupuesto <ChevronRight className="size-3.5" /></Link></div>
        <div className="space-y-1">{groups.map((group) => <CategoryRow key={group.group} {...group} icon={groupAllocations.find((item) => item.group === group.group)?.icon ?? "tag"} money={money} />)}</div>
      </div>
      <div className="border-t pt-8 xl:border-l xl:border-t-0 xl:pl-10 xl:pt-0">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-medium tracking-tight">Pulso de {shortMonth}</h2><p className="mt-1 text-sm text-muted-foreground">Lo importante, sin ruido</p></div><CircleDollarSign className="size-5 text-primary" /></div>
        <div className="space-y-5"><Insight value={`${Math.round((available / Math.max(totals.income, 1)) * 100)}%`} label="del ingreso sigue disponible" tone="text-emerald-300" /><Insight value={money.format(totals.expense / Math.max(today.getDate(), 1))} label="promedio diario de salida" /><Insight value={`${groups.filter((group) => group.percent >= 85).length} alertas`} label="categorías cerca del límite" tone="text-amber-300" /></div>
      </div>
    </section>

    <section className="border-t pt-8">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-medium tracking-tight">Últimos movimientos</h2><p className="mt-1 text-sm text-muted-foreground">Todo lo que pasó, en un vistazo</p></div><div className="flex gap-2"><Button asChild variant="outline" size="sm" className="gap-2 rounded-full"><Link href="/movimientos"><Search className="size-4" />Buscar</Link></Button><Button asChild variant="outline" size="sm" className="gap-2 rounded-full"><Link href="/movimientos"><SlidersHorizontal className="size-4" />Filtrar</Link></Button></div></div>
      <div>{recent.map((transaction) => { const category = categories.find((item) => item.id === transaction.categoryId); return <TransactionRow key={transaction.id} transaction={transaction} category={category?.name} icon={transaction.icon ?? category?.icon ?? (transaction.kind.startsWith("transfer") ? "hand-coins" : transaction.kind === "income" ? "coins" : "receipt")} money={money} />; })}</div>
    </section>
  </>;
}

function Metric({ label, value, note, positive = false }: { label: string; value: string; note: string; positive?: boolean }) { return <div className="border-border md:border-l md:px-8"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-medium tracking-[-0.04em] tabular-nums">{value}</p><p className={cn("mt-1 text-xs text-muted-foreground", positive && "text-emerald-300")}>{note}</p></div>; }

function CategoryRow({ name, color, budget, spent, percent, icon, money }: ReturnType<typeof groupBudgetSummary>[number] & { icon: string; money: Intl.NumberFormat }) {
  return <Link href="/presupuestos" className="group grid min-h-[70px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b py-3 text-left transition-colors hover:bg-foreground/[0.025] active:bg-secondary/50 sm:grid-cols-[170px_minmax(120px,1fr)_130px_auto]"><span className="flex min-w-0 items-center gap-3 text-sm font-medium"><span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ color, backgroundColor: `${color}16` }}><FinanceIcon name={icon} className="size-[17px]" /></span><span className="truncate">{name}</span></span><span className="hidden h-1.5 overflow-hidden rounded-full bg-muted sm:block"><span className="block h-full rounded-full" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }} /></span><span className="text-right"><span className="block text-sm font-medium tabular-nums">{money.format(spent)}</span><span className="text-[11px] text-muted-foreground">de {money.format(budget)}</span></span><span className={cn("hidden w-12 text-right text-xs tabular-nums text-muted-foreground sm:block", percent > 100 && "text-destructive")}>{percent}%</span></Link>;
}

function Insight({ value, label, tone }: { value: string; label: string; tone?: string }) { return <div className="flex items-baseline gap-3 border-b pb-4"><span className={cn("text-xl font-medium tracking-tight tabular-nums", tone)}>{value}</span><span className="text-sm text-muted-foreground">{label}</span></div>; }

function TransactionRow({ transaction, category, icon, money }: { transaction: Transaction; category?: string; icon: string; money: Intl.NumberFormat }) {
  const income = transaction.kind === "income" || transaction.kind === "transfer_in";
  return <Link href="/movimientos" className="group grid min-h-[66px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b py-2 text-left transition-colors hover:bg-foreground/[0.025] active:bg-secondary/50 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(120px,0.8fr)_auto_auto] sm:gap-4"><span className={cn("grid size-9 place-items-center rounded-full", income ? "bg-emerald-400/12 text-emerald-300" : "bg-amber-400/12 text-amber-300")}><FinanceIcon name={icon} className="size-[17px]" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{transaction.merchant || transaction.description}</span><span className="block truncate text-xs text-muted-foreground sm:hidden">{category || "Transferencia"}</span></span><span className="hidden text-xs text-muted-foreground sm:block">{category || "Transferencia"}</span><span className="hidden text-xs text-muted-foreground sm:block">{transaction.occurredOn}</span><span className={cn("text-right text-sm font-medium tabular-nums", income && "text-emerald-300")}>{income ? "+" : "-"}{money.format(transaction.amount)}</span></Link>;
}
