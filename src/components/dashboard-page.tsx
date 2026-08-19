"use client";

import Link from "next/link";
import { ChevronRight, CircleDollarSign, Search, SlidersHorizontal } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { currencyFormatter, groupBudgetSummary, localIsoDate, monthLabel, monthTotals } from "@/lib/finance/calculations";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import type { Transaction } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const { profile, transactions, categories, budgets, groupAllocations, snapshot, currentMonth } = useFinance();
  const money = currencyFormatter(profile?.currencyCode);
  const totals = monthTotals(transactions, currentMonth, snapshot);
  const available = totals.income - totals.expense;
  const availablePercent = Math.round((available / Math.max(totals.income, 1)) * 100);
  const boundedAvailablePercent = Math.max(0, Math.min(100, availablePercent));
  const groups = groupBudgetSummary(categories, budgets, transactions, groupAllocations, currentMonth, snapshot);
  const recent = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const todayIso = localIsoDate(new Date(), profile?.timezone);
  const currentDay = Number(todayIso.slice(8, 10));
  const [currentYear, currentMonthNumber] = currentMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(currentYear, currentMonthNumber, 0)).getUTCDate();
  const daysRemaining = Math.max(0, daysInMonth - currentDay);
  const shortMonth = monthLabel(currentMonth, "short").replace(/ de \d{4}/, "");

  return <div className="min-w-0" data-dashboard>
    <section className="min-w-0 pb-8 md:border-b md:border-border/75 lg:pb-10" data-dashboard-hero>
      <div className="max-w-[42rem]">
        <p className="mb-2 text-sm text-muted-foreground">Hola, {profile?.displayName.split(" ")[0] || "hola"} <span aria-hidden="true">👋</span></p><h1 className="text-balance text-[clamp(1.9rem,4vw,3.3rem)] font-medium leading-[1.04] tracking-[-0.055em]">Tu dinero, en calma.</h1><p className="mt-3 max-w-xl text-pretty text-sm leading-6 text-muted-foreground">Tienes {daysRemaining} {daysRemaining === 1 ? "día" : "días"} para cerrar {shortMonth}. Cada cifra de esta vista sale de tus propios movimientos.</p>
      </div>
      <div className="mt-8 grid min-w-0 grid-cols-2 gap-y-6 sm:mt-10 md:grid-cols-[minmax(0,1.65fr)_minmax(0,.675fr)_minmax(0,.675fr)] md:gap-0">
        <div className="col-span-2 min-w-0 [container-type:inline-size] md:col-span-1 md:pr-10 lg:pr-12"><p className="text-xs text-muted-foreground">Disponible este mes</p><p className="mt-1 whitespace-nowrap text-[clamp(2.15rem,13cqi,4.25rem)] font-medium leading-none tracking-[-0.06em] tabular-nums" data-dashboard-balance>{money.format(available)}</p><div className="mt-6 grid min-w-0 grid-cols-[minmax(7rem,1fr)_auto] items-center gap-4 text-xs text-muted-foreground"><span className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Porcentaje del ingreso disponible" aria-valuemin={0} aria-valuemax={100} aria-valuenow={boundedAvailablePercent}><span className="block h-full rounded-full bg-primary" style={{ width: `${boundedAvailablePercent}%` }} /></span><span className="text-right tabular-nums">{availablePercent}% del ingreso disponible</span></div></div>
        <Metric label="Ingresos" value={money.format(totals.income)} note="Clasificados por tipo de ingreso" />
        <Metric label="Salidas" value={money.format(totals.expense)} note={`${Math.round((totals.expense / Math.max(totals.income, 1)) * 100)}% de tus ingresos`} mobileDivider />
      </div>
    </section>

    <section className="grid min-w-0 gap-9 py-8 lg:py-10 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)] xl:gap-12">
      <div className="min-w-0" data-dashboard-budget>
        <div className="mb-6 flex items-end justify-between"><div><h2 className="text-lg font-medium tracking-tight">Presupuesto en marcha</h2><p className="mt-1 text-sm text-muted-foreground">{money.format(groups.reduce((sum, group) => sum + group.budget, 0))} asignados · {money.format(groups.reduce((sum, group) => sum + group.spent, 0))} usados</p></div><Link href="/presupuestos" className="hidden items-center gap-1 text-xs font-medium text-primary sm:flex">Ver presupuesto <ChevronRight className="size-3.5" /></Link></div>
        <div className="space-y-1">{groups.map((group) => <CategoryRow key={group.group} {...group} icon={groupAllocations.find((item) => item.group === group.group)?.icon ?? "tag"} money={money} />)}</div>
      </div>
      <div className="min-w-0 xl:border-l xl:pl-9" data-dashboard-pulse>
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-medium tracking-tight">Pulso de {shortMonth}</h2><p className="mt-1 text-sm text-muted-foreground">Lo importante, sin ruido</p></div><CircleDollarSign className="size-5 text-primary" /></div>
        <div className="space-y-5"><Insight value={`${availablePercent}%`} label="del ingreso sigue disponible" tone="text-positive" /><Insight value={money.format(totals.expense / Math.max(currentDay, 1))} label="promedio diario de salida" /><Insight value={`${groups.filter((group) => group.percent >= 85).length} alertas`} label="categorías cerca del límite" tone="text-warning" /></div>
      </div>
    </section>

    <section className="pt-8 sm:border-t">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-medium tracking-tight">Últimos movimientos</h2><p className="mt-1 text-sm text-muted-foreground">Todo lo que pasó, en un vistazo</p></div><div className="flex gap-2"><Button asChild variant="outline" size="sm" className="gap-2 rounded-full"><Link href="/movimientos"><Search className="size-4" />Buscar</Link></Button><Button asChild variant="outline" size="sm" className="gap-2 rounded-full"><Link href="/movimientos"><SlidersHorizontal className="size-4" />Filtrar</Link></Button></div></div>
      <div>{recent.length ? recent.map((transaction) => { const category = categories.find((item) => item.id === transaction.categoryId); return <TransactionRow key={transaction.id} transaction={transaction} category={category?.name} icon={transaction.icon ?? category?.icon ?? (transaction.kind.startsWith("transfer") ? "hand-coins" : transaction.kind === "income" ? "coins" : "receipt")} money={money} />; }) : <p className="border-y py-7 text-sm text-muted-foreground">Cuando registres tu primer movimiento aparecerá aquí, ordenado del más reciente al más antiguo.</p>}</div>
    </section>
  </div>;
}

function Metric({ label, value, note, mobileDivider = false }: { label: string; value: string; note: string; mobileDivider?: boolean }) { return <div className={cn("min-w-0 border-border md:border-l md:px-7", mobileDivider && "border-l pl-4 min-[360px]:pl-5 md:pl-7")}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 truncate text-[clamp(1.05rem,5.6vw,1.5rem)] font-medium tracking-[-0.04em] tabular-nums">{value}</p><p className="mt-1 text-pretty text-[11px] leading-4 text-muted-foreground min-[360px]:text-xs md:min-h-8">{note}</p></div>; }

function CategoryRow({ name, color, budget, spent, percent, icon, money }: ReturnType<typeof groupBudgetSummary>[number] & { icon: string; money: Intl.NumberFormat }) {
  return <Link href="/presupuestos" className="group grid min-h-[70px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-left transition-colors hover:bg-foreground/[0.025] active:bg-secondary/50 sm:grid-cols-[170px_minmax(120px,1fr)_130px_auto] sm:gap-4 sm:border-b"><span className="flex min-w-0 items-center gap-3 text-sm font-medium"><span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ color, backgroundColor: `${color}16` }}><FinanceIcon name={icon} className="size-[17px]" /></span><span className="truncate">{name}</span></span><span className="hidden h-1.5 overflow-hidden rounded-full bg-muted sm:block" role="progressbar" aria-label={`Presupuesto usado en ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(percent, 100))}><span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(percent, 100))}%`, backgroundColor: color }} /></span><span className="text-right"><span className="block text-sm font-medium tabular-nums">{money.format(spent)}</span><span className="text-[11px] text-muted-foreground">de {money.format(budget)}</span></span><span className={cn("hidden w-12 text-right text-xs tabular-nums text-muted-foreground sm:block", percent > 100 && "text-destructive")}>{percent}%</span></Link>;
}

function Insight({ value, label, tone }: { value: string; label: string; tone?: string }) { return <div className="flex items-baseline gap-3 sm:border-b sm:pb-4"><span className={cn("text-xl font-medium tracking-tight tabular-nums", tone)}>{value}</span><span className="text-sm text-muted-foreground">{label}</span></div>; }

function TransactionRow({ transaction, category, icon, money }: { transaction: Transaction; category?: string; icon: string; money: Intl.NumberFormat }) {
  const income = transaction.kind === "income" || transaction.kind === "transfer_in";
  return <Link href="/movimientos" className="group grid min-h-[66px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2 text-left transition-colors hover:bg-foreground/[0.025] active:bg-secondary/50 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(120px,0.8fr)_auto_auto] sm:gap-4 sm:border-b"><span className={cn("grid size-9 place-items-center rounded-full", income ? "bg-positive/12 text-positive" : "bg-warning/12 text-warning")}><FinanceIcon name={icon} className="size-[17px]" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{transaction.merchant || transaction.description}</span><span className="block truncate text-xs text-muted-foreground sm:hidden">{category || "Transferencia"}</span></span><span className="hidden text-xs text-muted-foreground sm:block">{category || "Transferencia"}</span><span className="hidden text-xs text-muted-foreground sm:block">{new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${transaction.occurredOn}T00:00:00Z`))}</span><span className={cn("text-right text-sm font-medium tabular-nums", income && "text-positive")}>{income ? "+" : "-"}{money.format(transaction.amount)}</span></Link>;
}
