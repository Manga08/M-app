"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarRange, CloudOff, Download, FileSpreadsheet, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PaginationControls } from "@/components/pagination-controls";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { DateControl, InputControl, MonthControl, SelectControl } from "@/components/ui/form-control";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { currencyFormatter } from "@/lib/finance/calculations";
import { creditCardStatementIsReconciled } from "@/lib/finance/credit-cards";
import { accountContextLabel, activeAccountEntities } from "@/lib/finance/account-entities";
import { transactionReportingAmount } from "@/lib/finance/currency";
import { downloadBlob } from "@/lib/download";
import { reportRequiresConnection } from "@/lib/finance/report-coverage";
import { createClient } from "@/lib/supabase/client";
import { loadRemoteFinancialRevision } from "@/lib/finance/remote-state";
import { defaultReportQuery, normalizeReportQuery, parseReportQuery, reportBudgetIsComparable, reportComparisonRange, reportDateMatchesQuery, reportPeriodLabel, reportQueryKey, reportRangeForPreset, serializeReportQuery } from "@/lib/finance/report-query";
import { createReportWorkbook, reportWorkbookFilename } from "@/lib/finance/report-workbook";
import { availableTone, expenseTone, financialToneClass, type FinancialTone } from "@/lib/finance/financial-status";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import type { DetailedFinanceReport, ReportKindFilter, ReportPreset, ReportQuery } from "@/lib/finance/types";
import { publicHistoryState } from "@/lib/history-state";
import { cn } from "@/lib/utils";

const CashflowReportChart = dynamic(() => import("@/components/report-charts").then((m) => m.CashflowReportChart), { ssr: false, loading: ChartSkeleton });
const BudgetReportChart = dynamic(() => import("@/components/report-charts").then((m) => m.BudgetReportChart), { ssr: false, loading: ChartSkeleton });
const IncomeReportChart = dynamic(() => import("@/components/report-charts").then((m) => m.IncomeReportChart), { ssr: false, loading: ChartSkeleton });
const WeekdayReportChart = dynamic(() => import("@/components/report-charts").then((m) => m.WeekdayReportChart), { ssr: false, loading: ChartSkeleton });
const PERIODS: Array<{ value: ReportPreset; label: string }> = [{ value: "month", label: "Este mes" }, { value: "6m", label: "6 meses" }, { value: "12m", label: "1 año" }, { value: "24m", label: "2 años" }];

export function ReportsPage() {
  const finance = useFinance();
  const [searchDraft, setSearchDraft] = useState("");
  const [privateSearch, setPrivateSearch] = useState("");
  const [searchReady, setSearchReady] = useState(false);
  const { profile, accountEntities, accounts, categories, online, pendingCount, syncing, getDetailedFinanceReport, exportReportTransactions, syncNow } = finance;
  const searchParams = useSearchParams();
  const query = useMemo(() => ({ ...parseReportQuery(new URLSearchParams(searchParams.toString()), new Date(`${finance.currentMonth}T12:00:00Z`)), search: privateSearch }), [searchParams, finance.currentMonth, privateSearch]);
  const queryKey = reportQueryKey(query);
  const [result, setResult] = useState<{ key: string; report: DetailedFinanceReport | null; error: string | null } | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterHistoryOwned = useRef(false);
  const money = currencyFormatter(profile?.currencyCode);
  const compactMoney = currencyFormatter(profile?.currencyCode, true);
  const requestKey = `${queryKey}|${refreshToken}|${online ? "online" : "offline"}|${pendingCount}`;
  const offlineGuard = reportRequiresConnection({ online, profileId: profile?.id });

  useEffect(() => {
    if (offlineGuard || !searchReady) return;
    let active = true;
    void getDetailedFinanceReport(query)
      .then((report) => { if (active) setResult({ key: requestKey, report, error: null }); })
      .catch((error: unknown) => { if (active) setResult({ key: requestKey, report: null, error: error instanceof Error ? error.message : "No pudimos calcular el reporte." }); });
    return () => { active = false; };
  }, [getDetailedFinanceReport, offlineGuard, query, requestKey, searchReady]);

  useEffect(() => {
    const refresh = () => setRefreshToken((value) => value + 1);
    window.addEventListener("moneva:transactions-changed", refresh);
    return () => window.removeEventListener("moneva:transactions-changed", refresh);
  }, []);

  useEffect(() => {
    const syncFromHistory = () => {
      const active = new URL(window.location.href).searchParams.get("panel") === "report-filters";
      if (!active) filterHistoryOwned.current = false;
      const stored = window.history.state?.__monevaReportSearch;
      const value = typeof stored === "string" ? stored : new URL(window.location.href).searchParams.get("buscar") ?? "";
      setPrivateSearch(value); setSearchDraft(value); setSearchReady(true);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("buscar");
      window.history.replaceState({ ...publicHistoryState(window.history.state), __monevaReportSearch: value }, "", `${clean.pathname}${clean.search}${clean.hash}`);
      setFilterOpen(active);
    };
    const frame = window.requestAnimationFrame(syncFromHistory);
    window.addEventListener("popstate", syncFromHistory);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("popstate", syncFromHistory); };
  }, []);

  const activeResult = result?.key === requestKey ? result : null;
  const exportReport = activeResult?.report ?? null;
  const report = exportReport ?? result?.report ?? null;
  const loading = !offlineGuard && !activeResult;
  const refreshing = loading && Boolean(report);
  const filterCount = query.groupKeys.length + query.categoryIds.length + query.incomeTypeIds.length + query.accountIds.length + (query.kind !== "all" ? 1 : 0) + (query.search ? 1 : 0);
  const mobilePeriodLabel = PERIODS.find((item) => item.value === query.preset)?.label ?? reportPeriodLabel(query);
  const applyQuery = (next: ReportQuery, replace = false) => {
    const normalized = normalizeReportQuery(next);
    const params = serializeReportQuery(normalized); params.delete("buscar");
    const state = { ...publicHistoryState(window.history.state), __monevaReportSearch: normalized.search };
    window.history[replace ? "replaceState" : "pushState"](state, "", `/reportes?${params}`);
    setPrivateSearch(normalized.search); setSearchDraft(normalized.search);
  };
  const applyPreset = (preset: ReportPreset) => applyQuery(normalizeReportQuery({ ...query, preset, ...reportRangeForPreset(preset, new Date(`${finance.currentMonth}T12:00:00Z`)), selectedMonths: [] }));

  function changeFilterOpen(next: boolean) {
    if (next) {
      const url = new URL(window.location.href);
      if (url.searchParams.get("panel") !== "report-filters") {
        url.searchParams.set("panel", "report-filters");
        window.history.pushState(publicHistoryState(window.history.state), "", `${url.pathname}${url.search}${url.hash}`);
        filterHistoryOwned.current = true;
      }
      setFilterOpen(true);
      return;
    }
    setFilterOpen(false);
    const url = new URL(window.location.href);
    if (filterHistoryOwned.current && url.searchParams.get("panel") === "report-filters") {
      window.history.back();
      return;
    }
    url.searchParams.delete("panel");
    window.history.replaceState(publicHistoryState(window.history.state), "", `${url.pathname}${url.search}${url.hash}`);
  }

  function applySheetQuery(next: ReportQuery) {
    filterHistoryOwned.current = false;
    setFilterOpen(false);
    applyQuery(next, true);
  }

  async function exportXlsx() {
    if (!exportReport || !profile) return;
    setExporting(true);
    try {
      const transactions = await exportReportTransactions(query);
      const client = profile.id !== "demo" ? createClient() : null;
      if (client && exportReport.revision !== (await loadRemoteFinancialRevision(client)).revision) {
        setRefreshToken((value) => value + 1);
        throw new Error("Los datos cambiaron mientras preparábamos el Excel. Actualizamos el reporte; vuelve a exportarlo.");
      }
      const exportedIncome = transactions.filter((item) => item.kind === "income").reduce((sum, item) => sum + transactionReportingAmount(item), 0);
      const exportedExpense = transactions.filter((item) => item.kind === "expense").reduce((sum, item) => sum + transactionReportingAmount(item), 0);
      if (Math.abs(exportedIncome - exportReport.summary.income) > 0.01 || Math.abs(exportedExpense - exportReport.summary.expense) > 0.01) {
        setRefreshToken((value) => value + 1);
        throw new Error("Los datos cambiaron mientras preparábamos el Excel. Actualizamos el reporte; vuelve a exportarlo.");
      }
      const blob = await createReportWorkbook({ report: exportReport, query, transactions, accounts, accountEntities: finance.accountEntities, categories, profile, financialTargets: finance.financialTargets, financialTargetEntries: finance.financialTargetEntries, financialTargetDebts: finance.financialTargetDebts, creditCards: finance.creditCards, creditCardStatements: finance.creditCardStatements, creditCardPurchasePlans: finance.creditCardPurchasePlans, creditCardInstallments: finance.creditCardInstallments, liabilityOverview: finance.liabilityOverview });
      downloadBlob(blob, reportWorkbookFilename(query));
      toast.success(`Excel de ${reportPeriodLabel(query)} creado con ${transactions.length} movimientos.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No pudimos crear el Excel."); }
    finally { setExporting(false); }
  }

  const hasActivity = Boolean(report?.summary.transactionCount || report?.summary.income || report?.summary.expense);
  const inspect = (kind: ReportKindFilter, categoryId?: string) => {
    applyQuery({ ...query, kind, groupKeys: categoryId || kind === "income" ? [] : query.groupKeys, categoryIds: categoryId ? [categoryId] : kind === "income" ? [] : query.categoryIds, incomeTypeIds: kind === "expense" ? [] : query.incomeTypeIds });
    document.getElementById("report-movements")?.scrollIntoView({ block: "start" });
  };
  return <>
    <PageHeader title="Reportes" description="Entiende qué pasó con tu dinero y comprueba de dónde sale cada cifra." action={<Button className="h-11 rounded-full px-5 max-sm:hidden" onClick={exportXlsx} disabled={exporting || !exportReport || offlineGuard || refreshing} aria-busy={exporting}><FileSpreadsheet className="size-4" />{exporting ? "Creando Excel…" : "Exportar a Excel"}</Button>} />
    <section className="space-y-4" aria-label="Periodo y filtros del reporte">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="hidden rounded-full bg-secondary/60 p-1 sm:flex" role="group" aria-label="Periodo rápido">{PERIODS.map((item) => <Button key={item.value} variant={query.preset === item.value ? "secondary" : "ghost"} aria-pressed={query.preset === item.value} onClick={() => applyPreset(item.value)} className="h-11 rounded-full px-4 text-xs">{item.label}</Button>)}</div>
        <Button variant="outline" className="h-11 min-w-0 flex-1 justify-start rounded-full px-4 sm:flex-none" onClick={() => changeFilterOpen(true)}><CalendarRange className="size-4 shrink-0" /><span className="truncate sm:hidden">{mobilePeriodLabel}</span><span className="hidden sm:inline">Elegir fechas</span></Button>
        <Sheet open={filterOpen} onOpenChange={changeFilterOpen}><SheetTrigger asChild><Button variant="outline" className="h-11 shrink-0 rounded-full px-4"><SlidersHorizontal className="size-4" />Filtros{filterCount ? <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{filterCount}</span> : null}</Button></SheetTrigger><SheetContent side="right" className="mobile-scroll h-dvh w-full gap-0 overflow-y-auto overscroll-y-contain p-0 sm:max-w-md"><ReportFilters key={queryKey} query={query} onApply={applySheetQuery} /></SheetContent></Sheet>
      </div>
      <p className="break-words text-sm font-medium">{reportPeriodLabel(query)}<span className="ml-2 font-normal text-muted-foreground">· {query.accountIds.length ? `${query.accountIds.length} cuenta(s)` : "Todas las cuentas"} · {profile?.currencyCode ?? "COP"} contables</span></p>
      <form className="flex items-end gap-2" role="search" onSubmit={(event) => { event.preventDefault(); applyQuery({ ...query, search: searchDraft }); }}><div className="min-w-0 flex-1 space-y-2"><Label htmlFor="report-search">Buscar movimientos</Label><InputControl id="report-search" leading={<Search className="size-4" />} value={searchDraft} maxLength={120} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Descripción, comercio o nota" /></div><Button type="submit" variant="outline" className="h-[52px] rounded-[14px] px-4">Buscar</Button></form>
      <ActiveReportFilters query={query} finance={finance} onChange={applyQuery} />
    </section>
    {offlineGuard ? <ReportConnectionRequired /> : null}
    {!offlineGuard && pendingCount > 0 ? <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-warning/8 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between"><p>Hay cambios pendientes. Sincronízalos para incluirlos en el reporte.</p><Button variant="outline" size="sm" className="rounded-full" disabled={syncing} onClick={async () => { await syncNow(); setRefreshToken((value) => value + 1); }}><RefreshCw className={cn("size-4", syncing && "animate-spin")} />Sincronizar</Button></div> : null}
    {!offlineGuard && loading && !report ? <ReportLoading /> : null}
    {!offlineGuard && activeResult?.error ? <ReportError message={activeResult.error} onRetry={() => setRefreshToken((value) => value + 1)} /> : null}
    {!offlineGuard && refreshing ? <p className="mt-4 min-h-8 text-xs text-muted-foreground" role="status">Actualizando; los datos anteriores siguen visibles…</p> : null}
    {!offlineGuard && report && !activeResult?.error ? <div className={cn("min-w-0 transition-opacity duration-[var(--motion-duration-state)]", refreshing && "pointer-events-none opacity-65")} aria-busy={refreshing} inert={refreshing}>
      <ReportSummary report={report} query={query} money={money} onInspect={inspect} />
      {!hasActivity ? <section className="rounded-2xl bg-secondary/25 px-5 py-7" role="status"><h2 className="text-lg font-medium">{filterCount ? "No hay movimientos con estos filtros" : "Todavía no hay movimientos en estas fechas"}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{filterCount ? "Prueba otra cuenta, quita un filtro o cambia las fechas. Tus saldos registrados se conservan abajo." : "Puedes consultar otro periodo. Un saldo inicial no es un ingreso y por eso no aparece como actividad."}</p><Button variant="outline" className="mt-4 rounded-full" onClick={() => filterCount ? applyQuery({ ...query, kind: "all", groupKeys: [], categoryIds: [], incomeTypeIds: [], accountIds: [], search: "" }) : changeFilterOpen(true)}>{filterCount ? "Quitar filtros de actividad" : "Cambiar fechas"}</Button></section> : <>
        {report.summary.income || report.summary.expense ? <section className="py-8"><SectionHeading title="Ingresos y gastos a lo largo del periodo" description="La fecha es la del movimiento, aunque lo hayas registrado por anticipado. Las transferencias no vuelven a contarse como ingreso o gasto." /><CashflowReportChart report={report} compactMoney={compactMoney} /><ExactSeriesData report={report} money={money} /></section> : <p className="py-5 text-sm text-muted-foreground">Solo hay transferencias en esta selección: mueven dinero entre cuentas, sin generar nuevos ingresos ni gastos.</p>}
        {report.summary.expense > 0 ? <CategoryBreakdown report={report} money={money} onInspect={inspect} /> : null}
        {report.summary.income > 0 ? <section className="py-8"><SectionHeading title="De dónde ingresó el dinero" description="Solo ingresos registrados en las fechas y cuentas seleccionadas." /><div className={cn("grid items-center gap-x-8", report.incomeTypes.filter((item) => item.income > 0).length > 1 && "md:grid-cols-[240px_minmax(0,1fr)]")}>{report.incomeTypes.filter((item) => item.income > 0).length > 1 ? <IncomeReportChart report={report} compactMoney={compactMoney} /> : null}<LegendList items={report.incomeTypes.filter((item) => item.income > 0).map((item) => ({ id: item.id, color: item.color, name: item.name, value: money.format(item.income), detail: `${formatPercent(item.percent)} de los ingresos` }))} empty="Sin ingresos" /></div></section> : null}
      </>}
      {report.summary.budget > 0 && reportBudgetIsComparable(query) ? <section className="py-8"><SectionHeading title="Cómo vas frente a tus presupuestos" description="Solo comparamos gastos de subcategorías y meses con un límite positivo. Los límites son mensuales completos; no se prorratean por días." /><div className="mb-5 flex flex-wrap gap-x-8 gap-y-3 text-sm"><p>Con límite: <strong className="tabular-nums">{money.format(report.summary.budgetExpense ?? 0)}</strong> de {money.format(report.summary.budget)}</p><p>Sin presupuesto: <strong className="tabular-nums">{money.format(report.summary.unbudgetedExpense ?? 0)}</strong></p></div><BudgetReportChart report={report} compactMoney={money} /></section> : null}
      {report.summary.budget > 0 && !reportBudgetIsComparable(query) ? <p className="py-4 text-sm text-muted-foreground">La comparación de presupuesto es global: quita la búsqueda y los filtros de cuenta o tipo de ingreso para verla sin mezclar alcances.</p> : null}
      <AccountReport report={report} query={query} />
      <CreditCardReport finance={finance} report={report} query={query} />
      <TargetReport report={report} money={money} />
      {hasActivity ? <RecentReportTransactions key={requestKey} report={report} query={query} accounts={accounts} accountEntities={accountEntities} categories={categories} /> : null}
      {report.summary.expense > 0 ? <details className="my-6 rounded-2xl bg-secondary/20 px-4"><summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium">Más detalle: comercios y días de la semana</summary><div className="grid gap-8 py-5 lg:grid-cols-2"><div><SectionHeading title="Comercios y descripciones" description="Los principales destinos del gasto; sin comercio usamos la descripción." /><LegendList items={report.merchants.map((item) => ({ id: item.name, name: item.name, color: "var(--primary)", value: money.format(item.expense), detail: `${item.transactionCount} movimientos` }))} empty="Sin gastos" /></div><div><SectionHeading title="Gasto por día de la semana" description="Suma de los gastos en los días seleccionados." /><WeekdayReportChart report={report} compactMoney={compactMoney} /><ExactWeekdayData report={report} money={money} /></div></div></details> : null}
      <div className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xl text-sm leading-6 text-muted-foreground">El Excel conserva estas fechas y filtros, todos los movimientos encontrados y solo las secciones que corresponden. Los saldos de cuenta incluyen el historial anterior al periodo.</p><Button className="h-12 shrink-0 rounded-full px-5" onClick={exportXlsx} disabled={exporting || refreshing || !exportReport} aria-busy={exporting}><Download className="size-4" />{exporting ? "Creando Excel…" : "Exportar a Excel"}</Button></div>
    </div> : null}
  </>;
}

function ReportFilters({ query, onApply }: { query: ReportQuery; onApply: (query: ReportQuery) => void }) {
  const { accountEntities, accounts, categories, groupAllocations, currentMonth } = useFinance();
  const [draft, setDraft] = useState(query);
  const [monthInput, setMonthInput] = useState("");
  const expenseCategories = categories.filter((item) => item.kind === "expense" && !item.archived);
  const incomeTypes = categories.filter((item) => item.kind === "income" && !item.archived);
  function toggle(key: "groupKeys" | "categoryIds" | "incomeTypeIds" | "accountIds", value: string) {
    setDraft((current) => {
      const values = current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value];
      return { ...current, [key]: values, ...(key === "groupKeys" ? { categoryIds: current.categoryIds.filter((id) => !values.length || categories.some((item) => item.id === id && values.includes(item.group))) } : {}) };
    });
  }
  function toggleEntity(entityId: string) {
    const childIds = accounts.filter((account) => account.entityId === entityId).map((account) => account.id);
    setDraft((current) => {
      const allSelected = childIds.length > 0 && childIds.every((id) => current.accountIds.includes(id));
      return { ...current, accountIds: allSelected ? current.accountIds.filter((id) => !childIds.includes(id)) : [...new Set([...current.accountIds, ...childIds])] };
    });
  }
  return <>
    <SheetHeader className="safe-dialog-top border-b px-5 pb-4 pt-5"><SheetTitle>Configurar reporte</SheetTitle><SheetDescription>Las fechas y cuentas determinan los saldos. Los demás filtros seleccionan la actividad, no cambian el saldo real.</SheetDescription></SheetHeader>
    <div className="space-y-7 px-5 py-5">
      <fieldset className="space-y-3"><legend className="text-sm font-medium">Periodo</legend><div className="grid grid-cols-2 gap-2">{[...PERIODS, { value: "custom" as const, label: "Rango" }, { value: "months" as const, label: "Meses sueltos" }].map((item) => <button key={item.value} type="button" aria-pressed={draft.preset === item.value} onClick={() => setDraft((current) => normalizeReportQuery({ ...current, preset: item.value, ...reportRangeForPreset(item.value, new Date(`${currentMonth}T12:00:00Z`)), selectedMonths: item.value === "months" ? current.selectedMonths : [] }))} className={cn("min-h-11 rounded-xl border px-3 text-sm text-muted-foreground", draft.preset === item.value && "border-primary bg-primary/8 text-foreground")}>{item.label}</button>)}</div></fieldset>
      {draft.preset === "custom" ? <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2"><DateField label="Desde" value={draft.startDate} onChange={(startDate) => setDraft((current) => ({ ...current, startDate }))} /><DateField label="Hasta" value={draft.endDate} onChange={(endDate) => setDraft((current) => ({ ...current, endDate }))} /></div> : null}
      {draft.preset === "months" ? <div className="space-y-3"><Label htmlFor="report-month">Meses específicos</Label><div className="grid gap-2 min-[380px]:grid-cols-[minmax(0,1fr)_auto]"><MonthControl id="report-month" value={monthInput} onValueChange={setMonthInput} /><Button type="button" variant="outline" onClick={() => { if (monthInput) { setDraft((current) => ({ ...current, selectedMonths: [...new Set([...current.selectedMonths, monthInput])] })); setMonthInput(""); } }}>Agregar</Button></div><div className="flex flex-wrap gap-2">{draft.selectedMonths.map((month) => <button type="button" key={month} aria-label={`Quitar ${formatMonth(month)}`} className="flex min-h-11 items-center gap-1 rounded-full bg-secondary px-3 text-xs" onClick={() => setDraft((current) => ({ ...current, selectedMonths: current.selectedMonths.filter((item) => item !== month) }))}>{formatMonth(month)}<X className="size-3" aria-hidden="true" /></button>)}</div></div> : null}
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2"><div className="space-y-2"><Label htmlFor="report-kind">Tipo</Label><SelectControl id="report-kind" value={draft.kind} onValueChange={(kind) => setDraft((current) => ({ ...current, kind: kind as ReportKindFilter, ...(kind === "income" || kind === "transfer" ? { groupKeys: [], categoryIds: [] } : {}), ...(kind === "expense" || kind === "transfer" ? { incomeTypeIds: [] } : {}) }))}><option value="all">Todos</option><option value="expense">Gastos</option><option value="income">Ingresos</option><option value="transfer">Transferencias</option></SelectControl></div><div className="space-y-2"><Label htmlFor="report-comparison">Comparar con</Label><SelectControl id="report-comparison" disabled={draft.preset === "months"} value={draft.comparison} onValueChange={(comparison) => setDraft((current) => ({ ...current, comparison: comparison as ReportQuery["comparison"] }))}><option value="previous">Periodo anterior</option><option value="year">Año anterior</option><option value="none">Sin comparación</option></SelectControl></div></div>

      {draft.kind !== "income" && draft.kind !== "transfer" ? <><FilterChecks title="Categorías principales" items={groupAllocations.filter((item) => !item.archived).map((item) => ({ id: item.group, label: item.name, color: item.color }))} selected={draft.groupKeys} onToggle={(id) => toggle("groupKeys", id)} />
      <FilterChecks title="Subcategorías" items={expenseCategories.filter((item) => !draft.groupKeys.length || draft.groupKeys.includes(item.group)).map((item) => ({ id: item.id, label: item.name, color: item.color }))} selected={draft.categoryIds} onToggle={(id) => toggle("categoryIds", id)} /></> : null}
      {draft.kind !== "expense" && draft.kind !== "transfer" ? <FilterChecks title="Tipos de ingreso" items={incomeTypes.map((item) => ({ id: item.id, label: item.name, color: item.color }))} selected={draft.incomeTypeIds} onToggle={(id) => toggle("incomeTypeIds", id)} /> : null}
      <FilterChecks title="Entidades" items={activeAccountEntities(accountEntities).filter((entity) => accounts.some((account) => account.entityId === entity.id)).map((entity) => ({ id: entity.id, label: entity.name, color: entity.color }))} selected={activeAccountEntities(accountEntities).filter((entity) => { const childIds = accounts.filter((account) => account.entityId === entity.id).map((account) => account.id); return childIds.length > 0 && childIds.every((id) => draft.accountIds.includes(id)); }).map((entity) => entity.id)} onToggle={toggleEntity} />
      <FilterChecks title="Cuentas" items={accounts.map((item) => ({ id: item.id, label: `${accountContextLabel(item, accountEntities)}${item.archived ? " · archivada" : ""}`, color: item.color }))} selected={draft.accountIds} onToggle={(id) => toggle("accountIds", id)} />
      {draft.preset === "months" ? <p className="text-xs leading-5 text-muted-foreground">Los meses elegidos se muestran por separado, sin introducir meses intermedios ni comparaciones continuas.</p> : null}
      <div className="space-y-2 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5"><Button className="h-12 w-full rounded-full" onClick={() => onApply(normalizeReportQuery(draft))} disabled={draft.preset === "months" && !draft.selectedMonths.length}>Aplicar filtros</Button><Button variant="ghost" className="h-11 w-full rounded-full" onClick={() => onApply(defaultReportQuery(new Date(`${currentMonth}T12:00:00Z`)))}>Restablecer</Button></div>
    </div>
  </>;
}

function FilterChecks({ title, items, selected, onToggle }: { title: string; items: Array<{ id: string; label: string; color: string }>; selected: string[]; onToggle: (id: string) => void }) { if (!items.length) return null; return <fieldset><legend className="mb-3 text-sm font-medium">{title}</legend><div className="grid gap-1 sm:grid-cols-2">{items.map((item) => <label key={item.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 text-sm hover:bg-secondary/55"><Checkbox className="mt-0.5" checked={selected.includes(item.id)} onCheckedChange={() => onToggle(item.id)} /><i className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="min-w-0 break-words leading-5">{item.label}</span></label>)}</div></fieldset>; }
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { const id = `report-${label.toLowerCase()}`; return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><DateControl id={id} value={value} onValueChange={onChange} /></div>; }

function ActiveReportFilters({ query, finance, onChange }: { query: ReportQuery; finance: ReturnType<typeof useFinance>; onChange: (query: ReportQuery) => void }) {
  const chips: Array<{ key: string; name: string; remove: () => void }> = [];
  const lists = ["groupKeys", "categoryIds", "incomeTypeIds", "accountIds"] as const;
  for (const field of lists) for (const id of query[field]) {
    const name = field === "groupKeys" ? finance.groupAllocations.find((item) => item.group === id)?.name
      : field === "accountIds" ? accountContextLabel(finance.accounts.find((item) => item.id === id), finance.accountEntities)
      : finance.categories.find((item) => item.id === id)?.name;
    chips.push({ key: `${field}:${id}`, name: name ?? id, remove: () => onChange({ ...query, [field]: query[field].filter((value) => value !== id) }) });
  }
  if (query.kind !== "all") chips.push({ key: "kind", name: { income: "Ingresos", expense: "Gastos", transfer: "Transferencias" }[query.kind], remove: () => onChange({ ...query, kind: "all" }) });
  if (query.search) chips.push({ key: "search", name: `Búsqueda: ${query.search}`, remove: () => onChange({ ...query, search: "" }) });
  return chips.length ? <div className="flex flex-wrap gap-2" aria-label="Filtros activos">{chips.map((chip) => <Button key={chip.key} variant="secondary" className="h-auto min-h-11 min-w-0 max-w-full rounded-full px-3 py-2 text-xs" onClick={chip.remove} aria-label={`Quitar filtro ${chip.name}`}><span className="min-w-0 truncate">{chip.name}</span><X className="size-3.5 shrink-0" /></Button>)}</div> : null;
}

function ReportSummary({ report, query, money, onInspect }: { report: DetailedFinanceReport; query: ReportQuery; money: Intl.NumberFormat; onInspect: (kind: ReportKindFilter) => void }) {
  const values: Array<{ label: string; value: number; detail: string; tone: FinancialTone; kind: ReportKindFilter }> = [
    { label: "Ingresos registrados", value: report.summary.income, detail: "Entradas nuevas; no incluye saldo inicial ni transferencias.", tone: availableTone(report.summary.income), kind: "income" },
    { label: "Gastos registrados", value: report.summary.expense, detail: "Compras y gastos; pagar tu tarjeta no suma un segundo gasto.", tone: expenseTone(report.summary.expense), kind: "expense" },
    { label: "Diferencia del periodo", value: report.summary.balance, detail: "Ingresos menos gastos. No es el saldo disponible de tus cuentas.", tone: availableTone(report.summary.balance), kind: "all" },
  ];
  const comparison = reportComparisonRange(query);
return <section className="py-7" aria-label="Resumen del periodo"><div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-8">{values.map((item) => <div key={item.label} className={cn("min-w-0", item.kind === "all" && "col-span-2 sm:col-span-1")}><p className="text-sm text-muted-foreground">{item.label}</p><p className={cn("mt-1 break-words text-2xl font-semibold tracking-tight tabular-nums xl:text-3xl", financialToneClass[item.tone])}>{money.format(item.value)}</p><p className={cn("mt-2 max-w-sm text-xs leading-5 text-muted-foreground", item.kind !== "all" && "max-sm:sr-only")}>{item.detail}</p>{report.comparison ? <p className="mt-2 text-xs">{comparisonLabel(item.value, item.kind === "income" ? report.comparison.income : item.kind === "expense" ? report.comparison.expense : report.comparison.balance)}</p> : null}<Button variant="link" className="mt-1 h-11 px-0 text-xs" onClick={() => onInspect(item.kind)}>{item.kind === "income" ? "Ver ingresos" : item.kind === "expense" ? "Ver gastos" : "Ver todos"}<ArrowRight className="size-3.5" /></Button></div>)}</div>{comparison ? <p className="mt-3 text-xs text-muted-foreground">Comparación: {shortDate(comparison.startDate)} – {shortDate(comparison.endDate)}. Un mes en curso puede tener menos actividad registrada que uno cerrado.</p> : null}<details className="mt-3 rounded-xl bg-secondary/25 px-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Cómo se calculan estas cifras</summary><div className="space-y-2 pb-4 text-sm leading-6 text-muted-foreground"><p>{money.format(report.summary.income)} de ingresos − {money.format(report.summary.expense)} de gastos = {money.format(report.summary.balance)} de diferencia.</p><p>El saldo que ya tenías pertenece a tus cuentas, no es un ingreso del periodo. Transferencias y ajustes cambian saldos, pero no esta diferencia. Las compras con tarjeta cuentan una vez, en su fecha de compra.</p><p>Los totales usan {report.reportingCurrencyCode} con la tasa guardada en cada movimiento. No se recalculan con la TRM de hoy. Las programaciones pendientes no se incluyen.</p><p>Gasto diario promedio: {money.format(report.summary.averageDailyExpense)}, contando todos los días seleccionados, también los días sin gastos.</p></div></details></section>;
}

function CategoryBreakdown({ report, money, onInspect }: { report: DetailedFinanceReport; money: Intl.NumberFormat; onInspect: (kind: ReportKindFilter, categoryId?: string) => void }) {
  const groups = report.groups.filter((item) => item.expense > 0).toSorted((a, b) => b.expense - a.expense);
  return <section className="py-8"><SectionHeading title="En qué gastaste" description="Cada porcentaje es una parte del gasto real, no un presupuesto ni una distribución obligatoria." /><div className={cn("grid items-start gap-x-10 gap-y-5", groups.length > 1 && "lg:grid-cols-2")}>{groups.map((group) => {
    const share = report.summary.expense > 0 ? group.expense / report.summary.expense * 100 : 0;
    return <div key={group.group} className="min-w-0 rounded-2xl bg-secondary/22 px-4 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-medium">{group.name}</h3><p className="mt-1 text-xs text-muted-foreground">{formatPercent(share)} del gasto · {group.transactionCount} movimientos</p></div><p className="min-w-0 max-w-[55%] break-words text-right text-sm font-semibold tabular-nums">{money.format(group.expense)}</p></div><Progress className="mt-3" value={share} label={`Participación de ${group.name} en el gasto`} valueText={formatPercent(share)} /><details className="mt-2"><summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-primary">Ver subcategorías</summary><div className="space-y-1">{group.categories.filter((item) => item.expense > 0).toSorted((a, b) => b.expense - a.expense).map((item) => <button key={item.id} type="button" onClick={() => onInspect("expense", item.id)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-2 text-left text-sm hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0 break-words">{item.name}<span className="block text-xs text-muted-foreground">Ver {item.transactionCount} movimientos</span></span><span className="max-w-[55%] break-words text-right font-medium tabular-nums">{money.format(item.expense)}</span></button>)}</div></details></div>;
  })}</div></section>;
}

function AccountReport({ report, query }: { report: DetailedFinanceReport; query: ReportQuery }) {
  if (!report.accounts.length) return null;
  const scoped = query.search || query.kind !== "all" || query.categoryIds.length || query.groupKeys.length || query.incomeTypeIds.length;
  return <section className="py-8"><SectionHeading title="Cómo quedaron tus cuentas" description="Saldos registrados al inicio y al cierre, incluidos el dinero anterior, transferencias y ajustes. Cada cuenta conserva su moneda." /><p className="mb-5 text-xs leading-5 text-muted-foreground">{scoped ? "Los filtros de actividad no cambian estos saldos: aquí se consideran todos los movimientos de cada cuenta entre las fechas, no solo los encontrados." : "Apertura + variación completa del libro = cierre. No es una consulta del saldo bancario en vivo."}{query.preset === "months" ? " Los saldos abarcan desde el primer mes hasta el último, incluidos los meses intermedios." : ""}</p><div className={cn("grid items-start gap-x-10 gap-y-4", report.accounts.length > 1 && "lg:grid-cols-2")}>{report.accounts.map((account) => {
    const money = currencyFormatter(account.currencyCode), foreign = account.currencyCode !== report.reportingCurrencyCode;
    return <div key={account.id} className="min-w-0 rounded-2xl bg-secondary/22 px-4 py-4"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary"><FinanceIcon name={account.icon || "wallet-cards"} className="size-5" /></span><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-medium">{account.name}</h3><p className="mt-1 text-xs text-muted-foreground">{account.entityName ? `${account.entityName} · ` : ""}{account.currencyCode}{account.archived ? " · Archivada" : ""}</p></div></div><dl className="mt-4 space-y-3 text-sm">{[["Al empezar", account.nativeOpeningBalance], ["Variación registrada", account.nativeNetFlow], ["Al terminar", account.nativeClosingBalance]].map(([label, amount]) => <div key={String(label)} className="flex items-baseline justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className={cn("min-w-0 max-w-[60%] break-words text-right tabular-nums", label === "Al terminar" && "font-semibold")}>{money.format(Number(amount))}</dd></div>)}</dl>{foreign ? <p className="mt-3 break-words text-xs text-muted-foreground">Cierre contable histórico: {currencyFormatter(report.reportingCurrencyCode).format(account.reportingClosingBalance)}. No es una valoración a la TRM actual.</p> : null}</div>;
  })}</div></section>;
}

function CreditCardReport({ finance, report, query }: { finance: ReturnType<typeof useFinance>; report: DetailedFinanceReport; query: ReportQuery }) {
  const debts = report.accounts.filter((account) => (finance.creditCards.some((card) => card.accountId === account.id) || finance.liabilityOverview.items.some((item) => item.accountId === account.id)) && (account.nativeOpeningBalance || account.nativeClosingBalance || account.nativeExpense || account.nativeTransferIn));
  if (!debts.length) return null;
  const onlyAccountAndDate = !query.search && query.kind === "all" && !query.groupKeys.length && !query.categoryIds.length && !query.incomeTypeIds.length;
  return <section className="py-8"><SectionHeading title="Tarjetas y deudas en estas fechas" description="La deuda al cierre viene del libro completo de cada cuenta. Los gastos y pagos de abajo sí respetan los filtros de actividad; pagar capital no crea otro gasto." /><div className={cn("grid gap-x-10 gap-y-5", debts.length > 1 && "lg:grid-cols-2")}>{debts.map((account) => {
    const card = finance.creditCards.find((item) => item.accountId === account.id);
    const money = currencyFormatter(account.currencyCode);
    const statements = onlyAccountAndDate ? finance.creditCardStatements.filter((item) => item.accountId === account.id && reportDateMatchesQuery(item.cutoffOn, query) && creditCardStatementIsReconciled(item)) : [];
    return <div key={account.id} className="min-w-0 rounded-2xl bg-secondary/22 px-4 py-4"><h3 className="break-words font-medium">{account.name}</h3><p className="mt-1 text-xs text-muted-foreground">{account.currencyCode}{card ? ` · ${card.network.toUpperCase()}${card.lastFour ? ` · •••• ${card.lastFour}` : ""}` : " · Deuda"}</p><dl className="mt-4 space-y-3 text-sm">{[["Deuda al empezar", Math.max(0, -account.nativeOpeningBalance)], ["Gastos encontrados", account.nativeExpense], ["Pagos recibidos encontrados", account.nativeTransferIn], ["Deuda al terminar", Math.max(0, -account.nativeClosingBalance)]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 max-w-[55%] break-words text-right tabular-nums">{money.format(Number(value))}</dd></div>)}</dl>{statements.length ? <p className="mt-4 text-xs text-muted-foreground">Extractos conciliados con corte en estas fechas: {money.format(statements.reduce((sum, item) => sum + item.interest + item.fees, 0))} en intereses y cargos. Se informa aparte; no se suma de nuevo al gasto.</p> : null}</div>;
  })}</div></section>;
}

function RecentReportTransactions({ report, query, accounts, accountEntities, categories }: { report: DetailedFinanceReport; query: ReportQuery; accounts: ReturnType<typeof useFinance>["accounts"]; accountEntities: ReturnType<typeof useFinance>["accountEntities"]; categories: ReturnType<typeof useFinance>["categories"] }) {
  const { listReportTransactions } = useFinance();
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<Record<number, typeof report.transactions>>({ 1: report.transactions.slice(0, 12) });
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const visible = pages[page] ?? [];
  async function changePage(next: number) {
    if (loading) return;
    if (pages[next]) { setPage(next); return; }
    const last = pages[page]?.at(-1);
    if (!last || next !== page + 1) return;
    setLoading(true); setPageError("");
    try {
      const result = await listReportTransactions(query, { occurredOn: last.occurredOn, createdAt: last.createdAt, id: last.id });
      setPages((current) => ({ ...current, [next]: result.items })); setPage(next);
    } catch (error) { setPageError(error instanceof Error ? error.message : "No pudimos cargar esta página. Inténtalo de nuevo."); }
    finally { setLoading(false); }
  }
  const params = serializeReportQuery(query); params.delete("buscar");
  return <section id="report-movements" className="scroll-mt-24 py-8"><SectionHeading title="Movimientos que explican el reporte" description={`${report.summary.transactionCount} movimientos con estos filtros. Abre uno para comprobarlo; usa las flechas para recorrer todo el resultado.`} /><div className="space-y-1">{visible.map((transaction) => {
    const account = accounts.find((item) => item.id === transaction.accountId), category = categories.find((item) => item.id === transaction.categoryId);
    const nativeCurrency = transaction.nativeCurrencyCode ?? account?.currencyCode ?? report.reportingCurrencyCode;
    const detail = new URLSearchParams(params); detail.set("overlay", "movement"); detail.set("transaction", transaction.id); detail.set("mode", "detail");
    const anticipated = transaction.recurringOccurrenceId && transaction.createdAt.slice(0, 10) < transaction.occurredOn;
    return <Link key={transaction.id} scroll={false} href={`/reportes?${detail}`} className="grid min-h-20 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-3 rounded-xl px-2 py-3 hover:bg-secondary/35 focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0"><span className="block break-words text-sm font-medium">{transaction.merchant || transaction.description}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{shortDate(transaction.occurredOn)} · {accountContextLabel(account, accountEntities)} · {category?.name ?? (transaction.kind.startsWith("transfer") ? "Transferencia" : "Ajuste")}</span>{transaction.recurringOccurrenceId ? <span className="mt-1 block text-xs text-warning">{anticipated ? "Registrado por anticipado" : "Desde una programación"}</span> : null}</span><span className="max-w-40 break-words text-right"><span className={cn("block text-sm font-medium tabular-nums", transaction.kind === "income" ? "text-positive" : transaction.kind === "expense" ? "text-destructive" : "text-info")}>{transaction.kind === "income" ? "+" : transaction.kind === "expense" ? "−" : ""}{currencyFormatter(nativeCurrency).format(transaction.amount)}</span>{nativeCurrency !== report.reportingCurrencyCode ? <span className="mt-1 block text-xs text-muted-foreground">{currencyFormatter(report.reportingCurrencyCode).format(transactionReportingAmount(transaction))} contables</span> : null}<span className="mt-1 block text-xs text-primary">Ver detalle</span></span></Link>;
  })}</div>{pageError ? <p className="mt-3 text-sm text-destructive" role="alert">{pageError}</p> : null}<fieldset disabled={loading} aria-busy={loading}><PaginationControls page={page} pageCount={Math.ceil(report.summary.transactionCount / 12)} total={report.summary.transactionCount} label="movimientos del reporte" onPageChange={(next) => void changePage(next)} /></fieldset>{loading ? <p className="mt-2 text-xs text-muted-foreground" role="status">Cargando movimientos…</p> : null}</section>;
}

function TargetReport({ report, money }: { report: DetailedFinanceReport; money: Intl.NumberFormat }) {
  if (!report.targetActivity?.length) return null;
  return <section className="py-8"><SectionHeading title="Aportes y retiros de tus metas" description="Actividad de estas fechas, no el avance acumulado actual. Los registros manuales se muestran aparte y no crean otro ingreso o gasto." /><div className={cn("grid gap-x-10 gap-y-4", report.targetActivity.length > 1 && "lg:grid-cols-2")}>{report.targetActivity.map((item) => <div key={item.id} className="min-w-0 rounded-2xl bg-secondary/22 px-4 py-4"><h3 className="break-words text-sm font-medium">{item.name}</h3><dl className="mt-3 space-y-2 text-sm">{[["Aportes vinculados", item.advanced], ["Retiros vinculados", item.reversed], ...(item.manualNet ? [["Ajuste manual neto", item.manualNet]] : [])].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="max-w-[55%] break-words text-right tabular-nums">{money.format(Number(amount))}</dd></div>)}</dl></div>)}</div></section>;
}

function ExactSeriesData({ report, money }: { report: DetailedFinanceReport; money: Intl.NumberFormat }) { return <details className="mt-5 min-w-0 w-full max-w-full overflow-hidden rounded-2xl bg-secondary/28 px-3 sm:px-4"><summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium text-primary focus-visible:text-foreground focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4">Ver datos exactos del gráfico</summary><div className="divide-y sm:hidden">{report.series.map((item) => <div key={item.period} className="min-w-0 py-3"><p className="text-sm font-medium">{formatDateBucket(item.period, report.granularity)}</p><dl className="mt-2 grid min-w-0 grid-cols-1 gap-2 text-xs min-[360px]:grid-cols-3"><div className="min-w-0"><dt className="text-muted-foreground">Ingresos</dt><dd className="mt-1 break-words tabular-nums">{money.format(item.income)}</dd></div><div className="min-w-0"><dt className="text-muted-foreground">Gastos</dt><dd className="mt-1 break-words tabular-nums">{money.format(item.expense)}</dd></div><div className="min-w-0 min-[360px]:text-right"><dt className="text-muted-foreground">Diferencia</dt><dd className="mt-1 break-words tabular-nums">{money.format(item.balance)}</dd></div></dl></div>)}</div><div className="hidden max-w-full overflow-x-auto overscroll-x-contain sm:block"><table className="w-full min-w-[520px] border-collapse text-sm"><caption className="sr-only">Ingresos, gastos y diferencia exactos de cada periodo</caption><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 font-normal">Periodo</th><th className="px-3 py-2 text-right font-normal">Ingresos</th><th className="px-3 py-2 text-right font-normal">Gastos</th><th className="py-2 text-right font-normal">Diferencia</th></tr></thead><tbody>{report.series.map((item) => <tr key={item.period} className="border-b last:border-0"><th scope="row" className="py-2 text-left font-medium">{formatDateBucket(item.period, report.granularity)}</th><td className="px-3 py-2 text-right tabular-nums">{money.format(item.income)}</td><td className="px-3 py-2 text-right tabular-nums">{money.format(item.expense)}</td><td className="py-2 text-right tabular-nums">{money.format(item.balance)}</td></tr>)}</tbody></table></div></details>; }
function ExactWeekdayData({ report, money }: { report: DetailedFinanceReport; money: Intl.NumberFormat }) { const names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]; return <ExactDataDisclosure label="Ver valores exactos por día">{report.weekdays.map((item) => <div key={item.weekday} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{names[item.weekday - 1] ?? `Día ${item.weekday}`}</span><span className="font-medium tabular-nums">{money.format(item.expense)}</span></div>)}</ExactDataDisclosure>; }
function ExactDataDisclosure({ label, children }: { label: string; children: React.ReactNode }) { return <details className="mt-4 rounded-2xl bg-secondary/28 px-3 sm:px-4"><summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium text-primary focus-visible:text-foreground focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4">{label}</summary><div className="divide-y">{children}</div></details>; }
function LegendList({ items, empty }: { items: Array<{ id: string; color: string; name: string; value: string; detail: string }>; empty: string }) { return items.length ? <div className="divide-y">{items.map((item) => <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3"><i className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} /><p className="truncate text-sm">{item.name}</p><div className="text-right"><p className="text-sm font-medium tabular-nums">{item.value}</p><p className="text-xs text-muted-foreground">{item.detail}</p></div></div>)}</div> : <EmptyInline text={empty} />; }
function SectionHeading({ title, description }: { title: string; description: string }) { return <div className="mb-5"><h2 className="text-xl font-medium tracking-tight">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>; }
function EmptyInline({ text }: { text: string }) { return <p className="py-9 text-sm text-muted-foreground">{text}</p>; }
function ChartSkeleton() { return <Skeleton className="h-[280px] w-full rounded-2xl" />; }
function ReportLoading() { return <div className="grid gap-6 py-8" role="status" aria-live="polite" aria-label="Calculando reporte" aria-busy="true"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-[390px] rounded-2xl" /><div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div></div>; }
function ReportError({ message, onRetry }: { message: string; onRetry: () => void }) { return <section className="my-8 grid min-h-72 place-items-center rounded-2xl bg-destructive/8 px-6 text-center" role="alert"><div><p className="font-medium text-destructive">No pudimos actualizar el reporte</p><p className="mt-2 max-w-md text-sm text-muted-foreground">{message}</p><Button variant="outline" className="mt-5 rounded-full" onClick={onRetry}><RefreshCw className="size-4" />Reintentar</Button></div></section>; }
export function ReportConnectionRequired() { return <section className="mt-8 grid min-h-80 place-items-center rounded-2xl bg-secondary/25 px-6 py-12" role="status" aria-live="polite" data-report-connection-required><div className="max-w-sm text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-warning"><CloudOff className="size-5" /></span><p className="mt-5 text-xs font-medium text-warning">Historial protegido</p><h2 className="mt-2 text-xl font-semibold tracking-[-.03em]">Conéctate para cargar el reporte completo</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">La copia cifrada de este dispositivo puede ser parcial. No mostramos cifras incompletas como si fueran el total.</p></div></section>; }
function comparisonLabel(current: number, previous?: number) { if (previous === undefined) return "Sin comparación"; if (previous === 0) return current === 0 ? "Sin cambios" : "Nuevo en este periodo"; const change = (current - previous) / Math.abs(previous); return `${change > 0 ? "+" : ""}${new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 }).format(change)} respecto al periodo comparado`; }
function formatPercent(value: number) { return new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 }).format(value / 100); }
function formatMonth(value: string) { return new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`)).replace(" de ", " "); }
function formatDateBucket(value: string, granularity: DetailedFinanceReport["granularity"]) { return new Intl.DateTimeFormat("es-CO", granularity === "month" ? { month: "long", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replace(" de ", " "); }
function shortDate(value: string) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replace(" de ", " "); }
