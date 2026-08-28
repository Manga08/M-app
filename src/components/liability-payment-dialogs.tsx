"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Check, CircleDollarSign, LoaderCircle, RefreshCw } from "lucide-react";
import { FinanceDataStateBadge } from "@/components/finance-data-state";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateControl, InputControl, SelectControl } from "@/components/ui/form-control";
import { FormDialogActions, FormDialogBody, FormDialogContent } from "@/components/ui/form-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { currencyFormatter, localIsoDate } from "@/lib/finance/calculations";
import { getOfficialTrm } from "@/lib/finance/exchange-rate";
import {
  liabilityPaymentBreakdown,
  liabilityPaymentStrategyLabel,
  liabilityRecordingModeLabel,
} from "@/lib/finance/liabilities";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import type {
  LiabilityOverviewItem,
  LiabilityPaymentIntent,
  LiabilityPaymentRecordingMode,
  LiabilityPaymentStrategy,
} from "@/lib/finance/types";

type DialogProps = {
  item: LiabilityOverviewItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestedIntent?: LiabilityPaymentIntent;
};

type PaymentChoice = "minimum" | "due" | "balance" | "custom";

/**
 * Records a liability payment as a paired transfer. Cross-currency payments use
 * the exact rate chosen here; a reference quote is never posted silently.
 */
export function LiabilityPaymentDialog({ item, open, onOpenChange, suggestedIntent }: DialogProps) {
  if (!open) return null;
  return <OpenLiabilityPaymentDialog item={item} open onOpenChange={onOpenChange} suggestedIntent={suggestedIntent} />;
}

function OpenLiabilityPaymentDialog({ item, open, onOpenChange, suggestedIntent }: DialogProps) {
  const finance = useFinance();
  const today = localIsoDate(new Date(), finance.profile?.timezone);
  const liabilityCurrency = item.currencyCode;
  const eligibleAccounts = finance.accounts.filter((account) => !account.archived && account.id !== item.accountId && account.type !== "credit");
  const suggestedAccountId = item.paymentRule?.fundingAccountId && eligibleAccounts.some((account) => account.id === item.paymentRule?.fundingAccountId)
    ? item.paymentRule.fundingAccountId
    : eligibleAccounts[0]?.id ?? "";
  const [choice, setChoice] = useState<PaymentChoice>(suggestedIntent ? "custom" : item.nextObligation ? "due" : "balance");
  const [fundingAccountId, setFundingAccountId] = useState(suggestedAccountId);
  const [amount, setAmount] = useState(() => formatMoneyInputValue(suggestedIntent?.plannedAmount ?? defaultPaymentAmount(item, item.nextObligation ? "due" : "balance"), liabilityCurrency));
  const [occurredOn, setOccurredOn] = useState(today);
  const [exchangeRate, setExchangeRate] = useState("");
  const [saving, setSaving] = useState(false);
  const fundingAccount = eligibleAccounts.find((account) => account.id === fundingAccountId);
  const fundingCurrency = fundingAccount?.currencyCode === "USD" ? "USD" : "COP";
  const liabilityAmount = parseMoneyInput(amount);
  const rate = parseMoneyInput(exchangeRate);
  const needsRate = liabilityCurrency === "USD" || fundingCurrency === "USD";
  const fundingAmount = paymentFundingAmount(liabilityAmount, liabilityCurrency, fundingCurrency, rate);
  const postingRates = paymentExchangeRates(liabilityAmount, liabilityCurrency, fundingAmount, fundingCurrency, rate);
  const nextRemaining = item.nextObligation?.remaining ?? 0;
  const allocatedToNext = item.nextObligation ? Math.min(liabilityAmount, nextRemaining) : 0;
  const paymentBreakdown = liabilityPaymentBreakdown({
    amount: allocatedToNext,
    allocated: item.nextObligation?.allocated,
    interestDue: item.nextObligation?.interestDue,
    feeDue: item.nextObligation?.feeDue,
    includeContractCosts: item.kind !== "credit_card",
  });
  const principalPaid = Math.max(liabilityAmount - paymentBreakdown.interest - paymentBreakdown.fee, 0);
  const matchingIntent = suggestedIntent ?? finance.liabilityPaymentIntents.find((intent) => intent.accountId === item.accountId
    && ["planned", "needs_confirmation", "confirmed", "failed"].includes(intent.status)
    && (!intent.obligationId || intent.obligationId === item.nextObligation?.id));
  const extraPrincipal = Math.max(liabilityAmount - allocatedToNext, 0);
  const canRecalculatePrepayment = item.kind !== "credit_card"
    && item.currentTerms?.prepaymentStrategy !== "manual"
    && !item.currentTerms?.variableRate
    && item.currentTerms?.calculationMethod !== "manual"
    && item.currentTerms?.amortizationMethod !== "manual";

  useEffect(() => {
    if (!open || !needsRate || exchangeRate) return;
    const controller = new AbortController();
    void getOfficialTrm(occurredOn, controller.signal)
      .then((quote) => setExchangeRate(formatMoneyInputValue(quote.rate, "USD")))
      .catch(() => undefined);
    return () => controller.abort();
  }, [exchangeRate, needsRate, occurredOn, open]);

  function selectChoice(next: PaymentChoice) {
    setChoice(next);
    if (next !== "custom") setAmount(formatMoneyInputValue(defaultPaymentAmount(item, next), liabilityCurrency));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fundingAccount) return;
    setSaving(true);
    try {
      const result = await finance.mutate.recordLiabilityPayment({
        accountId: item.accountId,
        fundingAccountId,
        liabilityAmount,
        fundingAmount,
        occurredOn,
        description: `Pago de ${item.accountName}`,
        intentId: matchingIntent?.id,
        fundingExchangeRate: postingRates.fundingExchangeRate,
        liabilityExchangeRate: postingRates.liabilityExchangeRate,
        fundingExchangeRateSource: fundingCurrency === "COP" ? "same_currency" : "manual",
        liabilityExchangeRateSource: liabilityCurrency === "COP" ? "same_currency" : "manual",
        allocations: item.nextObligation && nextRemaining > 0
          ? [{ obligationId: item.nextObligation.id, amount: Math.min(liabilityAmount, nextRemaining), allocatedOn: occurredOn }]
          : [],
      });
      announceMutation(result, "Pago registrado");
      onOpenChange(false);
    } catch (error) {
      announceMutationError(error, "No pudimos registrar el pago.");
    } finally {
      setSaving(false);
    }
  }

  const valid = Boolean(fundingAccount && liabilityAmount > 0 && fundingAmount > 0 && (!needsRate || rate > 0));
  const liabilityMoney = currencyFormatter(liabilityCurrency);
  const fundingMoney = currencyFormatter(fundingCurrency);

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><FormDialogContent variant="flow" showCloseButton={!saving}><form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}><FormDialogBody>
    <DialogHeader className="mb-7 pr-8"><p className="text-xs font-medium uppercase tracking-[.14em] text-primary">{suggestedIntent ? "Pago pendiente de confirmar" : "Pago de obligación"}</p><DialogTitle className="text-2xl tracking-[-.035em] sm:text-3xl">{suggestedIntent ? "Confirma lo que realmente pagaste" : "Registrar un pago real"}</DialogTitle><DialogDescription>Moneva crea una transferencia: sale dinero de tu cuenta y baja la deuda. El gasto original no se registra otra vez.</DialogDescription></DialogHeader>
    <div className="space-y-7">
      <section aria-labelledby="payment-amount-title"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="payment-amount-title" className="font-medium">¿Cuánto pagaste?</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Elige una referencia o escribe otro valor.</p></div><FinanceDataStateBadge state={choice === "custom" ? "manual" : item.nextObligation ? "confirmed" : "calculated"} /></div>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-secondary/55 p-1 sm:grid-cols-4" role="group" aria-label="Elegir monto del pago">
          {paymentChoices(item).map((option) => <button key={option.value} type="button" aria-pressed={choice === option.value} disabled={option.disabled} onClick={() => selectChoice(option.value)} className="coarse-target min-w-0 rounded-xl px-2 py-2.5 text-xs font-medium text-muted-foreground outline-none transition-[color,background-color,box-shadow,transform] duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-out)] aria-pressed:bg-background aria-pressed:text-primary aria-pressed:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 active:scale-[var(--motion-press-scale)] motion-reduce:transition-none"><span className="block truncate">{option.label}</span>{option.amount > 0 ? <span className="mt-1 block truncate text-[10px] font-normal tabular-nums">{liabilityMoney.format(option.amount)}</span> : null}</button>)}
        </div>
        <div className="mt-5"><Label htmlFor="liability-payment-amount">Valor total del pago</Label><InputControl id="liability-payment-amount" containerClassName="mt-2" inputMode="decimal" value={amount} onChange={(event) => { setChoice("custom"); setAmount(formatMoneyInput(event.target.value, liabilityCurrency)); }} leading={<span className="text-xs font-semibold">{liabilityCurrency}</span>} required /></div>
        {paymentBreakdown.interest > 0 || paymentBreakdown.fee > 0 ? <div className="mt-4 rounded-2xl bg-secondary/45 px-4 py-3.5" aria-label="Distribución estimada de este pago"><p className="text-xs leading-5 text-muted-foreground">Moneva separará los costos para no confundirlos con dinero que realmente reduce la deuda.</p><dl className="mt-3 grid grid-cols-3 gap-3 text-xs"><div><dt className="text-muted-foreground">Capital</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{liabilityMoney.format(principalPaid)}</dd></div><div><dt className="text-muted-foreground">Intereses</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{liabilityMoney.format(paymentBreakdown.interest)}</dd></div><div><dt className="text-muted-foreground">Cargos</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{liabilityMoney.format(paymentBreakdown.fee)}</dd></div></dl></div> : null}
        {extraPrincipal > 0.01 && item.kind !== "credit_card" ? <div className="mt-4 rounded-2xl bg-primary/8 px-4 py-3.5 text-xs leading-5"><p className="font-medium text-foreground">{liabilityMoney.format(extraPrincipal)} adicionales irán a capital.</p><p className="mt-1 text-muted-foreground">{canRecalculatePrepayment ? item.currentTerms?.prepaymentStrategy === "reduce_term" ? "Moneva reducirá el número de cuotas futuras sin tocar tu historial." : "Moneva recalculará cuotas futuras más bajas sin tocar tu historial." : "El saldo bajará hoy. Como la tasa o el calendario necesita confirmación, revisa después el nuevo plan informado por el acreedor."}</p></div> : null}
      </section>

      <section className="rounded-[22px] bg-secondary/25 p-4 sm:p-5" aria-labelledby="payment-origin-title"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-primary"><CircleDollarSign className="size-[18px]" aria-hidden="true" /></span><div><h3 id="payment-origin-title" className="font-medium">De dónde salió el dinero</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Selecciona la cuenta que realmente usaste.</p></div></div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2"><div><Label htmlFor="liability-payment-account">Cuenta de pago</Label><SelectControl id="liability-payment-account" containerClassName="mt-2" value={fundingAccountId} onValueChange={(value) => { setFundingAccountId(value); setExchangeRate(""); }} required><option value="">Selecciona una cuenta</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode ?? "COP"}</option>)}</SelectControl></div><div><Label htmlFor="liability-payment-date">Fecha real</Label><DateControl id="liability-payment-date" containerClassName="mt-2" value={occurredOn} onValueChange={(value) => { setOccurredOn(value); setExchangeRate(""); }} required /></div></div>
        {needsRate ? <div className="mt-5 rounded-2xl bg-background/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium">Conversión exacta</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Escribe los pesos por dólar que realmente usó el banco. La referencia automática se puede reemplazar.</p></div><FinanceDataStateBadge state="manual" /></div><div className="mt-4"><Label htmlFor="liability-payment-rate">COP por 1 USD</Label><InputControl id="liability-payment-rate" containerClassName="mt-2" inputMode="decimal" value={exchangeRate} onChange={(event) => setExchangeRate(formatMoneyInput(event.target.value, "USD"))} leading={<span className="text-xs font-semibold">COP</span>} required /></div>{fundingAmount > 0 ? <p className="mt-3 text-xs leading-5 text-muted-foreground">Saldrán <strong className="font-medium text-foreground">{fundingMoney.format(fundingAmount)}</strong> y bajarán <strong className="font-medium text-foreground">{liabilityMoney.format(liabilityAmount)}</strong> de la deuda.</p> : null}</div> : fundingAccount ? <p className="mt-4 text-xs leading-5 text-muted-foreground">Saldrán {fundingMoney.format(fundingAmount)} de {fundingAccount.name}.</p> : null}
      </section>
    </div>
  </FormDialogBody><FormDialogActions><Button type="submit" className="h-12 w-full rounded-2xl sm:w-auto sm:min-w-44" disabled={saving || !valid}>{saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Check className="size-4" />}{saving ? "Registrando…" : "Registrar pago"}</Button><Button type="button" variant="outline" className="h-12 w-full rounded-2xl sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button></FormDialogActions></form></FormDialogContent></Dialog>;
}

/** Configures a future payment rule. USD remains confirmation-only by design. */
export function LiabilityPaymentRuleDialog({ item, open, onOpenChange }: DialogProps) {
  if (!open) return null;
  return <OpenLiabilityPaymentRuleDialog item={item} open onOpenChange={onOpenChange} />;
}

function OpenLiabilityPaymentRuleDialog({ item, open, onOpenChange }: DialogProps) {
  const finance = useFinance();
  const rule = item.paymentRule;
  const eligibleAccounts = finance.accounts.filter((account) => !account.archived && account.id !== item.accountId && account.type !== "credit");
  const [fundingAccountId, setFundingAccountId] = useState(rule?.fundingAccountId ?? eligibleAccounts[0]?.id ?? "");
  const [strategy, setStrategy] = useState<LiabilityPaymentStrategy>(rule?.strategy ?? (item.kind === "credit_card" ? "statement_total" : "fixed"));
  const [fixedAmount, setFixedAmount] = useState(formatMoneyInputValue(rule?.fixedAmount ?? item.nextObligation?.totalDue ?? 0, item.currencyCode));
  const [maximumAmount, setMaximumAmount] = useState(rule?.maximumAmount === undefined ? "" : formatMoneyInputValue(rule.maximumAmount, item.currencyCode));
  const [daysBeforeDue, setDaysBeforeDue] = useState(String(rule?.daysBeforeDue ?? 0));
  const [active, setActive] = useState(rule?.active ?? true);
  const [recordingMode, setRecordingMode] = useState<LiabilityPaymentRecordingMode>(rule?.recordingMode ?? "manual");
  const [saving, setSaving] = useState(false);
  const fundingAccount = eligibleAccounts.find((account) => account.id === fundingAccountId);
  const sameCop = item.currencyCode === "COP" && (fundingAccount?.currencyCode ?? "COP") === "COP";
  const predictableContract = !item.currentTerms?.variableRate
    && !item.currentTerms?.indexName
    && item.currentTerms?.calculationMethod !== "manual";
  const canAutoPost = sameCop && predictableContract;
  const [id] = useState(() => rule?.id ?? crypto.randomUUID());

  const safeRecordingMode: LiabilityPaymentRecordingMode = canAutoPost ? recordingMode : "manual";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await finance.mutate.upsertLiabilityPaymentRule({
        id,
        accountId: item.accountId,
        fundingAccountId,
        strategy,
        fixedAmount: strategy === "fixed" ? parseMoneyInput(fixedAmount) : undefined,
        maximumAmount: maximumAmount ? parseMoneyInput(maximumAmount) : undefined,
        daysBeforeDue: Number(daysBeforeDue),
        recordingMode: safeRecordingMode,
        active,
        version: rule?.version,
      });
      announceMutation(result, rule ? "Programación actualizada" : "Pago programado");
      onOpenChange(false);
    } catch (error) {
      announceMutationError(error, "No pudimos guardar la programación.");
    } finally {
      setSaving(false);
    }
  }

  const fixedValue = parseMoneyInput(fixedAmount);
  const valid = Boolean(fundingAccountId && Number(daysBeforeDue) >= 0 && Number(daysBeforeDue) <= 30 && (strategy !== "fixed" || fixedValue > 0));
  const money = currencyFormatter(item.currencyCode);

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><FormDialogContent variant="flow" showCloseButton={!saving}><form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}><FormDialogBody>
    <DialogHeader className="mb-7 pr-8"><p className="text-xs font-medium uppercase tracking-[.14em] text-primary">Pago programado</p><DialogTitle className="text-2xl tracking-[-.035em] sm:text-3xl">Que Moneva te ayude a pagar</DialogTitle><DialogDescription>Elige cuánto, cuándo y desde qué cuenta. Puedes dejarlo como recordatorio o permitir el registro automático cuando sea seguro.</DialogDescription></DialogHeader>
    <div className="space-y-7">
      <section aria-labelledby="payment-rule-plan"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="payment-rule-plan" className="font-medium">Tu regla de pago</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">La puedes pausar o cambiar en cualquier momento.</p></div><FinanceDataStateBadge state="manual" /></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><div><Label htmlFor="liability-rule-strategy">Qué monto usar</Label><SelectControl id="liability-rule-strategy" containerClassName="mt-2" value={strategy} onValueChange={(value) => setStrategy(value as LiabilityPaymentStrategy)}><option value="fixed">Un valor fijo</option><option value="minimum_due">El mínimo pendiente</option>{item.kind === "credit_card" ? <option value="statement_total">Todo el extracto</option> : null}<option value="current_balance">Todo el saldo actual</option></SelectControl></div>{strategy === "fixed" ? <div><Label htmlFor="liability-rule-fixed">Valor fijo</Label><InputControl id="liability-rule-fixed" containerClassName="mt-2" inputMode="decimal" value={fixedAmount} onChange={(event) => setFixedAmount(formatMoneyInput(event.target.value, item.currencyCode))} leading={<span className="text-xs font-semibold">{item.currencyCode}</span>} required /></div> : null}<div><Label htmlFor="liability-rule-account">Cuenta de pago</Label><SelectControl id="liability-rule-account" containerClassName="mt-2" value={fundingAccountId} onValueChange={(value) => { setFundingAccountId(value); const account = eligibleAccounts.find((candidate) => candidate.id === value); if (item.currencyCode !== "COP" || (account?.currencyCode ?? "COP") !== "COP" || !predictableContract) setRecordingMode("manual"); }} required><option value="">Selecciona una cuenta</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode ?? "COP"}</option>)}</SelectControl></div><div><Label htmlFor="liability-rule-days">Cuántos días antes</Label><InputControl id="liability-rule-days" containerClassName="mt-2" type="number" min={0} max={30} inputMode="numeric" value={daysBeforeDue} onChange={(event) => setDaysBeforeDue(event.target.value)} trailing={<span className="text-xs">días</span>} required /></div><div className="sm:col-span-2"><Label htmlFor="liability-rule-maximum">Tope por pago <span className="text-muted-foreground">(opcional)</span></Label><InputControl id="liability-rule-maximum" containerClassName="mt-2" inputMode="decimal" value={maximumAmount} onChange={(event) => setMaximumAmount(formatMoneyInput(event.target.value, item.currencyCode))} leading={<span className="text-xs font-semibold">{item.currencyCode}</span>} placeholder="Sin tope adicional" /></div></div></section>

      <section className="rounded-[22px] bg-secondary/25 p-4 sm:p-5" aria-labelledby="payment-rule-mode"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-primary"><CalendarClock className="size-[18px]" aria-hidden="true" /></span><div><h3 id="payment-rule-mode" className="font-medium">Cómo debe actuar</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Moneva nunca usa una tasa o conversión aproximada para mover dinero.</p></div></div><div className="mt-5 space-y-3"><label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl bg-background/70 px-4 py-2"><span><span className="block text-sm font-medium">Registrar automáticamente</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Disponible con pesos, tasa fija y saldo suficiente.</span></span><Switch checked={safeRecordingMode === "auto_post"} disabled={!canAutoPost} onCheckedChange={(checked) => setRecordingMode(checked ? "auto_post" : "manual")} aria-label="Registrar automáticamente" /></label>{!sameCop ? <p className="rounded-xl bg-warning/10 px-3.5 py-3 text-xs leading-5 text-warning">Como este pago usa dólares, Moneva lo preparará y te pedirá confirmar la TRM exacta antes de registrarlo.</p> : !predictableContract ? <p className="rounded-xl bg-warning/10 px-3.5 py-3 text-xs leading-5 text-warning">Esta deuda usa una tasa variable, indexada o un calendario manual. Moneva te recordará el pago para que confirmes el valor vigente.</p> : null}<label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl bg-background/70 px-4 py-2"><span><span className="block text-sm font-medium">Regla activa</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Apágala para conservarla sin crear próximos pagos.</span></span><Switch checked={active} onCheckedChange={setActive} aria-label="Regla activa" /></label></div></section>

      <div className="rounded-2xl border border-border/80 px-4 py-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-muted-foreground">Resumen</p><p className="mt-1 text-sm font-medium">{liabilityPaymentStrategyLabel(strategy)} · {liabilityRecordingModeLabel(safeRecordingMode)}</p></div><RefreshCw className="mt-1 size-4 text-primary" aria-hidden="true" /></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{strategy === "fixed" ? `${money.format(fixedValue)} ` : "El valor vigente "}{Number(daysBeforeDue) === 0 ? "el día de pago" : `${daysBeforeDue} días antes del vencimiento`}.</p></div>
    </div>
  </FormDialogBody><FormDialogActions><Button type="submit" className="h-12 w-full rounded-2xl sm:w-auto sm:min-w-44" disabled={saving || !valid}>{saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Check className="size-4" />}{saving ? "Guardando…" : rule ? "Guardar cambios" : "Programar pago"}</Button><Button type="button" variant="outline" className="h-12 w-full rounded-2xl sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button></FormDialogActions></form></FormDialogContent></Dialog>;
}

function paymentChoices(item: LiabilityOverviewItem) {
  const obligation = item.nextObligation;
  const minimumRemaining = obligation ? minimumPaymentRemaining(obligation.minimumDue, obligation.allocated) : 0;
  return [
    { value: "minimum" as const, label: "Mínimo pendiente", amount: minimumRemaining, disabled: !obligation || minimumRemaining <= 0 },
    { value: "due" as const, label: "Cuota pendiente", amount: obligation?.remaining ?? 0, disabled: !obligation || obligation.remaining <= 0 },
    { value: "balance" as const, label: "Toda la deuda", amount: item.nativeDebt, disabled: item.nativeDebt <= 0 },
    { value: "custom" as const, label: "Otro valor", amount: 0, disabled: false },
  ];
}

function defaultPaymentAmount(item: LiabilityOverviewItem, choice: PaymentChoice) {
  if (choice === "minimum") return item.nextObligation ? minimumPaymentRemaining(item.nextObligation.minimumDue, item.nextObligation.allocated) : 0;
  if (choice === "due") return item.nextObligation?.remaining ?? 0;
  if (choice === "balance") return item.nativeDebt;
  return 0;
}

export function minimumPaymentRemaining(minimumDue: number, allocated: number) {
  return Math.max(minimumDue - allocated, 0);
}

export function paymentFundingAmount(liabilityAmount: number, liabilityCurrency: "COP" | "USD", fundingCurrency: "COP" | "USD", rate: number) {
  if (!(liabilityAmount > 0)) return 0;
  if (liabilityCurrency === fundingCurrency) return liabilityAmount;
  if (!(rate > 0)) return 0;
  if (liabilityCurrency === "USD" && fundingCurrency === "COP") return roundCurrency(liabilityAmount * rate, "COP");
  return roundCurrency(liabilityAmount / rate, "USD");
}

/** Returns posting snapshots whose COP reporting values are exactly paired. */
export function paymentExchangeRates(liabilityAmount: number, liabilityCurrency: "COP" | "USD", fundingAmount: number, fundingCurrency: "COP" | "USD", referenceRate: number) {
  if (liabilityCurrency === "COP" && fundingCurrency === "COP") return { liabilityExchangeRate: 1, fundingExchangeRate: 1 };
  if (!(liabilityAmount > 0) || !(fundingAmount > 0) || !(referenceRate > 0)) return { liabilityExchangeRate: 0, fundingExchangeRate: 0 };
  if (liabilityCurrency === "USD" && fundingCurrency === "COP") {
    return { liabilityExchangeRate: fundingAmount / liabilityAmount, fundingExchangeRate: 1 };
  }
  if (liabilityCurrency === "COP" && fundingCurrency === "USD") {
    return { liabilityExchangeRate: 1, fundingExchangeRate: liabilityAmount / fundingAmount };
  }
  return { liabilityExchangeRate: referenceRate, fundingExchangeRate: referenceRate };
}

function roundCurrency(value: number, currency: "COP" | "USD") {
  const factor = currency === "COP" ? 1 : 100;
  return Math.round(value * factor) / factor;
}
