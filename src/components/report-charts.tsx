"use client";

import { useReducedMotion } from "motion/react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { DetailedFinanceReport } from "@/lib/finance/types";

const cashflowConfig = {
  income: { label: "Ingresos", color: "var(--positive)" },
  expense: { label: "Gastos", color: "var(--destructive)" },
  balance: { label: "Balance", color: "var(--primary)" },
} satisfies ChartConfig;

export function CashflowReportChart({ report, compactMoney }: { report: DetailedFinanceReport; compactMoney: Intl.NumberFormat }) {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion && report.series.length <= 36;
  return (
    <ChartContainer config={cashflowConfig} className="h-[270px] w-full sm:h-[330px]" initialDimension={{ width: 260, height: 270 }}>
      <ComposedChart data={report.series} margin={{ top: 12, right: 8, bottom: 0, left: -10 }} accessibilityLayer>
        <defs>
          <linearGradient id="income-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-income)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--color-income)" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="4 6" />
        <XAxis dataKey="period" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={formatPeriod} />
        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(value) => compactMoney.format(Number(value))} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" formatter={(value, name) => <div className="flex min-w-40 items-center justify-between gap-4"><span className="text-muted-foreground">{cashflowConfig[String(name) as keyof typeof cashflowConfig]?.label}</span><span className="font-mono font-medium tabular-nums">{compactMoney.format(Number(value))}</span></div>} labelFormatter={(label) => longPeriod(String(label))} />} />
        <Area type="monotone" dataKey="income" fill="url(#income-fill)" stroke="var(--color-income)" strokeWidth={2} isAnimationActive={animate} animationDuration={260} />
        <Line type="monotone" dataKey="expense" stroke="var(--color-expense)" strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} isAnimationActive={animate} animationDuration={260} />
        <Line type="monotone" dataKey="balance" stroke="var(--color-balance)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={animate} animationDuration={260} />
      </ComposedChart>
    </ChartContainer>
  );
}

export function GroupCompositionChart({ report, compactMoney }: { report: DetailedFinanceReport; compactMoney: Intl.NumberFormat }) {
  const reduceMotion = useReducedMotion();
  const data = report.groups.filter((item) => item.expense > 0).slice(0, 8);
  return (
    <ChartContainer config={{ expense: { label: "Gastado", color: "var(--primary)" } }} className="h-[280px] w-full" initialDimension={{ width: 260, height: 280 }}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 0 }} accessibilityLayer>
        <CartesianGrid horizontal={false} strokeDasharray="4 6" />
        <XAxis type="number" hide />
        <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={92} tick={{ fontSize: 11 }} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.35 }} content={<ChartTooltipContent hideLabel formatter={(value) => <span className="font-mono font-medium tabular-nums">{compactMoney.format(Number(value))}</span>} />} />
        <Bar dataKey="expense" radius={[0, 7, 7, 0]} isAnimationActive={!reduceMotion} animationDuration={240}>
          {data.map((item) => <Cell key={item.group} fill={item.color} />)}
          <LabelList dataKey="expense" position="right" formatter={(value) => compactMoney.format(Number(value ?? 0))} className="fill-muted-foreground text-[11px]" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function BudgetReportChart({ report, compactMoney }: { report: DetailedFinanceReport; compactMoney: Intl.NumberFormat }) {
  const data = report.groups.filter((item) => item.budget > 0 || item.expense > 0).slice(0, 8);
  return (
    <div className="space-y-4 py-2" aria-label="Comparación de presupuesto y gasto por categoría principal">
      {data.map((item) => {
        const usage = item.budget > 0 ? (item.expense / item.budget) * 100 : item.expense > 0 ? 100 : 0;
        const width = Math.min(100, Math.max(0, usage));
        return <div key={item.group} className="space-y-2.5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.budget > 0 ? `${compactMoney.format(item.expense)} de ${compactMoney.format(item.budget)}` : `${compactMoney.format(item.expense)} sin límite`}</p></div>
            <p className={usage > 100 ? "shrink-0 text-sm font-medium tabular-nums text-destructive" : "shrink-0 text-sm font-medium tabular-nums text-muted-foreground"}>{Math.round(usage)}%</p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${item.name}: ${Math.round(usage)}% del presupuesto utilizado`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(usage))}>
            <span className="block h-full w-full origin-left rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${width / 100})`, backgroundColor: usage > 100 ? "var(--destructive)" : item.color }} />
          </div>
        </div>;
      })}
    </div>
  );
}

export function IncomeReportChart({ report, compactMoney }: { report: DetailedFinanceReport; compactMoney: Intl.NumberFormat }) {
  const reduceMotion = useReducedMotion();
  const data = report.incomeTypes.filter((item) => item.income > 0).slice(0, 8);
  return (
    <ChartContainer config={{ income: { label: "Ingresos", color: "var(--positive)" } }} className="h-[280px] w-full" initialDimension={{ width: 260, height: 280 }}>
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value) => <span className="font-mono font-medium tabular-nums">{compactMoney.format(Number(value))}</span>} />} />
        <Pie data={data} dataKey="income" nameKey="name" innerRadius={58} outerRadius={94} paddingAngle={2} strokeWidth={0} isAnimationActive={!reduceMotion} animationDuration={260}>
          {data.map((item) => <Cell key={item.id} fill={item.color} />)}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

export function WeekdayReportChart({ report, compactMoney }: { report: DetailedFinanceReport; compactMoney: Intl.NumberFormat }) {
  const reduceMotion = useReducedMotion();
  const labels = ["L", "M", "X", "J", "V", "S", "D"];
  const data = report.weekdays.map((item) => ({ ...item, label: labels[item.weekday - 1] ?? String(item.weekday) }));
  return (
    <ChartContainer config={{ expense: { label: "Gastos", color: "var(--destructive)" } }} className="h-[230px] w-full" initialDimension={{ width: 260, height: 230 }}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="4 6" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(value) => compactMoney.format(Number(value))} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.3 }} content={<ChartTooltipContent hideLabel formatter={(value) => <span className="font-mono font-medium tabular-nums">{compactMoney.format(Number(value))}</span>} />} />
        <Bar dataKey="expense" fill="var(--color-expense)" radius={[6, 6, 0, 0]} isAnimationActive={!reduceMotion} animationDuration={240} />
      </BarChart>
    </ChartContainer>
  );
}

function formatPeriod(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("es-CO", value.endsWith("-01") ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(date).replace(" de ", " ");
}
function longPeriod(value: string) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
