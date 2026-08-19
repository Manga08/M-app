"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CloudOff, Download, LoaderCircle, Minus } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { currencyFormatter, toCsv } from "@/lib/finance/calculations";
import { downloadBlob } from "@/lib/download";
import { reportRequiresConnection } from "@/lib/finance/report-coverage";
import type { FinanceReport } from "@/lib/finance/types";

export function ReportsPage() {
  const { profile, accounts, categories, currentMonth, online, getFinanceReport, exportTransactions } = useFinance();
  const [reportResult, setReportResult] = useState<{ key: string; report: FinanceReport | null; error: string | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [period, setPeriod] = useState<6 | 12 | 24>(12);
  const [refreshToken, setRefreshToken] = useState(0);
  const money = currencyFormatter(profile?.currencyCode);
  const compactMoney = currencyFormatter(profile?.currencyCode, true);
  const offlineGuard = reportRequiresConnection({ online, profileId: profile?.id });
  const requestKey = `${currentMonth}|${period}|${refreshToken}|${online ? "online" : "offline"}|${profile?.id ?? "anonymous"}`;

  useEffect(() => {
    if (offlineGuard) return;
    let active = true;
    void getFinanceReport(currentMonth, period)
      .then((next) => { if (active) setReportResult({ key: requestKey, report: next, error: null }); })
      .catch((loadError: unknown) => { if (active) setReportResult({ key: requestKey, report: null, error: loadError instanceof Error ? loadError.message : "No pudimos calcular el reporte." }); });
    return () => { active = false; };
  }, [currentMonth, getFinanceReport, offlineGuard, period, requestKey]);

  useEffect(() => {
    const refreshAfterMutation = () => setRefreshToken((current) => current + 1);
    window.addEventListener("moneva:transactions-changed", refreshAfterMutation);
    return () => window.removeEventListener("moneva:transactions-changed", refreshAfterMutation);
  }, []);

  const activeResult = reportResult?.key === requestKey ? reportResult : null;
  const report = activeResult?.report ?? null;
  const error = activeResult?.error ?? null;
  const connectionRequired = reportRequiresConnection({ online, profileId: profile?.id, coverage: report?.coverage });
  const loading = !connectionRequired && activeResult === null;

  const analytics = useMemo(() => analyzeReport(report), [report]);

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await exportTransactions();
      const blob = new Blob(["\ufeff", toCsv(rows, accounts, categories)], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, "moneva-movimientos-completos.csv");
      toast.success(`${rows.length} movimientos exportados`);
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "No pudimos descargar los datos.");
    } finally {
      setExporting(false);
    }
  }

  return <>
    <PageHeader eyebrow={`Últimos ${period} meses`} title="Reportes" description="Tendencias calculadas directamente sobre tus movimientos. El navegador recibe meses resumidos, no todo tu historial." action={<Button variant="outline" className="rounded-full" onClick={exportCsv} disabled={exporting || connectionRequired}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{exporting ? "Preparando…" : "Descargar historial"}</Button>} />
    {!connectionRequired && !online ? <p className="mb-6 border-y py-3 text-xs text-warning">Sin conexión: estás usando el historial local completo de este modo.</p> : !connectionRequired && profile?.id !== "demo" && report?.source === "local" ? <p className="mb-6 border-y py-3 text-xs text-warning">Mostrando el reporte completo con tus cambios financieros pendientes de sincronización.</p> : null}
    {connectionRequired ? <ReportConnectionRequired /> : null}
    {loading && !report ? <div className="grid min-h-80 place-items-center text-muted-foreground"><div className="text-center"><LoaderCircle className="mx-auto size-6 animate-spin" /><p className="mt-3 text-sm">Calculando tus tendencias…</p></div></div> : null}
    {!connectionRequired && error ? <div role="alert" className="border-y py-16 text-center"><p className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" className="mt-4 rounded-full" onClick={() => setRefreshToken((current) => current + 1)}>Reintentar</Button></div> : null}
    {!connectionRequired && report && analytics ? <>
      <section className="grid gap-7 border-b pb-8 md:grid-cols-3 md:gap-0">
        <ReportMetric label="Ingresos del mes" value={money.format(analytics.current.income)} note={comparisonText(analytics.current.income, analytics.previous.income, "mes anterior")} positive={analytics.current.income >= analytics.previous.income} />
        <ReportMetric label="Gastos del mes" value={money.format(analytics.current.expense)} note={comparisonText(analytics.current.expense, analytics.previous.expense, "mes anterior")} positive={analytics.current.expense <= analytics.previous.expense} />
        <ReportMetric label="Balance libre" value={money.format(analytics.current.balance)} note={analytics.current.income > 0 ? `${Math.round((analytics.current.balance / analytics.current.income) * 100)}% del ingreso` : "Registra ingresos para medirlo"} positive={analytics.current.balance >= 0} />
      </section>

      <section className="grid gap-10 py-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,.5fr)] xl:gap-14">
        <div>
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-medium tracking-tight">Flujo de caja</h2><p className="mt-1 text-sm text-muted-foreground">Ingresos y gastos reales por mes</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-full bg-secondary/65 p-1" role="group" aria-label="Periodo del reporte">{([6, 12, 24] as const).map((value) => <Button key={value} type="button" variant="ghost" size="sm" aria-pressed={period === value} className={`h-8 rounded-full px-3 text-xs ${period === value ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`} onClick={() => setPeriod(value)}>{value} m</Button>)}</div><span className="flex items-center gap-2 text-xs"><i className="size-2 rounded-full bg-primary" />Ingresos</span><span className="flex items-center gap-2 text-xs"><i className="size-2 rounded-full bg-destructive" />Gastos</span></div></div>
          <CashflowChart report={report} compactMoney={compactMoney} money={money} />
        </div>
        <div className="border-t pt-8 xl:border-l xl:border-t-0 xl:pl-10 xl:pt-0"><h2 className="text-xl font-medium tracking-tight">Lecturas útiles</h2><div className="mt-6 space-y-6"><ReportInsight icon={analytics.bestMonth ? ArrowUpRight : Minus} title="Mejor mes" value={analytics.bestMonth ? formatMonth(analytics.bestMonth.month, true) : "Sin datos aún"} note={analytics.bestMonth ? `${Math.round(analytics.bestMonth.rate * 100)}% de balance sobre ingresos` : "Aparecerá al registrar movimientos"} /><ReportInsight icon={analytics.expenseChange <= 0 ? ArrowDownRight : ArrowUpRight} title="Cambio en gastos" value={signedPercent(analytics.expenseChange)} note="frente al mes anterior" /><ReportInsight icon={analytics.projection >= 0 ? ArrowUpRight : ArrowDownRight} title="Proyección anual" value={money.format(analytics.projection)} note={analytics.activeMonths ? `promedio de ${analytics.activeMonths} ${analytics.activeMonths === 1 ? "mes" : "meses"} con actividad` : "sin actividad suficiente"} /></div></div>
      </section>

      <section className="border-t py-8"><div className="mb-6"><h2 className="text-xl font-medium tracking-tight">Distribución por grupo</h2><p className="mt-1 text-sm text-muted-foreground">Gastos acumulados en el periodo del reporte</p></div><div className="grid gap-x-8 md:grid-cols-2">{report.groups.filter((group) => !group.archived || group.expense > 0).map((group) => { const percent = analytics.groupExpense > 0 ? Math.round((group.expense / analytics.groupExpense) * 100) : 0; return <div key={group.group} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b py-4"><div className="min-w-0"><div className="flex items-center gap-2"><i className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} /><p className="truncate text-sm font-medium">{group.name}</p>{group.includedInPlan ? <span className="text-[10px] text-muted-foreground">meta {group.targetPercent}%</span> : null}</div><div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Participación de ${group.name} en los gastos`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: group.color }} /></div></div><div className="text-right"><p className="text-sm font-medium tabular-nums">{money.format(group.expense)}</p><p className="text-xs text-muted-foreground">{percent}%</p></div></div>; })}</div>{!report.groups.some((group) => group.expense > 0) ? <p className="py-10 text-sm text-muted-foreground">Todavía no hay gastos en este periodo.</p> : null}</section>
    </> : null}
  </>;
}

export function ReportConnectionRequired() {
  return (
    <section className="grid min-h-80 place-items-center border-y py-12" role="status" aria-live="polite" data-report-connection-required>
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-warning" aria-hidden="true">
          <CloudOff className="size-5" />
        </span>
        <p className="mt-5 text-xs font-medium text-warning">Historial protegido</p>
        <h2 className="mt-2 text-balance text-xl font-semibold tracking-[-.03em]">Conéctate para cargar el reporte completo</h2>
        <p className="mt-3 text-pretty text-sm leading-6 text-muted-foreground">
          La copia cifrada de este dispositivo puede contener solo una parte de tus movimientos. Por seguridad, no mostramos esas cifras como si fueran el total.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">El reporte se actualizará automáticamente cuando recuperes la conexión.</p>
      </div>
    </section>
  );
}

function CashflowChart({ report, compactMoney, money }: { report: FinanceReport; compactMoney: Intl.NumberFormat; money: Intl.NumberFormat }) {
  const maxValue = Math.max(1, ...report.months.flatMap((month) => [month.income, month.expense]));
  const x = (index: number) => report.months.length === 1 ? 500 : 28 + (index / (report.months.length - 1)) * 944;
  const y = (value: number) => 270 - (value / maxValue) * 238;
  const points = (key: "income" | "expense") => report.months.map((item, index) => `${x(index)},${y(item[key])}`).join(" ");
  return <div><div className="relative"><span className="absolute left-0 top-0 z-10 text-[11px] text-muted-foreground">{compactMoney.format(maxValue)}</span><svg viewBox="0 0 1000 300" className="block h-auto w-full overflow-visible" role="img" aria-labelledby="cashflow-title cashflow-desc"><title id="cashflow-title">Flujo mensual de ingresos y gastos</title><desc id="cashflow-desc">Compara los valores de cada mes del periodo seleccionado. La tabla posterior contiene los importes exactos.</desc>{[32, 91.5, 151, 210.5, 270].map((lineY) => <line key={lineY} x1="28" x2="972" y1={lineY} y2={lineY} stroke="var(--border)" strokeDasharray="8 8" vectorEffect="non-scaling-stroke" />)}<polyline points={points("income")} fill="none" stroke="var(--primary)" strokeWidth="2.25" vectorEffect="non-scaling-stroke" /><polyline points={points("expense")} fill="none" stroke="var(--destructive)" strokeWidth="2.25" vectorEffect="non-scaling-stroke" />{report.months.map((item, index) => <g key={item.month}><circle cx={x(index)} cy={y(item.income)} r="4" fill="var(--background)" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" /><circle cx={x(index)} cy={y(item.expense)} r="4" fill="var(--background)" stroke="var(--destructive)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></g>)}</svg><div className="mt-2 grid text-[11px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${report.months.length}, minmax(0, 1fr))` }}>{report.months.map((item, index) => <span key={item.month} className={`text-center first:text-left last:text-right ${index !== 0 && index !== report.months.length - 1 && index % 2 ? "invisible sm:visible" : ""}`}>{formatMonth(item.month)}</span>)}</div></div><details className="mt-7 border-y py-3"><summary className="cursor-pointer text-sm font-medium text-primary">Ver datos exactos por mes</summary><div className="mobile-scroll-x mt-3 overflow-x-auto"><table className="w-full min-w-[420px] border-collapse text-sm"><caption className="sr-only">Ingresos, gastos y balance de cada mes</caption><thead><tr className="border-b text-left text-xs text-muted-foreground"><th scope="col" className="py-2 pr-4 font-normal">Mes</th><th scope="col" className="px-4 py-2 text-right font-normal">Ingresos</th><th scope="col" className="px-4 py-2 text-right font-normal">Gastos</th><th scope="col" className="py-2 pl-4 text-right font-normal">Balance</th></tr></thead><tbody>{report.months.map((item) => <tr key={item.month} className="border-b last:border-0"><th scope="row" className="py-2 pr-4 text-left font-medium">{formatMonth(item.month, true)}</th><td className="px-4 py-2 text-right tabular-nums">{money.format(item.income)}</td><td className="px-4 py-2 text-right tabular-nums">{money.format(item.expense)}</td><td className="py-2 pl-4 text-right tabular-nums">{money.format(item.balance)}</td></tr>)}</tbody></table></div></details></div>;
}

function analyzeReport(report: FinanceReport | null) {
  if (!report?.months.length) return null;
  const current = report.months.at(-1)!;
  const previous = report.months.at(-2) ?? { month: current.month, income: 0, expense: 0, balance: 0 };
  const candidates = report.months.filter((month) => month.income > 0).map((month) => ({ ...month, rate: month.balance / month.income }));
  const bestMonth = candidates.sort((a, b) => b.rate - a.rate)[0] ?? null;
  const active = report.months.filter((month) => month.income !== 0 || month.expense !== 0);
  const projection = active.length ? (active.reduce((sum, month) => sum + month.balance, 0) / active.length) * 12 : 0;
  const expenseChange = previous.expense > 0 ? (current.expense - previous.expense) / previous.expense : current.expense > 0 ? 1 : 0;
  return { current, previous, bestMonth, projection, expenseChange, activeMonths: active.length, groupExpense: report.groups.reduce((sum, group) => sum + group.expense, 0) };
}

function comparisonText(current: number, previous: number, label: string) { if (previous === 0) return current === 0 ? `Sin cambios vs. ${label}` : `Nuevo frente al ${label}`; return `${signedPercent((current - previous) / previous)} vs. ${label}`; }
function signedPercent(value: number) { if (!Number.isFinite(value) || value === 0) return "Sin cambios"; return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 }).format(value)}`; }
function formatMonth(month: string, long = false) { return new Intl.DateTimeFormat("es-CO", { month: long ? "long" : "short", year: long ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(`${month.slice(0, 10)}T00:00:00Z`)).replace(" de ", " "); }
function ReportMetric({ label, value, note, positive }: { label: string; value: string; note: string; positive?: boolean }) { return <div className="md:border-l md:px-7 first:border-l-0 first:pl-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-medium tracking-[-.045em]">{value}</p><p className={positive ? "mt-1 text-xs text-positive" : "mt-1 text-xs text-muted-foreground"}>{note}</p></div>; }
function ReportInsight({ icon: Icon, title, value, note }: { icon: typeof ArrowUpRight; title: string; value: string; note: string }) { return <div className="flex items-start gap-3 border-b pb-5"><span className="grid size-9 place-items-center rounded-full bg-primary/12 text-primary"><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{title}</p><p className="mt-1 truncate text-lg font-medium">{value}</p><p className="text-xs text-muted-foreground">{note}</p></div></div>; }
