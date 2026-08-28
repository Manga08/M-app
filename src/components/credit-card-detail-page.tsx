"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, CircleDollarSign, CreditCard, FileCheck2, FilePenLine, LoaderCircle, ReceiptText, Repeat2, Scale, WalletCards } from "lucide-react";
import { FinanceDataStateBadge, type FinanceDataState } from "@/components/finance-data-state";
import { LiabilityPaymentDialog, LiabilityPaymentRuleDialog } from "@/components/liability-payment-dialogs";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateControl, InputControl } from "@/components/ui/form-control";
import { FormDialogActions, FormDialogBody, FormDialogContent } from "@/components/ui/form-dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { accountBalance, currencyFormatter } from "@/lib/finance/calculations";
import { creditCardAvailable, creditCardCycle, creditCardDebt, creditCardStatementIsReconciled, creditCardUtilization } from "@/lib/finance/credit-cards";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import type { CreditCardStatement, LiabilityReconciliationPreview, Transaction } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

export function CreditCardDetailPage({ accountId }: { accountId: string }) {
  const { accounts, creditCards, creditCardStatements, creditCardPurchasePlans, creditCardInstallments, liabilityOverview, transactions, snapshot, listTransactions } = useFinance();
  const account = accounts.find((candidate) => candidate.id === accountId);
  const card = creditCards.find((candidate) => candidate.accountId === accountId);
  const [activity, setActivity] = useState<Transaction[]>(() => transactions.filter((item) => item.accountId === accountId));
  const [statementOpen, setStatementOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentRuleOpen, setPaymentRuleOpen] = useState(false);

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
    const statementRows = creditCardStatements
      .filter((item) => item.accountId === accountId)
      .sort((a, b) => b.cutoffOn.localeCompare(a.cutoffOn));
    const statement = statementRows.find((item) => item.cutoffOn === cycle.cutoffOn);
    return { debt, available: creditCardAvailable(card.creditLimit, debt), utilization: creditCardUtilization(card.creditLimit, debt), cycle, purchases, payments, statement, latestStatement: statementRows[0] };
  }, [account, accountId, activity, card, creditCardStatements, snapshot, transactions]);

  if (!account || !card || !data) return <div className="py-16 text-center"><WalletCards className="mx-auto size-8 text-muted-foreground" /><h1 className="mt-4 text-2xl font-medium">Tarjeta no disponible</h1><p className="mt-2 text-sm text-muted-foreground">Puede estar archivada o pertenecer a otra cuenta.</p><Button asChild variant="outline" className="mt-6 rounded-full"><Link href="/cuentas?vista=tarjetas"><ArrowLeft className="size-4" />Volver a tarjetas</Link></Button></div>;

  const money = currencyFormatter(account.currencyCode ?? "COP");
  const plans = creditCardPurchasePlans.filter((plan) => plan.accountId === accountId && plan.status === "active");
  const statements = creditCardStatements.filter((statement) => statement.accountId === accountId).slice(0, 6);
  const liability = liabilityOverview.items.find((item) => item.accountId === accountId);
  const pendingStatement = liability?.nextObligation?.kind === "credit_card_statement"
    ? liability.nextObligation
    : undefined;
  const currentTotal = pendingStatement?.remaining ?? data.debt;
  const minimumRemaining = pendingStatement
    ? Math.max(pendingStatement.minimumDue - pendingStatement.allocated, 0)
    : 0;
  const status = data.debt <= 0 ? "Sin deuda" : data.cycle.daysUntilUpcomingDue <= 3 ? "Pago cercano" : "Al día";
  const currentStatementState: FinanceDataState = creditCardStatementIsReconciled(data.statement) ? "confirmed" : data.statement ? "manual" : "estimated";
  const latestStatementState: FinanceDataState = creditCardStatementIsReconciled(data.latestStatement) ? "confirmed" : data.latestStatement ? "manual" : "calculated";

  return <>
    <header className="mb-7 border-b pb-6 lg:mb-10 lg:pb-8">
      <Link href="/cuentas?vista=tarjetas" className="coarse-target inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-[var(--motion-duration-state)] hover:text-foreground"><ArrowLeft className="size-4" />Tarjetas</Link>
      <div className="mt-5 flex min-w-0 items-start gap-4"><span className="grid size-14 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: `${account.color}1f`, color: account.color }}><FinanceIcon name={account.icon || "credit-card"} className="size-7" /></span><div className="min-w-0"><p className="text-xs uppercase tracking-[.14em] text-primary">{status}</p><h1 className="mt-1 truncate text-[clamp(1.8rem,7vw,3rem)] font-medium leading-tight tracking-[-.045em]">{account.name}</h1><div className="mt-2 flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground">{card.network.toUpperCase()}{card.lastFour ? ` · •••• ${card.lastFour}` : ""} · {account.currencyCode}</p><FinanceDataStateBadge state="calculated" /></div></div></div>
    </header>

    <section className="grid gap-7 border-b pb-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)] lg:gap-14 lg:pb-10" aria-labelledby="card-debt-title">
      <div><div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground">Deuda actual</p><FinanceDataStateBadge state="calculated" /></div><h2 id="card-debt-title" className="mt-2 text-[clamp(2.4rem,10vw,5rem)] font-medium leading-none tracking-[-.065em] tabular-nums">{money.format(data.debt)}</h2><p className="mt-4 text-sm text-muted-foreground">{money.format(data.available)} disponibles de {money.format(card.creditLimit)}</p><Progress className="mt-4 h-2" value={Math.min(100, data.utilization * 100)} label="Uso del cupo" valueText={`${Math.round(data.utilization * 100)}% del cupo`} indicatorClassName={data.utilization >= .9 ? "bg-destructive" : data.utilization >= .7 ? "bg-warning" : undefined} /></div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:border-l lg:pl-10"><Metric label="Próximo corte" value={formatFullDate(data.cycle.cutoffOn)} detail={`${data.cycle.daysUntilCutoff} días · aproximado`} /><Metric label="Próximo pago" value={pendingStatement ? formatFullDate(pendingStatement.dueOn) : data.debt <= 0 ? "Sin pago pendiente" : formatFullDate(data.cycle.upcomingDueOn)} detail={pendingStatement ? "saldo pendiente del extracto" : data.debt <= 0 ? "último extracto cubierto" : `${data.cycle.daysUntilUpcomingDue} días · aproximado`} /><Metric label="Compras del ciclo" value={money.format(data.statement?.purchases ?? data.purchases)} detail={creditCardStatementIsReconciled(data.statement) ? "confirmado" : data.statement ? "manual" : "calculado"} /><Metric label="Pagos del ciclo" value={money.format(data.statement?.payments ?? data.payments)} detail={creditCardStatementIsReconciled(data.statement) ? "confirmado" : data.statement ? "manual" : "calculado"} /></div>
    </section>

    <section className="border-b py-8 lg:py-10" aria-labelledby="cycle-title"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.14em] text-primary">Ciclo actual</p><h2 id="cycle-title" className="mt-1 text-xl font-medium">Compra → corte → pago</h2></div><FinanceDataStateBadge state={currentStatementState} /></div><CycleLine periodStart={data.cycle.periodStart} cutoffOn={data.cycle.cutoffOn} dueOn={data.statement?.dueOn ?? data.cycle.upcomingDueOn} /></section>

    <section className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)] lg:gap-14 lg:py-10">
      <div className="min-w-0"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="text-xs uppercase tracking-[.14em] text-primary">Actividad</p><h2 className="mt-1 text-xl font-medium">Últimos movimientos</h2></div><Button asChild variant="outline" className="rounded-full max-sm:w-full"><Link href={`/cuentas/tarjetas/${accountId}?overlay=movement&type=expense&account=${accountId}`}><ReceiptText className="size-4" />Registrar compra</Link></Button></div>{activity.length ? <div className="border-y">{activity.slice(0, 10).map((item) => <ActivityRow key={item.id} transaction={item} money={money} />)}</div> : <p className="border-y py-8 text-sm text-muted-foreground">Todavía no hay movimientos en esta tarjeta.</p>}</div>
      <aside className="rounded-3xl bg-secondary/25 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.14em] text-primary">Pago</p><h2 className="mt-1 text-xl font-medium">Qué debes cubrir</h2></div><FinanceDataStateBadge state={latestStatementState} /></div><p className="mt-5 text-3xl font-medium tracking-[-.04em] tabular-nums">{money.format(currentTotal)}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{data.latestStatement?.status === "paid" ? `El extracto con vencimiento ${formatFullDate(data.latestStatement.dueOn)} ya está cubierto.` : creditCardStatementIsReconciled(data.latestStatement) ? `Saldo pendiente del extracto con vencimiento ${formatFullDate(data.latestStatement!.dueOn)}.` : data.latestStatement ? `Extracto guardado sin conciliar, con vencimiento ${formatFullDate(data.latestStatement.dueOn)}.` : "Sin extracto guardado: usamos la deuda viva como referencia."}</p><dl className="mt-5 space-y-3"><PaymentReference label="Total del extracto (original)" value={data.latestStatement ? money.format(data.latestStatement.totalDue) : "Sin confirmar"} state={data.latestStatement ? latestStatementState : "estimated"} /><PaymentReference label="Pago mínimo pendiente" value={pendingStatement ? money.format(minimumRemaining) : data.latestStatement?.status === "paid" ? money.format(0) : "Sin confirmar"} state={pendingStatement || data.latestStatement?.status === "paid" ? latestStatementState : "estimated"} /><PaymentReference label="Otro valor" value="Lo eliges al registrar" state="manual" /></dl><details className="group mt-4 rounded-2xl bg-background/70 px-4 py-3"><summary className="coarse-target flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">Cómo se registra <ChevronDown className="size-4 text-muted-foreground transition-transform duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary><p className="mt-2 text-xs leading-5 text-muted-foreground">Elige la cuenta desde la que pagaste y escribe el valor real. Moneva lo guarda como transferencia: reduce la deuda sin duplicar el gasto.</p></details>{liability ? <div className="mt-5 grid gap-2"><Button type="button" className="h-12 w-full rounded-2xl" onClick={() => setPaymentOpen(true)} disabled={data.debt <= 0}><CircleDollarSign className="size-4" />Registrar pago</Button><Button type="button" variant="outline" className="h-12 w-full rounded-2xl" onClick={() => setPaymentRuleOpen(true)}><Repeat2 className="size-4" />{liability.paymentRule ? "Editar pago programado" : "Programar pago"}</Button>{liability.paymentRule ? <p className="text-center text-[11px] leading-5 text-muted-foreground">{liability.paymentRule.active ? "Regla activa" : "Regla pausada"} · {liability.paymentRule.recordingMode === "auto_post" ? "registro automático" : "confirmación manual"}</p> : null}</div> : <Button asChild className="mt-5 h-12 w-full rounded-2xl"><Link href={`/cuentas/tarjetas/${accountId}?overlay=movement&type=transfer&destination=${accountId}`}><CircleDollarSign className="size-4" />Registrar pago</Link></Button>}</aside>
    </section>

    <section className="border-t py-8 lg:py-10" aria-labelledby="installments-title"><div><p className="text-xs uppercase tracking-[.14em] text-primary">Compromisos futuros</p><h2 id="installments-title" className="mt-1 text-xl font-medium">Compras a cuotas</h2><p className="mt-1 text-sm text-muted-foreground">Las compras a una cuota ya forman parte del ciclo; aquí sólo aparecen las que tienen un plan futuro.</p></div>{plans.length ? <div className="mt-5 border-y">{plans.map((plan) => { const installmentRows = creditCardInstallments.filter((row) => row.planId === plan.id && row.status !== "cancelled"); const transaction = activity.find((item) => item.id === plan.transactionId) ?? transactions.find((item) => item.id === plan.transactionId); const next = installmentRows.find((row) => row.status === "planned" || row.status === "billed"); return <div key={plan.id} className="grid gap-3 border-b py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{transaction?.merchant || transaction?.description || "Compra a cuotas"}</p><FinanceDataStateBadge state={next?.status === "billed" ? "confirmed" : plan.financingType === "known_rate" ? "manual" : "estimated"} /></div><p className="mt-1 text-xs text-muted-foreground">{plan.installmentCount} cuotas · {plan.financingType === "no_interest" ? "sin interés registrado" : plan.financingType === "known_rate" ? `${plan.annualEffectiveRate}% E.A.` : "tasa por confirmar"}</p></div><div className="sm:text-right"><p className="font-medium tabular-nums">{next ? money.format(next.principal + next.estimatedInterest + next.estimatedFee) : "Completada"}</p><p className="mt-1 text-xs text-muted-foreground">{next ? `próxima ${formatFullDate(next.dueOn)}` : "sin cuotas pendientes"}</p></div></div>; })}</div> : <p className="mt-5 border-y py-7 text-sm text-muted-foreground">No hay planes de cuotas activos. Una compra sigue siendo un gasto completo; aquí solo se proyectan sus pagos.</p>}</section>

    <section className="border-t py-8 lg:py-10" aria-labelledby="statements-title"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs uppercase tracking-[.14em] text-primary">Referencia bancaria</p><h2 id="statements-title" className="mt-1 text-xl font-medium">Extractos guardados</h2><p className="mt-1 text-sm text-muted-foreground">Guardar conserva los datos; conciliar además los compara con tus movimientos.</p></div><Button type="button" variant="outline" className="rounded-full max-sm:w-full" onClick={() => setStatementOpen(true)}>{data.statement ? <FilePenLine className="size-4" /> : <FileCheck2 className="size-4" />}{data.statement ? "Editar extracto" : "Registrar extracto"}</Button></div>{statements.length ? <div className="mt-5 border-y">{statements.map((statement) => { const reconciled = creditCardStatementIsReconciled(statement); return <div key={statement.id} className="flex items-center justify-between gap-4 border-b py-4 last:border-b-0"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium capitalize">{new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${statement.cutoffOn}T00:00:00Z`))}</p><FinanceDataStateBadge state={reconciled ? "confirmed" : "manual"} /></div><p className="mt-1 text-xs text-muted-foreground">{reconciled ? `Conciliado · pago ${formatFullDate(statement.dueOn)}` : `Guardado sin conciliar · pago ${formatFullDate(statement.dueOn)}`}</p></div><p className="font-medium tabular-nums">{money.format(statement.totalDue)}</p></div>; })}</div> : <p className="mt-5 border-y py-7 text-sm text-muted-foreground">Aún no has guardado extractos. Los valores superiores siguen identificados como aproximados o calculados.</p>}</section>
    <StatementDialog key={`${data.statement?.id ?? "new"}:${data.statement?.version ?? 0}:${data.cycle.cutoffOn}`} open={statementOpen} onOpenChange={setStatementOpen} accountId={accountId} currencyCode={account.currencyCode ?? "COP"} cycle={data.cycle} estimate={{ totalDue: data.debt, purchases: data.purchases, payments: data.payments }} statement={data.statement} />
    {liability ? <LiabilityPaymentDialog key={`payment:${liability.accountId}:${liability.nextObligation?.id ?? "none"}`} item={liability} open={paymentOpen} onOpenChange={setPaymentOpen} /> : null}
    {liability ? <LiabilityPaymentRuleDialog key={`rule:${liability.accountId}:${liability.paymentRule?.id ?? "new"}`} item={liability} open={paymentRuleOpen} onOpenChange={setPaymentRuleOpen} /> : null}
  </>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium capitalize tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div>; }

function PaymentReference({ label, value, state }: { label: string; value: string; state: FinanceDataState }) {
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><dt className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{label}</span><FinanceDataStateBadge state={state} /></dt><dd className="break-words text-right text-sm font-medium tabular-nums">{value}</dd></div>;
}

function StatementDialog({ open, onOpenChange, accountId, currencyCode, cycle, estimate, statement }: { open: boolean; onOpenChange: (open: boolean) => void; accountId: string; currencyCode: string; cycle: ReturnType<typeof creditCardCycle>; estimate: { totalDue: number; purchases: number; payments: number }; statement?: CreditCardStatement }) {
  const { mutate, previewLiabilityReconciliation } = useFinance();
  const [busy, setBusy] = useState<"preview" | "open" | "reconcile" | null>(null);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [preview, setPreview] = useState<LiabilityReconciliationPreview>();
  const [error, setError] = useState<string>();
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
  const [exchangeRate, setExchangeRate] = useState(statement?.reconciliationExchangeRate ? formatMoneyInputValue(statement.reconciliationExchangeRate, "USD") : "");
  const reviewRef = useRef<HTMLElement>(null);
  const symbol = currencyCode === "USD" ? "US$" : "$";
  const money = currencyFormatter(currencyCode);
  const subtotal = parseMoneyInput(purchases) + parseMoneyInput(advances) + parseMoneyInput(interest) + parseMoneyInput(fees) - parseMoneyInput(payments) - parseMoneyInput(refunds);
  const moneyChange = (setValue: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => setValue(formatMoneyInput(event.target.value, currencyCode));
  const wasReconciled = creditCardStatementIsReconciled(statement);

  function resetDraft() {
    setBusy(null);
    setStep("edit");
    setPreview(undefined);
    setError(undefined);
    setPeriodStart(statement?.periodStart ?? cycle.periodStart);
    setPeriodEnd(statement?.periodEnd ?? cycle.cutoffOn);
    setCutoffOn(statement?.cutoffOn ?? cycle.cutoffOn);
    setDueOn(statement?.dueOn ?? cycle.dueOn);
    setTotalDue(formatMoneyInputValue(statement?.totalDue ?? estimate.totalDue, currencyCode));
    setMinimumDue(formatMoneyInputValue(statement?.minimumDue ?? 0, currencyCode));
    setPurchases(formatMoneyInputValue(statement?.purchases ?? estimate.purchases, currencyCode));
    setPayments(formatMoneyInputValue(statement?.payments ?? estimate.payments, currencyCode));
    setAdvances(formatMoneyInputValue(statement?.advances ?? 0, currencyCode));
    setInterest(formatMoneyInputValue(statement?.interest ?? 0, currencyCode));
    setFees(formatMoneyInputValue(statement?.fees ?? 0, currencyCode));
    setRefunds(formatMoneyInputValue(statement?.refunds ?? 0, currencyCode));
    setExchangeRate(statement?.reconciliationExchangeRate ? formatMoneyInputValue(statement.reconciliationExchangeRate, "USD") : "");
  }

  function changeOpen(next: boolean) {
    if (!next) resetDraft();
    onOpenChange(next);
  }

  useEffect(() => {
    if (step === "review") reviewRef.current?.focus();
  }, [step]);

  function statementInput(saveMode: "open" | "reconcile") {
    return {
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
      saveMode,
      reconciliationExchangeRate: saveMode === "reconcile" && preview?.requiresExchangeRate ? parseMoneyInput(exchangeRate) : undefined,
      reconciliationExchangeRateSource: saveMode === "reconcile" && preview?.requiresExchangeRate ? "manual" as const : undefined,
    };
  }

  async function reviewReconciliation() {
    setBusy("preview");
    setError(undefined);
    try {
      const total = parseMoneyInput(totalDue);
      if (parseMoneyInput(minimumDue) > total) throw new Error("El pago mínimo no puede superar el total del extracto.");
      const nextPreview = await previewLiabilityReconciliation(accountId, cutoffOn, total, {
        id: statement?.id,
        periodStart,
        interest: parseMoneyInput(interest),
        fees: parseMoneyInput(fees),
      });
      setPreview(nextPreview);
      setStep("review");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No pudimos comparar el extracto con tus movimientos.";
      setError(message);
      announceMutationError(caught, "No pudimos revisar la conciliación.");
    } finally {
      setBusy(null);
    }
  }

  async function save(saveMode: "open" | "reconcile") {
    setBusy(saveMode);
    setError(undefined);
    try {
      if (saveMode === "reconcile" && preview?.requiresExchangeRate && !(parseMoneyInput(exchangeRate) > 0)) {
        throw new Error("Escribe la tasa exacta usada para convertir los movimientos del extracto a pesos.");
      }
      const result = await mutate.upsertCreditCardStatement(statementInput(saveMode));
      announceMutation(result, saveMode === "open" ? "Extracto guardado sin conciliar" : statement ? "Conciliación actualizada" : "Extracto conciliado");
      changeOpen(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No pudimos guardar el extracto.";
      setError(message);
      announceMutationError(caught, saveMode === "open" ? "No pudimos guardar el extracto." : "No pudimos conciliar el extracto.");
    } finally {
      setBusy(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value;
    if (action === "save-open") await save("open");
    else if (action === "reconcile") await save("reconcile");
    else await reviewReconciliation();
  }

  const isBusy = busy !== null;
  return <Dialog open={open} onOpenChange={(next) => !isBusy && changeOpen(next)}><FormDialogContent variant="flow" showCloseButton={!isBusy}><form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}><FormDialogBody>
    <DialogHeader className="mb-7 pr-8"><p className="text-xs uppercase tracking-[.14em] text-primary">Extracto bancario</p><DialogTitle className="text-2xl">{step === "review" ? "Confirmar conciliación" : statement ? "Editar extracto" : "Registrar extracto"}</DialogTitle><DialogDescription>{step === "review" ? "Revisa la diferencia antes de cambiar el libro. Nada se ajusta hasta que confirmes." : "Guárdalo como referencia manual o compáralo con tus movimientos para conciliarlo. Moneva no solicita ni almacena el archivo, PAN, CVV o PIN."}</DialogDescription></DialogHeader>
    {step === "edit" ? <>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)] lg:gap-12">
        <div className="space-y-6"><div className="flex items-start justify-between gap-4"><div><p className="font-medium">Periodo y vencimiento</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Usa las fechas exactas impresas por el banco.</p></div><FinanceDataStateBadge state="manual" /></div><div className="grid gap-5 sm:grid-cols-2"><StatementField label="Inicio del periodo" htmlFor="statement-start"><DateControl id="statement-start" value={periodStart} onValueChange={setPeriodStart} required /></StatementField><StatementField label="Fin del periodo" htmlFor="statement-end"><DateControl id="statement-end" min={periodStart} value={periodEnd} onValueChange={setPeriodEnd} required /></StatementField><StatementField label="Fecha de corte" htmlFor="statement-cutoff"><DateControl id="statement-cutoff" min={periodStart} value={cutoffOn} onValueChange={setCutoffOn} required /></StatementField><StatementField label="Fecha límite de pago" htmlFor="statement-due"><DateControl id="statement-due" min={cutoffOn} value={dueOn} onValueChange={setDueOn} required /></StatementField></div><div className="grid gap-5 sm:grid-cols-2"><StatementField label="Total a pagar" htmlFor="statement-total"><InputControl id="statement-total" inputMode="decimal" value={totalDue} onChange={moneyChange(setTotalDue)} leading={<span className="text-xs font-medium">{symbol}</span>} required /></StatementField><StatementField label="Pago mínimo" htmlFor="statement-minimum"><InputControl id="statement-minimum" inputMode="decimal" value={minimumDue} onChange={moneyChange(setMinimumDue)} leading={<span className="text-xs font-medium">{symbol}</span>} required /></StatementField></div></div>
        <aside className="rounded-3xl bg-secondary/25 p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[.14em] text-primary">Referencia manual</p><h3 className="mt-1 text-lg font-medium">Guardar no ajusta tu saldo</h3></div><FinanceDataStateBadge state="manual" /></div><p className="mt-5 text-3xl font-medium tracking-[-.04em] tabular-nums">{money.format(parseMoneyInput(totalDue))}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Puedes conservar estos datos abiertos y conciliarlos después. Solo la confirmación de conciliación puede crear un ajuste.</p><dl className="mt-5 space-y-3"><PaymentReference label="Pago mínimo" value={money.format(parseMoneyInput(minimumDue))} state="manual" /><PaymentReference label="Vencimiento" value={formatFullDate(dueOn)} state="manual" /><PaymentReference label="Subtotal detallado" value={money.format(subtotal)} state="calculated" /></dl></aside>
      </div>
      <details className="group mt-8 rounded-2xl bg-secondary/25 px-4 py-3.5 sm:px-5"><summary className="coarse-target flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium"><span><span className="block">Composición del extracto</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Opcional · compras, pagos, intereses y cargos</span></span><ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary><div className="mt-5"><p className="mb-5 text-xs leading-5 text-muted-foreground">Deja en cero lo que el banco no desglose. El subtotal puede diferir del total si existe saldo anterior.</p><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><StatementField label="Compras" htmlFor="statement-purchases"><InputControl id="statement-purchases" inputMode="decimal" value={purchases} onChange={moneyChange(setPurchases)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField><StatementField label="Pagos" htmlFor="statement-payments"><InputControl id="statement-payments" inputMode="decimal" value={payments} onChange={moneyChange(setPayments)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField><StatementField label="Avances" htmlFor="statement-advances"><InputControl id="statement-advances" inputMode="decimal" value={advances} onChange={moneyChange(setAdvances)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField><StatementField label="Intereses" htmlFor="statement-interest"><InputControl id="statement-interest" inputMode="decimal" value={interest} onChange={moneyChange(setInterest)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField><StatementField label="Cargos y seguros" htmlFor="statement-fees"><InputControl id="statement-fees" inputMode="decimal" value={fees} onChange={moneyChange(setFees)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField><StatementField label="Devoluciones" htmlFor="statement-refunds"><InputControl id="statement-refunds" inputMode="decimal" value={refunds} onChange={moneyChange(setRefunds)} leading={<span className="text-xs font-medium">{symbol}</span>} /></StatementField></div></div></details>
    </> : preview ? <ReconciliationReview focusRef={reviewRef} preview={preview} money={money} exchangeRate={exchangeRate} onExchangeRateChange={setExchangeRate} /> : null}
    {error ? <p className="mt-5 rounded-2xl bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive" role="alert">{error}</p> : null}
  </FormDialogBody><FormDialogActions>{step === "review" ? <><Button type="submit" name="statement-action" value="reconcile" className="h-12 w-full rounded-2xl sm:w-auto sm:min-w-52" disabled={isBusy || (preview?.requiresExchangeRate && !(parseMoneyInput(exchangeRate) > 0))}>{busy === "reconcile" ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <FileCheck2 className="size-4" />}{busy === "reconcile" ? "Conciliando…" : preview?.isBalanced ? "Confirmar conciliación" : "Conciliar y crear ajuste"}</Button><Button type="button" variant="outline" className="h-12 w-full rounded-2xl sm:w-auto" onClick={() => { setStep("edit"); setPreview(undefined); setError(undefined); }} disabled={isBusy}><ArrowLeft className="size-4" />Volver a editar</Button></> : <><Button type="submit" name="statement-action" value="review" className="h-12 w-full rounded-2xl sm:w-auto sm:min-w-48" disabled={isBusy}>{busy === "preview" ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Scale className="size-4" />}{busy === "preview" ? "Comparando…" : "Revisar conciliación"}</Button>{!wasReconciled ? <Button type="submit" name="statement-action" value="save-open" variant="outline" className="h-12 w-full rounded-2xl sm:w-auto" disabled={isBusy}>{busy === "open" ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <FilePenLine className="size-4" />}{busy === "open" ? "Guardando…" : "Guardar sin conciliar"}</Button> : null}<Button type="button" variant="ghost" className="h-12 w-full rounded-2xl sm:mr-auto sm:w-auto" onClick={() => changeOpen(false)} disabled={isBusy}>Cancelar</Button></>}</FormDialogActions></form></FormDialogContent></Dialog>;
}

function ReconciliationReview({ focusRef, preview, money, exchangeRate, onExchangeRateChange }: { focusRef: React.Ref<HTMLElement>; preview: LiabilityReconciliationPreview; money: Intl.NumberFormat; exchangeRate: string; onExchangeRateChange: (value: string) => void }) {
  const differenceMoney = money.format(Math.abs(preview.difference));
  const hasStatementCharges = Math.abs(preview.interestToPost) > 0.01 || Math.abs(preview.feesToPost) > 0.01;
  const summary = preview.isBalanced
    ? hasStatementCharges
      ? "Al confirmar, Moneva registrará los intereses y cargos informados por el banco. Si vuelves a conciliar este extracto, no se duplicarán."
      : "Al confirmar, el extracto quedará conciliado sin crear movimientos nuevos."
    : preview.adjustmentKind === "adjustment_out"
      ? `Además de los intereses y cargos detallados, Moneva registrará ${differenceMoney} para aumentar la deuda y hacerla coincidir con el banco.`
      : `Además de los intereses y cargos detallados, Moneva registrará ${differenceMoney} para reducir la deuda y hacerla coincidir con el banco.`;

  return <section ref={focusRef} tabIndex={-1} aria-labelledby="statement-review-title" className="outline-none">
    <div className={cn("rounded-3xl p-5 sm:p-6", preview.isBalanced ? "bg-positive/10" : "bg-warning/10")}>
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[.14em] text-primary">Vista previa</p><h3 id="statement-review-title" className="mt-1 text-xl font-medium">{preview.isBalanced ? "El extracto y el libro coinciden" : "Hay una diferencia por ajustar"}</h3></div><FinanceDataStateBadge state="calculated" /></div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{summary}</p>
    </div>
    <dl className="mt-7 divide-y border-y">
      <ReviewAmount label="Deuda antes de este extracto" value={money.format(preview.ledgerDebtBeforeStatementCharges)} />
      {Math.abs(preview.interestToPost) > 0.01 ? <ReviewAmount label={preview.interestToPost > 0 ? "Intereses por registrar" : "Corrección de intereses"} value={`${preview.interestToPost > 0 ? "+" : "−"}${money.format(Math.abs(preview.interestToPost))}`} /> : null}
      {Math.abs(preview.feesToPost) > 0.01 ? <ReviewAmount label={preview.feesToPost > 0 ? "Cargos por registrar" : "Corrección de cargos"} value={`${preview.feesToPost > 0 ? "+" : "−"}${money.format(Math.abs(preview.feesToPost))}`} /> : null}
      <ReviewAmount label="Deuda después de esos cargos" value={money.format(preview.ledgerDebt)} />
      <ReviewAmount label="Total informado por el banco" value={money.format(preview.statementTotal)} />
      <ReviewAmount label="Diferencia restante" value={preview.isBalanced ? money.format(0) : `${preview.difference > 0 ? "+" : "−"}${differenceMoney}`} emphasis={!preview.isBalanced} />
    </dl>
    {preview.requiresExchangeRate ? <div className="mt-7 rounded-2xl bg-secondary/25 p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><div><Label htmlFor="statement-reconciliation-rate">Tasa exacta del extracto</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">COP por 1 USD. Usa la tasa aplicada por el banco; no una aproximación.</p></div><FinanceDataStateBadge state="manual" /></div><InputControl id="statement-reconciliation-rate" containerClassName="mt-4" inputMode="decimal" value={exchangeRate} onChange={(event) => onExchangeRateChange(formatMoneyInput(event.target.value, "USD"))} leading={<span className="text-xs font-medium">COP</span>} required aria-describedby="statement-reconciliation-rate-help" /><p id="statement-reconciliation-rate-help" className="mt-2 text-xs leading-5 text-muted-foreground">La tasa valora en pesos los intereses, cargos o ajustes que se registrarán en USD.</p></div> : null}
    <p className="mt-7 text-sm leading-6 text-muted-foreground">Confirma únicamente si estos valores corresponden al mismo corte. Después podrás identificar el extracto como <strong className="font-medium text-foreground">Confirmado</strong>.</p>
  </section>;
}

function ReviewAmount({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className={cn("text-right font-medium tabular-nums", emphasis && "text-warning")}>{value}</dd></div>;
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
