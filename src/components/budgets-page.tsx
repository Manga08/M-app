"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, CircleAlert, Equal, History, LoaderCircle, Sparkles, WalletCards } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SelectControl } from "@/components/ui/form-control";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { automaticBudgetDraft } from "@/lib/finance/plan-simulator";
import { currencyFormatter, monthLabel } from "@/lib/finance/calculations";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { recurringCommitmentsByCategory } from "@/lib/finance/recurrence";
import type { BudgetPlanSource, MonthlyBudgetPlanData, PlanSimulationSeed } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

export function BudgetsPage({ embedded = false }: { embedded?: boolean }) {
  const finance = useFinance();
  const { profile, categories, groupAllocations, recurringRules, recurringOccurrences, currentMonth } = finance;
  const { getMonthlyBudgetPlan, getPlanSimulationSeed, mutate } = finance;
  const currencyCode = profile?.currencyCode ?? "COP";
  const money = currencyFormatter(currencyCode);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [planData, setPlanData] = useState<MonthlyBudgetPlanData | null>(null);
  const [seed, setSeed] = useState<PlanSimulationSeed | null>(null);
  const [incomeInput, setIncomeInput] = useState("0");
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState("");
  const [source, setSource] = useState<BudgetPlanSource>("manual");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyDialog, setHistoryDialog] = useState(false);
  const [referenceMonth, setReferenceMonth] = useState(previousMonth(currentMonth));
  const [applyingHistory, setApplyingHistory] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const activeCategories = useMemo(() => categories.filter((category) => category.kind === "expense" && !category.archived).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [categories]);
  const mainCategories = useMemo(() => groupAllocations.filter((category) => !category.archived).sort((a, b) => a.sortOrder - b.sortOrder), [groupAllocations]);
  const monthOptions = useMemo(() => surroundingMonths(currentMonth, 18, 4), [currentMonth]);
  const commitments = useMemo(() => recurringCommitmentsByCategory(recurringOccurrences, recurringRules, selectedMonth), [recurringOccurrences, recurringRules, selectedMonth]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMonthlyBudgetPlan(selectedMonth), getPlanSimulationSeed(selectedMonth)])
      .then(([nextPlan, nextSeed]) => {
        if (cancelled) return;
        const income = nextPlan.plan?.incomeTarget ?? nextSeed.actualIncome;
        const values = Object.fromEntries(activeCategories.map((category) => {
          const amount = Math.max(nextPlan.budgets.find((budget) => budget.categoryId === category.id)?.amount ?? 0, commitments[category.id] ?? 0);
          return [category.id, formatMoneyInputValue(amount, currencyCode)];
        }));
        const nextSource = nextPlan.plan?.source ?? (nextSeed.actualIncome > 0 ? "current_income" : "manual");
        const nextIncome = formatMoneyInputValue(income, currencyCode);
        setPlanData(nextPlan);
        setSeed(nextSeed);
        setIncomeInput(nextIncome);
        setBudgetInputs(values);
        setSource(nextSource);
        setBaseline(serializeBudget(nextIncome, values, nextSource));
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No pudimos cargar este presupuesto."))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeCategories, commitments, currencyCode, getMonthlyBudgetPlan, getPlanSimulationSeed, requestVersion, selectedMonth]);

  function changeMonth(month: string) {
    setLoading(true);
    setError(null);
    setSelectedMonth(month);
  }

  function retry() {
    setLoading(true);
    setError(null);
    setRequestVersion((version) => version + 1);
  }

  const incomeTarget = Math.max(0, parseMoneyInput(incomeInput));
  const draftAmounts = Object.fromEntries(activeCategories.map((category) => [category.id, Math.max(0, parseMoneyInput(budgetInputs[category.id] ?? "0"))]));
  const currentSerialized = serializeBudget(incomeInput, budgetInputs, source);
  const changed = Boolean(baseline && currentSerialized !== baseline);
  const totalBudget = Object.values(draftAmounts).reduce((sum, amount) => sum + amount, 0);
  const totalSpent = seed?.categories.reduce((sum, category) => sum + category.spent, 0) ?? 0;
  const totalCommitted = Object.values(commitments).reduce((sum, amount) => sum + amount, 0);
  const unassigned = incomeTarget - totalBudget;
  const assignedPercent = incomeTarget > 0 ? Math.round((totalBudget / incomeTarget) * 100) : totalBudget > 0 ? 100 : 0;
  const initialLoading = loading && !planData;
  const refreshing = loading && Boolean(planData);

  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  function applyAutomatic(weights?: Record<string, number>, nextSource: BudgetPlanSource = "manual") {
    const amounts = automaticBudgetDraft({ incomeTarget, mainCategories, subcategories: activeCategories.map((category) => ({ id: category.id, group: category.group, sortOrder: category.sortOrder ?? 0 })), weights });
    setBudgetInputs(Object.fromEntries(activeCategories.map((category) => [category.id, formatMoneyInputValue(Math.max(amounts[category.id] ?? 0, commitments[category.id] ?? 0), currencyCode)])));
    setSource(nextSource);
  }

  async function applyHistory() {
    if (applyingHistory) return;
    setApplyingHistory(true);
    try {
      const reference = await getPlanSimulationSeed(referenceMonth);
      applyAutomatic(Object.fromEntries(reference.categories.map((category) => [category.id, category.spent])), "historical");
      setHistoryDialog(false);
    } catch (historyError) {
      announceMutationError(historyError, "No pudimos usar ese mes como referencia.");
    } finally {
      setApplyingHistory(false);
    }
  }

  async function save() {
    if (!changed || saving) return;
    setSaving(true);
    try {
      const result = await mutate.setMonthlyBudgetPlan({
        month: selectedMonth,
        incomeTarget,
        source,
        budgets: activeCategories.map((category) => ({
          id: planData?.budgets.find((budget) => budget.categoryId === category.id)?.id ?? crypto.randomUUID(),
          categoryId: category.id,
          amount: draftAmounts[category.id] ?? 0,
        })),
      });
      setBaseline(currentSerialized);
      announceMutation(result, `Presupuesto de ${monthLabel(selectedMonth).toLocaleLowerCase("es")} guardado`);
    } catch (saveError) {
      announceMutationError(saveError, "No pudimos guardar el presupuesto completo.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    {!embedded ? <PageHeader eyebrow={monthLabel(selectedMonth)} title="Presupuesto" description="Asigna dinero real a cada subcategoría y revisa el avance del mes." /> : <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-medium tracking-[-.035em]">Presupuesto mensual</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Del porcentaje general al dinero concreto que puedes usar en cada subcategoría.</p></div><MonthSelect value={selectedMonth} months={monthOptions} onChange={changeMonth} /></div>}

    {initialLoading ? <BudgetLoading /> : error ? <div className="border-y py-12 text-center" role="alert"><CircleAlert className="mx-auto size-6 text-destructive" /><p className="mt-3 font-medium">No pudimos abrir el presupuesto</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button variant="outline" className="mt-5" onClick={retry}>Reintentar</Button></div> : <>
      {refreshing ? <p className="mb-3 flex min-h-8 items-center gap-2 text-xs font-medium text-muted-foreground" role="status" aria-live="polite"><LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Preparando {monthLabel(selectedMonth).toLocaleLowerCase("es")} sin ocultar el presupuesto anterior…</p> : null}
      <div className={cn("transition-opacity duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] motion-reduce:duration-[var(--motion-duration-reduced)]", refreshing && "pointer-events-none opacity-65")} aria-busy={refreshing} inert={refreshing ? true : undefined}>
      {planData?.coverage === "partial" || seed?.coverage === "partial" ? <p className="mb-5 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning-foreground" role="status">Estás viendo una copia parcial sin conexión. Puedes editarla; quedará pendiente de sincronización.</p> : null}
      <section className="grid gap-px overflow-hidden border-y bg-border md:grid-cols-[minmax(0,1.35fr)_minmax(150px,.65fr)_minmax(150px,.65fr)]" aria-label="Resumen del presupuesto">
        <div className="bg-background px-1 py-6 sm:px-5"><Label htmlFor="budget-income">Ingreso esperado</Label><div className="mt-2 flex max-w-md items-center rounded-[14px] border border-input bg-secondary/20 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"><span className="pl-4 text-sm text-muted-foreground" aria-hidden="true">{currencyCode}</span><input id="budget-income" className="h-[52px] min-w-0 flex-1 bg-transparent px-3 text-2xl font-medium tabular-nums outline-none" inputMode="decimal" value={incomeInput} onChange={(event) => { setIncomeInput(formatMoneyInput(event.target.value, currencyCode)); setSource("manual"); }} /></div><div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" size="sm" className="rounded-full" disabled={!seed?.actualIncome} onClick={() => { setIncomeInput(formatMoneyInputValue(seed?.actualIncome ?? 0, currencyCode)); setSource("current_income"); }}><WalletCards className="size-4" />Usar ingresos reales</Button><span className="self-center text-xs text-muted-foreground">Registrados: {money.format(seed?.actualIncome ?? 0)}</span></div></div>
        <SummaryMetric label="Asignado" value={money.format(totalBudget)} helper={`${assignedPercent}% del ingreso`} tone={unassigned < 0 ? "destructive" : totalBudget > 0 ? "positive" : "neutral"} />
        <SummaryMetric label={unassigned >= 0 ? "Sin asignar" : "Exceso"} value={money.format(Math.abs(unassigned))} helper={`Gastado ${money.format(totalSpent)} · previsto ${money.format(totalCommitted)}`} tone={unassigned < 0 ? "destructive" : unassigned > 0 ? "warning" : "positive"} />
      </section>

      <section className="py-7">
        <div className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-center"><div><h3 className="text-xl font-medium tracking-tight">Dinero por subcategoría</h3><p className="mt-1 text-sm text-muted-foreground">Todo se guarda junto para evitar planes incompletos.</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="rounded-full"><Sparkles className="size-4" />Asignación automática<ChevronDown className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => applyAutomatic()}><Equal />Repartir por igual dentro de cada categoría</DropdownMenuItem><DropdownMenuItem onClick={() => { setReferenceMonth(previousMonth(selectedMonth)); setHistoryDialog(true); }}><History />Basarse en lo gastado en otro mes</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        <div>{mainCategories.map((main) => {
          const children = activeCategories.filter((category) => category.group === main.group);
          const budget = children.reduce((sum, category) => sum + (draftAmounts[category.id] ?? 0), 0);
          const spent = children.reduce((sum, category) => sum + (seed?.categories.find((item) => item.id === category.id)?.spent ?? 0), 0);
          const target = main.includedInPlan ? incomeTarget * main.targetPercent / 100 : 0;
          return <details key={main.group} className="group border-b" open={main.includedInPlan}>
            <summary className="flex min-h-[76px] cursor-pointer list-none items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ color: main.color, backgroundColor: `${main.color}18` }}><FinanceIcon name={main.icon} className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="block font-medium">{main.name}</span><span className="mt-1 block text-xs text-muted-foreground">{main.includedInPlan ? `${main.targetPercent}% · objetivo ${money.format(target)}` : "Fuera del reparto porcentual"}</span></span><span className="hidden text-right sm:block"><span className={cn("block text-sm font-medium tabular-nums", budget > target && main.includedInPlan && "text-warning")}>{money.format(budget)}</span><span className="block text-xs text-muted-foreground">{money.format(spent)} usados</span></span><ChevronDown className="size-4 text-muted-foreground transition-transform duration-[var(--motion-duration-state)] ease-[var(--motion-ease-move)] group-open:rotate-180 motion-reduce:transition-none" /></summary>
            <div className="pb-5 sm:pl-[52px]">{children.length ? children.map((category) => {
              const amount = draftAmounts[category.id] ?? 0;
              const categorySpent = seed?.categories.find((item) => item.id === category.id)?.spent ?? 0;
              const committed = commitments[category.id] ?? 0;
              const usage = amount > 0 ? Math.round((categorySpent + committed) / amount * 100) : categorySpent + committed > 0 ? 100 : 0;
              return <div key={category.id} className="grid min-h-[76px] gap-3 border-t py-3 sm:grid-cols-[minmax(0,1fr)_minmax(140px,.8fr)_190px] sm:items-center"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ color: category.color, backgroundColor: `${category.color}18` }}><FinanceIcon name={category.icon} className="size-[18px]" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{category.name}</span><span className={cn("mt-1 block text-xs", categorySpent > amount && categorySpent > 0 ? "text-destructive" : "text-muted-foreground")}>{money.format(categorySpent)} gastados{committed > 0 ? ` · ${money.format(committed)} previstos` : ""}</span></span></div><Progress value={Math.min(100, usage)} label={`Uso del presupuesto de ${category.name}`} valueText={`${usage}% usado incluyendo compromisos previstos`} className="hidden sm:block" /><BudgetInput name={category.name} currencyCode={currencyCode} value={budgetInputs[category.id] ?? "0"} onChange={(value) => { setBudgetInputs((current) => ({ ...current, [category.id]: value })); setSource("manual"); }} /></div>;
            }) : <p className="border-t py-8 text-sm text-muted-foreground">Esta categoría principal todavía no tiene subcategorías. Créala en Distribución.</p>}</div>
          </details>;
        })}</div>
        {!activeCategories.length ? <div className="py-14 text-center"><p className="font-medium">Aún no hay subcategorías para presupuestar</p><p className="mt-1 text-sm text-muted-foreground">Créelas primero en Distribución.</p></div> : null}
      </section>

      {changed ? <div className="fixed inset-x-4 bottom-24 z-20 mx-auto flex max-w-xl items-center justify-between gap-4 rounded-2xl border bg-background/96 p-3 shadow-2xl backdrop-blur lg:bottom-6 lg:left-[236px]" role="status" aria-live="polite"><div className="min-w-0 pl-2"><p className="text-sm font-medium">Presupuesto sin guardar</p><p className="truncate text-xs text-muted-foreground">Se actualizarán {activeCategories.length} subcategorías en una sola operación.</p></div><Button className="shrink-0 rounded-xl" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}{saving ? "Guardando…" : "Guardar plan"}</Button></div> : null}
      </div>
    </>}

    <Dialog open={historyDialog} onOpenChange={(open) => !applyingHistory && setHistoryDialog(open)}><DialogContent showCloseButton={!applyingHistory} className="sm:max-w-md"><DialogHeader><DialogTitle>Basarse en un mes real</DialogTitle><DialogDescription>Usaremos el gasto de cada subcategoría como peso y mantendremos el ingreso esperado actual. Solo cambia este borrador.</DialogDescription></DialogHeader><div className="py-4"><Label htmlFor="budget-reference-month">Mes de referencia</Label><SelectControl id="budget-reference-month" value={referenceMonth} onValueChange={setReferenceMonth} containerClassName="mt-2">{monthOptions.filter((month) => month <= currentMonth).map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</SelectControl></div><DialogFooter><Button variant="outline" onClick={() => setHistoryDialog(false)} disabled={applyingHistory}>Cancelar</Button><Button onClick={() => void applyHistory()} disabled={applyingHistory}>{applyingHistory ? <LoaderCircle className="size-4 animate-spin" /> : <History className="size-4" />}{applyingHistory ? "Calculando…" : "Usar este mes"}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

function BudgetInput({ name, currencyCode, value, onChange }: { name: string; currencyCode: string; value: string; onChange: (value: string) => void }) {
  return <label className="flex h-[52px] items-center overflow-hidden rounded-[14px] border border-input bg-secondary/20 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"><span className="pl-3 text-xs text-muted-foreground">{currencyCode}</span><input aria-label={`Presupuesto para ${name}`} className="h-full min-w-0 flex-1 bg-transparent px-3 text-right text-base font-medium tabular-nums outline-none" inputMode="decimal" value={value} onChange={(event) => onChange(formatMoneyInput(event.target.value, currencyCode))} /></label>;
}

function SummaryMetric({ label, value, helper, tone }: { label: string; value: string; helper: string; tone: "positive" | "warning" | "destructive" | "neutral" }) {
  return <div className="bg-background px-1 py-6 sm:px-5"><p className="text-sm text-muted-foreground">{label}</p><p className={cn("mt-2 text-2xl font-medium tabular-nums", tone === "positive" && "text-positive", tone === "warning" && "text-warning", tone === "destructive" && "text-destructive")}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></div>;
}

function MonthSelect({ value, months, onChange }: { value: string; months: string[]; onChange: (value: string) => void }) {
  return <SelectControl aria-label="Mes del presupuesto" value={value} onValueChange={onChange} containerClassName="w-full sm:w-52">{months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</SelectControl>;
}

function BudgetLoading() {
  return <div className="border-y py-16 text-center" role="status" aria-live="polite"><LoaderCircle className="mx-auto size-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Preparando el presupuesto completo…</p></div>;
}

function serializeBudget(income: string, budgets: Record<string, string>, source: BudgetPlanSource) {
  return JSON.stringify({ income, source, budgets: Object.entries(budgets).sort(([left], [right]) => left.localeCompare(right)) });
}

function previousMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function surroundingMonths(center: string, past: number, future: number) {
  const [year, month] = center.split("-").map(Number);
  return Array.from({ length: past + future + 1 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - past + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }).reverse();
}
