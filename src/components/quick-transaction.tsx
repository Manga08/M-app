"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, BadgeDollarSign, CalendarClock, CreditCard, Flag, Landmark, Repeat2, Sparkles, Tag, TrendingUp, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";
import { FinanceIconPicker } from "@/components/finance-icon-picker";
import { useFinance } from "@/components/finance-provider";
import { LocalImageCapture } from "@/components/local-image-capture";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateControl, FormControl, FormControlAdornment, FormControlInput, InputControl, SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { accountBalance, categorySpend, currencyFormatter, localIsoDate } from "@/lib/finance/calculations";
import { defaultTargetEffect } from "@/lib/finance/financial-targets";
import { FinanceIcon, suggestFinanceIcon } from "@/lib/finance/icon-catalog";
import { activeIncomeTypes } from "@/lib/finance/income-types";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import { announceMutation } from "@/lib/finance/mutation-feedback";
import type { CaptureCandidate } from "@/lib/finance/local-image-capture";
import type { RecurringRule, RecurringRuleInput, TransactionInput } from "@/lib/finance/types";
import { normalizeImportText, suggestCategoryId, suggestIncomeTypeId } from "@/lib/finance/xlsx-import";
import { cn } from "@/lib/utils";

type FormState = {
  timing: "now" | "recurring";
  type: TransactionInput["type"];
  amount: string;
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
  postingPolicy: RecurringRuleInput["postingPolicy"];
  autoPost: boolean;
  includeInBudget: boolean;
  includeInIncomeTarget: boolean;
  endsOn: string;
  financialTargetId: string;
  financialTargetEffect: "advance" | "reverse";
};

export function QuickTransaction({ open, transactionId, recurringRuleId, initialFinancialTargetId, initialTiming, initialType, initialTargetEffect, onOpenChange }: { open: boolean; transactionId?: string; recurringRuleId?: string; initialFinancialTargetId?: string; initialTiming?: "recurring"; initialType?: TransactionInput["type"]; initialTargetEffect?: "advance" | "reverse"; onOpenChange: (open: boolean) => void }) {
  const { profile, accounts, categories, groupAllocations, transactions, recurringRules, financialTargets, budgets, snapshot, currentMonth, mutate } = useFinance();
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
  const [initialForm] = useState<FormState>(() => selectedRule ? formFromRecurringRule(selectedRule, accounts, categories, profile?.currencyCode) : selected ? formFromTransaction(selected, transferPair, accounts, categories, profile?.currencyCode) : emptyForm(accounts[0]?.id, initialTarget?.accountId ?? accounts[1]?.id, initialCategory, profile?.timezone, initialTarget, { timing: initialTiming, type: initialType, effect: initialTargetEffect }));
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const captureAppliedRef = useRef<Partial<FormState>>({});
  const [error, setError] = useState<string | null>(null);
  const [iconTouched, setIconTouched] = useState(Boolean(selected?.icon));
  const incomeTypes = useMemo(() => activeIncomeTypes(categories, selected?.kind === "income" ? selected.categoryId : undefined), [categories, selected]);
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
  const destination = accounts.find((item) => item.id === form.destinationAccountId);
  const category = categories.find((item) => item.id === form.categoryId);
  const displayIcon = form.icon || category?.icon || (form.type === "income" ? "coins" : "receipt");
  const budget = budgets.find((item) => item.categoryId === form.categoryId && item.month === currentMonth);
  const previousExpense = selected?.kind === "expense" && selected.categoryId === form.categoryId ? selected.amount : 0;
  const spentAfter = form.type === "expense" && category ? Math.max(0, categorySpend(transactions, category.id, currentMonth, snapshot) - previousExpense + amount) : 0;
  const previousSourceAmount = transactionId && (form.type === "transfer"
    ? originalTransferOut?.accountId === form.accountId
    : selected?.accountId === form.accountId)
    ? selected?.amount ?? 0
    : 0;
  const previousDestinationAmount = transactionId && originalTransferIn?.accountId === form.destinationAccountId
    ? selected?.amount ?? 0
    : 0;
  const balanceAfter = account ? accountBalance(account, transactions, snapshot) + balanceDelta(form.type, amount, previousSourceAmount) : 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  function changeType(type: TransactionInput["type"]) {
    if (transactionId || recurringRuleId) return;
    const nextCategory = type === "income" ? activeIncomeTypes(categories)[0] : defaultExpenseCategory;
    setForm((current) => { const target = financialTargets.find((candidate) => candidate.id === current.financialTargetId); return { ...current, type, groupKey: type === "expense" ? nextCategory?.group ?? "" : "", categoryId: type === "transfer" ? "" : nextCategory?.id ?? "", icon: type === "transfer" ? "" : nextCategory?.icon ?? "", financialTargetEffect: target ? defaultTargetEffect(target, type) : current.financialTargetEffect }; });
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
      const nextIcon = nextType === "transfer" ? "" : iconWasUntouched && suggestedIcon ? suggestedIcon : current.icon;

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
      accountId: form.accountId,
      destinationAccountId: form.type === "transfer" ? form.destinationAccountId : undefined,
      categoryId: form.type !== "transfer" ? form.categoryId : undefined,
      financialTargetId: form.financialTargetId || undefined,
      financialTargetEffect: form.financialTargetId ? form.financialTargetEffect : undefined,
      description: form.description.trim() || (form.type === "income" ? "Ingreso" : form.type === "expense" ? "Gasto" : "Transferencia"),
      merchant: form.merchant.trim() || undefined,
      note: form.note.trim() || undefined,
      icon: form.type === "transfer" ? undefined : displayIcon,
      occurredOn: form.occurredOn,
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
          : await mutate.addTransaction(input);
      announceMutation(result, form.timing === "recurring" ? recurringRuleId ? "Programación actualizada" : "Programación creada" : transactionId ? "Movimiento actualizado" : "Movimiento registrado");
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
    if (!next && dirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres cerrar este movimiento?")) return;
    onOpenChange(next);
  }

  return <Dialog open={open} onOpenChange={requestOpenChange}>
    <DialogContent showCloseButton={false} className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:p-0 max-sm:pb-0">
      <form onSubmit={submit} className="relative flex min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)]">
        <div className="mobile-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-40 pt-5 min-[360px]:px-5 sm:px-8 sm:pb-8 sm:pt-7">
          <DialogHeader className="pr-10"><p className="text-xs font-medium uppercase tracking-[.14em] text-primary">{recurringRuleId ? "Editar programación" : transactionId ? "Editar movimiento" : "Nuevo movimiento"}</p><DialogTitle className="text-2xl tracking-[-.035em] sm:text-3xl">{recurringRuleId ? "Ajusta lo que se repite" : transactionId ? "Ajusta los detalles" : form.timing === "recurring" ? "Configúralo una vez" : "¿Qué pasó con tu dinero?"}</DialogTitle><DialogDescription>{recurringRuleId ? "Los próximos eventos se recalcularán; el historial no cambia." : transactionId ? "Los saldos y presupuestos se recalculan al guardar." : form.timing === "recurring" ? "Moneva lo publicará en cada fecha elegida, sin descontarlo antes." : "Regístralo una vez; Moneva actualiza todo lo demás."}</DialogDescription></DialogHeader>

          {!transactionId && !recurringRuleId ? <div className="mt-7 grid grid-cols-2 gap-1 rounded-2xl border border-border/70 bg-secondary/35 p-1" role="group" aria-label="Momento del movimiento"><button type="button" aria-pressed={form.timing === "now"} onClick={() => setForm((current) => ({ ...current, timing: "now" }))} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-150 active:scale-[.98]", form.timing === "now" && "bg-background text-foreground shadow-sm")}><Sparkles className="size-4" />Ahora</button><button type="button" aria-pressed={form.timing === "recurring"} onClick={() => setForm((current) => ({ ...current, timing: "recurring" }))} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-150 active:scale-[.98]", form.timing === "recurring" && "bg-background text-primary shadow-sm")}><Repeat2 className="size-4" />Programado</button></div> : null}

          {!transactionId && !recurringRuleId && form.timing === "now" ? <LocalImageCapture referenceDate={form.occurredOn} onCandidate={applyCaptureCandidate} disabled={saving} /> : null}

          <div className="mt-7 grid grid-cols-3 gap-1 rounded-2xl bg-secondary/60 p-1" role="group" aria-label="Tipo de movimiento">{([
            { value: "expense", label: "Gasto", icon: ArrowUpRight },
            { value: "income", label: "Ingreso", icon: ArrowDownLeft },
            { value: "transfer", label: "Transferencia", icon: ArrowRightLeft },
          ] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={form.type === value} disabled={Boolean(transactionId) && lockedType !== value} onClick={() => changeType(value)} className={cn("flex min-h-14 items-center justify-center gap-2 rounded-xl px-1.5 text-xs font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-150 active:scale-[.98] max-[359px]:flex-col max-[359px]:gap-1 max-[359px]:text-[11px] sm:text-sm", form.type === value && "bg-background text-primary shadow-sm ring-1 ring-foreground/6", transactionId && lockedType !== value && "cursor-not-allowed opacity-35")}><Icon className="size-4" />{label}</button>)}</div>

          <div className="mt-7"><Label htmlFor="transaction-amount">Monto</Label><InputControl id="transaction-amount" value={form.amount} onChange={(event) => { setForm((current) => ({ ...current, amount: formatMoneyInput(event.target.value, profile?.currencyCode) })); setError(null); }} inputMode="decimal" required placeholder="0" leading={<span className="text-xl font-medium">$</span>} aria-invalid={error?.includes("monto") || undefined} aria-describedby={error ? "transaction-form-error" : undefined} containerClassName="mt-2 h-[72px] rounded-[20px] bg-secondary/35" className="pr-4 text-3xl font-medium tracking-[-.04em] tabular-nums" /></div>

          <m.div key={form.type} initial={{ opacity: 0.68, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }} className="mt-6 grid gap-5 sm:grid-cols-2">
            <FieldSelect label={form.type === "transfer" ? "Desde" : "Cuenta"} value={form.accountId} onChange={(value) => { setForm({ ...form, accountId: value }); setError(null); }} icon={<CreditCard className="size-4" />} options={accounts.map((item) => ({ value: item.id, label: item.name }))} invalid={Boolean(error?.includes("cuenta") && !error?.includes("destino"))} describedBy={error ? "transaction-form-error" : undefined} />
            {form.type === "transfer" ? <FieldSelect label="Hacia" value={form.destinationAccountId} onChange={(value) => { setForm((current) => ({ ...current, destinationAccountId: value })); setError(null); }} icon={<Landmark className="size-4" />} options={accounts.map((item) => ({ value: item.id, label: item.name }))} invalid={Boolean(error?.includes("destino") || error?.includes("diferentes"))} describedBy={error ? "transaction-form-error" : undefined} /> : form.type === "income" ? <div><FieldSelect label="Tipo de ingreso" value={form.categoryId} onChange={(value) => { const next = categories.find((item) => item.id === value); setForm((current) => ({ ...current, categoryId: value, icon: iconTouched ? current.icon : next?.icon ?? "" })); setError(null); }} icon={<BadgeDollarSign className="size-4" />} options={incomeTypes.map((item) => ({ value: item.id, label: item.name }))} emptyLabel="Crea un tipo en Cuentas" invalid={Boolean(error?.includes("tipo de ingreso"))} describedBy={error ? "transaction-form-error" : undefined} />{!incomeTypes.length ? <Link href="/cuentas#tipos-de-ingreso" className="mt-2 inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline">Crear un tipo de ingreso en Cuentas</Link> : null}</div> : <>
              <FieldSelect label="Categoría" value={form.groupKey} onChange={(value) => { const next = categories.find((item) => item.kind === "expense" && !item.archived && item.group === value); setForm((current) => ({ ...current, groupKey: value, categoryId: next?.id ?? "", icon: iconTouched ? current.icon : next?.icon ?? "" })); setError(null); }} icon={<FinanceIcon name={expenseGroups.find((item) => item.group === form.groupKey)?.icon ?? "tag"} className="size-4" />} options={expenseGroups.map((item) => ({ value: item.group, label: item.name }))} emptyLabel="No hay categorías disponibles" invalid={Boolean(error?.includes("categoría principal"))} describedBy={error ? "transaction-form-error" : undefined} />
              <FieldSelect label="Subcategoría" value={form.categoryId} onChange={(value) => { const next = categories.find((item) => item.id === value); setForm((current) => ({ ...current, categoryId: value, icon: iconTouched ? current.icon : next?.icon ?? "" })); setError(null); }} icon={<Tag className="size-4" />} options={expenseSubcategories.map((item) => ({ value: item.id, label: item.name }))} emptyLabel="No hay subcategorías" invalid={Boolean(error?.includes("subcategoría"))} describedBy={error ? "transaction-form-error" : undefined} />
            </>}
            <div><Label htmlFor="transaction-date">{form.timing === "recurring" ? "Primera fecha" : "Fecha"}</Label><DateControl id="transaction-date" value={form.occurredOn} onValueChange={(occurredOn) => setForm({ ...form, occurredOn })} required containerClassName="mt-2" /></div>
            {form.type !== "transfer" ? <div><div className="flex items-center justify-between gap-3"><Label htmlFor="transaction-merchant">Comercio <span className="text-muted-foreground">(opcional)</span></Label><span className="text-[10px] text-muted-foreground">Icono editable</span></div><FormControl className="mt-2"><FormControlAdornment interactive className="text-primary"><FinanceIconPicker embedded value={displayIcon} onValueChange={(icon) => { setForm({ ...form, icon }); setIconTouched(true); }} /></FormControlAdornment><FormControlInput id="transaction-merchant" value={form.merchant} onChange={(event) => { const merchant = event.target.value; const suggestion = suggestFinanceIcon(merchant); setForm({ ...form, merchant, icon: !iconTouched && suggestion ? suggestion : form.icon }); }} maxLength={120} placeholder="Ej. Spotify" /></FormControl><p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Toca el icono para personalizarlo; reconocemos comercios y bancos automáticamente.</p></div> : <div className="hidden sm:block" />}
            <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2"><FieldSelect label="Meta o deuda (opcional)" value={form.financialTargetId} onChange={(value) => { const target = financialTargets.find((candidate) => candidate.id === value); setForm((current) => ({ ...current, financialTargetId: value, financialTargetEffect: target ? defaultTargetEffect(target, current.type) : "advance" })); }} icon={<Flag className="size-4" />} options={financialTargets.filter((target) => ["active", "paused"].includes(target.status)).map((target) => ({ value: target.id, label: target.title }))} emptyLabel="No tienes metas activas" optional /><FieldSelect label="Efecto en el avance" value={form.financialTargetEffect} onChange={(value) => setForm((current) => ({ ...current, financialTargetEffect: value as FormState["financialTargetEffect"] }))} icon={<TrendingUp className="size-4" />} options={[{ value: "advance", label: "Sumar avance" }, { value: "reverse", label: "Restar avance" }]} disabled={!form.financialTargetId} /></div>
          </m.div>

          {form.timing === "recurring" ? <RecurringFields form={form} setForm={setForm} /> : null}

          <div className="mt-5"><Label htmlFor="transaction-description">Descripción</Label><Input id="transaction-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={200} className="mt-2 h-12" placeholder={form.type === "transfer" ? "Ej. Pasar a ahorros" : "Ej. Cena con amigos"} /></div>
          <div className="mt-5"><Label htmlFor="transaction-note">Nota <span className="text-muted-foreground">(opcional)</span></Label><Textarea id="transaction-note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={1000} className="mt-2 min-h-20 resize-none" placeholder="Algo que quieras recordar" /></div>
          <AnimatePresence>{error ? <m.p id="transaction-form-error" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.14 }} role="alert" className="mt-5 rounded-xl border border-destructive/35 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</m.p> : null}</AnimatePresence>
        </div>

        <aside className="hidden border-l bg-secondary/28 p-7 lg:flex lg:flex-col">
          <div><p className="text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">{form.timing === "recurring" ? "Así funcionará" : "Impacto antes de guardar"}</p><span className="mt-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><FinanceIcon name={displayIcon} className="size-6" /></span><m.p key={amount} initial={{ opacity: .55, y: 3 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-4xl font-medium tracking-[-.055em]">{money.format(amount || 0)}</m.p><p className="mt-2 text-sm text-muted-foreground">{form.timing === "recurring" ? recurringSummary(form) : form.type === "transfer" ? "Mueve dinero sin alterar ingresos ni gastos." : form.type === "income" ? "Se suma a tu ingreso y al saldo de la cuenta." : "Se descuenta de la cuenta y consume presupuesto."}</p></div>
          <div className="mt-8 space-y-5 border-y py-6"><PreviewLine label={account?.name || "Cuenta"} value={money.format(balanceAfter)} note="saldo estimado" />{form.type === "transfer" && destination ? <PreviewLine label={destination.name} value={money.format(accountBalance(destination, transactions, snapshot) + amount - previousDestinationAmount)} note="saldo estimado" /> : null}{form.type === "expense" && category ? <PreviewLine label={category.name} value={budget ? `${Math.round((spentAfter / Math.max(budget.amount, 1)) * 100)}%` : "Sin límite"} note={budget ? `${money.format(spentAfter)} de ${money.format(budget.amount)}` : "categoría sin presupuesto"} /> : null}</div>
          <div className="mt-auto pt-7"><p className="flex items-center gap-2 text-xs text-muted-foreground">{form.timing === "recurring" ? <CalendarClock className="size-4 text-primary" /> : <Sparkles className="size-4 text-primary" />}{form.timing === "recurring" ? "No afecta saldos antes de la fecha" : "Vista previa calculada en tiempo real"}</p><Button type="submit" className="mt-4 h-12 w-full rounded-full" disabled={saving}>{saving ? "Guardando…" : form.timing === "recurring" ? recurringRuleId ? "Guardar programación" : "Crear programación" : transactionId ? "Guardar cambios" : actionLabel(form.type)}</Button></div>
        </aside>

        <div className="absolute inset-x-0 bottom-0 z-10 border-t bg-popover/96 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_44px_-34px_rgba(0,0,0,.7)] backdrop-blur-xl lg:hidden"><div className="mx-auto max-w-xl"><div className="mb-2 flex min-w-0 items-center justify-between gap-4 px-1"><p className="truncate text-xs text-muted-foreground">{form.timing === "recurring" ? recurringSummary(form) : form.type === "transfer" ? "Entre cuentas" : account?.name || "Selecciona una cuenta"}</p><p className="shrink-0 text-sm font-medium tabular-nums">{money.format(amount || 0)}</p></div><Button type="submit" className="h-12 w-full rounded-2xl" disabled={saving}>{saving ? "Guardando…" : form.timing === "recurring" ? recurringRuleId ? "Guardar programación" : "Crear programación" : transactionId ? "Guardar cambios" : actionLabel(form.type)}</Button></div></div>
      </form>
      {!saving ? <Button type="button" variant="ghost" size="icon-sm" data-testid="quick-transaction-close" aria-label="Cerrar" onClick={() => requestOpenChange(false)} className="absolute right-3 top-3 z-20"><X className="size-4" /></Button> : null}
    </DialogContent>
  </Dialog>;
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
  const matches = accounts.filter((item) => normalizeImportText(item.name).includes(lastFour));
  return matches.length === 1 ? matches[0] : undefined;
}

function retainedCaptureFields(previous: Partial<FormState>, current: FormState) {
  const retained: Partial<FormState> = {};
  (Object.keys(previous) as Array<keyof FormState>).forEach((key) => {
    if (previous[key] === current[key]) Object.assign(retained, { [key]: previous[key] });
  });
  return retained;
}

function emptyForm(accountId = "", destinationAccountId = "", category?: ReturnType<typeof useFinance>["categories"][number], timeZone?: string, target?: ReturnType<typeof useFinance>["financialTargets"][number], preset: { timing?: "recurring"; type?: TransactionInput["type"]; effect?: "advance" | "reverse" } = {}): FormState {
  const type = preset.type ?? "expense";
  return { timing: preset.timing ?? "now", type, amount: "", accountId, destinationAccountId, groupKey: type === "expense" ? category?.group ?? "" : "", categoryId: type === "transfer" ? "" : category?.id ?? "", occurredOn: localIsoDate(new Date(), timeZone), merchant: "", description: "", note: "", icon: "", cadence: "monthly", postingPolicy: "scheduled_date", autoPost: true, includeInBudget: false, includeInIncomeTarget: false, endsOn: "", financialTargetId: target?.id ?? "", financialTargetEffect: preset.effect ?? (target ? defaultTargetEffect(target, type) : "advance") };
}

function formFromTransaction(selected: ReturnType<typeof useFinance>["transactions"][number], transferPair: ReturnType<typeof useFinance>["transactions"][number] | undefined, accounts: ReturnType<typeof useFinance>["accounts"], categories: ReturnType<typeof useFinance>["categories"], currencyCode = "COP"): FormState {
  const type: TransactionInput["type"] = selected.kind.startsWith("transfer") ? "transfer" : selected.kind === "income" ? "income" : "expense";
  const outgoing = selected.kind === "transfer_out" ? selected : transferPair?.kind === "transfer_out" ? transferPair : undefined;
  const incoming = selected.kind === "transfer_in" ? selected : transferPair?.kind === "transfer_in" ? transferPair : undefined;
  const targetSource = selected.financialTargetId ? selected : incoming;
  return { timing: "now", type, amount: formatMoneyInputValue(selected.amount, currencyCode), accountId: outgoing?.accountId ?? selected.accountId, destinationAccountId: incoming?.accountId ?? accounts.find((item) => item.id !== selected.accountId)?.id ?? "", groupKey: type === "expense" ? categories.find((item) => item.id === selected.categoryId)?.group ?? "" : "", categoryId: selected.categoryId ?? "", occurredOn: selected.occurredOn, merchant: selected.merchant ?? "", description: selected.description, note: selected.note ?? "", icon: selected.icon ?? "", cadence: "monthly", postingPolicy: "scheduled_date", autoPost: true, includeInBudget: false, includeInIncomeTarget: false, endsOn: "", financialTargetId: targetSource?.financialTargetId ?? "", financialTargetEffect: targetSource?.financialTargetEffect ?? "advance" };
}

function formFromRecurringRule(rule: RecurringRule, accounts: ReturnType<typeof useFinance>["accounts"], categories: ReturnType<typeof useFinance>["categories"], currencyCode = "COP"): FormState {
  const type: TransactionInput["type"] = rule.kind;
  return {
    timing: "recurring",
    type,
    amount: formatMoneyInputValue(rule.amount, currencyCode),
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
    postingPolicy: rule.postingPolicy,
    autoPost: rule.autoPost,
    includeInBudget: rule.includeInBudget,
    includeInIncomeTarget: rule.includeInIncomeTarget,
    endsOn: rule.endsOn ?? "",
    financialTargetId: rule.financialTargetId ?? "",
    financialTargetEffect: rule.financialTargetEffect ?? "advance",
  };
}

function recurringInput(form: FormState, transaction: TransactionInput, timezone = "America/Bogota", id?: string, existing?: RecurringRule): RecurringRuleInput {
  const date = new Date(`${form.occurredOn}T00:00:00Z`);
  return {
    id,
    kind: transaction.type,
    amount: transaction.amount,
    accountId: transaction.accountId,
    destinationAccountId: transaction.destinationAccountId,
    categoryId: transaction.categoryId,
    financialTargetId: transaction.financialTargetId,
    financialTargetEffect: transaction.financialTargetEffect,
    description: transaction.description,
    merchant: transaction.merchant,
    note: transaction.note,
    icon: transaction.icon,
    cadence: form.cadence,
    intervalCount: 1,
    startsOn: form.occurredOn,
    endsOn: form.endsOn || undefined,
    anchorDay: Number(form.occurredOn.slice(8, 10)),
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
  return <section className="mt-6 border-y py-6" aria-labelledby="recurring-settings-title">
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Repeat2 className="size-[18px]" /></span><div><h3 id="recurring-settings-title" className="font-medium">Frecuencia y automatización</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Puedes pausarla después. Ninguna fecha futura cuenta como gasto o ingreso real.</p></div></div>
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <FieldSelect label="Se repite" value={form.cadence} onChange={(value) => setForm((current) => ({ ...current, cadence: value as FormState["cadence"] }))} icon={<Repeat2 className="size-4" />} options={[{ value: "weekly", label: "Cada semana" }, { value: "monthly", label: "Cada mes" }, { value: "yearly", label: "Cada año" }]} />
      {form.cadence === "monthly" ? <FieldSelect label="Se registra" value={form.postingPolicy} onChange={(value) => setForm((current) => ({ ...current, postingPolicy: value as FormState["postingPolicy"] }))} icon={<CalendarClock className="size-4" />} options={[{ value: "scheduled_date", label: `El día ${Number(form.occurredOn.slice(8, 10)) || "elegido"}` }, { value: "month_start", label: "El primer día del mes" }]} /> : <div><Label htmlFor="transaction-end-date">Termina <span className="text-muted-foreground">(opcional)</span></Label><DateControl id="transaction-end-date" value={form.endsOn} onValueChange={(endsOn) => setForm((current) => ({ ...current, endsOn }))} min={form.occurredOn} containerClassName="mt-2" /></div>}
      {form.cadence === "monthly" ? <div><Label htmlFor="transaction-end-date">Termina <span className="text-muted-foreground">(opcional)</span></Label><DateControl id="transaction-end-date" value={form.endsOn} onValueChange={(endsOn) => setForm((current) => ({ ...current, endsOn }))} min={form.occurredOn} containerClassName="mt-2" /></div> : null}
    </div>
    <div className="mt-5 divide-y rounded-2xl bg-secondary/30 px-4">
      <ToggleRow label="Publicar automáticamente" detail="Crea el movimiento sin pedir confirmación en la fecha prevista." checked={form.autoPost} onCheckedChange={(autoPost) => setForm((current) => ({ ...current, autoPost }))} />
      {form.type === "expense" ? <ToggleRow label="Contarlo en el presupuesto" detail="Lo muestra como compromiso previsto dentro de esta subcategoría." checked={form.includeInBudget} onCheckedChange={(includeInBudget) => setForm((current) => ({ ...current, includeInBudget }))} /> : null}
      {form.type === "income" ? <ToggleRow label="Contarlo como ingreso esperado" detail="Lo incluye en la proyección mensual, nunca como saldo real anticipado." checked={form.includeInIncomeTarget} onCheckedChange={(includeInIncomeTarget) => setForm((current) => ({ ...current, includeInIncomeTarget }))} /> : null}
    </div>
  </section>;
}

function ToggleRow({ label, detail, checked, onCheckedChange }: { label: string; detail: string; checked: boolean; onCheckedChange: (value: boolean) => void }) { return <label className="flex min-h-[72px] cursor-pointer items-center gap-4 py-3"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span><Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} /></label>; }

function recurringSummary(form: FormState) { if (form.cadence === "weekly") return "Se repetirá cada semana"; if (form.cadence === "yearly") return "Se repetirá cada año"; return form.postingPolicy === "month_start" ? "Se registrará al iniciar cada mes" : `Se registrará el día ${Number(form.occurredOn.slice(8, 10)) || "elegido"} de cada mes`; }

function FieldSelect({ label, value, onChange, options, icon, emptyLabel = "Selecciona", invalid = false, describedBy, optional = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; icon: React.ReactNode; emptyLabel?: string; invalid?: boolean; describedBy?: string; optional?: boolean; disabled?: boolean }) {
  const id = `transaction-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <div><Label htmlFor={id}>{label}</Label><SelectControl id={id} value={value} onValueChange={onChange} required={!optional} disabled={disabled} leading={icon} aria-invalid={invalid || undefined} aria-describedby={describedBy} containerClassName="mt-2 [&_[data-slot=form-control-leading]]:text-primary"><option value="" disabled={!optional}>{options.length ? optional ? "Sin vincular" : "Selecciona" : emptyLabel}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectControl></div>;
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
  if (input.type !== "transfer" && !input.categoryId) return input.type === "income" ? { message: "Selecciona un tipo de ingreso.", field: "transaction-tipo-de-ingreso" } : { message: "Selecciona una subcategoría.", field: "transaction-subcategoría" };
  return null;
}
