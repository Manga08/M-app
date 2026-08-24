"use client";

import { useEffect, useMemo, useState } from "react";
import { Beaker, Equal, FlaskConical, LoaderCircle, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SelectControl } from "@/components/ui/form-control";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { monthLabel, currencyFormatter } from "@/lib/finance/calculations";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import { automaticBudgetDraft, distributeMoney, simulatorStateFromSeed, summarizeSimulator, type PlanSimulatorState } from "@/lib/finance/plan-simulator";
import { cn } from "@/lib/utils";

export function PlanSimulatorPage() {
  const finance = useFinance();
  const { getPlanSimulationSeed } = finance;
  const currencyCode = finance.profile?.currencyCode ?? "COP";
  const money = currencyFormatter(currencyCode);
  const [selectedMonth, setSelectedMonth] = useState(finance.currentMonth);
  const [state, setState] = useState<PlanSimulatorState>(() => emptySimulator(finance.currentMonth));
  const [initialState, setInitialState] = useState<PlanSimulatorState>(() => emptySimulator(finance.currentMonth));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const months = useMemo(() => simulatorMonths(finance.currentMonth), [finance.currentMonth]);

  useEffect(() => {
    let cancelled = false;
    getPlanSimulationSeed(selectedMonth)
      .then((seed) => {
        if (cancelled) return;
        const next = simulatorStateFromSeed(seed);
        setState(next);
        setInitialState(next);
        if (seed.coverage === "partial") setMessage("Este escenario parte de la copia disponible en el dispositivo; el historial puede estar incompleto.");
      })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "No pudimos preparar el escenario."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [getPlanSimulationSeed, requestVersion, selectedMonth]);

  function changeMonth(month: string) {
    setLoading(true);
    setMessage(null);
    setSelectedMonth(month);
  }

  function reload() {
    setLoading(true);
    setMessage(null);
    setRequestVersion((version) => version + 1);
  }

  const summary = summarizeSimulator(state);
  const changed = JSON.stringify(state) !== JSON.stringify(initialState);

  function equalPercentages() {
    setState((current) => {
      const included = current.mainCategories.filter((category) => category.included).sort((a, b) => a.sortOrder - b.sortOrder);
      const percentages = distributeMoney(100, included.map((category) => category.group), undefined, 0);
      return { ...current, mainCategories: current.mainCategories.map((category) => ({ ...category, targetPercent: category.included ? percentages[category.group] ?? 0 : 0 })) };
    });
  }

  function automaticBudgets() {
    setState((current) => {
      const amounts = automaticBudgetDraft({
        incomeTarget: current.incomeTarget,
        mainCategories: current.mainCategories.map((category) => ({ group: category.group, includedInPlan: category.included, targetPercent: category.targetPercent, sortOrder: category.sortOrder })),
        subcategories: current.subcategories.map((category) => ({ id: category.id, group: category.group, sortOrder: category.sortOrder })),
        weights: Object.fromEntries(current.subcategories.map((category) => [category.id, category.spent])),
      });
      return { ...current, subcategories: current.subcategories.map((category) => ({ ...category, budget: amounts[category.id] ?? 0 })) };
    });
  }

  function addMainCategory() {
    setState((current) => {
      const id = crypto.randomUUID();
      return { ...current, mainCategories: [...current.mainCategories, { id, group: `sim_${id}`, name: "Nueva categoría", color: "#fb7185", icon: "folder", included: false, targetPercent: 0, sortOrder: current.mainCategories.length }] };
    });
  }

  function addSubcategory(group: string) {
    setState((current) => ({ ...current, subcategories: [...current.subcategories, { id: crypto.randomUUID(), group, name: "Nueva subcategoría", color: "#fb7185", icon: "tag", sortOrder: current.subcategories.filter((category) => category.group === group).length, budget: 0, spent: 0 }] }));
  }

  return <>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.16em] text-primary"><FlaskConical className="size-4" />Laboratorio local</div><h2 className="mt-3 text-2xl font-medium tracking-[-.035em]">Simulador</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Prueba ingresos, porcentajes, presupuestos y gastos hipotéticos. Nada de esta pestaña se guarda ni modifica tus movimientos.</p></div><SelectControl aria-label="Mes de referencia del simulador" value={selectedMonth} onValueChange={changeMonth} containerClassName="w-full sm:w-52">{months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</SelectControl></div>

    <div className="mb-7 grid grid-cols-2 gap-2 border-y py-4 sm:flex sm:flex-wrap"><Button variant="outline" className="w-full min-w-0 rounded-full sm:w-auto" onClick={reload} disabled={loading}><Upload className="size-4" /><span className="sm:hidden">Cargar mes</span><span className="hidden sm:inline">Cargar datos del mes</span></Button><Button variant="outline" className="w-full min-w-0 rounded-full sm:w-auto" onClick={equalPercentages} disabled={loading || !state.mainCategories.some((category) => category.included)}><Equal className="size-4" /><span className="sm:hidden">100% igual</span><span className="hidden sm:inline">Equilibrar 100%</span></Button><Button variant="outline" className="w-full min-w-0 rounded-full sm:w-auto" onClick={automaticBudgets} disabled={loading || state.incomeTarget <= 0}><Beaker className="size-4" /><span className="sm:hidden">Calcular</span><span className="hidden sm:inline">Calcular presupuestos</span></Button><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" className="w-full min-w-0 rounded-full sm:w-auto" disabled={!changed}><RotateCcw className="size-4" />Restablecer</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Restablecer el escenario?</AlertDialogTitle><AlertDialogDescription>Volverás a los datos con los que abriste este mes. Esto no afecta tu plan real.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => setState(initialState)}>Restablecer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
    {message ? <p className="mb-6 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning-foreground" role="status">{message}</p> : null}

    {loading ? <div className="border-y py-16 text-center" role="status"><LoaderCircle className="mx-auto size-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Construyendo un escenario aislado…</p></div> : <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 border-b pb-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div className="min-w-0"><Label htmlFor="simulator-income">Ingreso disponible en el escenario</Label><div className="mt-2 flex w-full max-w-md min-w-0 items-center rounded-[14px] border border-input bg-secondary/20 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"><span className="pl-4 text-sm text-muted-foreground">{currencyCode}</span><input id="simulator-income" className="h-[52px] min-w-0 flex-1 bg-transparent px-3 text-2xl font-medium tabular-nums outline-none" inputMode="decimal" value={formatMoneyInputValue(state.incomeTarget, currencyCode)} onChange={(event) => setState((current) => ({ ...current, incomeTarget: Math.max(0, parseMoneyInput(formatMoneyInput(event.target.value, currencyCode))) }))} /></div><p className="mt-2 text-xs text-muted-foreground">Ingreso real del mes de referencia: {money.format(state.actualIncome)}</p></div><Button className="w-full min-w-0 rounded-full sm:w-auto" onClick={addMainCategory}><Plus className="size-4" />Categoría principal</Button></section>

        <section aria-label="Categorías del escenario" className="[&_button[data-size=icon]]:size-11">{[...state.mainCategories].sort((a, b) => a.sortOrder - b.sortOrder).map((main) => {
          const categorySummary = summary.categories.find((category) => category.group === main.group);
          const children = state.subcategories.filter((category) => category.group === main.group).sort((a, b) => a.sortOrder - b.sortOrder);
          return <article key={main.id} className="border-b py-6"><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ color: main.color, backgroundColor: `${main.color}18` }}><FinanceIcon name={main.icon} className="size-5" /></span><input aria-label="Nombre de la categoría principal simulada" className="h-11 min-w-0 flex-1 border-b bg-transparent text-base font-medium outline-none focus:border-ring" value={main.name} maxLength={60} onChange={(event) => setState((current) => ({ ...current, mainCategories: current.mainCategories.map((category) => category.id === main.id ? { ...category, name: event.target.value } : category) }))} /></div><div className="flex items-center justify-between gap-3 sm:justify-end"><label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><Switch checked={main.included} onCheckedChange={(included) => setState((current) => ({ ...current, mainCategories: current.mainCategories.map((category) => category.id === main.id ? { ...category, included, targetPercent: included ? category.targetPercent : 0 } : category) }))} />Incluir</label><label className={cn("flex h-11 w-24 items-center rounded-xl border border-input px-3", !main.included && "opacity-45")}><input aria-label={`Porcentaje simulado para ${main.name}`} className="min-w-0 flex-1 bg-transparent text-right font-medium tabular-nums outline-none" inputMode="numeric" disabled={!main.included} value={main.targetPercent} onChange={(event) => setState((current) => ({ ...current, mainCategories: current.mainCategories.map((category) => category.id === main.id ? { ...category, targetPercent: Math.min(100, Math.max(0, Number(event.target.value.replace(/\D/g, "")) || 0)) } : category) }))} /><span className="ml-1 text-sm text-muted-foreground">%</span></label><Button variant="ghost" size="icon" aria-label={`Eliminar ${main.name} del escenario`} onClick={() => setState((current) => ({ ...current, mainCategories: current.mainCategories.filter((category) => category.id !== main.id), subcategories: current.subcategories.filter((category) => category.group !== main.group) }))}><Trash2 className="size-4" /></Button></div></div>
            <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3"><span>Objetivo {money.format(categorySummary?.targetAmount ?? 0)}</span><span>Presupuesto {money.format(categorySummary?.budget ?? 0)}</span><span>Gasto {money.format(categorySummary?.spent ?? 0)}</span></div>
            <div className="mt-4 sm:pl-14">{children.map((subcategory) => <SimulatorSubcategory key={subcategory.id} category={subcategory} currencyCode={currencyCode} onChange={(changes) => setState((current) => ({ ...current, subcategories: current.subcategories.map((category) => category.id === subcategory.id ? { ...category, ...changes } : category) }))} onRemove={() => setState((current) => ({ ...current, subcategories: current.subcategories.filter((category) => category.id !== subcategory.id) }))} />)}<Button variant="ghost" size="sm" className="mt-3 rounded-full text-primary" onClick={() => addSubcategory(main.group)}><Plus className="size-4" />Añadir subcategoría</Button></div>
          </article>;
        })}</section>
      </div>
      <SimulatorSummary state={state} money={money} />
    </div>}
  </>;
}

function SimulatorSubcategory({ category, currencyCode, onChange, onRemove }: { category: PlanSimulatorState["subcategories"][number]; currencyCode: string; onChange: (changes: Partial<PlanSimulatorState["subcategories"][number]>) => void; onRemove: () => void }) {
  return <div className="grid gap-2 border-t py-3 sm:grid-cols-[minmax(120px,1fr)_150px_150px_44px] sm:items-center"><input aria-label="Nombre de la subcategoría simulada" className="h-11 min-w-0 rounded-xl border border-input bg-secondary/15 px-3 outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" value={category.name} maxLength={100} onChange={(event) => onChange({ name: event.target.value })} /><MoneySimulatorInput label={`Presupuesto simulado de ${category.name}`} value={category.budget} currencyCode={currencyCode} onChange={(budget) => onChange({ budget })} /><MoneySimulatorInput label={`Gasto hipotético de ${category.name}`} value={category.spent} currencyCode={currencyCode} onChange={(spent) => onChange({ spent })} /><Button variant="ghost" size="icon" aria-label={`Eliminar ${category.name} del escenario`} onClick={onRemove}><Trash2 className="size-4" /></Button></div>;
}

function MoneySimulatorInput({ label, value, currencyCode, onChange }: { label: string; value: number; currencyCode: string; onChange: (value: number) => void }) {
  const visibleLabel = label.startsWith("Presupuesto") ? "Presupuesto" : "Gasto hipotético";
  return <label className="grid min-w-0 gap-1 sm:block"><span className="px-1 text-[11px] text-muted-foreground sm:sr-only">{visibleLabel}</span><input aria-label={label} className="h-11 w-full min-w-0 rounded-xl border border-input bg-secondary/15 px-3 text-right tabular-nums outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" inputMode="decimal" value={formatMoneyInputValue(value, currencyCode)} onChange={(event) => onChange(Math.max(0, parseMoneyInput(formatMoneyInput(event.target.value, currencyCode))))} /></label>;
}

function SimulatorSummary({ state, money }: { state: PlanSimulatorState; money: Intl.NumberFormat }) {
  const summary = summarizeSimulator(state);
  const percentTotal = state.mainCategories.filter((category) => category.included).reduce((sum, category) => sum + category.targetPercent, 0);
  return <aside className="h-fit border-y py-6 xl:sticky xl:top-24" aria-label="Resultado del escenario"><p className="text-xs font-medium uppercase tracking-[.16em] text-primary">Resultado instantáneo</p><h3 className="mt-3 text-xl font-medium">Balance del escenario</h3><dl className="mt-6 divide-y"><SummaryRow term="Ingreso" value={money.format(summary.incomeTarget)} /><SummaryRow term="Presupuestado" value={money.format(summary.budget)} /><SummaryRow term="Gasto hipotético" value={money.format(summary.spent)} /><SummaryRow term={summary.unassigned >= 0 ? "Sin asignar" : "Exceso"} value={money.format(Math.abs(summary.unassigned))} tone={summary.unassigned < 0 ? "destructive" : summary.unassigned > 0 ? "warning" : "positive"} /></dl><div className="mt-6"><div className="mb-2 flex justify-between text-sm"><span>Distribución porcentual</span><span className={cn("font-medium tabular-nums", percentTotal === 100 ? "text-positive" : "text-warning")}>{percentTotal}%</span></div><Progress value={Math.min(100, percentTotal)} label="Distribución porcentual simulada" valueText={`${percentTotal}% de 100%`} /></div><p className="mt-6 text-xs leading-5 text-muted-foreground">Este resultado solo vive en memoria. Al salir o recargar la pestaña no se envía ninguna escritura a Supabase ni a la caché financiera.</p></aside>;
}

function SummaryRow({ term, value, tone }: { term: string; value: string; tone?: "positive" | "warning" | "destructive" }) {
  return <div className="flex items-baseline justify-between gap-4 py-4"><dt className="text-sm text-muted-foreground">{term}</dt><dd className={cn("font-medium tabular-nums", tone === "positive" && "text-positive", tone === "warning" && "text-warning", tone === "destructive" && "text-destructive")}>{value}</dd></div>;
}

function emptySimulator(month: string): PlanSimulatorState {
  return { month, incomeTarget: 0, actualIncome: 0, mainCategories: [], subcategories: [] };
}

function simulatorMonths(current: string) {
  const [year, month] = current.split("-").map(Number);
  return Array.from({ length: 18 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
}
