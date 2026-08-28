"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, CalendarClock, Check, ChevronDown, ChevronRight, CircleDollarSign, Flag, LoaderCircle, Pause, Pencil, Plus, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
import { DebtPlanFields, boundedDebtMinimumDue, buildDebtPlanPreview, createDebtPlanDraft, debtRateWasCleared, type DebtPlanDraft, type DebtPlanPreview } from "@/components/debt-plan-fields";
import { FinanceDataStateBadge, type FinanceDataState } from "@/components/finance-data-state";
import { useFinance } from "@/components/finance-provider";
import { LiabilityPaymentDialog, LiabilityPaymentRuleDialog } from "@/components/liability-payment-dialogs";
import { accountSelectOptions } from "@/components/account-select-options";
import { FinanceIdentityField, FINANCE_IDENTITY_COLORS } from "@/components/finance-identity-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateControl, InputControl, SelectControl } from "@/components/ui/form-control";
import { FormDialogActions, FormDialogBody, FormDialogContent } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationControls } from "@/components/pagination-controls";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { currencyFormatter, localIsoDate } from "@/lib/finance/calculations";
import { estimatedTargetCompletion, financialTargetProgress, liabilityBackedTargetProgress, targetKindLabel, targetProgressDuringMonth, targetStatusLabel } from "@/lib/finance/financial-targets";
import { transactionReportingAmount } from "@/lib/finance/currency";
import { debtCalculationLabel, debtFrequencyLabel, type DebtCalculationMethod, type DebtProductType } from "@/lib/finance/debt-products";
import { liabilityKindLabel } from "@/lib/finance/liabilities";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import type { FinancialTarget, FinancialTargetDebtDetails, FinancialTargetDebtInput, FinancialTargetEntryInput, FinancialTargetInput, FinancialTargetKind, FinancialTargetStatus, LiabilityObligationInput, LiabilityOverviewItem, LiabilityRatePeriod, LiabilityTerms } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

type TargetFilter = "active" | "all" | "debt" | "completed";

export function FinancialTargetsPage() {
  const finance = useFinance();
  const { loadFinancialTargetEntries } = finance;
  const router = useRouter();
  const searchParams = useSearchParams();
  const money = currencyFormatter(finance.profile?.currencyCode);
  const [filter, setFilter] = useState<TargetFilter>("active");
  const [page, setPage] = useState(1);
  const targetParam = searchParams.get("meta");
  const selected = finance.financialTargets.find((target) => target.id === targetParam);
  const creating = targetParam === "nueva";
  const editing = searchParams.get("editar") === "1";
  const visible = useMemo(() => finance.financialTargets
    .filter((target) => target.status !== "archived")
    .filter((target) => filter === "all" || filter === "active" && ["active", "paused"].includes(target.status) || filter === "debt" && target.kind === "debt" || filter === "completed" && target.status === "completed")
    .sort((a, b) => a.status.localeCompare(b.status) || a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt)), [filter, finance.financialTargets]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
  const priority = finance.financialTargets.filter((target) => target.status === "active").sort((a, b) => a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt))[0];

  useEffect(() => {
    if (!selected?.id) return;
    void loadFinancialTargetEntries(selected.id).catch(() => undefined);
  }, [loadFinancialTargetEntries, selected?.id]);

  function navigate(value?: string, edit = false) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("meta", value); else params.delete("meta");
    if (edit) params.set("editar", "1"); else params.delete("editar");
    router.push(`/metas${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  return <div className="min-w-0" data-financial-targets>
    <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl"><p className="text-[11px] font-medium uppercase tracking-[.14em] text-primary">Rumbo financiero</p><h1 className="mt-2 text-[clamp(2rem,4vw,3.25rem)] font-medium leading-none tracking-[-.055em]">Metas y deudas</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Convierte una intención en un recorrido claro. Moneva calcula el avance desde tus aportes y movimientos, sin alterar tus saldos dos veces.</p></div>
      <Button className="h-11 shrink-0 rounded-full px-5" onClick={() => navigate("nueva")}><Plus className="size-4" />Nueva meta</Button>
    </header>

    {priority ? <PriorityTarget target={priority} money={money} liability={targetLiabilityOverview(finance, priority)} onOpen={() => navigate(priority.id)} entries={finance.financialTargetEntries} transactions={finance.transactions} rules={finance.recurringRules} /> : <EmptyTargets onCreate={() => navigate("nueva")} />}

    <section className="border-t pt-7" aria-labelledby="target-list-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="target-list-title" className="text-xl font-medium tracking-[-.03em]">Tu recorrido</h2><p className="mt-1 text-sm text-muted-foreground">Cada cifra conserva su fuente: inicial, manual o movimiento.</p></div><div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-secondary/65 p-1" aria-label="Filtrar metas">{([{ value: "active", label: "En curso" }, { value: "all", label: "Todas" }, { value: "debt", label: "Deudas" }, { value: "completed", label: "Cumplidas" }] as const).map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setPage(1); }} className={cn("min-h-11 shrink-0 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-[color,background-color] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)]", filter === item.value && "bg-background text-foreground shadow-sm")}>{item.label}</button>)}</div></div>
      <div className="mt-5 divide-y">{paged.length ? paged.map((target) => <TargetRow key={target.id} target={target} money={money} liability={targetLiabilityOverview(finance, target)} onOpen={() => navigate(target.id)} entries={finance.financialTargetEntries} transactions={finance.transactions} />) : <p className="py-10 text-center text-sm text-muted-foreground">No hay metas en este filtro.</p>}</div>
      <PaginationControls page={Math.min(page, pageCount)} pageCount={pageCount} onPageChange={setPage} total={visible.length} label="metas" />
    </section>

    <TargetDialog key={`form-${creating ? "new" : selected?.id ?? "closed"}`} open={creating || Boolean(selected && editing)} target={editing ? selected : undefined} onOpenChange={(open) => !open && navigate(selected?.id)} />
    <TargetDetailDialog key={`detail-${selected?.id ?? "none"}`} open={Boolean(selected && !editing)} target={selected} onOpenChange={(open) => !open && navigate()} onEdit={() => selected && navigate(selected.id, true)} />
  </div>;
}

function PriorityTarget({ target, money, liability, onOpen, entries, transactions, rules }: { target: FinancialTarget; money: Intl.NumberFormat; liability?: LiabilityOverviewItem; onOpen: () => void; entries: ReturnType<typeof useFinance>["financialTargetEntries"]; transactions: ReturnType<typeof useFinance>["transactions"]; rules: ReturnType<typeof useFinance>["recurringRules"] }) {
  const targetMoney = liability ? currencyFormatter(liability.currencyCode) : money;
  const progress = liability ? liabilityBackedTargetProgress(liability.originalPrincipal ?? target.targetAmount, liability.nativeDebt) : financialTargetProgress(target, entries, transactions);
  const progressMax = liability?.originalPrincipal ?? target.targetAmount;
  const pace = targetProgressDuringMonth(target.id, new Date().toISOString().slice(0, 7), entries, transactions);
  const estimate = estimatedTargetCompletion(target, progress, rules);
  return <section className="py-8 lg:py-10" aria-labelledby="priority-target-title">
    <button type="button" onClick={onOpen} className="group grid w-full min-w-0 gap-7 text-left outline-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end lg:grid-cols-[minmax(0,1.2fr)_minmax(250px,.55fr)] lg:gap-14" aria-label={`Abrir ${target.title}`}>
      <span className="min-w-0"><span className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ color: target.color, backgroundColor: `${target.color}18` }}><FinanceIcon name={target.icon} className="size-5" /></span><span><span className="block text-xs text-muted-foreground">Prioridad actual</span><span id="priority-target-title" className="mt-0.5 block text-xl font-medium tracking-[-.03em] group-hover:text-primary">{target.title}</span></span></span><span className="mt-7 block text-[11px] uppercase tracking-[.14em] text-muted-foreground">{target.mode === "pay_down" ? "Saldo por pagar" : "Falta por reunir"}</span><span className="mt-1 block break-words text-[clamp(1.9rem,8.5vw,4.5rem)] font-medium leading-none tracking-[-.05em] tabular-nums [overflow-wrap:anywhere]">{targetMoney.format(progress.remaining)}</span><Progress className="mt-6 h-2" indicatorClassName="bg-[var(--target-color)]" style={{ "--target-color": target.color } as React.CSSProperties} value={progress.rawProgress} max={progressMax} label={`Avance de ${target.title}`} valueText={`${Math.round(progress.percent)}%, ${targetMoney.format(progress.remaining)} pendientes`} /><span className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground"><span>{targetMoney.format(progress.rawProgress)} de {targetMoney.format(progressMax)}</span><span className="font-medium tabular-nums" style={{ color: target.color }}>{Math.round(progress.percent)}%</span></span></span>
      <span className="grid grid-cols-2 gap-px overflow-hidden border-y bg-border sm:min-w-[250px] lg:grid-cols-1">{liability ? <><TargetMetric label="Próximo pago" value={liability.nextObligation ? targetMoney.format(liability.nextObligation.remaining) : "Sin pago calculado"} /><TargetMetric label="Próxima fecha" value={liability.nextObligation ? dateLabel(liability.nextObligation.dueOn) : "Sin fecha"} /></> : <><TargetMetric label="Este mes" value={money.format(pace)} /><TargetMetric label="Ritmo previsto" value={estimate ? monthYear(estimate) : target.targetDate ? dateLabel(target.targetDate) : "Sin fecha"} /></>}<span className="col-span-2 flex min-h-12 items-center justify-between bg-background px-4 text-sm font-medium text-primary lg:col-span-1">Ver recorrido <ChevronRight className="size-4" /></span></span>
    </button>
  </section>;
}

function TargetMetric({ label, value }: { label: string; value: string }) { return <span className="min-w-0 bg-background px-4 py-4"><span className="block text-[11px] text-muted-foreground">{label}</span><span className="mt-1 block break-words text-sm font-medium tabular-nums [overflow-wrap:anywhere]">{value}</span></span>; }

function TargetRow({ target, money, liability, onOpen, entries, transactions }: { target: FinancialTarget; money: Intl.NumberFormat; liability?: LiabilityOverviewItem; onOpen: () => void; entries: ReturnType<typeof useFinance>["financialTargetEntries"]; transactions: ReturnType<typeof useFinance>["transactions"] }) {
  const targetMoney = liability ? currencyFormatter(liability.currencyCode) : money;
  const progress = liability ? liabilityBackedTargetProgress(liability.originalPrincipal ?? target.targetAmount, liability.nativeDebt) : financialTargetProgress(target, entries, transactions);
  const progressMax = liability?.originalPrincipal ?? target.targetAmount;
  return <button type="button" onClick={onOpen} className="group grid min-h-[78px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left outline-none transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-secondary/25 focus-visible:ring-2 focus-visible:ring-ring"><span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ color: target.color, backgroundColor: `${target.color}16` }}><FinanceIcon name={target.icon} className="size-5" /></span><span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-medium group-hover:text-primary">{target.title}</span>{target.status !== "active" ? <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{targetStatusLabel(target.status)}</span> : null}</span><span className="mt-2 flex items-center gap-3"><Progress className="max-w-52" indicatorClassName="bg-[var(--target-color)]" style={{ "--target-color": target.color } as React.CSSProperties} value={progress.rawProgress} max={progressMax} label={`Avance de ${target.title}`} valueText={`${Math.round(progress.percent)}%`} /><span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{Math.round(progress.percent)}%</span></span></span><span className="text-right"><span className="block text-sm font-medium tabular-nums">{targetMoney.format(progress.remaining)}</span><span className="text-[11px] text-muted-foreground">{target.mode === "pay_down" ? "por pagar" : "pendiente"}</span></span></button>;
}

function EmptyTargets({ onCreate }: { onCreate: () => void }) { return <section className="py-10"><div className="border-y py-9 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary"><Flag className="size-5" /></span><h2 className="mt-4 text-xl font-medium tracking-[-.03em]">Dale un destino a tu próximo peso</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Crea una meta de ahorro, una compra o una deuda. Podrás avanzar manualmente o enlazando movimientos reales.</p><Button className="mt-5 rounded-full" onClick={onCreate}><Plus className="size-4" />Crear la primera</Button></div></section>; }

function TargetDialog({ open, target, onOpenChange }: { open: boolean; target?: FinancialTarget; onOpenChange: (open: boolean) => void }) {
  const finance = useFinance();
  const today = localIsoDate(new Date(), finance.profile?.timezone);
  const currencyCode = finance.profile?.currencyCode ?? "COP";
  const money = currencyFormatter(currencyCode);
  const debt = finance.financialTargetDebts.find((item) => item.targetId === target?.id);
  const liabilityOverview = target ? targetLiabilityOverview(finance, target) : undefined;
  const currentTerms = liabilityOverview?.currentTerms ?? currentLiabilityTerms(finance, liabilityOverview?.accountId);
  const currentRates = liabilityOverview?.currentRates ?? currentLiabilityRates(finance, liabilityOverview?.accountId);
  const initialDebtPlan = debtDraftFromState({ finance, target, debt, overview: liabilityOverview, terms: currentTerms, rates: currentRates, today, fallbackCurrency: currencyCode });
  const initialDebtScheduleSignature = debtScheduleSignature(initialDebtPlan);
  const [draftTargetId] = useState(() => target?.id ?? crypto.randomUUID());
  const [draftTermId] = useState(() => currentTerms?.id ?? crypto.randomUUID());
  const [draftRateId] = useState(() => currentRates.find((item) => item.rateKind === "principal")?.id ?? currentRates[0]?.id ?? crypto.randomUUID());
  const scheduleIds = useRef(new Map(finance.liabilityObligations
    .filter((item) => item.accountId === liabilityOverview?.accountId && item.sequenceNumber !== undefined && item.source === "contract")
    .map((item) => [item.sequenceNumber!, item.id])));
  const [kind, setKind] = useState<FinancialTargetKind>(target?.kind ?? "savings");
  const [title, setTitle] = useState(target?.title ?? "");
  const [description, setDescription] = useState(target?.description ?? "");
  const [targetAmount, setTargetAmount] = useState(target ? formatMoneyInputValue(target.targetAmount, currencyCode) : "");
  const [initialProgress, setInitialProgress] = useState(formatMoneyInputValue(target?.initialProgress ?? 0, target?.kind === "debt" ? initialDebtPlan.currencyCode : currencyCode));
  const [debtPlan, setDebtPlan] = useState<DebtPlanDraft>(initialDebtPlan);
  const [startsOn, setStartsOn] = useState(target?.startsOn ?? today);
  const [targetDate, setTargetDate] = useState(target?.targetDate ?? "");
  const [priority, setPriority] = useState(String(target?.priority ?? 3));
  const [color, setColor] = useState(target?.color ?? FINANCE_IDENTITY_COLORS[0]);
  const [icon, setIcon] = useState(target?.icon ?? "target");
  const [iconTouched, setIconTouched] = useState(Boolean(target));
  const [accountId, setAccountId] = useState(target?.kind === "debt" ? liabilityOverview?.paymentRule?.fundingAccountId ?? debtPlan.fundingAccountId ?? "" : target?.accountId ?? "");
  const [categoryId, setCategoryId] = useState(target?.categoryId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetValue = kind === "debt" ? target?.targetAmount ?? debtPlan.principal ?? 0 : parseMoneyInput(targetAmount);
  const progressValue = parseMoneyInput(initialProgress);
  const progressPercent = targetValue > 0 ? Math.min(100, Math.round((progressValue / targetValue) * 100)) : 0;
  const selectedKind = kindOptions.find((item) => item.value === kind) ?? kindOptions[0];
  const submitLabel = target ? "Guardar cambios" : kind === "debt" ? "Crear deuda" : "Crear meta";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (kind === "debt" && debtPlan.currencyCode === "USD" && !debtPlan.liabilityAccountId && !(debtPlan.openingExchangeRate && debtPlan.openingExchangeRate > 0)) {
      setError("Escribe la TRM inicial para crear esta deuda en dólares.");
      return;
    }
    setSaving(true);
    const id = draftTargetId;
    const preview = kind === "debt" ? buildDebtPlanPreview(debtPlan) : undefined;
    const existingObligations = debtPlan.liabilityAccountId
      ? finance.liabilityObligations.filter((item) => item.accountId === debtPlan.liabilityAccountId)
      : [];
    const scheduleChanged = kind === "debt" && debtScheduleSignature(debtPlan) !== initialDebtScheduleSignature;
    if (target?.kind === "debt" && scheduleChanged && existingObligations.some((item) => ["due", "partial", "overdue"].includes(item.status))) {
      setError("Antes de recalcular el plan, registra o concilia la cuota que sigue pendiente.");
      setSaving(false);
      return;
    }
    if (target?.kind === "debt" && scheduleChanged && preview?.state === "ready"
      && existingObligations.length > 0 && debtPlan.firstDueOn && debtPlan.firstDueOn <= today) {
      setError("Para recalcular lo que falta, elige una primera cuota posterior a hoy.");
      setSaving(false);
      return;
    }
    const originalFundingAccountId = liabilityOverview?.paymentRule?.fundingAccountId ?? "";
    const fundingAccountChanged = target?.kind !== "debt" || accountId !== originalFundingAccountId;
    const debtDraftInput = kind === "debt" ? debtInputFromDraft({
      value: { ...debtPlan, fundingAccountId: fundingAccountChanged ? accountId || undefined : undefined },
      preview,
      legacy: debt,
      terms: currentTerms,
      rates: currentRates,
      existingObligations,
      termId: draftTermId,
      rateId: draftRateId,
      scheduleIds: scheduleIds.current,
      includeSchedule: !target || scheduleChanged || existingObligations.length === 0,
      today,
    }) : undefined;
    const debtInput = debtDraftInput ? {
      ...debtDraftInput,
      clearFundingAccount: fundingAccountChanged && liabilityOverview?.paymentRule !== undefined && !accountId ? true : undefined,
    } : undefined;
    const input: FinancialTargetInput = {
      id, mode: kind === "debt" ? "pay_down" : "accumulate", kind, status: target?.status ?? "active",
      title, description: description || undefined, targetAmount: targetValue, initialProgress: progressValue,
      startsOn: kind === "debt" ? debtPlan.termsStartOn : startsOn, targetDate: targetDate || undefined, priority: Number(priority), color, icon,
      accountId: kind === "debt" ? undefined : accountId || undefined, categoryId: categoryId || undefined,
      trackingMode: "movements",
      debt: debtInput,
    };
    try {
      const result = await finance.mutate.upsertFinancialTarget(input);
      announceMutation(result, target ? "Meta actualizada" : "Meta creada");
      onOpenChange(false);
    } catch (caught) { const message = caught instanceof Error ? caught.message : "No pudimos guardar la meta."; setError(message); announceMutationError(caught, message); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><FormDialogContent variant="flow" showCloseButton={!saving}><form onSubmit={submit} className="flex min-h-0 flex-1 flex-col"><FormDialogBody>
    <DialogHeader className="mb-7 pr-8"><p className="text-xs font-medium uppercase tracking-[.14em] text-primary">{target ? "Editar rumbo" : "Nuevo rumbo financiero"}</p><DialogTitle className="text-2xl tracking-[-.035em] sm:text-3xl">{target ? "Ajusta tu recorrido" : kind === "debt" ? "¿Qué quieres terminar de pagar?" : "¿Qué quieres hacer posible?"}</DialogTitle><DialogDescription>{target ? "El avance registrado permanece intacto; solo cambia cómo organizas este recorrido." : kind === "debt" ? "Empieza con el saldo que debes. Los datos del plan y los intereses son opcionales." : "Define el destino y registra avances sin alterar dos veces tus saldos."}</DialogDescription></DialogHeader>
    <div className={cn("gap-8", kind !== "debt" && "grid lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)] lg:gap-12")}>
      <div className="min-w-0">
        <fieldset><legend className="text-sm font-medium">¿Qué vas a gestionar?</legend><div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl bg-secondary/55 p-1 min-[380px]:grid-cols-3">{kindOptions.map((item) => { const disabled = Boolean(target?.kind === "debt" && liabilityOverview && item.value !== "debt"); return <button key={item.value} type="button" aria-pressed={kind === item.value} disabled={disabled} onClick={() => { const next = item.value; setKind(next); if (!iconTouched) setIcon(item.icon); }} className={cn("flex min-h-[62px] min-w-0 items-center gap-2 rounded-xl px-2.5 text-left text-xs font-medium text-muted-foreground outline-none transition-[color,background-color,box-shadow,transform] duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-out)] focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[var(--motion-press-scale)] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none", kind === item.value && "bg-background text-primary shadow-sm ring-1 ring-foreground/6")}><FinanceIcon name={item.icon} className="size-[18px] shrink-0" /><span className="leading-4">{item.label}</span></button>; })}</div>{target?.kind === "debt" && liabilityOverview ? <p className="mt-2 text-xs leading-5 text-muted-foreground">La deuda conserva su tipo contable para proteger pagos, movimientos e historial.</p> : null}</fieldset>

        <div className="mt-7"><FinanceIdentityField id="target-title" value={title} onValueChange={(value) => { setTitle(value); setError(null); }} icon={icon} onIconChange={(value) => { setIcon(value); setIconTouched(true); }} color={color} onColorChange={setColor} required autoFocus placeholder={kind === "debt" ? "Ej. Crédito del carro" : "Ej. Fondo de emergencia"} colorLabel="Color del recorrido" /></div>

        {kind === "debt" ? <div className="mt-7"><DebtPlanFields value={debtPlan} openingStateLocked={Boolean(liabilityOverview)} onChange={(next) => { setDebtPlan(next); setError(null); }} />{target && !liabilityOverview ? <div className="mt-7 max-w-xl rounded-[22px] bg-secondary/25 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">Avance de la versión anterior</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Conserva lo que ya habías registrado mientras completas el nuevo saldo de la deuda.</p></div><FinanceDataStateBadge state="manual" /></div><Label htmlFor="target-progress" className="mt-5">Ya pagado</Label><InputControl id="target-progress" className="tabular-nums" containerClassName="mt-2" inputMode="decimal" value={initialProgress} onChange={(event) => setInitialProgress(formatMoneyInput(event.target.value, debtPlan.currencyCode))} leading={<TrendingUp />} placeholder="0" /></div> : null}</div> : <><div className="mt-6"><Label htmlFor="target-amount">Monto objetivo</Label><InputControl id="target-amount" className="pr-4 text-3xl font-medium tracking-[-.04em] tabular-nums" containerClassName="mt-2 h-[72px] rounded-[20px] bg-secondary/35" inputMode="decimal" value={targetAmount} onChange={(event) => { setTargetAmount(formatMoneyInput(event.target.value, currencyCode)); setError(null); }} leading={<span className="text-xl font-medium">$</span>} required placeholder="0" aria-invalid={Boolean(error && targetValue <= 0) || undefined} aria-describedby={error ? "target-form-error" : undefined} /><p className="mt-2 text-xs leading-5 text-muted-foreground">Es el destino total que quieres alcanzar.</p></div><div className="mt-6"><Label htmlFor="target-progress">Avance inicial</Label><InputControl id="target-progress" className="tabular-nums" containerClassName="mt-2" inputMode="decimal" value={initialProgress} onChange={(event) => setInitialProgress(formatMoneyInput(event.target.value, currencyCode))} leading={<TrendingUp />} placeholder="0" /></div></>}

        <details className="group mt-7 rounded-2xl bg-secondary/25 px-4 py-3.5 sm:px-5"><summary className="coarse-target flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium"><span><span className="block">Organización y seguimiento</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Opcional · fechas, prioridad y vínculos</span></span><ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary><div className="mt-5 grid gap-5 sm:grid-cols-2"><div><Label htmlFor="target-priority">Prioridad</Label><SelectControl id="target-priority" containerClassName="mt-2" value={priority} onValueChange={setPriority}><option value="1">1 · Esencial</option><option value="2">2 · Alta</option><option value="3">3 · Normal</option><option value="4">4 · Flexible</option><option value="5">5 · Algún día</option></SelectControl></div>{kind !== "debt" ? <div><Label htmlFor="target-start">Fecha de inicio</Label><DateControl id="target-start" containerClassName="mt-2" value={startsOn} onValueChange={setStartsOn} required /></div> : null}<div><Label htmlFor="target-date">Fecha objetivo <span className="text-muted-foreground">(opcional)</span></Label><DateControl id="target-date" containerClassName="mt-2" value={targetDate} min={kind === "debt" ? debtPlan.termsStartOn : startsOn} onValueChange={setTargetDate} /></div><div><Label htmlFor="target-account">{kind === "debt" ? "Cuenta desde la que pagarás" : "Cuenta vinculada"} <span className="text-muted-foreground">(opcional)</span></Label><SelectControl id="target-account" containerClassName="mt-2" value={accountId} onValueChange={setAccountId}><option value="">Ninguna</option>{accountSelectOptions({ accounts: kind === "debt" ? finance.accounts.filter((account) => account.type !== "credit") : finance.accounts, entities: finance.accountEntities })}</SelectControl>{kind === "debt" ? <p className="mt-2 text-xs leading-5 text-muted-foreground">Esta cuenta sólo indica de dónde saldrán futuros pagos. Nunca se usa como la cuenta de la deuda.</p> : null}</div><div><Label htmlFor="target-category">Subcategoría <span className="text-muted-foreground">(opcional)</span></Label><SelectControl id="target-category" containerClassName="mt-2" value={categoryId} onValueChange={setCategoryId}><option value="">Ninguna</option>{finance.categories.filter((category) => !category.archived).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectControl></div><div className="sm:col-span-2"><Label htmlFor="target-description">Descripción <span className="text-muted-foreground">(opcional)</span></Label><Textarea id="target-description" className="mt-2 min-h-24 resize-none rounded-[14px]" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={600} placeholder={kind === "debt" ? "Qué originó esta deuda o qué quieres recordar" : "Qué quieres lograr y por qué importa"} /></div></div></details>
        {error ? <p id="target-form-error" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive" role="alert">{error}</p> : null}
      </div>

      {kind !== "debt" ? <aside className="hidden self-start rounded-3xl bg-secondary/28 p-6 lg:block lg:sticky lg:top-0"><p className="text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">Vista previa</p><span className="mt-5 grid size-12 place-items-center rounded-2xl" style={{ color, backgroundColor: `${color}18` }}><FinanceIcon name={icon} className="size-6" /></span><p className="mt-4 break-words text-2xl font-medium tracking-[-.04em]">{title.trim() || selectedKind.example}</p><p className="mt-2 text-4xl font-medium tracking-[-.055em] tabular-nums">{money.format(targetValue || 0)}</p><p className="mt-2 text-sm text-muted-foreground">Destino total que quieres alcanzar.</p><dl className="mt-7 space-y-5"><TargetPreviewLine label="Tipo" value={selectedKind.label} /><TargetPreviewLine label="Avance inicial" value={`${money.format(progressValue)} · ${progressPercent}%`} /><TargetPreviewLine label="Fecha objetivo" value={targetDate ? dateLabel(targetDate) : "Flexible"} /></dl><p className="mt-7 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />El avance sólo cambia con aportes, pagos o movimientos reales.</p></aside> : null}
    </div>
  </FormDialogBody><FormDialogActions><Button type="submit" className="h-12 w-full rounded-2xl sm:w-auto sm:min-w-40" disabled={saving || !title.trim() || targetValue <= 0}>{saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Check className="size-4" />}{saving ? "Guardando…" : submitLabel}</Button><Button type="button" variant="outline" className="h-12 w-full rounded-2xl sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button></FormDialogActions></form></FormDialogContent></Dialog>;
}

function TargetPreviewLine({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="max-w-[60%] text-right text-sm font-medium tabular-nums">{value}</dd></div>; }

function TargetDetailDialog({ open, target, onOpenChange, onEdit }: { open: boolean; target?: FinancialTarget; onOpenChange: (open: boolean) => void; onEdit: () => void }) {
  const finance = useFinance();
  const today = localIsoDate(new Date(), finance.profile?.timezone);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [reverse, setReverse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentRuleOpen, setPaymentRuleOpen] = useState(false);
  if (!target) return null;
  const liabilityOverview = target.mode === "pay_down" ? targetLiabilityOverview(finance, target) : undefined;
  const money = currencyFormatter(liabilityOverview?.currencyCode ?? finance.profile?.currencyCode);
  const progress = liabilityOverview
    ? liabilityBackedTargetProgress(liabilityOverview.originalPrincipal ?? target.targetAmount, liabilityOverview.nativeDebt)
    : financialTargetProgress(target, finance.financialTargetEntries, finance.transactions);
  const progressMax = liabilityOverview?.originalPrincipal ?? target.targetAmount;
  const debt = finance.financialTargetDebts.find((item) => item.targetId === target.id);
  const entries = finance.financialTargetEntries.filter((entry) => entry.targetId === target.id).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt));
  const movements = finance.transactions.filter((movement) => movement.financialTargetId === target.id).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  const rules = finance.recurringRules.filter((rule) => rule.financialTargetId === target.id && rule.status !== "archived");
  const estimate = estimatedTargetCompletion(target, progress, finance.recurringRules);
  const entryAmount = parseMoneyInput(amount);
  const debtStillOpen = Boolean(liabilityOverview && liabilityOverview.nativeDebt > 0.01);

  async function addEntry(event: React.FormEvent) {
    event.preventDefault(); setSaving(true);
    const input: FinancialTargetEntryInput = { targetId: target!.id, kind: target!.mode === "pay_down" ? reverse ? "interest" : "payment" : reverse ? "withdrawal" : "contribution", effect: reverse ? "reverse" : "advance", amount: entryAmount, occurredOn: date, note: note || undefined };
    try { const result = await finance.mutate.upsertFinancialTargetEntry(input); announceMutation(result, reverse ? "Ajuste registrado" : target!.mode === "pay_down" ? "Pago registrado" : "Aporte registrado"); setAmount(""); setNote(""); }
    catch (error) { announceMutationError(error, "No pudimos registrar el avance."); }
    finally { setSaving(false); }
  }

  async function changeStatus(status: FinancialTargetStatus) { try { const result = await finance.mutate.setFinancialTargetStatus(target!.id, status); announceMutation(result, status === "completed" ? "Recorrido completado" : status === "archived" ? "Recorrido archivado" : status === "paused" ? "Recorrido pausado" : "Recorrido reanudado"); if (status === "archived") onOpenChange(false); } catch (error) { announceMutationError(error, "No pudimos cambiar el estado."); } }
  function programContribution() {
    window.dispatchEvent(new CustomEvent("moneva:quick-add", { detail: { financialTargetId: target!.id, timing: "recurring", type: target!.mode === "accumulate" ? "transfer" : "expense", effect: "advance" } }));
  }

  const detailOpen = open && !paymentOpen && !paymentRuleOpen;

  return <><Dialog open={detailOpen} onOpenChange={onOpenChange}><DialogContent className="fullscreen-dialog-close-safe gap-0 p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-w-3xl"><div className="safe-dialog-top p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-7"><DialogHeader><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ color: target.color, backgroundColor: `${target.color}18` }}><FinanceIcon name={target.icon} className="size-5" /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">{targetKindLabel(target.kind)} · {targetStatusLabel(target.status)}</p><DialogTitle className="mt-1 line-clamp-2 break-words pr-8 text-xl">{target.title}</DialogTitle></div></div><DialogDescription className="pt-1">{target.description || (target.mode === "pay_down" ? "Reduce esta deuda con pagos registrados o movimientos enlazados." : "Acércate a este objetivo con aportes registrados o movimientos enlazados.")}</DialogDescription></DialogHeader>
    <section className="mt-7 border-y py-6"><div className="flex flex-wrap items-center gap-2"><p className="text-[11px] uppercase tracking-[.14em] text-muted-foreground">{target.mode === "pay_down" ? "Saldo pendiente" : "Falta por reunir"}</p><FinanceDataStateBadge state={target.mode === "pay_down" && liabilityOverview?.reportingApproximate ? "estimated" : "calculated"} /></div><p className="mt-2 break-words text-[clamp(1.9rem,8.5vw,4rem)] font-medium leading-none tracking-[-.05em] tabular-nums [overflow-wrap:anywhere]">{money.format(progress.remaining)}</p><Progress className="mt-6 h-2" indicatorClassName="bg-[var(--target-color)]" style={{ "--target-color": target.color } as React.CSSProperties} value={progress.rawProgress} max={progressMax} label={`Avance de ${target.title}`} valueText={`${Math.round(progress.percent)}%, ${money.format(progress.remaining)} pendientes`} /><div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground"><span>{money.format(progress.rawProgress)} de {money.format(progressMax)}</span><span>{Math.round(progress.percent)}%</span></div>{target.mode === "pay_down" ? <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4"><DetailMetric label="Saldo inicial" value={money.format(progressMax)} /><DetailMetric label="Próximo pago" value={liabilityOverview?.nextObligation ? money.format(liabilityOverview.nextObligation.remaining) : "Sin pago calculado"} /><DetailMetric label="Próxima fecha" value={liabilityOverview?.nextObligation ? dateLabel(liabilityOverview.nextObligation.dueOn) : debt?.dueDay ? `Día ${debt.dueDay}` : "Sin fecha"} /><DetailMetric label="Moneda" value={liabilityOverview?.currencyCode ?? finance.profile?.currencyCode ?? "COP"} /></div> : <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4"><DetailMetric label="Objetivo" value={money.format(target.targetAmount)} /><DetailMetric label="Este mes" value={money.format(targetProgressDuringMonth(target.id, today.slice(0, 7), finance.financialTargetEntries, finance.transactions))} /><DetailMetric label="Fecha" value={target.targetDate ? dateLabel(target.targetDate) : "Flexible"} /><DetailMetric label="Final aproximado" value={estimate ? monthYear(estimate) : "Sin ritmo"} /></div>}</section>
    {target.mode === "pay_down" ? <DebtPlanDetail overview={liabilityOverview} debt={debt} money={money} finance={finance} /> : null}
    {target.status !== "completed" && liabilityOverview ? <section className="border-b py-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-medium">Paga sin duplicar movimientos</h3><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">El pago sale de la cuenta que elijas y reduce esta deuda. Si hay conversión, confirmarás la tasa exacta.</p></div><div className="grid shrink-0 grid-cols-1 gap-2 min-[380px]:grid-cols-2"><Button onClick={() => setPaymentOpen(true)}><CircleDollarSign className="size-4" />Registrar pago</Button><Button variant="outline" onClick={() => setPaymentRuleOpen(true)}><CalendarClock className="size-4" />Programar</Button></div></div></section> : null}
    {target.status !== "completed" && !liabilityOverview ? <form onSubmit={addEntry} className="border-b py-6"><div><h3 className="font-medium">Registrar un ajuste manual</h3><p className="mt-1 text-xs text-muted-foreground">Esta deuda es de una versión anterior. El ajuste cambia su avance, pero no el saldo de una cuenta.</p></div><div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-secondary/55 p-1" role="group" aria-label="Efecto sobre el avance"><button type="button" aria-pressed={!reverse} onClick={() => setReverse(false)} className={cn("min-h-12 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-out)] active:scale-[var(--motion-press-scale)] motion-reduce:transition-none", !reverse && "bg-background text-positive shadow-sm")}>Reducir deuda</button><button type="button" aria-pressed={reverse} onClick={() => setReverse(true)} className={cn("min-h-12 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-out)] active:scale-[var(--motion-press-scale)] motion-reduce:transition-none", reverse && "bg-background text-warning shadow-sm")}>Aumentar deuda</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="target-entry-amount">Monto</Label><InputControl id="target-entry-amount" aria-label="Monto del ajuste" containerClassName="mt-2" value={amount} onChange={(event) => setAmount(formatMoneyInput(event.target.value, finance.profile?.currencyCode))} inputMode="decimal" leading={<CircleDollarSign />} placeholder="0" required /></div><div><Label htmlFor="target-entry-date">Fecha</Label><DateControl id="target-entry-date" containerClassName="mt-2" value={date} onValueChange={setDate} required /></div><div className="sm:col-span-2"><Label htmlFor="target-entry-note">Nota <span className="text-muted-foreground">(opcional)</span></Label><Input id="target-entry-note" aria-label="Nota del ajuste" className="mt-2 h-[52px] rounded-[14px]" value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} placeholder="Ej. Corrección del saldo" /></div><Button className="h-[52px] sm:col-span-2" disabled={saving || entryAmount <= 0}>{saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Plus className="size-4" />}Registrar ajuste</Button></div></form> : null}
    {target.status !== "completed" && target.mode === "accumulate" ? <form onSubmit={addEntry} className="border-b py-6"><div><h3 className="font-medium">Registrar aporte</h3><p className="mt-1 text-xs text-muted-foreground">Ajusta el avance sin modificar el saldo de ninguna cuenta.</p></div><div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-secondary/55 p-1" role="group" aria-label="Efecto sobre el avance"><button type="button" aria-pressed={!reverse} onClick={() => setReverse(false)} className={cn("min-h-12 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-out)] active:scale-[var(--motion-press-scale)] motion-reduce:transition-none", !reverse && "bg-background text-positive shadow-sm")}>Sumar avance</button><button type="button" aria-pressed={reverse} onClick={() => setReverse(true)} className={cn("min-h-12 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-out)] active:scale-[var(--motion-press-scale)] motion-reduce:transition-none", reverse && "bg-background text-warning shadow-sm")}>Restar avance</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="target-entry-amount">Monto</Label><InputControl id="target-entry-amount" aria-label="Monto del avance" containerClassName="mt-2" value={amount} onChange={(event) => setAmount(formatMoneyInput(event.target.value, finance.profile?.currencyCode))} inputMode="decimal" leading={<CircleDollarSign />} placeholder="0" required /></div><div><Label htmlFor="target-entry-date">Fecha</Label><DateControl id="target-entry-date" containerClassName="mt-2" value={date} onValueChange={setDate} required /></div><div className="sm:col-span-2"><Label htmlFor="target-entry-note">Nota <span className="text-muted-foreground">(opcional)</span></Label><Input id="target-entry-note" aria-label="Nota del avance" className="mt-2 h-[52px] rounded-[14px]" value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} placeholder="Ej. Aporte de este mes" /></div><Button className="h-[52px] sm:col-span-2" disabled={saving || entryAmount <= 0}>{saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Plus className="size-4" />}Registrar</Button></div></form> : null}
    <section className="py-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">Actividad</h3><p className="mt-1 text-xs text-muted-foreground">Aportes manuales y movimientos, sin duplicados.</p></div>{target.mode === "accumulate" ? <Button variant="outline" className="rounded-full" onClick={programContribution}><CalendarClock className="size-4" />Programar</Button> : null}</div><div className="mt-4 divide-y">{[...entries.map((entry) => ({ id: entry.id, date: entry.occurredOn, title: entry.note || (entry.effect === "advance" ? target.mode === "pay_down" ? "Pago manual" : "Aporte manual" : "Ajuste inverso"), amount: entry.amount, effect: entry.effect, source: "Manual" })), ...movements.map((movement) => ({ id: movement.id, date: movement.occurredOn, title: movement.merchant || movement.description, amount: transactionReportingAmount(movement), effect: movement.financialTargetEffect!, source: "Movimiento" }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((item) => <div key={`${item.source}-${item.id}`} className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2"><span className={cn("grid size-8 place-items-center rounded-full", item.effect === "advance" ? "bg-positive/12 text-positive" : "bg-warning/12 text-warning")}>{item.source === "Manual" ? <Sparkles className="size-3.5" /> : <CircleDollarSign className="size-3.5" />}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="text-[11px] text-muted-foreground">{item.source} · {dateLabel(item.date)}</span></span><span className={cn("text-sm font-medium tabular-nums", item.effect === "advance" ? "text-positive" : "text-warning")}>{item.effect === "advance" ? "+" : "−"}{money.format(item.amount)}</span></div>)}{!entries.length && !movements.length ? <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay actividad registrada.</p> : null}</div>{rules.length ? <p className="mt-3 text-xs text-muted-foreground">{rules.length === 1 ? "1 programación enlazada" : `${rules.length} programaciones enlazadas`} a este recorrido.</p> : null}</section>
    <div className="flex flex-wrap gap-2 border-t pt-5"><Button onClick={onEdit}><Pencil className="size-4" />Editar</Button>{target.status === "active" ? <Button variant="outline" onClick={() => void changeStatus("paused")}><Pause className="size-4" />Pausar</Button> : target.status === "paused" ? <Button variant="outline" onClick={() => void changeStatus("active")}><RotateCcw className="size-4" />Reanudar</Button> : null}{target.status !== "completed" ? <Button variant="outline" disabled={debtStillOpen} title={debtStillOpen ? "Primero deja la deuda en cero" : undefined} onClick={() => void changeStatus("completed")}><Check className="size-4" />Marcar cumplida</Button> : null}<Button variant="ghost" className="text-muted-foreground sm:ml-auto" disabled={debtStillOpen} title={debtStillOpen ? "Primero deja la deuda en cero" : undefined} onClick={() => void changeStatus("archived")}><Archive className="size-4" />Archivar</Button></div>
  </div></DialogContent></Dialog>{liabilityOverview ? <><LiabilityPaymentDialog item={liabilityOverview} open={paymentOpen} onOpenChange={setPaymentOpen} /><LiabilityPaymentRuleDialog item={liabilityOverview} open={paymentRuleOpen} onOpenChange={setPaymentRuleOpen} /></> : null}</>;
}

function DebtPlanDetail({ overview, debt, money, finance }: { overview?: LiabilityOverviewItem; debt?: FinancialTargetDebtDetails; money: Intl.NumberFormat; finance: ReturnType<typeof useFinance> }) {
  const terms = overview?.currentTerms;
  const rate = overview?.currentRates.find((item) => item.rateKind === "principal") ?? overview?.currentRates[0];
  const state = debtPlanState(overview);
  const fundingAccount = overview?.paymentRule ? finance.accounts.find((account) => account.id === overview.paymentRule?.fundingAccountId) : undefined;

  return <section className="py-6" aria-labelledby="debt-plan-title"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="debt-plan-title" className="font-medium">Tu plan de pago</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Moneva separa lo que escribiste, lo que calculó y lo que ya fue confirmado por una fuente.</p></div><FinanceDataStateBadge state={state} /></div>
    {overview ? <>
      <dl className="mt-4 grid gap-4 rounded-2xl bg-secondary/25 p-4 sm:grid-cols-2">
        <DebtFact label="Tipo" value={liabilityKindLabel(overview.kind)} />
        <DebtFact label="Acreedor" value={overview.creditorName || debt?.creditor || "Sin especificar"} />
        <DebtFact label="Próximo pago" value={overview.nextObligation ? `${money.format(overview.nextObligation.remaining)} · ${dateLabel(overview.nextObligation.dueOn)}` : terms?.scheduledPayment !== undefined ? money.format(terms.scheduledPayment) : "Sin pago calculado"} />
        <DebtFact label="Frecuencia" value={terms ? debtFrequencyLabel(terms.paymentFrequency) : debt?.dueDay ? `Día ${debt.dueDay} de cada mes` : "Sin especificar"} />
        <DebtFact label="Forma de pago" value={terms ? debtCalculationLabel(displayCalculationMethod(terms, rate)) : "Manual"} />
        <DebtFact label="Tasa informada" value={rate ? `${formatRate(rate.reportedValue)} · ${rateBasisLabel(rate.rateBasis)}${terms?.variableRate ? ` · ${terms.indexName ?? "variable"}` : ""}` : debt?.annualInterestRate === undefined ? "Sin especificar" : `${formatRate(debt.annualInterestRate)} · E.A.`} />
        <DebtFact label="Seguro y cargos" value={terms && terms.periodicInsurance + terms.periodicFee > 0 ? money.format(terms.periodicInsurance + terms.periodicFee) + " por periodo" : "Sin cargos periódicos"} />
        <DebtFact label="Cuenta para pagar" value={fundingAccount?.name ?? "Sin vincular"} />
      </dl>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">{state === "confirmed" ? "El próximo cobro coincide con una obligación ya registrada o conciliada." : state === "estimated" ? "La cifra puede cambiar por tasa variable, conversión o actualización del acreedor." : state === "calculated" ? "La proyección usa las condiciones que registraste; compárala con el próximo extracto." : "Estos datos fueron escritos manualmente y aún no tienen una proyección completa."}</p>
    </> : debt && (debt.creditor || debt.minimumPayment !== undefined || debt.dueDay !== undefined || debt.annualInterestRate !== undefined) ? <><dl className="mt-4 grid gap-3 rounded-2xl bg-secondary/25 p-4 sm:grid-cols-2"><DebtFact label="Acreedor" value={debt.creditor || "Sin especificar"} /><DebtFact label="Pago mínimo" value={debt.minimumPayment === undefined ? "Sin especificar" : money.format(debt.minimumPayment)} /><DebtFact label="Día de pago" value={debt.dueDay === undefined ? "Sin especificar" : `Día ${debt.dueDay} de cada mes`} /><DebtFact label="Tasa informada" value={debt.annualInterestRate === undefined ? "Sin especificar" : `${formatRate(debt.annualInterestRate)} · E.A.`} /></dl><p className="mt-4 text-xs leading-5 text-muted-foreground">Información anterior conservada. Edita la deuda para completar el nuevo plan.</p></> : <p className="mt-4 rounded-2xl bg-secondary/25 px-4 py-4 text-sm leading-6 text-muted-foreground">Aún no configuraste un plan. Puedes registrar pagos ahora y completar las condiciones después.</p>}
  </section>;
}

function debtPlanState(overview: LiabilityOverviewItem | undefined): FinanceDataState {
  if (!overview?.currentTerms && !overview?.nextObligation) return "manual";
  if (overview.reportingApproximate || overview.currentTerms?.variableRate) return "estimated";
  if (overview.nextObligation && overview.nextObligation.status !== "projected") return "confirmed";
  return overview.nextObligation ? "calculated" : "manual";
}

function displayCalculationMethod(terms: LiabilityTerms, rate: LiabilityRatePeriod | undefined): DebtCalculationMethod {
  if (terms.calculationMethod === "simple" && (rate?.effectiveAnnualRate ?? rate?.reportedValue ?? 0) === 0) return "zero_interest";
  return terms.amortizationMethod;
}

function rateBasisLabel(value: LiabilityRatePeriod["rateBasis"]) {
  if (value === "effective_annual") return "E.A.";
  if (value === "monthly") return "mensual";
  if (value === "nominal_annual") return "nominal anual";
  return "monto fijo";
}

function formatRate(value: number) {
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 }).format(value)}%`;
}

function DetailMetric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 bg-popover px-3 py-4"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-xs font-medium tabular-nums [overflow-wrap:anywhere] sm:text-sm">{value}</p></div>; }

function DebtFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium tabular-nums [overflow-wrap:anywhere]">{value}</dd></div>;
}

function targetLiabilityOverview(finance: ReturnType<typeof useFinance>, target: FinancialTarget) {
  return finance.liabilityOverview.items.find((item) => item.accountId === target.accountId || item.legacyTargetId === target.id);
}

function currentLiabilityTerms(finance: ReturnType<typeof useFinance>, accountId: string | undefined) {
  if (!accountId) return undefined;
  return finance.liabilityTerms
    .filter((term) => term.accountId === accountId)
    .toSorted((left, right) => right.startsOn.localeCompare(left.startsOn) || right.id.localeCompare(left.id))[0];
}

function currentLiabilityRates(finance: ReturnType<typeof useFinance>, accountId: string | undefined) {
  if (!accountId) return [];
  return finance.liabilityRatePeriods
    .filter((rate) => rate.accountId === accountId)
    .toSorted((left, right) => right.startsOn.localeCompare(left.startsOn) || right.id.localeCompare(left.id));
}

function debtDraftFromState({ finance, target, debt, overview, terms, rates, today, fallbackCurrency }: {
  finance: ReturnType<typeof useFinance>;
  target?: FinancialTarget;
  debt?: FinancialTargetDebtDetails;
  overview?: LiabilityOverviewItem;
  terms?: LiabilityTerms;
  rates: LiabilityRatePeriod[];
  today: string;
  fallbackCurrency: string;
}): DebtPlanDraft {
  const currencyCode = overview?.currencyCode ?? (fallbackCurrency === "USD" ? "USD" : "COP");
  const base = createDebtPlanDraft({ currencyCode, startOn: terms?.startsOn ?? target?.startsOn ?? today });
  const rate = rates.find((item) => item.rateKind === "principal") ?? rates[0];
  const productType = productTypeFromLiability(overview, terms);
  const account = overview ? finance.accounts.find((item) => item.id === overview.accountId) : undefined;
  const inferredAmortization: DebtCalculationMethod = terms?.calculationMethod === "simple" && (rate?.effectiveAnnualRate ?? rate?.reportedValue ?? debt?.annualInterestRate ?? 0) === 0
    ? "zero_interest"
    : terms?.amortizationMethod ?? base.amortizationMethod;
  const principal = overview ? overview.nativeDebt : target?.targetAmount;

  return {
    ...base,
    productType,
    debtType: overview && overview.kind !== "credit_card" ? overview.kind : base.debtType,
    liabilityAccountId: overview?.accountId,
    fundingAccountId: overview?.paymentRule?.fundingAccountId,
    creditor: overview?.creditorName ?? debt?.creditor,
    currencyCode,
    principal,
    openingExchangeRate: account?.openingExchangeRate,
    termsStartOn: terms?.startsOn ?? target?.startsOn ?? base.termsStartOn,
    paymentFrequency: terms?.paymentFrequency ?? base.paymentFrequency,
    intervalCount: terms?.intervalCount ?? 1,
    calculationMethod: terms?.calculationMethod ?? base.calculationMethod,
    amortizationMethod: inferredAmortization,
    firstDueOn: terms?.firstDueOn ?? firstDueFromLegacy(today, debt?.dueDay) ?? base.firstDueOn,
    installmentCount: terms?.installmentCount ?? base.installmentCount,
    scheduledPayment: terms?.scheduledPayment,
    minimumPayment: terms?.contractualMinimum ?? debt?.minimumPayment,
    periodicFee: terms?.periodicFee ?? 0,
    periodicInsurance: terms?.periodicInsurance ?? 0,
    variableRate: terms?.variableRate ?? false,
    indexName: terms?.indexName,
    spreadRate: terms?.spreadRate,
    rateBasis: rate?.rateBasis ?? "effective_annual",
    rateValue: rate?.reportedValue ?? debt?.annualInterestRate,
    effectiveAnnualRate: rate?.effectiveAnnualRate ?? debt?.annualInterestRate,
    prepaymentStrategy: terms?.prepaymentStrategy ?? base.prepaymentStrategy,
  };
}

function productTypeFromLiability(overview: LiabilityOverviewItem | undefined, terms: LiabilityTerms | undefined): DebtProductType {
  if (terms?.indexName === "UVR") return "mortgage_uvr";
  if (overview?.kind === "personal_debt") return "person";
  if (overview?.kind === "bnpl") return "bnpl";
  if (overview?.kind === "other") return "other";
  return "consumer";
}

function firstDueFromLegacy(today: string, dueDay: number | undefined) {
  if (!dueDay) return undefined;
  const [year, month] = today.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), Math.min(dueDay, lastDay))).toISOString().slice(0, 10);
}

/** Fields that materially change future installments; identity and payment-source edits do not rebuild history. */
function debtScheduleSignature(value: DebtPlanDraft) {
  return JSON.stringify({
    currencyCode: value.currencyCode,
    principal: value.principal,
    termsStartOn: value.termsStartOn,
    paymentFrequency: value.paymentFrequency,
    intervalCount: value.intervalCount,
    calculationMethod: value.calculationMethod,
    amortizationMethod: value.amortizationMethod,
    firstDueOn: value.firstDueOn,
    installmentCount: value.installmentCount,
    scheduledPayment: value.scheduledPayment,
    minimumPayment: value.minimumPayment,
    periodicFee: value.periodicFee,
    periodicInsurance: value.periodicInsurance,
    variableRate: value.variableRate,
    indexName: value.indexName,
    indexReferenceValue: value.indexReferenceValue,
    spreadRate: value.spreadRate,
    rateBasis: value.rateBasis,
    rateValue: value.rateValue,
    effectiveAnnualRate: value.effectiveAnnualRate,
    prepaymentStrategy: value.prepaymentStrategy,
  });
}

function debtInputFromDraft({ value, preview, legacy, terms, rates, existingObligations, termId, rateId, scheduleIds, includeSchedule, today }: {
  value: DebtPlanDraft;
  preview: DebtPlanPreview | undefined;
  legacy?: FinancialTargetDebtDetails;
  terms?: LiabilityTerms;
  rates: LiabilityRatePeriod[];
  existingObligations: LiabilityObligationInput[];
  termId: string;
  rateId: string;
  scheduleIds: Map<number, string>;
  includeSchedule: boolean;
  today: string;
}): FinancialTargetDebtInput {
  const rate = rates.find((item) => item.rateKind === "principal") ?? rates[0];
  const preservedSchedule = existingObligations.filter((item) => item.source === "contract" && ["projected", "open"].includes(item.status));
  const generatedSchedule = includeSchedule && preview?.state === "ready"
    ? scheduleFromPreview(preview, value, existingObligations, scheduleIds, today)
    : undefined;
  const schedule = !includeSchedule
    ? undefined
    : generatedSchedule?.length
    ? generatedSchedule
    : preservedSchedule.length
      ? preservedSchedule
      : undefined;
  const hasRate = value.rateValue !== undefined || value.effectiveAnnualRate !== undefined;
  const clearRate = debtRateWasCleared(value, Boolean(rate));
  return {
    creditor: value.creditor || undefined,
    annualInterestRate: clearRate ? undefined : value.effectiveAnnualRate ?? legacy?.annualInterestRate,
    minimumPayment: value.minimumPayment,
    dueDay: value.firstDueOn ? Number(value.firstDueOn.slice(8, 10)) : legacy?.dueDay,
    liabilityAccountId: value.liabilityAccountId,
    fundingAccountId: value.fundingAccountId,
    debtType: value.debtType,
    currencyCode: value.currencyCode,
    principal: value.principal,
    openingExchangeRate: value.currencyCode === "USD" ? value.openingExchangeRate : undefined,
    termId: terms?.id ?? termId,
    rateId: hasRate ? rate?.id ?? rateId : undefined,
    termsStartOn: value.termsStartOn,
    paymentFrequency: value.paymentFrequency,
    intervalCount: value.intervalCount,
    calculationMethod: value.calculationMethod,
    amortizationMethod: value.amortizationMethod === "zero_interest" ? "constant_payment" : value.amortizationMethod,
    firstDueOn: value.firstDueOn,
    installmentCount: value.installmentCount,
    scheduledPayment: value.scheduledPayment,
    periodicFee: value.periodicFee,
    periodicInsurance: value.periodicInsurance,
    variableRate: value.variableRate,
    indexName: value.variableRate ? value.indexName : undefined,
    spreadRate: value.variableRate ? value.spreadRate : undefined,
    prepaymentStrategy: value.prepaymentStrategy,
    rateBasis: value.rateBasis,
    rateValue: value.rateValue,
    effectiveAnnualRate: value.effectiveAnnualRate,
    clearRate: clearRate || undefined,
    schedule,
    clearSchedule: includeSchedule && value.amortizationMethod === "manual" ? true : undefined,
  };
}

function scheduleFromPreview(preview: Extract<DebtPlanPreview, { state: "ready" }>, value: DebtPlanDraft, existing: LiabilityObligationInput[], stableIds: Map<number, string>, today: string): LiabilityObligationInput[] {
  const accountId = value.liabilityAccountId ?? existing[0]?.accountId ?? "";
  const sequenceOffset = existing
    .filter((item) => item.source === "contract" && !["projected", "open"].includes(item.status))
    .reduce((maximum, item) => Math.max(maximum, item.sequenceNumber ?? 0), 0);
  return preview.schedule.rows
    .filter((row) => row.dueOn >= today)
    .map((row) => {
      const sequenceNumber = row.installmentNumber + sequenceOffset;
      const prior = existing.find((item) => item.sequenceNumber === sequenceNumber && item.source === "contract" && ["projected", "open"].includes(item.status));
      const factor = preview.schedule.currencyCode === "UVR" ? row.indexValue ?? value.indexReferenceValue ?? 1 : 1;
      const principalDue = row.principal * factor;
      const interestDue = row.interest * factor;
      const feeDue = (row.insurance + row.fees + row.otherCharges) * factor;
      const totalDue = row.total * factor;
      const stableId = prior?.id ?? stableIds.get(sequenceNumber) ?? crypto.randomUUID();
      stableIds.set(sequenceNumber, stableId);
      return {
        id: stableId,
        accountId,
        kind: "loan_installment",
        sequenceNumber,
        periodStart: row.periodStart,
        periodEnd: row.dueOn,
        dueOn: row.dueOn,
        principalDue,
        interestDue,
        feeDue,
        minimumDue: boundedDebtMinimumDue(value.minimumPayment, totalDue),
        totalDue,
        status: "projected",
        source: "contract",
        version: prior?.version,
      };
    });
}

const kindOptions = [
  { value: "savings", label: "Ahorro", icon: "piggy-bank", example: "Mi próxima meta" },
  { value: "emergency", label: "Fondo de emergencia", icon: "shield", example: "Fondo de emergencia" },
  { value: "investment", label: "Inversión", icon: "chart-no-axes-combined", example: "Capital para invertir" },
  { value: "purchase", label: "Compra planeada", icon: "shopping", example: "Compra importante" },
  { value: "debt", label: "Deuda", icon: "landmark", example: "Deuda por terminar" },
  { value: "other", label: "Otra meta", icon: "target", example: "Un nuevo objetivo" },
] as const;

function dateLabel(value: string) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replaceAll(" de ", " "); }
function monthYear(value: string) { return new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replaceAll(" de ", " "); }
