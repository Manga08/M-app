"use client";

import { ArrowDownRight, ArrowUpRight, Download } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { monthTotals, toCsv } from "@/lib/finance/calculations";

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0, notation: "compact" });
const chart = [
  { month: "Ene", income: 3.6, expense: 2.8 }, { month: "Feb", income: 3.8, expense: 2.6 },
  { month: "Mar", income: 4.0, expense: 3.1 }, { month: "Abr", income: 4.0, expense: 2.9 },
  { month: "May", income: 4.2, expense: 3.0 }, { month: "Jun", income: 4.0, expense: 2.7 },
  { month: "Jul", income: 4.0, expense: 3.2 }, { month: "Ago", income: 4.0, expense: 2.93 },
] as const;

export function ReportsPage() {
  const { transactions, accounts, categories } = useFinance(); const totals = monthTotals(transactions); const savings = totals.income - totals.expense;
  function exportCsv() { const blob = new Blob(["\ufeff", toCsv(transactions, accounts, categories)], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "moneva-reporte.csv"; link.click(); URL.revokeObjectURL(link.href); }
  const points = (key: "income" | "expense") => chart.map((item, index) => `${(index / (chart.length - 1)) * 100},${100 - ((item[key] - 2) / 2.5) * 100}`).join(" ");
  return <>
    <PageHeader eyebrow="Tendencias" title="Reportes" description="Una lectura clara de cómo cambia tu dinero con el tiempo. Los datos provienen del mismo registro, sin duplicar información." action={<Button variant="outline" className="rounded-full" onClick={exportCsv}><Download className="size-4" />Descargar datos</Button>} />
    <section className="grid gap-7 border-b pb-8 md:grid-cols-3 md:gap-0"><ReportMetric label="Ingresos del mes" value={money.format(totals.income)} note="+4,8% vs. julio" positive /><ReportMetric label="Gastos del mes" value={money.format(totals.expense)} note="-8,4% vs. julio" positive /><ReportMetric label="Balance libre" value={money.format(savings)} note={`${Math.round((savings / Math.max(totals.income, 1)) * 100)}% del ingreso`} /></section>
    <section className="grid gap-10 py-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,.5fr)] xl:gap-14"><div><div className="mb-8 flex items-end justify-between"><div><h2 className="text-xl font-medium tracking-tight">Flujo de caja</h2><p className="mt-1 text-sm text-muted-foreground">Millones de pesos · enero a agosto</p></div><div className="flex gap-4 text-xs"><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-primary" />Ingresos</span><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-rose-400" />Gastos</span></div></div><div className="relative h-[280px] border-b border-l"><div className="absolute inset-x-0 top-1/4 border-t border-dashed" /><div className="absolute inset-x-0 top-1/2 border-t border-dashed" /><div className="absolute inset-x-0 top-3/4 border-t border-dashed" /><svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" preserveAspectRatio="none" aria-label="Gráfica de ingresos y gastos"><polyline points={points("income")} fill="none" stroke="var(--primary)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /><polyline points={points("expense")} fill="none" stroke="#fb7185" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg><div className="absolute -bottom-7 inset-x-0 flex justify-between text-[11px] text-muted-foreground">{chart.map((item) => <span key={item.month}>{item.month}</span>)}</div></div></div><div className="border-t pt-8 xl:border-l xl:border-t-0 xl:pl-10 xl:pt-0"><h2 className="text-xl font-medium tracking-tight">Lecturas útiles</h2><div className="mt-6 space-y-6"><ReportInsight icon={ArrowUpRight} title="Mejor mes" value="Junio" note="32% de ahorro" /><ReportInsight icon={ArrowDownRight} title="Gasto bajo control" value="-8,4%" note="frente a julio" /><ReportInsight icon={ArrowUpRight} title="Proyección anual" value="$13,8 M" note="de balance libre" /></div></div></section>
  </>;
}

function ReportMetric({ label, value, note, positive }: { label: string; value: string; note: string; positive?: boolean }) { return <div className="md:border-l md:px-7 first:border-l-0 first:pl-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-medium tracking-[-.045em]">{value}</p><p className={positive ? "mt-1 text-xs text-emerald-300" : "mt-1 text-xs text-muted-foreground"}>{note}</p></div>; }
function ReportInsight({ icon: Icon, title, value, note }: { icon: typeof ArrowUpRight; title: string; value: string; note: string }) { return <div className="flex items-start gap-3 border-b pb-5"><span className="grid size-9 place-items-center rounded-full bg-primary/12 text-primary"><Icon className="size-4" /></span><div className="flex-1"><p className="text-xs text-muted-foreground">{title}</p><p className="mt-1 text-lg font-medium">{value}</p><p className="text-xs text-muted-foreground">{note}</p></div></div>; }
