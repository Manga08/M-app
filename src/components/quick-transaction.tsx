"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, BadgeDollarSign, CalendarClock, CreditCard, Flag, Landmark, LoaderCircle, RefreshCw, Repeat2, Sparkles, Tag, TrendingUp, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";
import { FinanceIconPicker } from "@/components/finance-icon-picker";
import { useFinance } from "@/components/finance-provider";
import { LocalImageCapture } from "@/components/local-image-capture";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialogContent } from "@/components/ui/form-dialog";
import { DateControl, FormControl, FormControlAdornment, FormControlInput, InputControl, SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { accountBalance, categorySpend, currencyFormatter, localIsoDate } from "@/lib/finance/calculations";
import { accountOptionGroups } from "@/lib/finance/account-entities";
import { defaultTargetEffect } from "@/lib/finance/financial-targets";
import { FinanceIcon, suggestFinanceIcon } from "@/lib/finance/icon-catalog";
import { activeIncomeTypes } from "@/lib/finance/income-types";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import { getOfficialTrm } from "@/lib/finance/exchange-rate";
import { announceMutation } from "@/lib/finance/mutation-feedback";
import { movementIdentityTone } from "@/lib/finance/movement-visuals";
import { motionDurations, motionEasings } from "@/lib/motion";
import type { CaptureCandidate } from "@/lib/finance/local-image-capture";
import type { RecurringRule, RecurringRuleInput, TransactionInput } from "@/lib/finance/types";
import { normalizeImportText, suggestCategoryId, suggestIncomeTypeId } from "@/lib/finance/xlsx-import";
import { creditCardCycle } from "@/lib/finance/credit-cards";
import { cn } from "@/lib/utils";

type FormState = {
  timing: "now" | "recurring";
  type: TransactionInput["type"];
  amount: string;
  destinationAmount: string;
  feeAmount: string;
  exchangeRate: string;
  referenceExchangeRate?: number;
  accountId: string;
  destinationAccountId: string;
  groupKey: string;
  categoryId: string;
  occurredOn: string;
  merchant: string;
  description: string;
  note: string;
  icon: string;
  cadence: RecurringRuleInput["cadence"];
  intervalCount: number;
  firstAnchorDay: number;
  secondAnchorDay: number;
  postingPolicy: RecurringRuleInput["postingPolicy"];
  autoPost: boolean;
  includeInBudget: boolean;
  includeInIncomeTarget: boolean;
  endsOn: string;
  financialTargetId: string;
  financialTargetEffect: "advance" | "reverse";
  installmentCount: number;
  financingType: "no_interest" | "known_rate" | "unknown";
  purchaseRateEa: string;
  firstDueOn: string;
};

export function QuickTransaction({ open, transactionId, recurringRuleId, initialFinancialTargetId, initialTiming, initialType, initialTargetEffect, initialOccurredOn, initialAccountId, initialDestinationAccountId, onOpenChange, onExitComplete }: { open: boolean; transactionId?: string; recurringRuleId?: string; initialFinancialTargetId?: string; initialTiming?: "recurring"; initialType?: TransactionInput["type"]; initialTargetEffect?: "advance" | "reverse"; initialOccurredOn?: string; initialAccountId?: string; initialDestinationAccountId?: string; onOpenChange: (open: boolean) => void; onExitComplete?: () => void }) {
  const { profile, accountEntities, accounts, creditCards, categories, groupAllocations, transactions, recurringRules, financialTargets, budgets, snapshot, currentMonth, mutate } = useFinance();
  const selected = transactions.find((transaction) => transaction.id === transactionId);
  const selectedRule = recurringRules.find((rule) => rule.id === recurringRuleId);
  const transferPair = selected?.transferGroupId ? transactions.find((transaction) => transaction.transferGroupId === selected.transferGroupId && transaction.id !== selected.id) : undefined;
  const originalTransferOut = selected?.kind === "transfer_out" ? selected : transferPair?.kind === "transfer_out" ? transferPair : undefined;
  const originalTransferIn = selected?.kind === "transfer_in" ? selected : transferPair?.kind === "transfer_in" ? transferPair : undefined;
  const lockedType: TransactionInput["type"] = selected?.kind.startsWith("transfer") ? "transfer" : selected?.kind === "income" ? "income" : "expense";
  const firstActiveGroup = [...groupAllocations].filter((item) => !item.archived).sort((a, b) => a.sortOrder - b.sortOrder)[0]?.group;
  const defaultExpenseCategory = categories.find((category) => category.kind === "expense" && !category.archived && category.group === firstActiveGroup)
    ?? categories.find((category) => category.kind === "expense" && !category.archived);
  const initialTarget = financialTargets.find((target) => target.id === initialFinancialTargetId && target.status !== "archived");
  const initialCategory = categories.find((category) => category.id === initialTarget?.categoryId && !category.archived) ?? defaultExpenseCategory;
  const activeAccounts = accounts.filter((account) => !account.archived);
  const preferredAccountId = activeAccounts.some((item) => item.id === initialAccountId) ? initialAccountId : activeAccounts[0]?.id;
  const initialCard = creditCards.find((item) => item.accountId === preferredAccountId);
  const initialCardDue = initialCard ? creditCardCycle(initialCard, new Date(`${initialOccurredOn ?? localIsoDate(new Date(), profile?.timezone)}T12:00:00Z`)).dueOn : undefined;
  const [initialForm] = useState<FormState>(() => selectedRule ? formFromRecurringRule(selectedRule, accounts, categories, profile?.currencyCode) : selected ? formFromTransaction(selected, transferPair, accounts, categories, profile?.currencyCode) : emptyForm(preferredAccountId, activeAccounts.some((item) => item.id === initialDestinationAccountId) ? initialDestinationAccountId : initialTarget?.accountId ?? activeAccounts.find((item) => item.id !== initialAccountId)?.id, initialCategory, profile?.timezone, initialTarget, { timing: initialTiming, type: initialType, effect: initialTargetEffect, occurredOn: initialOccurredOn, firstDueOn: initialCardDue }));
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const captureAppliedRef = useRef<Partial<FormState>>({});
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [iconTouched, setIconTouched] = useState(Boolean(selected?.icon));
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const rateTouchedRef = useRef(Boolean(selectedRule?.exchangeRate ?? selected?.exchangeRate));
  const storedRateSource = selectedRule?.exchangeRateSource ?? selected?.exchangeRateSource;
  const rateSourceRef = useRef<"provider" | "manual" | "imported" | undefined>(storedRateSource === "manual" || storedRateSource === "imported" ? storedRateSource : (selectedRule?.exchangeRate ?? selected?.exchangeRate) ? "provider" : undefined);
  const [destinationTouched, setDestinationTouched] = useState(Boolean(selectedRule?.destinationAmount ?? originalTransferIn));
  const incomeTypes = useMemo(() => activeIncomeTypes(categories, selected?.kind === "income" ? selected.categoryId : undefined), [categories, selected]);
  const accountOptions = useMemo(() => accountOptionGroups(accounts, accountEntities).flatMap((group) => group.options.map((option) => ({ ...option, group: group.label }))), [accountEntities, accounts]);
  const expenseGroups = useMemo(() => {
    const selectableGroups = new Set(categories
      .filter((item) => item.kind === "expense" && (!item.archived || item.id === selected?.categoryId))
      .map((item) => item.group));
    return groupAllocations
      .filter((item) => selectableGroups.has(item.group) && (!item.archived || item.group === form.groupKey))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, form.groupKey, groupAllocations, selected?.categoryId]);
  const expenseSubcategories = useMemo(() => categories.filter((item) => item.kind === "expense"
    && item.group === form.groupKey
    && (!item.archived || item.id === selected?.categoryId)), [categories, form.groupKey, selected?.categoryId]);
  const amount = parseMoneyInput(form.amount);
  const money = currencyFormatter(profile?.currencyCode);
  const account = accounts.find((item) => item.id === form.accountId);
  const selectedCreditCard = creditCards.find((item) => item.accountId === form.accountId);
  const destination = accounts.find((item) => item.id === form.destinationAccountId);
  const sourceCurrency = account?.currencyCode ?? profile?.currencyCode ?? "COP";
  const destinationCurrency = destination?.currencyCode ?? profile?.currencyCode ?? "COP";
  const sourceMoney = currencyFormatter(sourceCurrency);
  const destinationMoney = currencyFormatter(destinationCurrency);
  const needsExchangeRate = sourceCurrency !== (profile?.currencyCode ?? "COP")
    || (form.type === "transfer" && destinationCurrency !== (profile?.currencyCode ?? "COP"));
  const parsedExchangeRate = parseMoneyInput(form.exchangeRate);
  const suggestedDestinationAmount = form.type === "transfer" && sourceCurrency !== destinationCurrency && amount > 0 && parsedExchangeRate > 0
    ? sourceCurrency === "USD" ? amount * parsedExchangeRate : amount / parsedExchangeRate
    : amount;
  const destinationAmountInput = destinationTouched
    ? form.destinationAmount
    : formatMoneyInputValue(suggestedDestinationAmount, destinationCurrency);
  const category = categories.find((item) => item.id === form.categoryId);
  const displayIcon = form.icon || category?.icon || (form.type === "income" ? "coins" : form.type === "transfer" ? "transfer" : "receipt");
  const identityTone = movementIdentityTone(form.type);
  const budget = budgets.find((item) => item.categoryId === form.categoryId && item.month === currentMonth);
  const previousExpense = selected?.kind === "expense" && selected.categoryId === form.categoryId ? selected.amount : 0;
  const spentAfter = form.type === "expense" && category ? Math.max(0, categorySpend(transactions, category.id, currentMonth, snapshot) - previousExpense + amount) : 0;
  const previousSourceAmount = transactionId && (form.type === "transfer"
    ? originalTransferOut?.accountId === form.accountId
    : selected?.accountId === form.accountId)
    ? form.type === "transfer" ? originalTransferOut?.amount ?? 0 : selected?.amount ?? 0
    : 0;
  const previousDestinationAmount = transactionId && originalTransferIn?.accountId === form.destinationAccountId
    ? originalTransferIn.amount
    : 0;
  const balanceAfter = account ? accountBalance(account, transactions, snapshot) + balanceDelta(form.type, amount, previousSourceAmount) : 0;
  const destinationAmount = form.type === "transfer" && sourceCurrency !== destinationCurrency ? parseMoneyInput(destinationAmountInput) : amount;
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);


  useEffect(() => {
    if (!open || !needsExchangeRate || !form.occurredOn) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => setRateLoading(true)).then(() => getOfficialTrm(form.occurredOn, controller.signal)).then((quote) => {
      setForm((current) => ({
        ...current,
        exchangeRate: rateTouchedRef.current ? current.exchangeRate : formatMoneyInputValue(quote.rate, "USD"),
        referenceExchangeRate: quote.rate,
      }));
      if (!rateTouchedRef.current) rateSourceRef.current = "provider";
      setRateError(null);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRateError(error instanceof Error ? error.message : "No pudimos consultar la TRM.");
    }).finally(() => setRateLoading(false));
    return () => controller.abort();
  }, [form.occurredOn, needsExchangeRate, open]);

  function changeType(type: TransactionInput["type"]) {
    if (transactionId || recurringRuleId) return;
    const nextCategory = type === "income" ? activeIncomeTypes(categories)[0] : defaultExpenseCategory;
    setForm((current) => { const target = financialTargets.find((candidate) => candidate.id === current.financialTargetId); return { ...current, type, groupKey: type === "expense" ? nextCategory?.group ?? "" : "", categoryId: type === "transfer" ? "" : nextCategory?.id ?? "", icon: type === "transfer" ? "transfer" : nextCategory?.icon ?? "", financialTargetEffect: target ? defaultTargetEffect(target, type) : current.financialTargetEffect }; });
    setIconTouched(false);
    setError(null);
  }

  function applyCaptureCandidate(candidate: CaptureCandidate) {
    const candidateType = candidate.type !== "unknown" && candidate.confidence.type >= 0.7 ? candidate.type : null;
    const matchedAccount = candidate.accountLast4 && candidate.confidence.account >= 0.8
      ? uniqueAccountMatch(candidate.accountLast4, accounts)
      : undefined;
    const previousCapture = captureAppliedRef.current;

    setForm((current) => {
      const applied = retainedCaptureFields(previousCapture, current);
      const canReplace = <Key extends keyof FormState>(key: Key) => current[key] === initialForm[key]
        || previousCapture[key] !== undefined && current[key] === previousCapture[key];
      const typeWasUntouched = canReplace("type");
      const nextType = typeWasUntouched && candidateType ? candidateType : current.type;
      if (typeWasUntouched && candidateType) applied.type = candidateType;
      const categoryWasUntouched = canReplace("groupKey") && canReplace("categoryId");
      const suggestedCategory = categoryWasUntouched
        ? captureCategory(candidate, nextType, categories, transactions)
        : undefined;
      const defaultForType = nextType === "income"
        ? activeIncomeTypes(categories)[0]
        : nextType === "expense"
          ? defaultExpenseCategory
          : undefined;
      const nextCategory = suggestedCategory ?? (nextType !== current.type && typeWasUntouched ? defaultForType : undefined);
      const merchantIsReliable = Boolean(candidate.merchant) && candidate.confidence.merchant >= 0.7;
      const descriptionIsReliable = candidate.description !== "Movimiento capturado"
        && (candidate.confidence.type >= 0.7 || candidate.confidence.merchant >= 0.7);
      const nextMerchant = canReplace("merchant") && merchantIsReliable
        ? candidate.merchant ?? current.merchant
        : current.merchant;
      const suggestedIcon = candidate.icon || suggestFinanceIcon(nextMerchant || candidate.description);
      const iconWasUntouched = canReplace("icon") && !iconTouched;
      const nextAmount = canReplace("amount") && candidate.amount && candidate.confidence.amount >= 0.7
        ? formatMoneyInputValue(candidate.amount, profile?.currencyCode)
        : current.amount;
      const nextAccountId = canReplace("accountId") && matchedAccount ? matchedAccount.id : current.accountId;
      const nextGroupKey = nextType === "transfer" && typeWasUntouched
        ? ""
        : nextCategory?.group ?? current.groupKey;
      const nextCategoryId = nextType === "transfer" && typeWasUntouched
        ? ""
        : nextCategory?.id ?? current.categoryId;
      const nextOccurredOn = canReplace("occurredOn") && candidate.occurredOn && candidate.confidence.date >= 0.8
        ? candidate.occurredOn
        : current.occurredOn;
      const capturedMerchant = nextType === "transfer" ? "" : nextMerchant;
      const nextDescription = canReplace("description") && descriptionIsReliable
        ? candidate.description
        : current.description;
      const nextIcon = nextType === "transfer" ? "transfer" : iconWasUntouched && suggestedIcon ? suggestedIcon : current.icon;

      if (nextAmount !== current.amount) applied.amount = nextAmount;
      if (nextAccountId !== current.accountId) applied.accountId = nextAccountId;
      if (nextGroupKey !== current.groupKey) applied.groupKey = nextGroupKey;
      if (nextCategoryId !== current.categoryId) applied.categoryId = nextCategoryId;
      if (nextOccurredOn !== current.occurredOn) applied.occurredOn = nextOccurredOn;
      if (capturedMerchant !== current.merchant) applied.merchant = capturedMerchant;
      if (nextDescription !== current.description) applied.description = nextDescription;
      if (nextIcon !== current.icon) applied.icon = nextIcon;

      const next = {
        ...current,
        type: nextType,
        amount: nextAmount,
        accountId: nextAccountId,
        groupKey: nextGroupKey,
        categoryId: nextCategoryId,
        occurredOn: nextOccurredOn,
        merchant: capturedMerchant,
        description: nextDescription,
        icon: nextIcon,
      };
      captureAppliedRef.current = applied;
      return next;
    });
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const input: TransactionInput = {
      type: form.type,
      amount,
      destinationAmount: form.type === "transfer" && sourceCurrency !== destinationCurrency ? parseMoneyInput(destinationAmountInput) : undefined,
      feeAmount: !transactionId && form.type === "transfer" && needsExchangeRate ? parseMoneyInput(form.feeAmount) || undefined : undefined,
      accountId: form.accountId,
      destinationAccountId: form.type === "transfer" ? form.destinationAccountId : undefined,
      categoryId: form.type !== "transfer" ? form.categoryId : undefined,
      financialTargetId: form.financialTargetId || undefined,
      financialTargetEffect: form.financialTargetId ? form.financialTargetEffect : undefined,
      description: form.description.trim() || (form.type === "income" ? "Ingreso" : form.type === "expense" ? "Gasto" : "Transferencia"),
      merchant: form.merchant.trim() || undefined,
      note: form.note.trim() || undefined,
      icon: displayIcon,
      occurredOn: form.occurredOn,
      exchangeRate: needsExchangeRate ? parseMoneyInput(form.exchangeRate) : 1,
      exchangeRateDate: form.occurredOn,
      exchangeRateSource: needsExchangeRate ? rateSourceRef.current ?? "provider" : undefined,
      referenceExchangeRate: form.referenceExchangeRate,
      referenceRateSource: form.referenceExchangeRate ? "sfc_trm" : undefined,
    };
    const validation = validate(input);
    if (validation) {
      setError(validation.message);
      requestAnimationFrame(() => document.getElementById(validation.field)?.focus());
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = form.timing === "recurring"
        ? await mutate.upsertRecurringRule(recurringInput(form, input, profile?.timezone, recurringRuleId, selectedRule))
        : transactionId
          ? await mutate.updateTransaction(transactionId, input)
          : input.type === "expense" && selectedCreditCard && form.installmentCount > 1
            ? await mutate.addCreditCardPurchase({ transaction: input, installmentCount: form.installmentCount, financingType: form.financingType, annualEffectiveRate: form.financingType === "known_rate" ? Number(form.purchaseRateEa) : undefined, firstDueOn: form.firstDueOn })
          : await mutate.addTransaction(input);
      announceMutation(result, form.timing === "recurring" ? recurringRuleId ? "Programación actualizada" : "Programación creada" : transactionId ? "Movimiento actualizado" : selectedCreditCard && form.installmentCount > 1 ? "Compra y cuotas registradas" : "Movimiento registrado");
      window.dispatchEvent(new Event(form.timing === "recurring" ? "moneva:recurring-changed" : "moneva:transactions-changed"));
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No pudimos guardar el movimiento.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function requestOpenChange(next: boolean) {
    if (savingRef.current) return;
    if (!next && dirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(next);
  }

  return <><Dialog open={open} onOpenChange={requestOpenChange}>
    <FormDialogContent variant="flow" showCloseButton={false} onExitComplete={onExitComplete}>
      <form onSubmit={submit} className="relative flex min-h-0 min-w-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)]">
        <div data-quick-transaction-body className="safe-dialog-top mobile-scroll min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-40 pt-5 min-[360px]:px-5 sm:px-8 sm:pb-8 sm:pt-7">
          <div className="flex items-start gap-2"><DialogHeader className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-[.14em] text-primary">{recurringRuleId ? "Editar programación" : transactionId ? "Editar movimiento" : "Nuevo movimiento"}</p><DialogTitle className="text-2xl tracking-[-.035em] sm:text-3xl">{recurringRuleId ? "Ajusta lo que se repite" : transactionId ? "Ajusta los detalles" : form.timing === "recurring" ? "Configúralo una vez" : "¿Qué pasó con tu dinero?"}</DialogTitle><DialogDescription>{recurringRuleId ? "Los próximos eventos se recalcularán; el historial no cambia." : transactionId ? "Los saldos y presupuestos se recalculan al guardar." : form.timing === "recurring" ? "Moneva lo publicará en cada fecha elegida, sin descontarlo antes." : "Regístralo una vez; Moneva actualiza todo lo demás."}</DialogDescription></DialogHeader>{!saving ? <Button type="button" variant="ghost" size="icon-sm" data-testid="quick-transaction-close" aria-label="Cerrar" onClick={() => requestOpenChange(false)} className="shrink-0"><X className="size-4" /></Button> : null}</div>

          {!transactionId && !recurringRuleId ? <div className="mt-7 grid grid-cols-2 gap-1 rounded-2xl border border-border/70 bg-secondary/35 p-1" role="group" aria-label="Momento del movimiento"><button type="button" aria-pressed={form.timing === "now"} onClick={() => setForm((current) => ({ ...current, timing: "now" }))} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-out)] active:scale-[var(--motion-press-scale)] motion-reduce:transition-none", form.timing === "now" && "bg-background text-foreground shadow-sm")}><Sparkles className="size-4" />Ahora</button><button type="button" aria-pressed={form.timing === "recurring"} onClick={() => setForm((current) => ({ ...current, timing: "recurring" }))} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-out)] active:scale-[var(--motion-press-scale)] motion-reduce:transition-none", form.timing === "recurring" && "bg-background text-primary shadow-sm")}><Repeat2 className="size-4" />Programado</button></div> : null}

          {!transactionId && !recurringRuleId && form.timing === "now" ? <LocalImageCapture referenceDate={form.occurredOn} onCandidate={applyCaptureCandidate} disabled={saving} /> : null}

          <div className="mt-7 grid grid-cols-3 gap-1 rounded-2xl bg-secondary/60 p-1" role="group" aria-label="Tipo de movimiento">{([
            { value: "expense", label: "Gasto", icon: ArrowUpRight },
            { value: "income", label: "Ingreso", icon: ArrowDownLeft },
            { value: "transfer", label: "Transferencia", icon: ArrowRightLeft },
          ] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={form.type === value} disabled={Boolean(transactionId) && lockedType !== value} onClick={() => changeType(value)} className={cn("flex min-h-14 items-center justify-center gap-2 rounded-xl px-1.5 text-xs font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-out)] active:scale-[var(--motion-press-scale)] motion-reduce:transition-none max-[359px]:flex-col max-[359px]:gap-1 max-[359px]:text-[11px] sm:text-sm", form.type === value && "bg-background shadow-sm ring-1 ring-foreground/6", form.type === value && movementIdentityTone(value).text, transactionId && lockedType !== value && "cursor-not-allowed opacity-35")}><Icon className="size-4" />{label}</button>)}</div>

          <div className="mt-7"><Label htmlFor="transaction-amount">{form.type === "transfer" && sourceCurrency !== destinationCurrency ? "Tú envías" : "Monto"}</Label><InputControl id="transaction-amount" value={form.amount} onChange={(event) => { setForm((current) => ({ ...current, amount: formatMoneyInput(event.target.value, sourceCurrency) })); setError(null); }} inputMode="decimal" required placeholder="0" leading={<span className="text-base font-medium">{sourceCurrency === "USD" ? "US$" : "$"}</span>} aria-invalid={error?.includes("monto") || undefined} aria-describedby={error ? "transaction-form-error" : undefined} containerClassName="mt-2 h-[72px] rounded-[20px] bg-secondary/35" className="pr-4 text-3xl font-medium tracking-[-.04em] tabular-nums" /><p className="mt-2 text-xs text-muted-foreground">Se guardará en {sourceCurrency} dentro de {account?.name ?? "la cuenta elegida"}.</p></div>

          <div className="mt-6 grid min-w-0 gap-5 sm:grid-cols-2">
            <FieldSelect label={form.type === "transfer" ? "Desde" : "Cuenta"} value={form.accountId} onChange={(value) => { const nextCurrency = accounts.find((item) => item.id === value)?.currencyCode ?? profile?.currencyCode ?? "COP"; const nextCard = creditCards.find((item) => item.accountId === value); setForm((current) => ({ ...current, accountId: value, amount: formatMoneyInputValue(parseMoneyInput(current.amount), nextCurrency), firstDueOn: nextCard ? creditCardCycle(nextCard, new Date(`${current.occurredOn}T12:00:00Z`)).dueOn : current.occurredOn, installmentCount: nextCard ? current.installmentCount : 1 })); rateTouchedRef.current = false; rateSourceRef.current = undefined; setDestinationTouched(false); setError(null); }} icon={<CreditCard className="size-4" />} options={accountOptions} invalid={Boolean(error?.includes("cuenta") && !error?.includes("destino"))} describedBy={error ? "transaction-form-error" : undefined} />
            {form.type === "transfer" ? <FieldSelect label="Hacia" value={form.destinationAccountId} onChange={(value) => { setForm((current) => ({ ...current, destinationAccountId: value, destinationAmount: "" })); rateTouchedRef.current = false; rateSourceRef.current = undefined; setDestinationTouched(false); setError(null); }} icon={<Landmark className="size-4" />} options={accountOptions} invalid={Boolean(error?.includes("destino") || error?.includes("diferentes"))} describedBy={error ? "transaction-form-error" : undefined} /> : form.type === "income" ? <div><FieldSelect label="Tipo de ingreso" value={form.categoryId} onChange={(value) => { const next = categories.find((item) => item.id === value); setForm((current) => ({ ...current, categoryId: value, icon: iconTouched ? current.icon : next?.icon ?? "" })); setError(null); }} icon={<BadgeDollarSign className="size-4" />} options={incomeTypes.map((item) => ({ value: item.id, label: item.name }))} emptyLabel="Crea un tipo en Cuentas" invalid={Boolean(error?.includes("tipo de ingreso"))} describedBy={error ? "transaction-form-error" : undefined} />{!incomeTypes.length ? <Link href="/cuentas#tipos-de-ingreso" className="mt-2 inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline">Crear un tipo de ingreso en Cuentas</Link> : null}</div> : <>
              <FieldSelect label="Categoría" value={form.groupKey} onChange={(value) => { const next = categories.find((item) => item.kind === "expense" && !item.archived && item.group === value); setForm((current) => ({ ...current, groupKey: value, categoryId: next?.id ?? "", icon: iconTouched ? current.icon : next?.icon ?? "" })); setError(null); }} icon={<FinanceIcon name={expenseGroups.find((item) => item.group === form.groupKey)?.icon ?? "tag"} className="size-4" />} options={expenseGroups.map((item) => ({ value: item.group, label: item.name }))} emptyLabel="No hay categorías disponibles" invalid={Boolean(error?.includes("categoría principal"))} describedBy={error ? "transaction-form-error" : undefined} />
              <FieldSelect label="Subcategoría" value={form.categoryId} onChange={(value) => { const next = categories.find((item) => item.id === value); setForm((current) => ({ ...current, categoryId: value, icon: iconTouched ? current.icon : next?.icon ?? "" })); setError(null); }} icon={<Tag className="size-4" />} options={expenseSubcategories.map((item) => ({ value: item.id, label: item.name }))} emptyLabel="No hay subcategorías" invalid={Boolean(error?.includes("subcategoría"))} describedBy={error ? "transaction-form-error" : undefined} />
            </>}
            <div><Label htmlFor="transaction-date">{form.timing === "recurring" ? "Primera fecha" : "Fecha"}</Label><DateControl id="transaction-date" value={form.occurredOn} onValueChange={(occurredOn) => setForm({ ...form, occurredOn })} required containerClassName="mt-2" /></div>
            <div><Label htmlFor="transaction-merchant">{form.type === "transfer" ? "Etiqueta" : "Comercio"} <span className="text-muted-foreground">(opcional)</span></Label><FormControl className="mt-2"><FormControlAdornment interactive className={identityTone.text}><FinanceIconPicker embedded value={displayIcon} onValueChange={(icon) => { setForm({ ...form, icon }); setIconTouched(true); }} /></FormControlAdornment><FormControlInput id="transaction-merchant" value={form.merchant} onChange={(event) => { const merchant = event.target.value; const suggestion = suggestFinanceIcon(merchant); setForm({ ...form, merchant, icon: !iconTouched && suggestion ? suggestion : form.icon }); }} maxLength={120} placeholder={form.type === "transfer" ? "Ej. Ahorro del mes" : "Ej. Spotify"} /></FormControl><p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Toca el icono para personalizarlo. El color se asigna por tipo: ingreso, gasto o transferencia.</p></div>
            <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2"><FieldSelect label="Meta o deuda (opcional)" value={form.financialTargetId} onChange={(value) => { const target = financialTargets.find((candidate) => candidate.id === value); setForm((current) => ({ ...current, financialTargetId: value, financialTargetEffect: target ? defaultTargetEffect(target, current.type) : "advance" })); }} icon={<Flag className="size-4" />} options={financialTargets.filter((target) => ["active", "paused"].includes(target.status)).map((target) => ({ value: target.id, label: target.title }))} emptyLabel="No tienes metas activas" optional /><FieldSelect label="Efecto en el avance" value={form.financialTargetEffect} onChange={(value) => setForm((current) => ({ ...current, financialTargetEffect: value as FormState["financialTargetEffect"] }))} icon={<TrendingUp className="size-4" />} options={[{ value: "advance", label: "Sumar avance" }, { value: "reverse", label: "Restar avance" }]} disabled={!form.financialTargetId} /></div>
          </div>

          {needsExchangeRate ? <section className="mt-6 border-y py-6" aria-labelledby="exchange-details-title">
            <div className="flex items-start justify-between gap-4"><div><h3 id="exchange-details-title" className="font-medium">{form.timing === "recurring" ? "Conversión programada" : "Conversión a pesos"}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{form.timing === "recurring" ? "La tasa y el monto recibido quedarán fijos en cada ejecución hasta que edites esta programación." : "La referencia oficial orienta el cálculo; la tasa aplicada es la que realmente te cobró el servicio."}</p></div>{rateLoading ? <LoaderCircle className="size-5 animate-spin text-primary motion-reduce:animate-none" /> : <RefreshCw className="size-5 text-primary" aria-hidden="true" />}</div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div><Label htmlFor="transaction-exchange-rate">{form.timing === "recurring" ? "Tasa fija aplicada" : "Tasa aplicada"}</Label><InputControl id="transaction-exchange-rate" value={form.exchangeRate} onChange={(event) => { rateTouchedRef.current = true; rateSourceRef.current = "manual"; setDestinationTouched(false); setForm((current) => ({ ...current, exchangeRate: formatMoneyInput(event.target.value, "USD") })); }} inputMode="decimal" required leading={<span className="text-xs font-medium">COP</span>} containerClassName="mt-2" /><p className="mt-1.5 text-[11px] text-muted-foreground">COP por cada USD</p></div>
              {form.type === "transfer" && sourceCurrency !== destinationCurrency ? <div><Label htmlFor="transaction-destination-amount">Cuenta recibe</Label><InputControl id="transaction-destination-amount" value={destinationAmountInput} onChange={(event) => { rateTouchedRef.current = true; rateSourceRef.current = "manual"; setDestinationTouched(true); setForm((current) => ({ ...current, destinationAmount: formatMoneyInput(event.target.value, destinationCurrency) })); }} inputMode="decimal" required leading={<span className="text-xs font-medium">{destinationCurrency === "USD" ? "US$" : "COP"}</span>} containerClassName="mt-2" /><p className="mt-1.5 text-[11px] text-muted-foreground">Puedes corregir el valor exacto acreditado.</p></div> : <div><p className="text-sm font-medium">Equivalente estimado</p><p className="mt-3 text-xl font-medium tabular-nums">{currencyFormatter("COP").format(sourceCurrency === "USD" ? amount * parseMoneyInput(form.exchangeRate) : amount)}</p><p className="mt-1.5 text-[11px] text-muted-foreground">Solo es una ayuda visual; el movimiento conserva {sourceCurrency}.</p></div>}
              {form.type === "transfer" && form.timing === "now" && !transactionId ? <div className="sm:col-span-2"><Label htmlFor="transaction-fee">Comisión <span className="text-muted-foreground">(opcional, en {sourceCurrency})</span></Label><InputControl id="transaction-fee" value={form.feeAmount} onChange={(event) => setForm((current) => ({ ...current, feeAmount: formatMoneyInput(event.target.value, sourceCurrency) }))} inputMode="decimal" leading={<span className="text-xs font-medium">{sourceCurrency === "USD" ? "US$" : "COP"}</span>} containerClassName="mt-2" /><p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Se registrará aparte como gasto para que el valor transferido y la comisión no se mezclen.</p></div> : null}
            </div>
            {form.referenceExchangeRate ? <p className="mt-4 text-xs text-muted-foreground">TRM oficial de referencia: {currencyFormatter("COP").format(form.referenceExchangeRate)} · {form.occurredOn}</p> : null}{rateError ? <p className="mt-2 text-xs text-warning" role="status">{rateError}</p> : null}
          </section> : null}

          {!transactionId && !recurringRuleId && form.timing === "now" && form.type === "expense" && selectedCreditCard ? <section className="mt-6 border-y py-6" aria-labelledby="installment-settings-title"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CreditCard className="size-[18px]" /></span><div><h3 id="installment-settings-title" className="font-medium">Cómo pagarás esta compra</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">La compra completa cuenta hoy como gasto. Las cuotas solo proyectan pagos futuros y no duplican el gasto.</p></div></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><FieldSelect label="Número de cuotas" value={String(form.installmentCount)} onChange={(value) => setForm((current) => ({ ...current, installmentCount: Number(value), financingType: Number(value) === 1 ? "no_interest" : current.financingType }))} icon={<CreditCard className="size-4" />} options={[1, 2, 3, 6, 12, 18, 24, 36].map((count) => ({ value: String(count), label: count === 1 ? "Una cuota" : `${count} cuotas` }))} />{form.installmentCount > 1 ? <><FieldSelect label="Interés" value={form.financingType} onChange={(value) => setForm((current) => ({ ...current, financingType: value as FormState["financingType"] }))} icon={<BadgeDollarSign className="size-4" />} options={[{ value: "no_interest", label: "Sin interés" }, { value: "known_rate", label: "Con tasa conocida" }, { value: "unknown", label: "Aún no sé la tasa" }]} /><div><Label htmlFor="transaction-first-due">Primera cuota</Label><DateControl id="transaction-first-due" value={form.firstDueOn} onValueChange={(firstDueOn) => setForm((current) => ({ ...current, firstDueOn }))} min={form.occurredOn} containerClassName="mt-2" required /></div>{form.financingType === "known_rate" ? <div><Label htmlFor="transaction-purchase-rate">Tasa efectiva anual</Label><InputControl id="transaction-purchase-rate" value={form.purchaseRateEa} onChange={(event) => setForm((current) => ({ ...current, purchaseRateEa: event.target.value }))} inputMode="decimal" trailing={<span className="text-xs font-medium">% E.A.</span>} containerClassName="mt-2" required /></div> : null}</> : null}</div></section> : null}

          {form.timing === "recurring" ? <RecurringFields form={form} setForm={setForm} /> : null}

          <div className="mt-5"><Label htmlFor="transaction-description">Descripción</Label><Input id="transaction-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={200} className="mt-2 h-12" placeholder={form.type === "transfer" ? "Ej. Pasar a ahorros" : "Ej. Cena con amigos"} /></div>
          <div className="mt-5"><Label htmlFor="transaction-note">Nota <span className="text-muted-foreground">(opcional)</span></Label><Textarea id="transaction-note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={1000} className="mt-2 min-h-20 resize-none" placeholder="Algo que quieras recordar" /></div>
          <AnimatePresence initial={false}>{error ? <m.p id="transaction-form-error" initial={{ opacity: 0, transform: "translateY(-3px)" }} animate={{ opacity: 1, transform: "translateY(0)" }} exit={{ opacity: 0, transform: "translateY(-2px)" }} transition={{ duration: motionDurations.menu, ease: motionEasings.out }} role="alert" className="mt-5 rounded-xl border border-destructive/35 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</m.p> : null}</AnimatePresence>
        </div>

        <aside className="hidden border-l bg-secondary/28 p-7 lg:flex lg:flex-col">
          <div><p className="text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">{form.timing === "recurring" ? "Así funcionará" : "Impacto antes de guardar"}</p><span className={cn("mt-5 grid size-12 place-items-center rounded-2xl", identityTone.surface, identityTone.text)}><FinanceIcon name={displayIcon} className="size-6" /></span><p className="mt-4 text-4xl font-medium tracking-[-.055em] tabular-nums">{sourceMoney.format(amount || 0)}</p>{sourceCurrency === "USD" && parseMoneyInput(form.exchangeRate) > 0 ? <p className="mt-1 text-sm tabular-nums text-muted-foreground">≈ {currencyFormatter("COP").format(amount * parseMoneyInput(form.exchangeRate))}</p> : null}<p className="mt-2 text-sm text-muted-foreground">{form.timing === "recurring" ? recurringSummary(form) : form.type === "transfer" ? "Mueve dinero sin alterar ingresos ni gastos." : form.type === "income" ? "Se suma a tu ingreso y al saldo de la cuenta." : "Se descuenta de la cuenta y consume presupuesto."}</p></div>
          <div className="mt-8 space-y-5 border-y py-6"><PreviewLine label={account?.name || "Cuenta"} value={sourceMoney.format(balanceAfter)} note="saldo estimado" />{form.type === "transfer" && destination ? <PreviewLine label={destination.name} value={destinationMoney.format(accountBalance(destination, transactions, snapshot) + destinationAmount - previousDestinationAmount)} note="saldo estimado" /> : null}{form.type === "expense" && category ? <PreviewLine label={category.name} value={budget ? `${Math.round((spentAfter / Math.max(budget.amount, 1)) * 100)}%` : "Sin límite"} note={budget ? `${money.format(spentAfter)} de ${money.format(budget.amount)}` : "categoría sin presupuesto"} /> : null}</div>
          <div className="mt-auto pt-7"><p className="flex items-center gap-2 text-xs text-muted-foreground">{form.timing === "recurring" ? <CalendarClock className="size-4 text-primary" /> : <Sparkles className="size-4 text-primary" />}{form.timing === "recurring" ? "No afecta saldos antes de la fecha" : "Vista previa calculada en tiempo real"}</p><Button type="submit" className="mt-4 h-12 w-full rounded-full" disabled={saving}>{saving ? "Guardando…" : form.timing === "recurring" ? recurringRuleId ? "Guardar programación" : "Crear programación" : transactionId ? "Guardar cambios" : actionLabel(form.type)}</Button></div>
        </aside>

        <div data-quick-transaction-footer className="absolute inset-x-0 bottom-0 z-10 border-t bg-popover/96 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_44px_-34px_rgba(0,0,0,.7)] backdrop-blur-xl lg:hidden"><div className="mx-auto max-w-xl"><div className="mb-2 flex min-w-0 items-center justify-between gap-4 px-1"><p className="truncate text-xs text-muted-foreground">{form.timing === "recurring" ? recurringSummary(form) : form.type === "transfer" ? "Entre cuentas" : account?.name || "Selecciona una cuenta"}</p><p className="shrink-0 text-sm font-medium tabular-nums">{sourceMoney.format(amount || 0)}</p></div><Button type="submit" className="h-12 w-full rounded-2xl" disabled={saving}>{saving ? "Guardando…" : form.timing === "recurring" ? recurringRuleId ? "Guardar programación" : "Crear programación" : transactionId ? "Guardar cambios" : actionLabel(form.type)}</Button></div></div>
      </form>
    </FormDialogContent>
  </Dialog><AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle><AlertDialogDescription>El movimiento todavía no se ha guardado. Si sales ahora, perderás lo que escribiste.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Seguir editando</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setDiscardOpen(false); onOpenChange(false); }}>Descartar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

function captureCategory(
  candidate: CaptureCandidate,
  type: TransactionInput["type"],
  categories: ReturnType<typeof useFinance>["categories"],
  transactions: ReturnType<typeof useFinance>["transactions"],
) {
  if (type === "transfer") return undefined;
  const kind = type === "income" ? "income" : "expense";
  const active = categories.filter((item) => item.kind === kind && !item.archived);
  const merchantKey = normalizeImportText(candidate.merchant ?? "");
  const historic = merchantKey
    ? transactions.find((item) => item.kind === kind
      && normalizeImportText(item.merchant ?? "") === merchantKey
      && active.some((category) => category.id === item.categoryId))
    : undefined;
  if (historic?.categoryId) return active.find((item) => item.id === historic.categoryId);

  const source = candidate.merchant || candidate.description;
  const suggestedId = type === "income"
    ? suggestIncomeTypeId(source, active)
    : suggestCategoryId(source, active);
  return active.find((item) => item.id === suggestedId);
}

function uniqueAccountMatch(lastFour: string, accounts: ReturnType<typeof useFinance>["accounts"]) {
  const matches = accounts.filter((item) => !item.archived && normalizeImportText(item.name).includes(lastFour));
  return matches.length === 1 ? matches[0] : undefined;
}

function retainedCaptureFields(previous: Partial<FormState>, current: FormState) {
  const retained: Partial<FormState> = {};
  (Object.keys(previous) as Array<keyof FormState>).forEach((key) => {
    if (previous[key] === current[key]) Object.assign(retained, { [key]: previous[key] });
  });
  return retained;
}

function emptyForm(accountId = "", destinationAccountId = "", category?: ReturnType<typeof useFinance>["categories"][number], timeZone?: string, target?: ReturnType<typeof useFinance>["financialTargets"][number], preset: { timing?: "recurring"; type?: TransactionInput["type"]; effect?: "advance" | "reverse"; occurredOn?: string; firstDueOn?: string } = {}): FormState {
  const type = preset.type ?? "expense";
  const occurredOn = preset.occurredOn ?? localIsoDate(new Date(), timeZone);
  return { timing: preset.timing ?? "now", type, amount: "", destinationAmount: "", feeAmount: "", exchangeRate: "", accountId, destinationAccountId, groupKey: type === "expense" ? category?.group ?? "" : "", categoryId: type === "transfer" ? "" : category?.id ?? "", occurredOn, merchant: "", description: "", note: "", icon: type === "transfer" ? "transfer" : category?.icon ?? "", cadence: "monthly", intervalCount: 1, firstAnchorDay: 15, secondAnchorDay: 31, postingPolicy: "scheduled_date", autoPost: true, includeInBudget: false, includeInIncomeTarget: false, endsOn: "", financialTargetId: target?.id ?? "", financialTargetEffect: preset.effect ?? (target ? defaultTargetEffect(target, type) : "advance"), installmentCount: 1, financingType: "no_interest", purchaseRateEa: "", firstDueOn: preset.firstDueOn ?? occurredOn };
}

function formFromTransaction(selected: ReturnType<typeof useFinance>["transactions"][number], transferPair: ReturnType<typeof useFinance>["transactions"][number] | undefined, accounts: ReturnType<typeof useFinance>["accounts"], categories: ReturnType<typeof useFinance>["categories"], currencyCode = "COP"): FormState {
  const type: TransactionInput["type"] = selected.kind.startsWith("transfer") ? "transfer" : selected.kind === "income" ? "income" : "expense";
  const outgoing = selected.kind === "transfer_out" ? selected : transferPair?.kind === "transfer_out" ? transferPair : undefined;
  const incoming = selected.kind === "transfer_in" ? selected : transferPair?.kind === "transfer_in" ? transferPair : undefined;
  const targetSource = selected.financialTargetId ? selected : incoming;
  const sourceCurrency = accounts.find((item) => item.id === (outgoing?.accountId ?? selected.accountId))?.currencyCode ?? currencyCode;
  const destinationCurrency = accounts.find((item) => item.id === incoming?.accountId)?.currencyCode ?? currencyCode;
  const foreignPosting = [outgoing, incoming].find((item) => item
    && (item.nativeCurrencyCode ?? accounts.find((account) => account.id === item.accountId)?.currencyCode ?? currencyCode) !== currencyCode);
  const appliedRate = foreignPosting?.exchangeRate ?? outgoing?.exchangeRate ?? selected.exchangeRate;
  const category = categories.find((item) => item.id === selected.categoryId);
  return { timing: "now", type, amount: formatMoneyInputValue(outgoing?.amount ?? selected.amount, sourceCurrency), destinationAmount: incoming ? formatMoneyInputValue(incoming.amount, destinationCurrency) : "", feeAmount: "", exchangeRate: appliedRate ? formatMoneyInputValue(appliedRate, "USD") : "", referenceExchangeRate: foreignPosting?.referenceExchangeRate ?? outgoing?.referenceExchangeRate ?? selected.referenceExchangeRate, accountId: outgoing?.accountId ?? selected.accountId, destinationAccountId: incoming?.accountId ?? accounts.find((item) => item.id !== selected.accountId)?.id ?? "", groupKey: type === "expense" ? category?.group ?? "" : "", categoryId: selected.categoryId ?? "", occurredOn: selected.occurredOn, merchant: selected.merchant ?? "", description: selected.description, note: selected.note ?? "", icon: selected.icon ?? (type === "transfer" ? "transfer" : category?.icon ?? ""), cadence: "monthly", intervalCount: 1, firstAnchorDay: 15, secondAnchorDay: 31, postingPolicy: "scheduled_date", autoPost: true, includeInBudget: false, includeInIncomeTarget: false, endsOn: "", financialTargetId: targetSource?.financialTargetId ?? "", financialTargetEffect: targetSource?.financialTargetEffect ?? "advance", installmentCount: 1, financingType: "no_interest", purchaseRateEa: "", firstDueOn: selected.occurredOn };
}

function formFromRecurringRule(rule: RecurringRule, accounts: ReturnType<typeof useFinance>["accounts"], categories: ReturnType<typeof useFinance>["categories"], currencyCode = "COP"): FormState {
  const type: TransactionInput["type"] = rule.kind;
  const sourceCurrency = accounts.find((item) => item.id === rule.accountId)?.currencyCode ?? currencyCode;
  const destinationCurrency = accounts.find((item) => item.id === rule.destinationAccountId)?.currencyCode ?? currencyCode;
  return {
    timing: "recurring",
    type,
    amount: formatMoneyInputValue(rule.amount, sourceCurrency),
    destinationAmount: rule.destinationAmount === undefined ? "" : formatMoneyInputValue(rule.destinationAmount, destinationCurrency),
    feeAmount: "",
    exchangeRate: formatMoneyInputValue(rule.exchangeRate, "USD"),
    referenceExchangeRate: rule.referenceExchangeRate,
    accountId: rule.accountId,
    destinationAccountId: rule.destinationAccountId ?? accounts.find((item) => item.id !== rule.accountId)?.id ?? "",
    groupKey: type === "expense" ? categories.find((item) => item.id === rule.categoryId)?.group ?? "" : "",
    categoryId: rule.categoryId ?? "",
    occurredOn: rule.startsOn,
    merchant: rule.merchant ?? "",
    description: rule.description,
    note: rule.note ?? "",
    icon: rule.icon ?? "",
    cadence: rule.cadence,
    intervalCount: rule.intervalCount,
    firstAnchorDay: rule.anchorDay ?? 15,
    secondAnchorDay: rule.secondAnchorDay ?? 31,
    postingPolicy: rule.postingPolicy,
    autoPost: rule.autoPost,
    includeInBudget: rule.includeInBudget,
    includeInIncomeTarget: rule.includeInIncomeTarget,
    endsOn: rule.endsOn ?? "",
    financialTargetId: rule.financialTargetId ?? "",
    financialTargetEffect: rule.financialTargetEffect ?? "advance",
    installmentCount: 1,
    financingType: "no_interest",
    purchaseRateEa: "",
    firstDueOn: rule.startsOn,
  };
}

function recurringInput(form: FormState, transaction: TransactionInput, timezone = "America/Bogota", id?: string, existing?: RecurringRule): RecurringRuleInput {
  const date = new Date(`${form.occurredOn}T00:00:00Z`);
  return {
    id,
    kind: transaction.type,
    amount: transaction.amount,
    destinationAmount: transaction.destinationAmount,
    accountId: transaction.accountId,
    destinationAccountId: transaction.destinationAccountId,
    categoryId: transaction.categoryId,
    financialTargetId: transaction.financialTargetId,
    financialTargetEffect: transaction.financialTargetEffect,
    description: transaction.description,
    merchant: transaction.merchant,
    note: transaction.note,
    icon: transaction.icon,
    exchangeRate: transaction.exchangeRate ?? 1,
    exchangeRateDate: transaction.exchangeRateDate ?? form.occurredOn,
    exchangeRateSource: transaction.exchangeRateSource ?? "same_currency",
    referenceExchangeRate: transaction.referenceExchangeRate,
    referenceRateSource: transaction.referenceRateSource,
    cadence: form.cadence,
    intervalCount: form.intervalCount,
    startsOn: form.occurredOn,
    endsOn: form.endsOn || undefined,
    anchorDay: form.cadence === "semimonthly" ? form.firstAnchorDay : Number(form.occurredOn.slice(8, 10)),
    secondAnchorDay: form.cadence === "semimonthly" ? form.secondAnchorDay : undefined,
    weekday: date.getUTCDay(),
    postingPolicy: form.postingPolicy,
    timezone,
    autoPost: form.autoPost,
    includeInBudget: transaction.type === "expense" && form.includeInBudget,
    includeInIncomeTarget: transaction.type === "income" && form.includeInIncomeTarget,
    status: existing?.status ?? "active",
  };
}

function RecurringFields({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  const frequencyValue = `${form.cadence}:${form.intervalCount}`;
  const dayOptions = Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: index === 30 ? "Último día disponible" : `Día ${index + 1}` }));
  return <section className="mt-6 border-y py-6" aria-labelledby="recurring-settings-title">
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Repeat2 className="size-[18px]" /></span><div><h3 id="recurring-settings-title" className="font-medium">Frecuencia y automatización</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Puedes pausarla después. Ninguna fecha futura cuenta como gasto o ingreso real.</p></div></div>
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <FieldSelect label="Se repite" value={frequencyValue} onChange={(value) => { const [cadence, interval] = value.split(":"); setForm((current) => ({ ...current, cadence: cadence as FormState["cadence"], intervalCount: Number(interval) })); }} icon={<Repeat2 className="size-4" />} options={[{ value: "weekly:1", label: "Cada semana" }, { value: "weekly:2", label: "Cada 14 días" }, { value: "semimonthly:1", label: "Dos veces al mes" }, { value: "monthly:1", label: "Cada mes" }, { value: "yearly:1", label: "Cada año" }]} />
      {form.cadence === "monthly" ? <FieldSelect label="Se registra" value={form.postingPolicy} onChange={(value) => setForm((current) => ({ ...current, postingPolicy: value as FormState["postingPolicy"] }))} icon={<CalendarClock className="size-4" />} options={[{ value: "scheduled_date", label: `El día ${Number(form.occurredOn.slice(8, 10)) || "elegido"}` }, { value: "month_start", label: "El primer día del mes" }]} /> : form.cadence !== "semimonthly" ? <div><Label htmlFor="transaction-end-date">Termina <span className="text-muted-foreground">(opcional)</span></Label><DateControl id="transaction-end-date" value={form.endsOn} onValueChange={(endsOn) => setForm((current) => ({ ...current, endsOn }))} min={form.occurredOn} containerClassName="mt-2" /></div> : null}
      {form.cadence === "monthly" ? <div><Label htmlFor="transaction-end-date">Termina <span className="text-muted-foreground">(opcional)</span></Label><DateControl id="transaction-end-date" value={form.endsOn} onValueChange={(endsOn) => setForm((current) => ({ ...current, endsOn }))} min={form.occurredOn} containerClassName="mt-2" /></div> : null}
      {form.cadence === "semimonthly" ? <><FieldSelect label="Primer cobro" value={String(form.firstAnchorDay)} onChange={(value) => setForm((current) => ({ ...current, firstAnchorDay: Number(value) }))} icon={<CalendarClock className="size-4" />} options={dayOptions} /><FieldSelect label="Segundo cobro" value={String(form.secondAnchorDay)} onChange={(value) => setForm((current) => ({ ...current, secondAnchorDay: Number(value) }))} icon={<CalendarClock className="size-4" />} options={dayOptions} /><div className="sm:col-span-2"><Label htmlFor="transaction-end-date">Termina <span className="text-muted-foreground">(opcional)</span></Label><DateControl id="transaction-end-date" value={form.endsOn} onValueChange={(endsOn) => setForm((current) => ({ ...current, endsOn }))} min={form.occurredOn} containerClassName="mt-2" /><p className="mt-2 text-xs leading-5 text-muted-foreground">“Dos veces al mes” usa dos fechas del calendario. “Cada 14 días” conserva siempre catorce días exactos entre movimientos.</p></div></> : null}
    </div>
    <div className="mt-5 divide-y rounded-2xl bg-secondary/30 px-4">
      <ToggleRow label="Publicar automáticamente" detail="Crea el movimiento sin pedir confirmación en la fecha prevista." checked={form.autoPost} onCheckedChange={(autoPost) => setForm((current) => ({ ...current, autoPost }))} />
      {form.type === "expense" ? <ToggleRow label="Contarlo en el presupuesto" detail="Lo muestra como compromiso previsto dentro de esta subcategoría." checked={form.includeInBudget} onCheckedChange={(includeInBudget) => setForm((current) => ({ ...current, includeInBudget }))} /> : null}
      {form.type === "income" ? <ToggleRow label="Contarlo como ingreso esperado" detail="Lo incluye en la proyección mensual, nunca como saldo real anticipado." checked={form.includeInIncomeTarget} onCheckedChange={(includeInIncomeTarget) => setForm((current) => ({ ...current, includeInIncomeTarget }))} /> : null}
    </div>
  </section>;
}

function ToggleRow({ label, detail, checked, onCheckedChange }: { label: string; detail: string; checked: boolean; onCheckedChange: (value: boolean) => void }) { return <label className="flex min-h-[72px] cursor-pointer items-center gap-4 py-3"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span><Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} /></label>; }

function recurringSummary(form: FormState) { if (form.cadence === "weekly") return form.intervalCount === 2 ? "Se repetirá cada 14 días" : "Se repetirá cada semana"; if (form.cadence === "semimonthly") return `Se registrará los días ${form.firstAnchorDay} y ${form.secondAnchorDay} de cada mes`; if (form.cadence === "yearly") return "Se repetirá cada año"; return form.postingPolicy === "month_start" ? "Se registrará al iniciar cada mes" : `Se registrará el día ${Number(form.occurredOn.slice(8, 10)) || "elegido"} de cada mes`; }

function FieldSelect({ label, value, onChange, options, icon, emptyLabel = "Selecciona", invalid = false, describedBy, optional = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string; group?: string }>; icon: React.ReactNode; emptyLabel?: string; invalid?: boolean; describedBy?: string; optional?: boolean; disabled?: boolean }) {
  const id = `transaction-${label.toLowerCase().replaceAll(" ", "-")}`;
  const grouped = options.some((option) => option.group);
  const groupNames = Array.from(new Set(options.map((option) => option.group).filter((group): group is string => Boolean(group))));
  return <div className="min-w-0"><Label htmlFor={id}>{label}</Label><SelectControl id={id} value={value} onValueChange={onChange} required={!optional} disabled={disabled} leading={icon} aria-invalid={invalid || undefined} aria-describedby={describedBy} containerClassName="mt-2 [&_[data-slot=form-control-leading]]:text-primary"><option value="" disabled={!optional}>{options.length ? optional ? "Sin vincular" : "Selecciona" : emptyLabel}</option>{grouped ? groupNames.map((group) => <optgroup key={group} label={group}>{options.filter((option) => option.group === group).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>) : options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectControl></div>;
}

function PreviewLine({ label, value, note }: { label: string; value: string; note: string }) { return <div><div className="flex items-baseline justify-between gap-3"><p className="truncate text-sm">{label}</p><p className="shrink-0 font-medium tabular-nums">{value}</p></div><p className="mt-1 text-right text-xs text-muted-foreground">{note}</p></div>; }
function actionLabel(type: TransactionInput["type"]) { return type === "expense" ? "Guardar gasto" : type === "income" ? "Guardar ingreso" : "Transferir"; }
function balanceDelta(type: TransactionInput["type"], amount: number, previous: number) { if (type === "income") return amount - previous; return -(amount - previous); }
function validate(input: TransactionInput): { message: string; field: string } | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { message: "Escribe un monto mayor que cero.", field: "transaction-amount" };
  if (!input.accountId) return { message: "Selecciona una cuenta.", field: input.type === "transfer" ? "transaction-desde" : "transaction-cuenta" };
  if (!input.occurredOn) return { message: "Selecciona una fecha.", field: "transaction-date" };
  if (input.type === "transfer" && !input.destinationAccountId) return { message: "Selecciona la cuenta de destino.", field: "transaction-hacia" };
  if (input.type === "transfer" && input.accountId === input.destinationAccountId) return { message: "La cuenta de origen y destino deben ser diferentes.", field: "transaction-hacia" };
  if (input.exchangeRate !== undefined && !(input.exchangeRate > 0)) return { message: "Escribe una tasa de cambio mayor que cero.", field: "transaction-exchange-rate" };
  if (input.type === "transfer" && input.destinationAmount !== undefined && !(input.destinationAmount > 0)) return { message: "Escribe el valor que recibió la cuenta de destino.", field: "transaction-destination-amount" };
  if (input.type !== "transfer" && !input.categoryId) return input.type === "income" ? { message: "Selecciona un tipo de ingreso.", field: "transaction-tipo-de-ingreso" } : { message: "Selecciona una subcategoría.", field: "transaction-subcategoría" };
  return null;
}
