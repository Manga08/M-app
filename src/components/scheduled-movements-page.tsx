"use client";

import { useMemo, useState } from "react";
import { CalendarClock, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { currencyFormatter, localIsoDate } from "@/lib/finance/calculations";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { nextPlannedOccurrence, projectedOccurrences } from "@/lib/finance/recurrence";
import type { RecurringRule } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type RuleFilter = "all" | "expense" | "income" | "transfer";

export function ScheduledMovementsPage() {
  const { profile, accounts, categories, recurringRules, recurringOccurrences, mutate } = useFinance();
  const [filter, setFilter] = useState<RuleFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<RecurringRule | null>(null);
  const money = currencyFormatter(profile?.currencyCode);
  const today = localIsoDate(new Date(), profile?.timezone);
  const activeRules = useMemo(() => recurringRules.filter((rule) => rule.status !== "archived"), [recurringRules]);
  const visible = activeRules.filter((rule) => filter === "all" || rule.kind === filter);
  const next = nextPlannedOccurrence(recurringOccurrences, today);
  const monthlyExpenses = recurringOccurrences.filter((item) => item.kind === "expense" && item.status === "planned" && item.effectiveOn.slice(0, 7) === today.slice(0, 7)).reduce((sum, item) => sum + item.amount, 0);
  const monthlyIncome = recurringOccurrences.filter((item) => item.kind === "income" && item.status === "planned" && item.effectiveOn.slice(0, 7) === today.slice(0, 7)).reduce((sum, item) => sum + item.amount, 0);

  async function toggleRule(rule: RecurringRule) {
    if (busyId) return;
    setBusyId(rule.id);
    try {
      const result = await mutate.upsertRecurringRule({ ...rule, status: rule.status === "active" ? "paused" : "active" });
      announceMutation(result, rule.status === "active" ? "Programación pausada" : "Programación reanudada");
    } catch (error) {
      announceMutationError(error, "No pudimos cambiar la programación.");
    } finally {
      setBusyId(null);
    }
  }

  async function archiveRule(rule: RecurringRule) {
    if (busyId) return;
    setBusyId(rule.id);
    try {
      const result = await mutate.archiveRecurringRule(rule.id);
      announceMutation(result, "Programación archivada");
    } catch (error) {
      announceMutationError(error, "No pudimos archivar la programación.");
    } finally {
      setBusyId(null);
    }
  }

  return <div className="min-w-0">
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-medium uppercase tracking-[.14em] text-primary">Automatizaciones</p><h2 className="mt-2 text-2xl font-medium tracking-[-.035em]">Lo que se repite, una sola vez</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Configura suscripciones, salarios o transferencias. Moneva crea cada movimiento en la fecha elegida sin tocar saldos antes de tiempo.</p></div><Button className="h-11 rounded-full" onClick={() => window.dispatchEvent(new CustomEvent("moneva:quick-add", { detail: { timing: "recurring" } }))}><Plus className="size-4" />Nueva programación</Button></div>

    <section className="grid gap-px overflow-hidden border-y bg-border sm:grid-cols-3" aria-label="Resumen de programaciones">
      <Summary label="Próximo" value={next ? formatDate(next.effectiveOn) : "Sin pendientes"} helper={next?.description ?? "Crea tu primera programación"} tone="primary" />
      <Summary label="Gastos previstos este mes" value={money.format(monthlyExpenses)} helper="Todavía no afectan el saldo" tone={monthlyExpenses > 0 ? "destructive" : "neutral"} />
      <Summary label="Ingresos previstos este mes" value={money.format(monthlyIncome)} helper="Se sumarán cuando correspondan" tone={monthlyIncome > 0 ? "positive" : "neutral"} />
    </section>

    <div className="mt-7 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filtrar programaciones">{(["all", "expense", "income", "transfer"] as const).map((value) => <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} className={cn("shrink-0 rounded-full", filter === value && "text-secondary-foreground ring-1 ring-primary/30")} onClick={() => setFilter(value)}>{value === "all" ? "Todas" : value === "expense" ? "Suscripciones y gastos" : value === "income" ? "Ingresos" : "Transferencias"}</Button>)}</div>

    <div className="mt-2 divide-y">{visible.map((rule) => {
      const category = categories.find((item) => item.id === rule.categoryId);
      const account = accounts.find((item) => item.id === rule.accountId);
      const destination = accounts.find((item) => item.id === rule.destinationAccountId);
      const ruleNext = recurringOccurrences.filter((item) => item.ruleId === rule.id).sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn)).find((item) => item.status === "planned" && item.effectiveOn >= today)
        ?? projectedOccurrences(rule, today, addIsoDays(today, 740))[0];
      const positive = rule.kind === "income";
      const ruleMoney = currencyFormatter(account?.currencyCode ?? profile?.currencyCode);
      return <article key={rule.id} className="grid min-h-[86px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-4 sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(150px,.65fr)_minmax(130px,.55fr)_44px] sm:gap-4">
        <span className={cn("grid size-11 place-items-center rounded-2xl", positive ? "bg-positive/12 text-positive" : rule.kind === "expense" ? "bg-destructive/12 text-destructive" : "bg-info/12 text-info")}><FinanceIcon name={rule.icon ?? category?.icon ?? (positive ? "briefcase" : rule.kind === "transfer" ? "hand-coins" : "receipt")} className="size-5" /></span>
        <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-medium">{rule.description}</h3>{rule.status === "paused" ? <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-medium text-warning">Pausado</span> : null}</div><p className="mt-1 truncate text-xs text-muted-foreground">{scheduleText(rule)} · {category?.name ?? (rule.kind === "transfer" ? `${account?.name ?? "Cuenta"} → ${destination?.name ?? "Cuenta"}` : "Sin categoría")}</p></div>
        <div className="hidden sm:block"><p className="text-xs text-muted-foreground">Próximo</p><p className="mt-1 text-sm font-medium">{ruleNext ? formatDate(ruleNext.effectiveOn) : rule.status === "paused" ? "En pausa" : "Sin fecha"}</p></div>
        <div className="text-right"><p className={cn("text-sm font-medium tabular-nums", positive ? "text-positive" : rule.kind === "expense" ? "text-destructive" : "text-foreground")}>{positive ? "+" : rule.kind === "expense" ? "−" : ""}{ruleMoney.format(rule.amount)}</p><p className="mt-1 text-[11px] text-muted-foreground sm:hidden">{ruleNext ? formatDate(ruleNext.effectiveOn) : rule.status === "paused" ? "En pausa" : "Sin fecha"}</p>{rule.includeInBudget ? <p className="mt-1 text-[11px] text-muted-foreground">Incluido en presupuesto</p> : null}</div>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={busyId === rule.id} aria-label={`Opciones para ${rule.description}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("moneva:edit-recurring-rule", { detail: { id: rule.id } }))}><Pencil />Editar</DropdownMenuItem><DropdownMenuItem onSelect={() => void toggleRule(rule)}>{rule.status === "active" ? <Pause /> : <Play />}{rule.status === "active" ? "Pausar" : "Reanudar"}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setArchiveTarget(rule)}><Trash2 />Archivar</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </article>;
    })}</div>
    {!visible.length ? <div className="grid min-h-64 place-items-center border-b px-6 text-center" role="status"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-primary"><CalendarClock className="size-5" /></span><h3 className="mt-4 font-medium">Nada programado en esta vista</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Crea una suscripción, un salario o una transferencia recurrente y aparecerá aquí.</p></div></div> : null}
    <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>¿Archivar esta programación?</AlertDialogTitle><AlertDialogDescription>“{archiveTarget?.description}” dejará de crear movimientos futuros. Los que ya se registraron se conservarán.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={Boolean(busyId)} onClick={() => { if (archiveTarget) void archiveRule(archiveTarget); setArchiveTarget(null); }}>Archivar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Summary({ label, value, helper, tone }: { label: string; value: string; helper: string; tone: "primary" | "positive" | "destructive" | "neutral" }) { return <div className="min-w-0 bg-background px-1 py-6 sm:px-5"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-2 break-words text-xl font-medium tabular-nums [overflow-wrap:anywhere]", tone === "primary" && "text-primary", tone === "positive" && "text-positive", tone === "destructive" && "text-destructive")}>{value}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{helper}</p></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replace(" de ", " "); }
function scheduleText(rule: RecurringRule) { const interval = rule.intervalCount > 1 ? `cada ${rule.intervalCount} ` : "cada "; if (rule.cadence === "weekly") return rule.intervalCount === 2 ? "cada 14 días" : `${interval}${rule.intervalCount > 1 ? "semanas" : "semana"}`; if (rule.cadence === "semimonthly") return `los días ${rule.anchorDay ?? 15} y ${rule.secondAnchorDay ?? 31} de cada mes`; if (rule.cadence === "yearly") return `${interval}${rule.intervalCount > 1 ? "años" : "año"}`; return rule.postingPolicy === "month_start" ? "el primer día de cada mes" : `el día ${rule.anchorDay ?? Number(rule.startsOn.slice(8, 10))} de cada mes`; }
function addIsoDays(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
