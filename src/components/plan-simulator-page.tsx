"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Beaker, CircleCheck, Equal, FlaskConical, Info, LoaderCircle, Plus, RefreshCcw, RotateCcw, ShieldCheck, Trash2, TriangleAlert, WalletCards } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { InputControl, SelectControl } from "@/components/ui/form-control";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { currencyFormatter, monthLabel } from "@/lib/finance/calculations";
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
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
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
        setLoadMessage(seed.coverage === "partial"
          ? "Este escenario usa la copia disponible en el dispositivo. Algunos movimientos históricos podrían faltar."
          : null);
      })
      .catch((error) => {
        if (!cancelled) setLoadMessage(error instanceof Error ? error.message : "No pudimos preparar el escenario.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [getPlanSimulationSeed, requestVersion, selectedMonth]);

  const summary = useMemo(() => summarizeSimulator(state), [state]);
  const summaryByGroup = useMemo(() => new Map(summary.categories.map((category) => [category.group, category])), [summary.categories]);
  const changed = useMemo(() => JSON.stringify(state) !== JSON.stringify(initialState), [initialState, state]);
  const includedCategories = useMemo(() => state.mainCategories.filter((category) => category.included), [state.mainCategories]);
  const percentTotal = includedCategories.reduce((sum, category) => sum + category.targetPercent, 0);
  const percentagesComplete = percentTotal === 100;
  const canCalculateBudgets = state.incomeTarget > 0 && percentagesComplete && state.subcategories.length > 0;

  function changeMonth(month: string) {
    setLoading(true);
    setLoadMessage(null);
    setActionMessage(null);
    setSelectedMonth(month);
  }

  function reload() {
    setLoading(true);
    setLoadMessage(null);
    setActionMessage(null);
    setRequestVersion((version) => version + 1);
  }

  function equalPercentages() {
    setState((current) => {
      const included = current.mainCategories.filter((category) => category.included).sort((left, right) => left.sortOrder - right.sortOrder);
      const percentages = distributeMoney(100, included.map((category) => category.group), undefined, 0);
      return {
        ...current,
        mainCategories: current.mainCategories.map((category) => ({
          ...category,
          targetPercent: category.included ? percentages[category.group] ?? 0 : 0,
        })),
      };
    });
    setActionMessage("El 100% quedó repartido de la forma más equitativa posible entre las categorías incluidas.");
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
    setActionMessage("Los presupuestos se calcularon con tus porcentajes y el gasto del mes como referencia.");
  }

  function addMainCategory() {
    setState((current) => {
      const id = crypto.randomUUID();
      return {
        ...current,
        mainCategories: [...current.mainCategories, {
          id,
          group: `sim_${id}`,
          name: "Nueva categoría",
          color: "#fb7185",
          icon: "folder",
          included: false,
          targetPercent: 0,
          sortOrder: current.mainCategories.length,
        }],
      };
    });
    setActionMessage("Añadiste una categoría solo a este escenario.");
  }

  function addSubcategory(group: string) {
    setState((current) => ({
      ...current,
      subcategories: [...current.subcategories, {
        id: crypto.randomUUID(),
        group,
        name: "Nueva subcategoría",
        color: "#fb7185",
        icon: "tag",
        sortOrder: current.subcategories.filter((category) => category.group === group).length,
        budget: 0,
        spent: 0,
      }],
    }));
    setActionMessage("Añadiste una subcategoría solo a este escenario.");
  }

  function resetScenario() {
    setState(initialState);
    setActionMessage("El escenario volvió a los datos originales del mes.");
  }

  return (
    <div data-plan-simulator>
      <SimulatorIntro selectedMonth={selectedMonth} months={months} loading={loading} changed={changed} onMonthChange={changeMonth} onReload={reload} onReset={resetScenario} />

      {loadMessage ? (
        <p className="mb-6 flex items-start gap-2 rounded-xl bg-warning/10 px-4 py-3 text-sm leading-5 text-warning-foreground" role="status">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {loadMessage}
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite">{actionMessage}</p>

      {loading ? (
        <div className="border-y py-16 text-center" role="status">
          <LoaderCircle className="mx-auto size-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">Preparando una copia segura de {monthLabel(selectedMonth)}…</p>
        </div>
      ) : (
        <>
          <ScenarioIncome state={state} currencyCode={currencyCode} money={money} onChange={setState} onAnnounce={setActionMessage} />

          <div className="mt-8 grid min-w-0 gap-8 2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:items-start">
            <SimulatorSummary summary={summary} percentTotal={percentTotal} money={money} className="2xl:col-start-2 2xl:row-start-1" />

            <section className="min-w-0 2xl:col-start-1 2xl:row-start-1" aria-labelledby="simulator-distribution-title">
              <DistributionHeader percentTotal={percentTotal} includedCount={includedCategories.length} canCalculateBudgets={canCalculateBudgets} hasIncludedCategories={includedCategories.length > 0} onEqualize={equalPercentages} onCalculate={automaticBudgets} />

              <div className="mt-5" aria-label="Categorías del escenario">
                {[...state.mainCategories].sort((left, right) => left.sortOrder - right.sortOrder).map((main, index) => {
                  const categorySummary = summaryByGroup.get(main.group);
                  const children = state.subcategories.filter((category) => category.group === main.group).sort((left, right) => left.sortOrder - right.sortOrder);
                  return (
                    <SimulatorCategory
                      key={main.id}
                      index={index}
                      main={main}
                      subcategories={children}
                      summary={categorySummary}
                      currencyCode={currencyCode}
                      money={money}
                      onMainChange={(changes) => setState((current) => ({ ...current, mainCategories: current.mainCategories.map((category) => category.id === main.id ? { ...category, ...changes } : category) }))}
                      onRemoveMain={() => setState((current) => ({ ...current, mainCategories: current.mainCategories.filter((category) => category.id !== main.id), subcategories: current.subcategories.filter((category) => category.group !== main.group) }))}
                      onSubcategoryChange={(id, changes) => setState((current) => ({ ...current, subcategories: current.subcategories.map((category) => category.id === id ? { ...category, ...changes } : category) }))}
                      onRemoveSubcategory={(id) => setState((current) => ({ ...current, subcategories: current.subcategories.filter((category) => category.id !== id) }))}
                      onAddSubcategory={() => addSubcategory(main.group)}
                    />
                  );
                })}

                {state.mainCategories.length === 0 ? (
                  <div className="border-y py-10 text-center">
                    <p className="font-medium">Este escenario todavía no tiene categorías.</p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Añade una categoría principal y luego crea los presupuestos que quieras probar.</p>
                  </div>
                ) : null}

                <Button variant="outline" className="mt-5 w-full rounded-full sm:w-auto" onClick={addMainCategory}>
                  <Plus className="size-4" aria-hidden="true" />
                  Añadir categoría principal
                </Button>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function SimulatorIntro({ selectedMonth, months, loading, changed, onMonthChange, onReload, onReset }: {
  selectedMonth: string;
  months: string[];
  loading: boolean;
  changed: boolean;
  onMonthChange: (month: string) => void;
  onReload: () => void;
  onReset: () => void;
}) {
  return (
    <header className="mb-7 border-b pb-7">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.16em] text-primary"><FlaskConical className="size-4" aria-hidden="true" />Ensayo financiero</span>
            <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-positive/10 px-2.5 text-xs font-medium text-positive"><ShieldCheck className="size-3.5" aria-hidden="true" />No se guarda</span>
          </div>
          <h2 className="mt-3 text-2xl font-medium tracking-[-.04em] text-balance">Prueba un mes antes de tomar decisiones</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">Cambia el ingreso, la distribución y los gastos para ver qué ocurriría. Tu plan, tus movimientos y tus datos reales permanecen intactos.</p>
        </div>
        <div>
          <Label htmlFor="simulator-reference-month">Mes que quieres usar como referencia</Label>
          <SelectControl id="simulator-reference-month" value={selectedMonth} onValueChange={onMonthChange} containerClassName="mt-2">
            {months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
          </SelectControl>
        </div>
      </div>

      <ol className="mt-6 grid gap-2 sm:grid-cols-3" aria-label="Cómo usar el simulador">
        <GuideStep number="1" title="Define el dinero" description="Usa el ingreso real o escribe otro." />
        <GuideStep number="2" title="Reparte el 100%" description="Decide cuánto recibe cada categoría." />
        <GuideStep number="3" title="Prueba tus gastos" description="Compara el presupuesto con lo que gastarías." />
      </ol>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="ghost" className="justify-start rounded-full sm:justify-center" onClick={onReload} disabled={loading}><RefreshCcw className="size-4" aria-hidden="true" />Volver a cargar {monthLabel(selectedMonth)}</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="ghost" className="justify-start rounded-full sm:justify-center" disabled={!changed}><RotateCcw className="size-4" aria-hidden="true" />Deshacer todos mis cambios</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>¿Restablecer este escenario?</AlertDialogTitle><AlertDialogDescription>Volverás a la copia original de {monthLabel(selectedMonth)}. Tu plan real no se modificará.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Conservar cambios</AlertDialogCancel><AlertDialogAction onClick={onReset}>Restablecer escenario</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  );
}

function GuideStep({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <li className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-xl bg-secondary/35 px-3 py-3">
      <span className="grid size-8 place-items-center rounded-[10px] bg-background text-sm font-semibold tabular-nums text-primary shadow-[0_0_0_1px_var(--border)]" aria-hidden="true">{number}</span>
      <span className="min-w-0"><strong className="block text-sm font-medium">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span></span>
    </li>
  );
}

function ScenarioIncome({ state, currencyCode, money, onChange, onAnnounce }: {
  state: PlanSimulatorState;
  currencyCode: string;
  money: Intl.NumberFormat;
  onChange: React.Dispatch<React.SetStateAction<PlanSimulatorState>>;
  onAnnounce: (message: string) => void;
}) {
  const usesActualIncome = state.incomeTarget === state.actualIncome;
  return (
    <section className="grid gap-5 border-b pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,380px)] lg:items-end" aria-labelledby="simulator-income-title">
      <div>
        <p className="text-xs font-medium uppercase tracking-[.14em] text-primary">Paso 1</p>
        <h3 id="simulator-income-title" className="mt-2 text-xl font-medium tracking-[-.03em]">¿Cuánto dinero quieres organizar?</h3>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Este es el ingreso de prueba. Cambiarlo recalcula las metas por porcentaje, pero no toca tu ingreso registrado.</p>
      </div>
      <div>
        <Label htmlFor="simulator-income">Ingreso disponible en este escenario</Label>
        <InputControl id="simulator-income" containerClassName="mt-2" leading={<span className="text-[11px] font-semibold">{currencyCode}</span>} className="text-right text-xl font-medium tabular-nums" inputMode="decimal" value={formatMoneyInputValue(state.incomeTarget, currencyCode)} onChange={(event) => onChange((current) => ({ ...current, incomeTarget: Math.max(0, parseMoneyInput(formatMoneyInput(event.target.value, currencyCode))) }))} />
        <div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Ingreso registrado en el mes: <strong className="font-medium text-foreground tabular-nums">{money.format(state.actualIncome)}</strong></span>
          {!usesActualIncome && state.actualIncome > 0 ? (
            <button type="button" className="min-h-8 self-start rounded-lg px-2 font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 sm:self-auto" onClick={() => { onChange((current) => ({ ...current, incomeTarget: current.actualIncome })); onAnnounce("El escenario vuelve a usar el ingreso registrado en el mes."); }}>Usar ingreso real</button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DistributionHeader({ percentTotal, includedCount, canCalculateBudgets, hasIncludedCategories, onEqualize, onCalculate }: {
  percentTotal: number;
  includedCount: number;
  canCalculateBudgets: boolean;
  hasIncludedCategories: boolean;
  onEqualize: () => void;
  onCalculate: () => void;
}) {
  const complete = percentTotal === 100;
  return (
    <div className="border-b pb-5">
      <p className="text-xs font-medium uppercase tracking-[.14em] text-primary">Paso 2</p>
      <div className="mt-2">
        <div className="max-w-2xl"><h3 id="simulator-distribution-title" className="text-xl font-medium tracking-[-.03em]">Distribuye y prueba el gasto</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Primero reparte el 100% entre categorías principales. Después define, en cada subcategoría, cuánto presupuestarías y cuánto crees que gastarías.</p></div>
        <div className="mt-4 grid w-full gap-2 sm:max-w-xl sm:grid-cols-2">
          <Button variant="outline" className="w-full rounded-full" onClick={onEqualize} disabled={!hasIncludedCategories}><Equal className="size-4" aria-hidden="true" />Repartir 100% por igual</Button>
          <Button className="w-full rounded-full" onClick={onCalculate} disabled={!canCalculateBudgets} aria-describedby="automatic-budget-help"><Beaker className="size-4" aria-hidden="true" />Crear presupuestos</Button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-medium">Porcentaje asignado</span><span className={cn("font-semibold tabular-nums", complete ? "text-positive" : "text-warning")}>{percentTotal}% de 100%</span></div>
          <Progress value={Math.min(100, percentTotal)} label="Porcentaje total asignado en el escenario" valueText={`${percentTotal}% de 100%`} indicatorClassName={complete ? "bg-positive" : "bg-warning"} />
        </div>
        <p className={cn("flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium", complete ? "bg-positive/10 text-positive" : "bg-warning/10 text-warning-foreground")} role="status">
          {complete ? <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> : <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />}
          {complete
            ? `${includedCount} categorías completan el plan`
            : percentTotal < 100
              ? `Faltan ${100 - percentTotal} puntos para completar el 100%`
              : `Sobran ${percentTotal - 100} puntos; reduce la distribución`}
        </p>
      </div>
      <p id="automatic-budget-help" className="mt-3 text-xs leading-5 text-muted-foreground">“Crear presupuestos” reparte el ingreso con estos porcentajes y usa los gastos del mes como referencia. Solo se habilita cuando la distribución suma 100%.</p>
    </div>
  );
}

function SimulatorCategory({ index, main, subcategories, summary, currencyCode, money, onMainChange, onRemoveMain, onSubcategoryChange, onRemoveSubcategory, onAddSubcategory }: {
  index: number;
  main: PlanSimulatorState["mainCategories"][number];
  subcategories: PlanSimulatorState["subcategories"];
  summary: ReturnType<typeof summarizeSimulator>["categories"][number] | undefined;
  currencyCode: string;
  money: Intl.NumberFormat;
  onMainChange: (changes: Partial<PlanSimulatorState["mainCategories"][number]>) => void;
  onRemoveMain: () => void;
  onSubcategoryChange: (id: string, changes: Partial<PlanSimulatorState["subcategories"][number]>) => void;
  onRemoveSubcategory: (id: string) => void;
  onAddSubcategory: () => void;
}) {
  const categoryId = `simulator-category-${main.id}`;
  const remaining = summary?.remaining ?? 0;
  return (
    <article className="border-b py-7" aria-labelledby={`${categoryId}-name`}>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
        <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-end gap-3">
          <span className="grid size-11 place-items-center rounded-xl" style={{ color: main.color, backgroundColor: `${main.color}18` }} aria-hidden="true"><FinanceIcon name={main.icon} className="size-5" /></span>
          <div className="min-w-0"><Label htmlFor={`${categoryId}-name`}>Categoría principal {index + 1}</Label><input id={`${categoryId}-name`} aria-label="Nombre de la categoría principal simulada" className="mt-1 h-8 w-full min-w-0 border-b border-input bg-transparent text-base font-medium outline-none transition-colors focus:border-ring" value={main.name} maxLength={60} onChange={(event) => onMainChange({ name: event.target.value })} /></div>
        </div>
        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_112px_44px] items-end gap-2 lg:grid-cols-[auto_112px_44px]">
          <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl bg-secondary/35 px-3 text-sm"><Switch checked={main.included} onCheckedChange={(included) => onMainChange({ included, targetPercent: included ? main.targetPercent : 0 })} /><span className="leading-5"><span className="block font-medium">Cuenta en el 100%</span><span className="block text-[11px] text-muted-foreground">{main.included ? "Incluida" : "Fuera del reparto"}</span></span></label>
          <label className={cn("grid min-w-0 gap-1", !main.included && "opacity-50")}><span className="text-[11px] text-muted-foreground">Porcentaje</span><span className="flex h-11 w-full min-w-0 items-center rounded-xl border border-input bg-control px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20"><input aria-label={`Porcentaje simulado para ${main.name}`} className="min-w-0 flex-1 bg-transparent text-right font-medium tabular-nums outline-none" inputMode="numeric" disabled={!main.included} value={main.targetPercent} onChange={(event) => onMainChange({ targetPercent: Math.min(100, Math.max(0, Number(event.target.value.replace(/\D/g, "")) || 0)) })} /><span className="ml-1 text-sm text-muted-foreground">%</span></span></label>
          <Button variant="ghost" size="icon" aria-label={`Eliminar ${main.name} del escenario`} onClick={onRemoveMain}><Trash2 className="size-4" aria-hidden="true" /></Button>
        </div>
      </div>
      {!main.included ? <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground lg:ml-14"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Esta categoría no recibe un porcentaje del ingreso. Los presupuestos que escribas abajo sí seguirán contando en el balance del escenario.</p> : null}
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-secondary/25 px-4 py-3 sm:grid-cols-4 lg:ml-14">
        <CategoryMetric term="Meta por porcentaje" value={money.format(summary?.targetAmount ?? 0)} />
        <CategoryMetric term="Presupuesto máximo" value={money.format(summary?.budget ?? 0)} />
        <CategoryMetric term="Gasto de prueba" value={money.format(summary?.spent ?? 0)} />
        <CategoryMetric term={remaining >= 0 ? "Disponible" : "Exceso"} value={money.format(Math.abs(remaining))} tone={remaining < 0 ? "destructive" : "positive"} />
      </dl>
      <div className="mt-5 lg:ml-14">
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,.85fr)_minmax(0,.85fr)_minmax(0,.62fr)_44px] gap-3 border-b px-2 pb-2 text-[11px] font-medium text-muted-foreground lg:grid" aria-hidden="true"><span>Subcategoría</span><span>Presupuesto máximo</span><span>Gasto que quieres probar</span><span>Resultado</span><span></span></div>
        {subcategories.length ? subcategories.map((subcategory) => <SimulatorSubcategory key={subcategory.id} category={subcategory} currencyCode={currencyCode} money={money} onChange={(changes) => onSubcategoryChange(subcategory.id, changes)} onRemove={() => onRemoveSubcategory(subcategory.id)} />) : <p className="border-b py-5 text-sm leading-6 text-muted-foreground">No hay subcategorías. Añade una para probar un presupuesto y un gasto concreto.</p>}
        <Button variant="ghost" size="sm" className="mt-3 rounded-full text-primary" onClick={onAddSubcategory}><Plus className="size-4" aria-hidden="true" />Añadir subcategoría a {main.name || "esta categoría"}</Button>
      </div>
    </article>
  );
}

function CategoryMetric({ term, value, tone }: { term: string; value: string; tone?: "positive" | "destructive" }) {
  return <div className="min-w-0"><dt className="text-[11px] leading-4 text-muted-foreground">{term}</dt><dd className={cn("mt-1 truncate text-sm font-medium tabular-nums", tone === "positive" && "text-positive", tone === "destructive" && "text-destructive")}>{value}</dd></div>;
}

function SimulatorSubcategory({ category, currencyCode, money, onChange, onRemove }: {
  category: PlanSimulatorState["subcategories"][number];
  currencyCode: string;
  money: Intl.NumberFormat;
  onChange: (changes: Partial<PlanSimulatorState["subcategories"][number]>) => void;
  onRemove: () => void;
}) {
  const rowId = `simulator-subcategory-${category.id}`;
  const remaining = category.budget - category.spent;
  return (
    <fieldset className="grid min-w-0 gap-3 border-b py-4 min-[380px]:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,.85fr)_minmax(0,.85fr)_minmax(0,.62fr)_44px] lg:items-end lg:px-2">
      <legend className="sr-only">Simular {category.name}</legend>
      <div className="min-w-0 min-[380px]:col-span-2 lg:col-span-1"><Label htmlFor={`${rowId}-name`} className="lg:sr-only">Subcategoría</Label><input id={`${rowId}-name`} aria-label="Nombre de la subcategoría simulada" className="mt-1 h-11 w-full min-w-0 rounded-xl border border-input bg-control px-3 outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-3 focus:ring-ring/20 lg:mt-0" value={category.name} maxLength={100} onChange={(event) => onChange({ name: event.target.value })} /></div>
      <MoneySimulatorInput id={`${rowId}-budget`} visibleLabel="Presupuesto máximo" accessibleLabel={`Presupuesto máximo simulado de ${category.name}`} value={category.budget} currencyCode={currencyCode} onChange={(budget) => onChange({ budget })} />
      <MoneySimulatorInput id={`${rowId}-spent`} visibleLabel="Gasto que quieres probar" accessibleLabel={`Gasto hipotético de ${category.name}`} value={category.spent} currencyCode={currencyCode} onChange={(spent) => onChange({ spent })} />
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-secondary/30 px-3 lg:block lg:bg-transparent lg:px-0"><span className="text-xs text-muted-foreground lg:sr-only">Resultado</span><span className={cn("text-sm font-medium tabular-nums", remaining < 0 ? "text-destructive" : "text-positive")}>{remaining < 0 ? `Exceso ${money.format(Math.abs(remaining))}` : `Quedan ${money.format(remaining)}`}</span></div>
      <Button variant="ghost" size="icon" className="justify-self-end lg:justify-self-auto" aria-label={`Eliminar ${category.name} del escenario`} onClick={onRemove}><Trash2 className="size-4" aria-hidden="true" /></Button>
    </fieldset>
  );
}

function MoneySimulatorInput({ id, visibleLabel, accessibleLabel, value, currencyCode, onChange }: {
  id: string;
  visibleLabel: string;
  accessibleLabel: string;
  value: number;
  currencyCode: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="lg:sr-only">{visibleLabel}</Label>
      <InputControl id={id} aria-label={accessibleLabel} containerClassName="mt-1 lg:mt-0" leading={<span className="text-[11px] font-semibold">{currencyCode}</span>} className="text-right tabular-nums" inputMode="decimal" value={formatMoneyInputValue(value, currencyCode)} onChange={(event) => onChange(Math.max(0, parseMoneyInput(formatMoneyInput(event.target.value, currencyCode))))} />
    </div>
  );
}

function SimulatorSummary({ summary, percentTotal, money, className }: { summary: ReturnType<typeof summarizeSimulator>; percentTotal: number; money: Intl.NumberFormat; className?: string }) {
  const budgetBalance = summary.incomeTarget - summary.budget;
  const spendingBalance = summary.budget - summary.spent;
  const budgetUsage = summary.budget > 0 ? Math.min(100, (summary.spent / summary.budget) * 100) : 0;
  const outcome = budgetBalance < 0
    ? { title: "El plan supera tu ingreso", detail: `Te faltan ${money.format(Math.abs(budgetBalance))} para cubrir todo lo presupuestado.`, tone: "destructive" as const }
    : budgetBalance > 0
      ? { title: "Todavía queda dinero sin destino", detail: `Aún puedes asignar ${money.format(budgetBalance)} a tus presupuestos.`, tone: "warning" as const }
      : { title: "Todo el ingreso tiene un destino", detail: "El total presupuestado coincide con el ingreso de este escenario.", tone: "positive" as const };
  return (
    <aside className={cn("h-fit rounded-[1.5rem] bg-secondary/35 p-5 shadow-[0_0_0_1px_var(--border)] 2xl:sticky 2xl:top-24", className)} aria-label="Resultado del escenario">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[.14em] text-primary">Resultado en vivo</p><h3 className="mt-2 text-xl font-medium tracking-[-.03em]">¿Qué pasaría?</h3></div><span className="grid size-11 place-items-center rounded-xl bg-background text-primary shadow-[0_0_0_1px_var(--border)]" aria-hidden="true"><WalletCards className="size-5" /></span></div>
      <div className={cn("mt-5 rounded-xl px-4 py-4", outcome.tone === "positive" && "bg-positive/10", outcome.tone === "warning" && "bg-warning/10", outcome.tone === "destructive" && "bg-destructive/10")}>
        <p className={cn("flex items-center gap-2 text-sm font-semibold", outcome.tone === "positive" && "text-positive", outcome.tone === "warning" && "text-warning-foreground", outcome.tone === "destructive" && "text-destructive")}>{outcome.tone === "positive" ? <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> : <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />}{outcome.title}</p>
        <p className="mt-1 text-xs leading-5 text-foreground/75">{outcome.detail}</p>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2" aria-label="Flujo del dinero simulado">
        <FlowValue label="Ingreso de prueba" value={money.format(summary.incomeTarget)} /><ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
        <FlowValue label="Total presupuestado" value={money.format(summary.budget)} /><ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
        <FlowValue label="Gasto que probarías" value={money.format(summary.spent)} /><span aria-hidden="true"></span>
      </div>
      <div className="mt-6 border-t pt-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>Distribución del ingreso</span><span className={cn("font-semibold tabular-nums", percentTotal === 100 ? "text-positive" : "text-warning")}>{percentTotal}%</span></div>
        <Progress value={Math.min(100, percentTotal)} label="Distribución porcentual simulada" valueText={`${percentTotal}% de 100%`} indicatorClassName={percentTotal === 100 ? "bg-positive" : "bg-warning"} />
        <div className="mb-2 mt-5 flex items-center justify-between gap-3 text-sm"><span>Uso de lo presupuestado</span><span className={cn("font-semibold tabular-nums", spendingBalance < 0 ? "text-destructive" : "text-foreground")}>{Math.round(budgetUsage)}%</span></div>
        <Progress value={budgetUsage} label="Porcentaje del presupuesto que se gastaría" valueText={`${Math.round(budgetUsage)}% del presupuesto`} indicatorClassName={spendingBalance < 0 ? "bg-destructive" : "bg-primary"} />
        <p className={cn("mt-3 text-xs font-medium leading-5", spendingBalance < 0 ? "text-destructive" : "text-positive")}>{spendingBalance < 0 ? `El gasto de prueba supera los presupuestos por ${money.format(Math.abs(spendingBalance))}.` : `Después del gasto de prueba quedarían ${money.format(spendingBalance)} dentro de los presupuestos.`}</p>
      </div>
      <p className="mt-6 flex items-start gap-2 border-t pt-4 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden="true" />Este escenario vive únicamente en la memoria del navegador. Salir o recargar lo descarta y no escribe nada en Supabase.</p>
    </aside>
  );
}

function FlowValue({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-border/70 py-2.5"><span className="text-xs text-muted-foreground">{label}</span><strong className="shrink-0 text-sm font-medium tabular-nums">{value}</strong></div>;
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
