"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Download, LoaderCircle, Minus } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { currencyFormatter, toCsv } from "@/lib/finance/calculations";
import type { FinanceReport } from "@/lib/finance/types";

const compactMoney = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 1, notation: "compact" });
export function ReportsPage() {
  const { profile, accounts, categories, currentMonth, online, getFinanceReport, exportTransactions } = useFinance();
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = currencyFormatter(profile?.currencyCode);

  useEffect(() => {
    let active = true;
    void getFinanceReport(currentMonth, 12)
      .then((next) => { if (active) setReport(next); })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "No pudimos calcular el reporte."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentMonth, getFinanceReport]);

  const analytics = useMemo(() => analyzeReport(report), [report]);

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await exportTransactions();
      const blob = new Blob(["\ufeff", toCsv(rows, accounts, categories)], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `moneva-reporte-${currentMonth.slice(0, 7)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`${rows.length} movimientos exportados`);
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "No pudimos descargar los datos.");
    } finally {
      setExporting(false);
    }
  }

  return <>
    <PageHeader eyebrow="Últimos 12 meses" title="Reportes" description="Tendencias calculadas directamente sobre tus movimientos. El navegador recibe meses resumidos, no todo tu historial." action={<Button variant="outline" className="rounded-full" onClick={exportCsv} disabled={exporting}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{exporting ? "Preparando…" : "Descargar datos"}</Button>} />
    {!online || report?.source === "local" ? <p className="mb-6 border-y py-3 text-xs text-amber-600 dark:text-amber-300">Sin conexión: el reporte usa únicamente los movimientos cifrados disponibles en este dispositivo.</p> : null}
    {loading && !report ? <div className="grid min-h-80 place-items-center text-muted-foreground"><div className="text-center"><LoaderCircle className="mx-auto size-6 animate-spin" /><p className="mt-3 text-sm">Calculando tus tendencias…</p></div></div> : null}
    {error ? <div role="alert" className="border-y py-16 text-center"><p className="text-sm text-destructive">{error}</p></div> : null}
    {report && analytics ? <>
      <section className="grid gap-7 border-b pb-8 md:grid-cols-3 md:gap-0">
        <ReportMetric label="Ingresos del mes" value={money.format(analytics.current.income)} note={comparisonText(analytics.current.income, analytics.previous.income, "mes anterior")} positive={analytics.current.income >= analytics.previous.income} />
        <ReportMetric label="Gastos del mes" value={money.format(analytics.current.expense)} note={comparisonText(analytics.current.expense, analytics.previous.expense, "mes anterior")} positive={analytics.current.expense <= analytics.previous.expense} />
        <ReportMetric label="Balance libre" value={money.format(analytics.current.balance)} note={analytics.current.income > 0 ? `${Math.round((analytics.current.balance / analytics.current.income) * 100)}% del ingreso` : "Registra ingresos para medirlo"} positive={analytics.current.balance >= 0} />
      </section>

      <section className="grid gap-10 py-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,.5fr)] xl:gap-14">
        <div>
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-medium tracking-tight">Flujo de caja</h2><p className="mt-1 text-sm text-muted-foreground">Ingresos y gastos reales por mes</p></div><div className="flex gap-4 text-xs"><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-primary" />Ingresos</span><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-rose-400" />Gastos</span></div></div>
          <CashflowChart report={report} />
        </div>
        <div className="border-t pt-8 xl:border-l xl:border-t-0 xl:pl-10 xl:pt-0"><h2 className="text-xl font-medium tracking-tight">Lecturas útiles</h2><div className="mt-6 space-y-6"><ReportInsight icon={analytics.bestMonth ? ArrowUpRight : Minus} title="Mejor mes" value={analytics.bestMonth ? formatMonth(analytics.bestMonth.month, true) : "Sin datos aún"} note={analytics.bestMonth ? `${Math.round(analytics.bestMonth.rate * 100)}% de balance sobre ingresos` : "Aparecerá al registrar movimientos"} /><ReportInsight icon={analytics.expenseChange <= 0 ? ArrowDownRight : ArrowUpRight} title="Cambio en gastos" value={signedPercent(analytics.expenseChange)} note="frente al mes anterior" /><ReportInsight icon={analytics.projection >= 0 ? ArrowUpRight : ArrowDownRight} title="Proyección anual" value={money.format(analytics.projection)} note={analytics.activeMonths ? `promedio de ${analytics.activeMonths} ${analytics.activeMonths === 1 ? "mes" : "meses"} con actividad` : "sin actividad suficiente"} /></div></div>
      </section>

      <section className="border-t py-8"><div className="mb-6"><h2 className="text-xl font-medium tracking-tight">Distribución por grupo</h2><p className="mt-1 text-sm text-muted-foreground">Gastos acumulados en el periodo del reporte</p></div><div className="grid gap-x-8 md:grid-cols-2">{report.groups.filter((group) => !group.archived || group.expense > 0).map((group) => { const percent = analytics.groupExpense > 0 ? Math.round((group.expense / analytics.groupExpense) * 100) : 0; return <div key={group.group} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b py-4"><div className="min-w-0"><div className="flex items-center gap-2"><i className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} /><p className="truncate text-sm font-medium">{group.name}</p>{group.includedInPlan ? <span className="text-[10px] text-muted-foreground">meta {group.targetPercent}%</span> : null}</div><div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: group.color }} /></div></div><div className="text-right"><p className="text-sm font-medium tabular-nums">{money.format(group.expense)}</p><p className="text-xs text-muted-foreground">{percent}%</p></div></div>; })}</div>{!report.groups.some((group) => group.expense > 0) ? <p className="py-10 text-sm text-muted-foreground">Todavía no hay gastos en este periodo.</p> : null}</section>
    </> : null}
  </>;
}

function CashflowChart({ report }: { report: FinanceReport }) {
  const maxValue = Math.max(1, ...report.months.flatMap((month) => [month.income, month.expense]));
  const points = (key: "income" | "expense") => report.months.map((item, index) => `${report.months.length === 1 ? 50 : (index / (report.months.length - 1)) * 100},${92 - (item[key] / maxValue) * 78}`).join(" ");
  return <div className="relative pl-10"><span className="absolute left-0 top-0 w-8 text-right text-[11px] text-muted-foreground">{compactMoney.format(maxValue)}</span><div className="relative h-[280px] border-b border-l"><div className="absolute inset-x-0 top-1/4 border-t border-dashed" /><div className="absolute inset-x-0 top-1/2 border-t border-dashed" /><div className="absolute inset-x-0 top-3/4 border-t border-dashed" /><svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Gráfica de ingresos y gastos de los últimos doce meses"><polyline points={points("income")} fill="none" stroke="var(--primary)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /><polyline points={points("expense")} fill="none" stroke="#fb7185" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg><div className="absolute -bottom-7 inset-x-0 flex justify-between text-[11px] text-muted-foreground">{report.months.map((item, index) => <span key={item.month} className={index % 2 ? "hidden sm:inline" : undefined}>{formatMonth(item.month)}</span>)}</div></div></div>;
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
function ReportMetric({ label, value, note, positive }: { label: string; value: string; note: string; positive?: boolean }) { return <div className="md:border-l md:px-7 first:border-l-0 first:pl-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-medium tracking-[-.045em]">{value}</p><p className={positive ? "mt-1 text-xs text-emerald-600 dark:text-emerald-300" : "mt-1 text-xs text-muted-foreground"}>{note}</p></div>; }
function ReportInsight({ icon: Icon, title, value, note }: { icon: typeof ArrowUpRight; title: string; value: string; note: string }) { return <div className="flex items-start gap-3 border-b pb-5"><span className="grid size-9 place-items-center rounded-full bg-primary/12 text-primary"><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{title}</p><p className="mt-1 truncate text-lg font-medium">{value}</p><p className="text-xs text-muted-foreground">{note}</p></div></div>; }
