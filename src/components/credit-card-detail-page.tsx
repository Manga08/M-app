"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, CircleDollarSign, CreditCard, FileCheck2, LoaderCircle, ReceiptText, WalletCards } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateControl, InputControl } from "@/components/ui/form-control";
import { FormDialogActions, FormDialogBody, FormDialogContent } from "@/components/ui/form-dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { accountBalance, currencyFormatter } from "@/lib/finance/calculations";
import { creditCardAvailable, creditCardCycle, creditCardDebt, creditCardUtilization } from "@/lib/finance/credit-cards";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import type { CreditCardStatement, Transaction } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

export function CreditCardDetailPage({ accountId }: { accountId: string }) {
  const { accounts, creditCards, creditCardStatements, creditCardPurchasePlans, creditCardInstallments, transactions, snapshot, listTransactions } = useFinance();
  const account = accounts.find((candidate) => candidate.id === accountId);
  const card = creditCards.find((candidate) => candidate.accountId === accountId);
  const [activity, setActivity] = useState<Transaction[]>(() => transactions.filter((item) => item.accountId === accountId));
  const [statementOpen, setStatementOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void listTransactions({ accountId, limit: 100 }).then((page) => {
      if (active) setActivity([...page.items, ...page.related].filter((item) => item.accountId === accountId));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [accountId, listTransactions]);

  const data = useMemo(() => {
    if (!account || !card) return null;
    const debt = creditCardDebt(accountBalance(account, transactions, snapshot));
    const cycle = creditCardCycle(card);
    const currentActivity = activity.filter((item) => item.occurredOn >= cycle.periodStart && item.occurredOn <= cycle.cutoffOn);
    const purchases = currentActivity.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    const payments = currentActivity.filter((item) => item.kind === "transfer_in" || item.kind === "adjustment_in").reduce((sum, item) => sum + item.amount, 0);
    const statement = creditCardStatements.find((item) => item.accountId === accountId && item.cutoffOn === cycle.cutoffOn);
    return { debt, available: creditCardAvailable(card.creditLimit, debt), utilization: creditCardUtilization(card.creditLimit, debt), cycle, purchases, payments, statement };
  }, [account, accountId, activity, card, creditCardStatements, snapshot, transactions]);

  if (!account || !card || !data) return <div className="py-16 text-center"><WalletCards className="mx-auto size-8 text-muted-foreground" /><h1 className="mt-4 text-2xl font-medium">Tarjeta no disponible</h1><p className="mt-2 text-sm text-muted-foreground">Puede estar archivada o pertenecer a otra cuenta.</p><Button asChild variant="outline" className="mt-6 rounded-full"><Link href="/cuentas?vista=tarjetas"><ArrowLeft className="size-4" />Volver a tarjetas</Link></Button></div>;

  const money = currencyFormatter(account.currencyCode ?? "COP");
  const plans = creditCardPurchasePlans.filter((plan) => plan.accountId === accountId && plan.status === "active");
  const statements = creditCardStatements.filter((statement) => statement.accountId === accountId).slice(0, 6);
  const currentTotal = data.statement?.totalDue ?? data.debt;
  const status = data.debt <= 0 ? "Sin deuda" : data.cycle.daysUntilDue <= 3 ? "Pago cercano" : "Al día";

  return <>
    <header className="mb-7 border-b pb-6 lg:mb-10 lg:pb-8">
      <Link href="/cuentas?vista=tarjetas" className="coarse-target inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-[var(--motion-duration-state)] hover:text-foreground"><ArrowLeft className="size-4" />Tarjetas</Link>
      <div className="mt-5 flex min-w-0 items-start gap-4"><span className="grid size-14 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: `${account.color}1f`, color: account.color }}><FinanceIcon name={account.icon || "credit-card"} className="size-7" /></span><div className="min-w-0"><p className="text-xs uppercase tracking-[.14em] text-primary">{status}</p><h1 className="mt-1 truncate text-[clamp(1.8rem,7vw,3rem)] font-medium leading-tight tracking-[-.045em]">{account.name}</h1><p className="mt-1 text-sm text-muted-foreground">{card.network.toUpperCase()}{card.lastFour ? ` · •••• ${card.lastFour}` : ""} · {account.currencyCode}</p></div></div>
    </header>

    <section className="grid gap-7 border-b pb-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)] lg:gap-14 lg:pb-10" aria-labelledby="card-debt-title">
      <div><p className="text-sm text-muted-foreground">Deuda actual</p><h2 id="card-debt-title" className="mt-2 text-[clamp(2.4rem,10vw,5rem)] font-medium leading-none tracking-[-.065em] tabular-nums">{money.format(data.debt)}</h2><p className="mt-4 text-sm text-muted-foreground">{money.format(data.available)} disponibles de {money.format(card.creditLimit)}</p><Progress className="mt-4 h-2" value={Math.min(100, data.utilization * 100)} label="Uso del cupo" valueText={`${Math.round(data.utilization * 100)}% del cupo`} indicatorClassName={data.utilization >= .9 ? "bg-destructive" : data.utilization >= .7 ? "bg-warning" : undefined} /></div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:border-l lg:pl-10"><Metric label="Próximo corte" value={formatFullDate(data.cycle.cutoffOn)} detail={`${data.cycle.daysUntilCutoff} días`} /><Metric label="Próximo pago" value={formatFullDate(data.cycle.dueOn)} detail={`${data.cycle.daysUntilDue} días`} /><Metric label="Compras del ciclo" value={money.format(data.statement?.purchases ?? data.purchases)} detail={data.statement ? "extracto conciliado" : "estimado"} /><Metric label="Pagos del ciclo" value={money.format(data.statement?.payments ?? data.payments)} detail={data.statement ? "extracto conciliado" : "registrado"} /></div>
    </section>

    <section className="border-b py-8 lg:py-10" aria-labelledby="cycle-title"><div className="mb-7 flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.14em] text-primary">Ciclo actual</p><h2 id="cycle-title" className="mt-1 text-xl font-medium">Compra → corte → pago</h2></div><p className="text-xs text-muted-foreground">{data.statement ? "Conciliado" : "Estimado desde movimientos"}</p></div><CycleLine periodStart={data.cycle.periodStart} cutoffOn={data.cycle.cutoffOn} dueOn={data.cycle.dueOn} /></section>

    <section className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)] lg:gap-14 lg:py-10">
      <div className="min-w-0"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="text-xs uppercase tracking-[.14em] text-primary">Actividad</p><h2 className="mt-1 text-xl font-medium">Últimos movimientos</h2></div><Button asChild variant="outline" className="rounded-full max-sm:w-full"><Link href={`/cuentas/tarjetas/${accountId}?overlay=movement&type=expense&account=${accountId}`}><ReceiptText className="size-4" />Registrar compra</Link></Button></div>{activity.length ? <div className="border-y">{activity.slice(0, 10).map((item) => <ActivityRow key={item.id} transaction={item} money={money} />)}</div> : <p className="border-y py-8 text-sm text-muted-foreground">Todavía no hay movimientos en esta tarjeta.</p>}</div>
      <aside><p className="text-xs uppercase tracking-[.14em] text-primary">Pago</p><h2 className="mt-1 text-xl font-medium">Qué debes cubrir</h2><p className="mt-5 text-3xl font-medium tracking-[-.04em] tabular-nums">{money.format(currentTotal)}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{data.statement ? `Pago mínimo ${money.format(data.statement.minimumDue)}. Verifica siempre el valor contra tu extracto.` : "Aún no hay un extracto conciliado; mostramos la deuda viva como referencia."}</p><Button asChild className="mt-5 h-12 w-full rounded-2xl"><Link href={`/cuentas/tarjetas/${accountId}?overlay=movement&type=transfer&destination=${accountId}`}><CircleDollarSign className="size-4" />Registrar pago</Link></Button></aside>
    </section>

    <section className="border-t py-8 lg:py-10" aria-labelledby="installments-title"><div><p className="text-xs uppercase tracking-[.14em] text-primary">Compromisos futuros</p><h2 id="installments-title" className="mt-1 text-xl font-medium">Compras a cuotas</h2></div>{plans.length ? <div className="mt-5 border-y">{plans.map((plan) => { const installmentRows = creditCardInstallments.filter((row) => row.planId === plan.id && row.status !== "cancelled"); const transaction = activity.find((item) => item.id === plan.transactionId) ?? transactions.find((item) => item.id === plan.transactionId); const next = installmentRows.find((row) => row.status === "planned" || row.status === "billed"); return <div key={plan.id} className="grid gap-3 border-b py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-medium">{transaction?.merchant || transaction?.description || "Compra a cuotas"}</p><p className="mt-1 text-xs text-muted-foreground">{plan.installmentCount} cuotas · {plan.financingType === "no_interest" ? "sin interés registrado" : plan.financingType === "known_rate" ? `${plan.annualEffectiveRate}% E.A.` : "tasa por confirmar"}</p></div><div className="sm:text-right"><p className="font-medium tabular-nums">{next ? money.format(next.principal + next.estimatedInterest + next.estimatedFee) : "Completada"}</p><p className="mt-1 text-xs text-muted-foreground">{next ? `próxima ${formatFullDate(next.dueOn)}` : "sin cuotas pendientes"}</p></div></div>; })}</div> : <p className="mt-5 border-y py-7 text-sm text-muted-foreground">No hay planes de cuotas activos. Una compra sigue siendo un gasto completo; aquí solo se proyectan sus pagos.</p>}</section>

    <section className="border-t py-8 lg:py-10" aria-labelledby="statements-title"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs uppercase tracking-[.14em] text-primary">Historial verificable</p><h2 id="statements-title" className="mt-1 text-xl font-medium">Extractos conciliados</h2></div><Button type="button" variant="outline" className="rounded-full max-sm:w-full" onClick={() => setStatementOpen(true)}><FileCheck2 className="size-4" />Conciliar extracto</Button></div>{statements.length ? <div className="mt-5 border-y">{statements.map((statement) => <div key={statement.id} className="flex items-center justify-between gap-4 border-b py-4 last:border-b-0"><div><p className="font-medium capitalize">{new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${statement.cutoffOn}T00:00:00Z`))}</p><p className="mt-1 text-xs text-muted-foreground">Pago {formatFullDate(statement.dueOn)} · conciliado</p></div><p className="font-medium tabular-nums">{money.format(statement.totalDue)}</p></div>)}</div> : <p className="mt-5 border-y py-7 text-sm text-muted-foreground">Aún no has conciliado extractos. Los cálculos superiores están identificados como estimados.</p>}</section>
    <StatementDialog key={`${data.statement?.id ?? "new"}:${data.cycle.cutoffOn}`} open={statementOpen} onOpenChange={setStatementOpen} accountId={accountId} currencyCode={account.currencyCode ?? "COP"} cycle={data.cycle} estimate={{ totalDue: data.debt, purchases: data.purchases, payments: data.payments }} statement={data.statement} />
  </>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium capitalize tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div>; }

function StatementDialog({ open, onOpenChange, accountId, currencyCode, cycle, estimate, statement }: { open: boolean; onOpenChange: (open: boolean) => void; accountId: string; currencyCode: string; cycle: ReturnType<typeof creditCardCycle>; estimate: { totalDue: number; purchases: number; payments: number }; statement?: CreditCardStatement }) {
  const { mutate } = useFinance();
  const [saving, setSaving] = useState(false);
  const [periodStart, setPeriodStart] = useState(statement?.periodStart ?? cycle.periodStart);
  const [periodEnd, setPeriodEnd] = useState(statement?.periodEnd ?? cycle.cutoffOn);
  const [cutoffOn, setCutoffOn] = useState(statement?.cutoffOn ?? cycle.cutoffOn);
  const [dueOn, setDueOn] = useState(statement?.dueOn ?? cycle.dueOn);
  const [totalDue, setTotalDue] = useState(formatMoneyInputValue(statement?.totalDue ?? estimate.totalDue, currencyCode));
  const [minimumDue, setMinimumDue] = useState(formatMoneyInputValue(statement?.minimumDue ?? 0, currencyCode));
  const [purchases, setPurchases] = useState(formatMoneyInputValue(statement?.purchases ?? estimate.purchases, currencyCode));
  const [payments, setPayments] = useState(formatMoneyInputValue(statement?.payments ?? estimate.payments, currencyCode));
  const [advances, setAdvances] = useState(formatMoneyInputValue(statement?.advances ?? 0, currencyCode));
  const [interest, setInterest] = useState(formatMoneyInputValue(statement?.interest ?? 0, currencyCode));
  const [fees, setFees] = useState(formatMoneyInputValue(statement?.fees ?? 0, currencyCode));
  const [refunds, setRefunds] = useState(formatMoneyInputValue(statement?.refunds ?? 0, currencyCode));
  const symbol = currencyCode === "USD" ? "US$" : "$";
  const moneyChange = (setValue: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => setValue(formatMoneyInput(event.target.value, currencyCode));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await mutate.upsertCreditCardStatement({
        id: statement?.id,
        accountId,
        periodStart,
        periodEnd,
        cutoffOn,
        dueOn,
        totalDue: parseMoneyInput(totalDue),
        minimumDue: parseMoneyInput(minimumDue),
        purchases: parseMoneyInput(purchases),
        advances: parseMoneyInput(advances),
        interest: parseMoneyInput(interest),
        fees: parseMoneyInput(fees),
        payments: parseMoneyInput(payments),
        refunds: parseMoneyInput(refunds),
      });
      announceMutation(result, statement ? "Extracto actualizado" : "Extracto conciliado");
      onOpenChange(false);
    } catch (error) {
      announceMutationError(error, "No pudimos conciliar el extracto.");
    } finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><FormDialogContent variant="flow" showCloseButton={!saving}><form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}><FormDialogBody><DialogHeader className="mb-7 pr-8"><p className="text-xs uppercase tracking-[.14em] text-primary">Fuente verificable</p><DialogTitle className="text-2xl">Conciliar extracto</DialogTitle><DialogDescription>Transcribe los totales que muestra tu banco. Moneva no solicita ni almacena el archivo, el número completo, CVV o PIN.</DialogDescription></DialogHeader><div className="grid gap-7 lg:grid-cols-2 lg:gap-10"><div className="space-y-5"><p className="text-sm font-medium">Periodo y vencimiento</p><div className="grid gap-5 sm:grid-cols-2"><StatementField label="Inicio del periodo" htmlFor="statement-start"><DateControl id="statement-start" value={periodStart} onValueChange={setPeriodStart} required /></StatementField><StatementField label="Fin del periodo" htmlFor="statement-end"><DateControl id="statement-end" value={periodEnd} onValueChange={setPeriodEnd} required /></StatementField><StatementField label="Fecha de corte" htmlFor="statement-cutoff"><DateControl id="statement-cutoff" value={cutoffOn} onValueChange={setCutoffOn} required /></StatementField><StatementField label="Fecha límite de pago" htmlFor="statement-due"><DateControl id="statement-due" value={dueOn} onValueChange={setDueOn} required /></StatementField></div><div className="grid gap-5 sm:grid-cols-2"><StatementField label="Total a pagar" htmlFor="statement-total"><InputControl id="statement-total" inputMode="decimal" value={totalDue} onChange={moneyChange(setTotalDue)} leading={<span className="text-xs font-medium">{symbol}</span>} required /></StatementField><StatementField label="Pago mínimo" htmlFor="statement-minimum"><InputControl id="statement-minimum" inputMode="decimal" value={minimumDue} onChange={moneyChange(setMinimumDue)} leading={<span className="text-xs font-medium">{symbol}</span>} required /></StatementField></div></div><div className="space-y-5 lg:border-l lg:pl-8"><div><p className="text-sm font-medium">Composición del extracto</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Los campos sin valor pueden quedar en cero; no se inventan importes.</p></div><div className="grid gap-5 sm:grid-cols-2"><StatementField label="Compras" htmlFor="statement-purchases"><InputControl id="statement-purchases" inputMode="decimal" value={purchases} onChange={moneyChange(setPurchases)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField><StatementField label="Pagos" htmlFor="statement-payments"><InputControl id="statement-payments" inputMode="decimal" value={payments} onChange={moneyChange(setPayments)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField><StatementField label="Avances" htmlFor="statement-advances"><InputControl id="statement-advances" inputMode="decimal" value={advances} onChange={moneyChange(setAdvances)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField><StatementField label="Intereses" htmlFor="statement-interest"><InputControl id="statement-interest" inputMode="decimal" value={interest} onChange={moneyChange(setInterest)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField><StatementField label="Cargos" htmlFor="statement-fees"><InputControl id="statement-fees" inputMode="decimal" value={fees} onChange={moneyChange(setFees)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField><StatementField label="Devoluciones" htmlFor="statement-refunds"><InputControl id="statement-refunds" inputMode="decimal" value={refunds} onChange={moneyChange(setRefunds)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField></div></div></div></FormDialogBody><FormDialogActions><Button type="submit" className="h-12 w-full rounded-2xl sm:w-auto sm:min-w-44" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <FileCheck2 className="size-4" />}{saving ? "Guardando…" : "Guardar conciliación"}</Button><Button type="button" variant="outline" className="h-12 w-full rounded-2xl sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button></FormDialogActions></form></FormDialogContent></Dialog>;
}

function StatementField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) { return <div><Label htmlFor={htmlFor}>{label}</Label><div className="mt-2">{children}</div></div>; }

function CycleLine({ periodStart, cutoffOn, dueOn }: { periodStart: string; cutoffOn: string; dueOn: string }) { return <div className="relative grid grid-cols-3 before:absolute before:left-[8%] before:right-[8%] before:top-3 before:h-px before:bg-border"><CyclePoint icon={ReceiptText} label="Comienza" value={formatDate(periodStart)} /><CyclePoint icon={CalendarDays} label="Corte" value={formatDate(cutoffOn)} /><CyclePoint icon={CreditCard} label="Pago" value={formatDate(dueOn)} /></div>; }

function CyclePoint({ icon: Icon, label, value }: { icon: typeof CreditCard; label: string; value: string }) { return <div className="relative z-10 text-center"><span className="mx-auto grid size-6 place-items-center rounded-full bg-background ring-1 ring-border"><Icon className="size-3 text-primary" /></span><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium capitalize">{value}</p></div>; }

function ActivityRow({ transaction, money }: { transaction: Transaction; money: Intl.NumberFormat }) {
  const incoming = transaction.kind === "transfer_in" || transaction.kind === "adjustment_in";
  return <Link href={`/movimientos?overlay=movement&transaction=${transaction.id}`} className="flex min-h-16 items-center gap-3 border-b py-3 last:border-b-0 transition-colors duration-[var(--motion-duration-state)] hover:bg-secondary/20 focus-visible:bg-secondary/25"><span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", incoming ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}><FinanceIcon name={transaction.icon || (incoming ? "arrow-down-left" : "receipt")} className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{transaction.merchant || transaction.description}</span><span className="mt-1 block text-xs text-muted-foreground">{formatFullDate(transaction.occurredOn)}</span></span><span className={cn("shrink-0 text-sm font-medium tabular-nums", incoming ? "text-success" : "text-destructive")}>{incoming ? "+" : "−"}{money.format(transaction.amount)}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /></Link>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function formatFullDate(value: string) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
