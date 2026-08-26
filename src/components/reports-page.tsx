"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, CalendarRange, CloudOff, Download, FileSpreadsheet, Landmark, RefreshCw, Search, SlidersHorizontal, TrendingUp, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { DateControl, MonthControl, SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { currencyFormatter } from "@/lib/finance/calculations";
import { accountContextLabel, activeAccountEntities } from "@/lib/finance/account-entities";
import { downloadBlob } from "@/lib/download";
import { reportRequiresConnection } from "@/lib/finance/report-coverage";
import { defaultReportQuery, normalizeReportQuery, parseReportQuery, reportPeriodLabel, reportQueryKey, reportRangeForPreset, serializeReportQuery } from "@/lib/finance/report-query";
import { createReportWorkbook, reportWorkbookFilename } from "@/lib/finance/report-workbook";
import { availableTone, expenseTone, financialToneClass, type FinancialTone } from "@/lib/finance/financial-status";
import { financialTargetProgress } from "@/lib/finance/financial-targets";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import type { DetailedFinanceReport, ReportKindFilter, ReportPreset, ReportQuery } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const CashflowReportChart = dynamic(() => import("@/components/report-charts").then((m) => m.CashflowReportChart), { ssr: false, loading: ChartSkeleton });
const GroupCompositionChart = dynamic(() => import("@/components/report-charts").then((m) => m.GroupCompositionChart), { ssr: false, loading: ChartSkeleton });
const BudgetReportChart = dynamic(() => import("@/components/report-charts").then((m) => m.BudgetReportChart), { ssr: false, loading: ChartSkeleton });
const IncomeReportChart = dynamic(() => import("@/components/report-charts").then((m) => m.IncomeReportChart), { ssr: false, loading: ChartSkeleton });
const WeekdayReportChart = dynamic(() => import("@/components/report-charts").then((m) => m.WeekdayReportChart), { ssr: false, loading: ChartSkeleton });
const PERIODS: Array<{ value: ReportPreset; label: string }> = [{ value: "month", label: "Este mes" }, { value: "6m", label: "6 meses" }, { value: "12m", label: "1 año" }, { value: "24m", label: "2 años" }];

export function ReportsPage() {
  const finance = useFinance();
  const { profile, accountEntities, accounts, categories, online, pendingCount, syncing, getDetailedFinanceReport, exportReportTransactions, syncNow } = finance;
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(() => parseReportQuery(new URLSearchParams(searchParams.toString())), [searchParams]);
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
    if (offlineGuard) return;
    let active = true;
    void getDetailedFinanceReport(query)
      .then((report) => { if (active) setResult({ key: requestKey, report, error: null }); })
      .catch((error: unknown) => { if (active) setResult({ key: requestKey, report: null, error: error instanceof Error ? error.message : "No pudimos calcular el reporte." }); });
    return () => { active = false; };
  }, [getDetailedFinanceReport, offlineGuard, query, requestKey]);

  useEffect(() => {
    const refresh = () => setRefreshToken((value) => value + 1);
    window.addEventListener("moneva:transactions-changed", refresh);
    return () => window.removeEventListener("moneva:transactions-changed", refresh);
  }, []);

  useEffect(() => {
    const syncFromHistory = () => {
      const active = new URL(window.location.href).searchParams.get("panel") === "report-filters";
      if (!active) filterHistoryOwned.current = false;
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
  const applyQuery = (next: ReportQuery) => router.push(`/reportes?${serializeReportQuery(next).toString()}`, { scroll: false });
  const applyPreset = (preset: ReportPreset) => applyQuery(normalizeReportQuery({ ...query, preset, ...reportRangeForPreset(preset), selectedMonths: [] }));

  function changeFilterOpen(next: boolean) {
    if (next) {
      const url = new URL(window.location.href);
      if (url.searchParams.get("panel") !== "report-filters") {
        url.searchParams.set("panel", "report-filters");
        window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
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
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function applySheetQuery(next: ReportQuery) {
    filterHistoryOwned.current = false;
    setFilterOpen(false);
    router.replace(`/reportes?${serializeReportQuery(next).toString()}`, { scroll: false });
  }

  async function exportXlsx() {
    if (!exportReport || !profile) return;
    setExporting(true);
    try {
      const transactions = await exportReportTransactions(query);
      const blob = await createReportWorkbook({ report: exportReport, query, transactions, accounts, accountEntities: finance.accountEntities, categories, profile, financialTargets: finance.financialTargets, financialTargetEntries: finance.financialTargetEntries, financialTargetDebts: finance.financialTargetDebts });
      downloadBlob(blob, reportWorkbookFilename(query));
      toast.success(`Excel creado con ${transactions.length} movimientos y los filtros actuales.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No pudimos crear el Excel."); }
    finally { setExporting(false); }
  }

  return <>
    <PageHeader eyebrow="Análisis financiero" title="Reportes" description="Explora tendencias, presupuesto y movimientos con una misma selección. Cada cifra respeta los filtros visibles." action={<Button className="h-11 rounded-full px-5 max-sm:hidden" onClick={exportXlsx} disabled={exporting || !exportReport || offlineGuard || refreshing} aria-busy={exporting}><FileSpreadsheet className="size-4" />{exporting ? "Creando Excel…" : "Exportar a Excel"}</Button>} />

    <section className="app-sticky-below-header sticky z-20 -mx-4 border-y bg-background/96 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:rounded-[1.25rem] sm:border sm:bg-secondary/18 sm:p-2 sm:backdrop-blur-none" aria-label="Periodo y filtros del reporte">
      <div className="flex min-w-0 items-center gap-2 sm:flex-wrap">
        <div className="hidden shrink-0 rounded-full bg-secondary/75 p-1 sm:flex" role="group" aria-label="Periodo rápido">{PERIODS.map((item) => <button key={item.value} type="button" aria-pressed={query.preset === item.value} onClick={() => applyPreset(item.value)} className={cn("coarse-target min-h-9 rounded-full px-3 text-xs font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", query.preset === item.value && "bg-background text-foreground shadow-sm")}>{item.label}</button>)}</div>
        <Button variant={query.preset === "custom" || query.preset === "months" ? "secondary" : "ghost"} className="h-11 min-w-0 flex-1 justify-start rounded-full px-4 sm:h-9 sm:flex-none" onClick={() => changeFilterOpen(true)} title={mobilePeriodLabel}><CalendarRange className="size-4 shrink-0" /><span className="truncate sm:hidden">{mobilePeriodLabel}</span><span className="hidden sm:inline">{query.preset === "custom" || query.preset === "months" ? reportPeriodLabel(query) : "Otro periodo"}</span></Button>
        <div className="hidden h-6 w-px bg-border sm:block" />
        <Sheet open={filterOpen} onOpenChange={changeFilterOpen}><SheetTrigger asChild><Button variant="outline" className="h-11 shrink-0 rounded-full px-4 sm:h-9"><SlidersHorizontal className="size-4" />Filtros{filterCount ? <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{filterCount}</span> : null}</Button></SheetTrigger><SheetContent side="right" onOpenAutoFocus={(event) => { event.preventDefault(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-slot="sheet-content"][data-state="open"] [data-slot="sheet-close"]')?.focus()); }} className="mobile-scroll h-dvh w-full gap-0 overflow-y-auto overscroll-y-contain p-0 sm:max-w-md"><ReportFilters query={query} onApply={applySheetQuery} /></SheetContent></Sheet>
        <p className="ml-auto hidden px-2 text-xs text-muted-foreground lg:block">{reportPeriodLabel(query)}</p>
      </div>
    </section>

    {offlineGuard ? <ReportConnectionRequired /> : null}
    {!offlineGuard && pendingCount > 0 ? <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-warning/8 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between"><p>Hay cambios pendientes. Sincronízalos para que este reporte sea exacto.</p><Button variant="outline" size="sm" className="rounded-full" disabled={syncing} onClick={async () => { await syncNow(); setRefreshToken((value) => value + 1); }}><RefreshCw className={cn("size-4", syncing && "animate-spin")} />Sincronizar</Button></div> : null}
    {!offlineGuard && loading && !report ? <ReportLoading /> : null}
    {!offlineGuard && activeResult?.error ? <ReportError message={activeResult.error} onRetry={() => setRefreshToken((value) => value + 1)} /> : null}

    {!offlineGuard && refreshing ? <p className="mt-4 flex min-h-8 items-center gap-2 text-xs font-medium text-muted-foreground" role="status" aria-live="polite"><RefreshCw className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Actualizando el reporte sin ocultar los datos anteriores…</p> : null}
    {!offlineGuard && report ? <div className={cn("min-w-0 transition-opacity duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] motion-reduce:duration-[var(--motion-duration-reduced)]", refreshing && "pointer-events-none opacity-65")} aria-busy={refreshing}>
      <ReportSummary report={report} money={money} />
      <section className="grid min-w-0 gap-10 border-b py-9 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.55fr)] xl:gap-14"><div className="min-w-0"><SectionHeading eyebrow="Evolución" title="Flujo de caja" description="Ingresos, gastos y balance neto a través del periodo." />{report.series.some((item) => item.income || item.expense) ? <><CashflowReportChart report={report} compactMoney={compactMoney} /><ExactSeriesData report={report} money={money} /></> : <ChartEmpty text="No hay ingresos ni gastos con estos filtros." />}</div><ReportInsights report={report} money={money} /></section>
      <section className="grid min-w-0 gap-10 border-b py-9 lg:grid-cols-2 lg:gap-14"><div className="min-w-0"><SectionHeading eyebrow="Destino del dinero" title="Gasto por categoría principal" description="Compara en qué partes del plan se concentró el gasto." />{report.groups.some((item) => item.expense > 0) ? <><GroupCompositionChart report={report} compactMoney={compactMoney} /><ExactCategoryData report={report} money={money} /></> : <ChartEmpty text="No hay gastos que distribuir en esta selección." />}</div><div className="min-w-0 lg:border-l lg:pl-14"><SectionHeading eyebrow="Control" title="Presupuesto frente a gasto" description="El límite y el consumo real de cada categoría principal." />{report.groups.some((item) => item.budget > 0 || item.expense > 0) ? <BudgetReportChart report={report} compactMoney={compactMoney} /> : <ChartEmpty text="Configura presupuestos para compararlos aquí." />}</div></section>
      <CategoryBreakdown report={report} money={money} />
      <section className="grid min-w-0 gap-10 border-b py-9 lg:grid-cols-2 lg:gap-14"><div className="min-w-0"><SectionHeading eyebrow="Origen" title="Tipos de ingreso" description="Cómo se compusieron las entradas del periodo." />{report.incomeTypes.some((item) => item.income > 0) ? <div className="grid items-center sm:grid-cols-[minmax(180px,.8fr)_minmax(0,1fr)]"><IncomeReportChart report={report} compactMoney={compactMoney} /><LegendList items={report.incomeTypes.map((item) => ({ id: item.id, color: item.color, name: item.name, value: money.format(item.income), detail: `${Math.round(item.percent)}%` }))} empty="No hay ingresos en esta selección." /></div> : <ChartEmpty text="No hay ingresos que distribuir en esta selección." />}</div><div className="min-w-0 lg:border-l lg:pl-14"><SectionHeading eyebrow="Comportamiento" title="Gasto por día de la semana" description="Detecta qué días concentran más salidas." />{report.weekdays.some((item) => item.expense > 0) ? <><WeekdayReportChart report={report} compactMoney={compactMoney} /><ExactWeekdayData report={report} money={money} /></> : <ChartEmpty text="No hay gastos suficientes para detectar un patrón semanal." />}</div></section>
      <AccountReport report={report} />
      <TargetReport finance={finance} money={money} />
      <RecentReportTransactions report={report} accounts={accounts} accountEntities={accountEntities} categories={categories} />
      <div className="flex flex-col items-stretch justify-between gap-3 py-8 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">El Excel incluirá resumen, flujo, categorías, ingresos, cuentas, comercios, días, metas, movimientos y la configuración exacta del filtro.</p><Button className="h-12 rounded-full px-5 sm:h-11" onClick={exportXlsx} disabled={exporting || refreshing || !exportReport} aria-busy={exporting}><Download className="size-4" />{exporting ? "Creando Excel…" : "Exportar a Excel"}</Button></div>
    </div> : null}
  </>;
}

function ReportFilters({ query, onApply }: { query: ReportQuery; onApply: (query: ReportQuery) => void }) {
  const { accountEntities, accounts, categories, groupAllocations } = useFinance();
  const [draft, setDraft] = useState(query);
  const [monthInput, setMonthInput] = useState("");
  const expenseCategories = categories.filter((item) => item.kind === "expense" && !item.archived);
  const incomeTypes = categories.filter((item) => item.kind === "income" && !item.archived);
  function toggle(key: "groupKeys" | "categoryIds" | "incomeTypeIds" | "accountIds", value: string) { setDraft((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] })); }
  function toggleEntity(entityId: string) {
    const childIds = accounts.filter((account) => account.entityId === entityId).map((account) => account.id);
    setDraft((current) => {
      const allSelected = childIds.length > 0 && childIds.every((id) => current.accountIds.includes(id));
      return { ...current, accountIds: allSelected ? current.accountIds.filter((id) => !childIds.includes(id)) : [...new Set([...current.accountIds, ...childIds])] };
    });
  }
  return <>
    <SheetHeader className="safe-dialog-top border-b px-5 pb-4 pt-5"><SheetTitle>Configurar reporte</SheetTitle><SheetDescription>El periodo y estos filtros controlan toda la página y el Excel.</SheetDescription></SheetHeader>
    <div className="space-y-7 px-5 py-5">
      <fieldset className="space-y-3"><legend className="text-sm font-medium">Periodo</legend><div className="grid grid-cols-2 gap-2">{[...PERIODS, { value: "custom" as const, label: "Rango" }, { value: "months" as const, label: "Meses sueltos" }].map((item) => <button key={item.value} type="button" aria-pressed={draft.preset === item.value} onClick={() => setDraft((current) => normalizeReportQuery({ ...current, preset: item.value, ...reportRangeForPreset(item.value), selectedMonths: item.value === "months" ? current.selectedMonths : [] }))} className={cn("min-h-11 rounded-xl border px-3 text-sm text-muted-foreground", draft.preset === item.value && "border-primary bg-primary/8 text-foreground")}>{item.label}</button>)}</div></fieldset>
      {draft.preset === "custom" ? <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2"><DateField label="Desde" value={draft.startDate} onChange={(startDate) => setDraft((current) => ({ ...current, startDate }))} /><DateField label="Hasta" value={draft.endDate} onChange={(endDate) => setDraft((current) => ({ ...current, endDate }))} /></div> : null}
      {draft.preset === "months" ? <div className="space-y-3"><Label htmlFor="report-month">Meses específicos</Label><div className="grid gap-2 min-[380px]:grid-cols-[minmax(0,1fr)_auto]"><MonthControl id="report-month" value={monthInput} onValueChange={setMonthInput} /><Button type="button" variant="outline" onClick={() => { if (monthInput) { setDraft((current) => ({ ...current, selectedMonths: [...new Set([...current.selectedMonths, monthInput])] })); setMonthInput(""); } }}>Agregar</Button></div><div className="flex flex-wrap gap-2">{draft.selectedMonths.map((month) => <button type="button" key={month} aria-label={`Quitar ${formatMonth(month)}`} className="flex min-h-11 items-center gap-1 rounded-full bg-secondary px-3 text-xs" onClick={() => setDraft((current) => ({ ...current, selectedMonths: current.selectedMonths.filter((item) => item !== month) }))}>{formatMonth(month)}<X className="size-3" aria-hidden="true" /></button>)}</div></div> : null}
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2"><div className="space-y-2"><Label htmlFor="report-kind">Tipo</Label><SelectControl id="report-kind" value={draft.kind} onValueChange={(kind) => setDraft((current) => ({ ...current, kind: kind as ReportKindFilter }))}><option value="all">Todos</option><option value="expense">Gastos</option><option value="income">Ingresos</option><option value="transfer">Transferencias</option></SelectControl></div><div className="space-y-2"><Label htmlFor="report-comparison">Comparar con</Label><SelectControl id="report-comparison" value={draft.comparison} onValueChange={(comparison) => setDraft((current) => ({ ...current, comparison: comparison as ReportQuery["comparison"] }))}><option value="previous">Periodo anterior</option><option value="year">Año anterior</option><option value="none">Sin comparación</option></SelectControl></div></div>
      <div className="space-y-2"><Label htmlFor="report-search">Buscar</Label><div className="relative"><Search className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" /><Input id="report-search" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} className="pl-10" placeholder="Comercio, concepto o nota" /></div></div>
      <FilterChecks title="Categorías principales" items={groupAllocations.filter((item) => !item.archived).map((item) => ({ id: item.group, label: item.name, color: item.color }))} selected={draft.groupKeys} onToggle={(id) => toggle("groupKeys", id)} />
      <FilterChecks title="Subcategorías" items={expenseCategories.filter((item) => !draft.groupKeys.length || draft.groupKeys.includes(item.group)).map((item) => ({ id: item.id, label: item.name, color: item.color }))} selected={draft.categoryIds} onToggle={(id) => toggle("categoryIds", id)} />
      <FilterChecks title="Tipos de ingreso" items={incomeTypes.map((item) => ({ id: item.id, label: item.name, color: item.color }))} selected={draft.incomeTypeIds} onToggle={(id) => toggle("incomeTypeIds", id)} />
      <FilterChecks title="Entidades" items={activeAccountEntities(accountEntities).filter((entity) => accounts.some((account) => account.entityId === entity.id)).map((entity) => ({ id: entity.id, label: entity.name, color: entity.color }))} selected={activeAccountEntities(accountEntities).filter((entity) => { const childIds = accounts.filter((account) => account.entityId === entity.id).map((account) => account.id); return childIds.length > 0 && childIds.every((id) => draft.accountIds.includes(id)); }).map((entity) => entity.id)} onToggle={toggleEntity} />
      <FilterChecks title="Cuentas" items={accounts.map((item) => ({ id: item.id, label: `${accountContextLabel(item, accountEntities)}${item.archived ? " · archivada" : ""}`, color: item.color }))} selected={draft.accountIds} onToggle={(id) => toggle("accountIds", id)} />
      <div className="space-y-2 border-t pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5"><Button className="h-12 w-full rounded-full" onClick={() => onApply(normalizeReportQuery(draft))} disabled={draft.preset === "months" && !draft.selectedMonths.length}>Aplicar filtros</Button><Button variant="ghost" className="h-11 w-full rounded-full" onClick={() => onApply(defaultReportQuery())}>Restablecer</Button></div>
    </div>
  </>;
}

function FilterChecks({ title, items, selected, onToggle }: { title: string; items: Array<{ id: string; label: string; color: string }>; selected: string[]; onToggle: (id: string) => void }) { if (!items.length) return null; return <fieldset><legend className="mb-3 text-sm font-medium">{title}</legend><div className="grid gap-1 sm:grid-cols-2">{items.map((item) => <label key={item.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 text-sm hover:bg-secondary/55"><Checkbox className="mt-0.5" checked={selected.includes(item.id)} onCheckedChange={() => onToggle(item.id)} /><i className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="min-w-0 break-words leading-5">{item.label}</span></label>)}</div></fieldset>; }
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { const id = `report-${label.toLowerCase()}`; return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><DateControl id={id} value={value} onValueChange={onChange} /></div>; }

function ReportSummary({ report, money }: { report: DetailedFinanceReport; money: Intl.NumberFormat }) {
  const values: Array<{ label: string; value: string; detail: string; tone: FinancialTone; icon: typeof WalletCards }> = [
    { label: "Ingresos", value: money.format(report.summary.income), detail: comparisonLabel(report.summary.income, report.comparison?.income), tone: availableTone(report.summary.income), icon: ArrowUpRight },
    { label: "Gastos", value: money.format(report.summary.expense), detail: comparisonLabel(report.summary.expense, report.comparison?.expense), tone: expenseTone(report.summary.expense), icon: ArrowDownRight },
    { label: "Balance", value: money.format(report.summary.balance), detail: `${formatPercent(report.summary.savingsRate)} de los ingresos`, tone: availableTone(report.summary.balance), icon: Activity },
    { label: "Presupuesto disponible", value: money.format(report.summary.budgetVariance), detail: report.summary.budget > 0 ? `${formatPercent(report.summary.budgetUsage)} utilizado` : "Sin límites en el periodo", tone: availableTone(report.summary.budgetVariance), icon: WalletCards },
  ];
  return <section className="grid gap-0 border-b py-7 sm:grid-cols-2 xl:grid-cols-4">{values.map((item, index) => <div key={item.label} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b py-5 last:border-b-0 sm:px-5 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:first:pl-0 xl:last:border-r-0", index === 1 && "sm:border-r-0 xl:border-r", index > 1 && "sm:border-b-0")}><span className={cn("mt-0.5 grid size-9 place-items-center rounded-xl bg-secondary", financialToneClass[item.tone])}><item.icon className="size-4" /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">{item.label}</p><p className={cn("mt-1 break-words text-xl font-medium tracking-[-.04em] tabular-nums sm:text-2xl", financialToneClass[item.tone])}>{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div></div>)}</section>;
}

function ReportInsights({ report, money }: { report: DetailedFinanceReport; money: Intl.NumberFormat }) {
  const hasFlow = report.series.some((item) => item.income > 0 || item.expense > 0);
  const best = hasFlow ? [...report.series].sort((a, b) => b.balance - a.balance)[0] : undefined; const merchant = report.merchants[0]; const weekday = [...report.weekdays].sort((a, b) => b.expense - a.expense)[0]; const weekdays = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const insights = [{ icon: TrendingUp, label: "Mejor periodo", value: best ? formatDateBucket(best.period, report.granularity) : "Sin actividad", detail: best ? `${money.format(best.balance)} de balance` : "Aparecerá con tus movimientos" }, { icon: Landmark, label: "Mayor destino", value: merchant?.name ?? "Sin gastos", detail: merchant ? `${money.format(merchant.expense)} en ${merchant.transactionCount} movimientos` : "No hay comercios en el periodo" }, { icon: CalendarRange, label: "Día con más gasto", value: weekday?.expense ? weekdays[weekday.weekday - 1] : "Sin patrón todavía", detail: weekday?.expense ? money.format(weekday.expense) : "Se calcula con el historial elegido" }];
  return <aside className="min-w-0 xl:border-l xl:pl-12"><SectionHeading eyebrow="Lecturas útiles" title="Lo que cambió" description="Señales rápidas del periodo seleccionado." /><div className="mt-4 divide-y">{insights.map((item) => <div key={item.label} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><item.icon className="size-4" /></span><div><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-lg font-medium">{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div></div>)}</div></aside>;
}

function CategoryBreakdown({ report, money }: { report: DetailedFinanceReport; money: Intl.NumberFormat }) {
  const rows = report.groups.flatMap((group) => group.categories.map((category) => ({ ...category, groupName: group.name })));
  return <section className="border-b py-9"><SectionHeading eyebrow="Detalle del plan" title="Categorías y presupuesto" description="Importe, límite y estado de cada subcategoría." /><div className="mt-5 divide-y">{rows.length ? rows.map((item) => <div key={item.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,.8fr)_130px_130px]"><div className="flex min-w-0 items-center gap-3"><i className="size-3 rounded-full" style={{ backgroundColor: item.color }} /><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="truncate text-xs text-muted-foreground">{item.groupName} · {item.transactionCount} mov.</p></div></div><div className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-muted sm:col-span-1 sm:row-auto"><span className={cn("block h-full rounded-full", item.usage > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, item.usage)}%` }} /></div><div className="text-right"><p className="text-sm font-medium tabular-nums">{money.format(item.expense)}</p><p className="text-xs text-muted-foreground">de {money.format(item.budget)}</p></div><p className={cn("hidden text-right text-sm tabular-nums sm:block", financialToneClass[availableTone(item.variance)])}>{item.budget > 0 ? money.format(item.variance) : "Sin límite"}</p></div>) : <EmptyInline text="No hay subcategorías con datos en esta selección." />}</div></section>;
}

function AccountReport({ report }: { report: DetailedFinanceReport }) {
  const reportingMoney = currencyFormatter(report.reportingCurrencyCode);
  return <section className="border-b py-9"><SectionHeading eyebrow="Patrimonio" title="Flujo por entidad y cuenta" description={`Cada saldo nativo es exacto. Los equivalentes históricos están expresados en ${report.reportingCurrencyCode} con la tasa guardada en cada movimiento.`} /><div className="mt-5 divide-y border-y">{report.entities.map((entity) => { const accounts = report.accounts.filter((account) => (account.entityId ?? "ungrouped") === entity.key); return <div key={entity.key} className="py-5"><div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"><span className="grid size-11 place-items-center rounded-xl" style={{ backgroundColor: `${entity.color}18`, color: entity.color }}><FinanceIcon name={entity.icon} className="size-5" /></span><div className="min-w-0"><h3 className="truncate text-sm font-medium">{entity.name}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{entity.nativeTotals.map((item) => currencyFormatter(item.currencyCode).format(item.closingBalance)).join(" · ")} · {entity.accountCount} {entity.accountCount === 1 ? "cuenta" : "cuentas"}</p></div><div className="text-right"><p className="text-sm font-medium tabular-nums">≈ {reportingMoney.format(entity.reportingClosingBalance)}</p><p className={cn("text-[11px] tabular-nums", entity.reportingNetFlow === 0 ? "text-muted-foreground" : financialToneClass[availableTone(entity.reportingNetFlow)])}>{entity.reportingNetFlow > 0 ? "+" : ""}{reportingMoney.format(entity.reportingNetFlow)} en el periodo</p></div></div><div className="mt-3 divide-y rounded-2xl bg-secondary/22 px-3 sm:ml-14 sm:px-4">{accounts.map((account) => { const nativeMoney = currencyFormatter(account.currencyCode); const foreign = account.currencyCode !== report.reportingCurrencyCode; return <div key={account.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{account.name}{account.archived ? <span className="ml-2 text-[11px] font-normal text-muted-foreground">Archivada</span> : null}</p><p className={cn("mt-1 text-xs tabular-nums", account.nativeNetFlow === 0 ? "text-muted-foreground" : financialToneClass[availableTone(account.nativeNetFlow)])}>{account.nativeNetFlow > 0 ? "+" : ""}{nativeMoney.format(account.nativeNetFlow)} · antes {nativeMoney.format(account.nativeOpeningBalance)}</p></div><div className="text-right"><p className="text-sm font-medium tabular-nums">{nativeMoney.format(account.nativeClosingBalance)}</p>{foreign ? <p className="text-[11px] text-muted-foreground">≈ {reportingMoney.format(account.reportingClosingBalance)}</p> : null}</div></div>; })}</div></div>; })}</div></section>;
}

function RecentReportTransactions({ report, accounts, accountEntities, categories }: { report: DetailedFinanceReport; accounts: ReturnType<typeof useFinance>["accounts"]; accountEntities: ReturnType<typeof useFinance>["accountEntities"]; categories: ReturnType<typeof useFinance>["categories"] }) {
  const reportingMoney = currencyFormatter(report.reportingCurrencyCode); const visible = report.transactions.slice(0, 12); return <section className="border-b py-9"><SectionHeading eyebrow="Trazabilidad" title="Movimientos del reporte" description={`Los ${visible.length} movimientos más recientes que cumplen los filtros. El importe original se conserva sin reinterpretarlo.`} />{visible.length ? <div className="mt-5 divide-y">{visible.map((transaction) => { const category = categories.find((item) => item.id === transaction.categoryId); const account = accounts.find((item) => item.id === transaction.accountId); const positive = transaction.kind === "income"; const nativeCurrency = transaction.nativeCurrencyCode ?? account?.currencyCode ?? report.reportingCurrencyCode; const nativeMoney = currencyFormatter(nativeCurrency); const foreign = nativeCurrency !== report.reportingCurrencyCode; return <div key={transaction.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)_minmax(160px,.55fr)_auto]"><p className="hidden text-xs text-muted-foreground sm:block">{shortDate(transaction.occurredOn)}</p><div className="min-w-0"><p className="truncate text-sm font-medium">{transaction.merchant || transaction.description}</p><p className="truncate text-xs text-muted-foreground sm:hidden">{shortDate(transaction.occurredOn)} · {category?.name ?? (transaction.kind.startsWith("transfer") ? "Transferencia" : "Sin categoría")} · {accountContextLabel(account, accountEntities)}</p><p className="hidden truncate text-xs text-muted-foreground sm:block">{category?.name ?? (transaction.kind.startsWith("transfer") ? "Transferencia" : "Sin categoría")}</p></div><p className="hidden truncate text-xs text-muted-foreground sm:block">{accountContextLabel(account, accountEntities)}</p><div className="text-right"><p className={cn("text-sm font-medium tabular-nums", positive ? "text-positive" : transaction.kind === "expense" ? "text-destructive" : "text-foreground")}>{positive ? "+" : transaction.kind === "expense" ? "−" : ""}{nativeMoney.format(transaction.amount)}</p>{foreign ? <p className="text-[11px] text-muted-foreground">≈ {reportingMoney.format(transaction.baseAmount ?? transaction.amount)}</p> : null}</div></div>; })}</div> : <EmptyInline text="No hay movimientos para estos filtros." />}</section>;
}

function TargetReport({ finance, money }: { finance: ReturnType<typeof useFinance>; money: Intl.NumberFormat }) {
  const targets = finance.financialTargets.filter((target) => target.status !== "archived").sort((a, b) => a.priority - b.priority).slice(0, 8);
  return <section className="border-b py-9"><div className="flex items-end justify-between gap-4"><SectionHeading eyebrow="Rumbo financiero" title="Metas y deudas actuales" description="Estado actual del recorrido. El periodo elegido sigue controlando las gráficas y movimientos; esta sección muestra el saldo vivo de cada objetivo." /><Button asChild variant="outline" className="mb-5 shrink-0 rounded-full"><Link href="/metas">Gestionar</Link></Button></div>{targets.length ? <div className="grid gap-x-10 gap-y-2 md:grid-cols-2">{targets.map((target) => { const progress = financialTargetProgress(target, finance.financialTargetEntries, finance.transactions); return <Link key={target.id} href={`/metas?meta=${encodeURIComponent(target.id)}`} className="grid min-h-20 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-4"><span className="grid size-10 place-items-center rounded-xl" style={{ color: target.color, backgroundColor: `${target.color}16` }}><FinanceIcon name={target.icon} className="size-[18px]" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{target.title}</span><span className="mt-2 flex items-center gap-2"><Progress className="max-w-44" indicatorClassName="bg-[var(--target-color)]" style={{ "--target-color": target.color } as React.CSSProperties} value={progress.rawProgress} max={target.targetAmount} label={`Avance de ${target.title}`} valueText={`${Math.round(progress.percent)}%`} /><span className="text-[11px] text-muted-foreground">{Math.round(progress.percent)}%</span></span></span><span className="text-right"><span className="block text-sm font-medium tabular-nums">{money.format(progress.remaining)}</span><span className="text-[11px] text-muted-foreground">pendiente</span></span></Link>; })}</div> : <EmptyInline text="Todavía no has creado metas ni deudas." />}</section>;
}

function ExactSeriesData({ report, money }: { report: DetailedFinanceReport; money: Intl.NumberFormat }) { return <details className="mt-5 min-w-0 w-full max-w-full overflow-hidden rounded-2xl bg-secondary/28 px-3 sm:px-4"><summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium text-primary focus-visible:text-foreground focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4">Ver datos exactos del gráfico</summary><div className="divide-y sm:hidden">{report.series.map((item) => <div key={item.period} className="min-w-0 py-3"><p className="text-sm font-medium">{formatDateBucket(item.period, report.granularity)}</p><dl className="mt-2 grid min-w-0 grid-cols-1 gap-2 text-xs min-[360px]:grid-cols-3"><div className="min-w-0"><dt className="text-muted-foreground">Ingresos</dt><dd className="mt-1 break-words tabular-nums">{money.format(item.income)}</dd></div><div className="min-w-0"><dt className="text-muted-foreground">Gastos</dt><dd className="mt-1 break-words tabular-nums">{money.format(item.expense)}</dd></div><div className="min-w-0 min-[360px]:text-right"><dt className="text-muted-foreground">Balance</dt><dd className="mt-1 break-words tabular-nums">{money.format(item.balance)}</dd></div></dl></div>)}</div><div className="hidden max-w-full overflow-x-auto overscroll-x-contain sm:block"><table className="w-full min-w-[520px] border-collapse text-sm"><caption className="sr-only">Ingresos, gastos y balance exactos de cada periodo</caption><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 font-normal">Periodo</th><th className="px-3 py-2 text-right font-normal">Ingresos</th><th className="px-3 py-2 text-right font-normal">Gastos</th><th className="py-2 text-right font-normal">Balance</th></tr></thead><tbody>{report.series.map((item) => <tr key={item.period} className="border-b last:border-0"><th scope="row" className="py-2 text-left font-medium">{formatDateBucket(item.period, report.granularity)}</th><td className="px-3 py-2 text-right tabular-nums">{money.format(item.income)}</td><td className="px-3 py-2 text-right tabular-nums">{money.format(item.expense)}</td><td className="py-2 text-right tabular-nums">{money.format(item.balance)}</td></tr>)}</tbody></table></div></details>; }
function ExactCategoryData({ report, money }: { report: DetailedFinanceReport; money: Intl.NumberFormat }) { const rows = report.groups.filter((item) => item.expense > 0); const total = rows.reduce((sum, item) => sum + item.expense, 0); return <ExactDataDisclosure label="Ver valores exactos por categoría">{rows.map((item) => <div key={item.group} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 text-sm"><span className="min-w-0 break-words">{item.name}</span><span className="text-right font-medium tabular-nums">{money.format(item.expense)}<span className="block text-[11px] font-normal text-muted-foreground">{total > 0 ? Math.round((item.expense / total) * 100) : 0}%</span></span></div>)}</ExactDataDisclosure>; }
function ExactWeekdayData({ report, money }: { report: DetailedFinanceReport; money: Intl.NumberFormat }) { const names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]; return <ExactDataDisclosure label="Ver valores exactos por día">{report.weekdays.map((item) => <div key={item.weekday} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{names[item.weekday - 1] ?? `Día ${item.weekday}`}</span><span className="font-medium tabular-nums">{money.format(item.expense)}</span></div>)}</ExactDataDisclosure>; }
function ExactDataDisclosure({ label, children }: { label: string; children: React.ReactNode }) { return <details className="mt-4 rounded-2xl bg-secondary/28 px-3 sm:px-4"><summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium text-primary focus-visible:text-foreground focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4">{label}</summary><div className="divide-y">{children}</div></details>; }
function LegendList({ items, empty }: { items: Array<{ id: string; color: string; name: string; value: string; detail: string }>; empty: string }) { return items.length ? <div className="divide-y">{items.map((item) => <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3"><i className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} /><p className="truncate text-sm">{item.name}</p><div className="text-right"><p className="text-sm font-medium tabular-nums">{item.value}</p><p className="text-xs text-muted-foreground">{item.detail}</p></div></div>)}</div> : <EmptyInline text={empty} />; }
function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="mb-5"><p className="text-[11px] font-medium uppercase tracking-[.14em] text-primary">{eyebrow}</p><h2 className="mt-2 text-xl font-medium tracking-[-.025em]">{title}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p></div>; }
function EmptyInline({ text }: { text: string }) { return <p className="py-9 text-sm text-muted-foreground">{text}</p>; }
function ChartEmpty({ text }: { text: string }) { return <div className="grid min-h-36 place-items-center rounded-2xl bg-secondary/24 px-6 text-center text-sm text-muted-foreground"><p>{text}</p></div>; }
function ChartSkeleton() { return <Skeleton className="h-[280px] w-full rounded-2xl" />; }
function ReportLoading() { return <div className="grid gap-6 py-8" role="status" aria-live="polite" aria-label="Calculando reporte" aria-busy="true"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-[390px] rounded-2xl" /><div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div></div>; }
function ReportError({ message, onRetry }: { message: string; onRetry: () => void }) { return <section className="my-8 grid min-h-72 place-items-center rounded-2xl bg-destructive/8 px-6 text-center" role="alert"><div><p className="font-medium text-destructive">No pudimos actualizar el reporte</p><p className="mt-2 max-w-md text-sm text-muted-foreground">{message}</p><Button variant="outline" className="mt-5 rounded-full" onClick={onRetry}><RefreshCw className="size-4" />Reintentar</Button></div></section>; }
export function ReportConnectionRequired() { return <section className="mt-8 grid min-h-80 place-items-center rounded-2xl bg-secondary/25 px-6 py-12" role="status" aria-live="polite" data-report-connection-required><div className="max-w-sm text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-warning"><CloudOff className="size-5" /></span><p className="mt-5 text-xs font-medium text-warning">Historial protegido</p><h2 className="mt-2 text-xl font-semibold tracking-[-.03em]">Conéctate para cargar el reporte completo</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">La copia cifrada de este dispositivo puede ser parcial. No mostramos cifras incompletas como si fueran el total.</p></div></section>; }
function comparisonLabel(current: number, previous?: number) { if (previous === undefined) return "Sin comparación"; if (previous === 0) return current === 0 ? "Sin cambios" : "Nuevo en este periodo"; const change = (current - previous) / Math.abs(previous); return `${change > 0 ? "+" : ""}${new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 }).format(change)} vs. comparación`; }
function formatPercent(value: number) { return new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 }).format(value / 100); }
function formatMonth(value: string) { return new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`)).replace(" de ", " "); }
function formatDateBucket(value: string, granularity: DetailedFinanceReport["granularity"]) { return new Intl.DateTimeFormat("es-CO", granularity === "month" ? { month: "long", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replace(" de ", " "); }
function shortDate(value: string) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replace(" de ", " "); }
