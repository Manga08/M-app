"use client";

import { useMemo, useState } from "react";
import { CalendarClock, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { currencyFormatter, localIsoDate } from "@/lib/finance/calculations";
import { accountContextLabel } from "@/lib/finance/account-entities";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { nextPlannedOccurrence, projectedOccurrences } from "@/lib/finance/recurrence";
import { recurringOccurrenceReportingAmount } from "@/lib/finance/currency";
import type { RecurringRule } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type RuleFilter = "all" | "expense" | "income" | "transfer";

export function ScheduledMovementsPage() {
  const { profile, accountEntities, accounts, categories, recurringRules, recurringOccurrences, mutate } = useFinance();
  const [filter, setFilter] = useState<RuleFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<RecurringRule | null>(null);
  const money = currencyFormatter(profile?.currencyCode);
  const timezone = profile?.timezone;
  const today = localIsoDate(new Date(), timezone);
  const activeRules = useMemo(() => recurringRules.filter((rule) => rule.status !== "archived"), [recurringRules]);
  const visible = activeRules.filter((rule) => filter === "all" || rule.kind === filter);
  const next = nextPlannedOccurrence(recurringOccurrences, today);
  const nextByRule = useMemo(() => {
    const currentDate = localIsoDate(new Date(), timezone);
    const result = new Map<string, (typeof recurringOccurrences)[number]>();
    const ordered = recurringOccurrences
      .filter((item) => item.status === "planned" && item.effectiveOn >= currentDate)
      .toSorted((a, b) => a.effectiveOn.localeCompare(b.effectiveOn) || a.scheduledOn.localeCompare(b.scheduledOn));
    for (const occurrence of ordered) {
      if (!result.has(occurrence.ruleId)) result.set(occurrence.ruleId, occurrence);
    }
    return result;
  }, [recurringOccurrences, timezone]);
  const monthlyExpenses = recurringOccurrences.filter((item) => item.kind === "expense" && item.status === "planned" && item.effectiveOn.slice(0, 7) === today.slice(0, 7)).reduce((sum, item) => sum + recurringOccurrenceReportingAmount(item), 0);
  const monthlyIncome = recurringOccurrences.filter((item) => item.kind === "income" && item.status === "planned" && item.effectiveOn.slice(0, 7) === today.slice(0, 7)).reduce((sum, item) => sum + recurringOccurrenceReportingAmount(item), 0);

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
      <Summary label="Próximo registro" value={next ? formatDate(next.effectiveOn) : "Sin pendientes"} helper={next ? next.effectiveOn === next.scheduledOn ? next.description : `${next.description} · movimiento con fecha ${formatDate(next.scheduledOn)}` : "Crea tu primera programación"} tone="primary" />
      <Summary label="Gastos previstos este mes" value={money.format(monthlyExpenses)} helper="Todavía no afectan el saldo" tone={monthlyExpenses > 0 ? "destructive" : "neutral"} />
      <Summary label="Ingresos previstos este mes" value={money.format(monthlyIncome)} helper="Se sumarán cuando correspondan" tone={monthlyIncome > 0 ? "positive" : "neutral"} />
    </section>

    <div className="mt-7 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filtrar programaciones">{(["all", "expense", "income", "transfer"] as const).map((value) => <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} className={cn("shrink-0 rounded-full", filter === value && "text-secondary-foreground ring-1 ring-primary/30")} onClick={() => setFilter(value)}>{value === "all" ? "Todas" : value === "expense" ? "Suscripciones y gastos" : value === "income" ? "Ingresos" : "Transferencias"}</Button>)}</div>

    {visible.length ? <div className="mt-2" role="list" aria-label="Programaciones">
      <div className="hidden grid-cols-[44px_minmax(190px,1.2fr)_minmax(170px,.85fr)_minmax(180px,.8fr)_minmax(130px,.55fr)_44px] gap-4 border-b px-0 pb-2 text-xs text-muted-foreground xl:grid" aria-hidden="true">
        <span />
        <span>Programación</span>
        <span>Cuenta y categoría</span>
        <span>Próximo movimiento</span>
        <span className="text-right">Valor</span>
        <span />
      </div>
      {visible.map((rule) => {
      const category = categories.find((item) => item.id === rule.categoryId);
      const account = accounts.find((item) => item.id === rule.accountId);
      const destination = accounts.find((item) => item.id === rule.destinationAccountId);
      const ruleNext = nextByRule.get(rule.id)
        ?? projectedOccurrences(rule, today, addIsoDays(today, 740))[0];
      const positive = rule.kind === "income";
      const ruleMoney = currencyFormatter(account?.currencyCode ?? profile?.currencyCode);
      const destinationMoney = currencyFormatter(destination?.currencyCode ?? profile?.currencyCode);
      const title = rule.merchant || rule.description;
      const accountLabel = accountContextLabel(account, accountEntities);
      const context = rule.kind === "transfer"
        ? `${accountLabel} → ${accountContextLabel(destination, accountEntities)}`
        : `${category?.name ?? "Sin categoría"} · ${accountLabel}`;
      const nextMovement = ruleNext ? formatDate(ruleNext.scheduledOn) : rule.status === "paused" ? "En pausa" : "Sin fecha";
      const registration = ruleNext ? registrationText(rule, ruleNext.scheduledOn, ruleNext.effectiveOn) : rule.status === "paused" ? "No se crearán movimientos" : "Sin registro pendiente";
      return <article key={rule.id} role="listitem" className="grid min-h-[112px] grid-cols-[44px_minmax(0,1fr)_44px] items-start gap-x-3 border-b py-4 last:border-b-0 xl:min-h-[92px] xl:grid-cols-[44px_minmax(190px,1.2fr)_minmax(170px,.85fr)_minmax(180px,.8fr)_minmax(130px,.55fr)_44px] xl:items-center xl:gap-4">
        <span className={cn("grid size-11 place-items-center rounded-2xl", positive ? "bg-positive/12 text-positive" : rule.kind === "expense" ? "bg-destructive/12 text-destructive" : "bg-info/12 text-info")}><FinanceIcon name={rule.icon ?? category?.icon ?? (positive ? "briefcase" : rule.kind === "transfer" ? "hand-coins" : "receipt")} className="size-5" /></span>
        <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-medium">{title}</h3>{rule.status === "paused" ? <span className="shrink-0 rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-medium text-warning">Pausada</span> : null}</div><p className="mt-1 truncate text-xs text-muted-foreground">{rule.merchant && rule.description !== rule.merchant ? rule.description : movementTypeLabel(rule.kind)} · {scheduleText(rule)}</p><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground xl:hidden">{context}</p></div>
        <div className="hidden min-w-0 xl:block"><p className="truncate text-sm">{context}</p><p className="mt-1 text-[11px] text-muted-foreground">{rule.autoPost ? "Publicación automática" : "Revisión manual"}</p></div>
        <div className="hidden xl:block"><p className="text-sm font-medium">{nextMovement}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{registration}</p></div>
        <div className="col-start-2 col-end-4 mt-3 flex min-w-0 items-end justify-between gap-3 xl:col-start-auto xl:col-end-auto xl:mt-0 xl:block xl:text-right"><div className="min-w-0 xl:hidden"><p className="text-[11px] text-muted-foreground">Próximo movimiento</p><p className="mt-0.5 text-sm font-medium">{nextMovement}</p><p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{registration}</p></div><div className="shrink-0 text-right"><p className={cn("text-sm font-medium tabular-nums", positive ? "text-positive" : rule.kind === "expense" ? "text-destructive" : "text-info")}>{positive ? "+" : rule.kind === "expense" ? "−" : ""}{ruleMoney.format(rule.amount)}</p>{rule.kind === "transfer" && rule.destinationAmount !== undefined ? <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">recibe {destinationMoney.format(rule.destinationAmount)}</p> : null}{rule.includeInBudget ? <p className="mt-1 text-[11px] text-muted-foreground">En presupuesto</p> : null}</div></div>
        <div className="col-start-3 row-start-1 xl:col-start-auto xl:row-start-auto"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={busyId === rule.id} aria-label={`Opciones para ${rule.description}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("moneva:edit-recurring-rule", { detail: { id: rule.id } }))}><Pencil />Editar</DropdownMenuItem><DropdownMenuItem onSelect={() => void toggleRule(rule)}>{rule.status === "active" ? <Pause /> : <Play />}{rule.status === "active" ? "Pausar" : "Reanudar"}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setArchiveTarget(rule)}><Trash2 />Archivar</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      </article>;
      })}
    </div> : <div className="grid min-h-64 place-items-center border-b px-6 text-center" role="status"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-primary"><CalendarClock className="size-5" /></span><h3 className="mt-4 font-medium">Nada programado en esta vista</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Crea una suscripción, un salario o una transferencia recurrente y aparecerá aquí.</p></div></div>}
    <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>¿Archivar esta programación?</AlertDialogTitle><AlertDialogDescription>“{archiveTarget?.description}” dejará de crear movimientos futuros. Los que ya se registraron se conservarán.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={Boolean(busyId)} onClick={() => { if (archiveTarget) void archiveRule(archiveTarget); setArchiveTarget(null); }}>Archivar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Summary({ label, value, helper, tone }: { label: string; value: string; helper: string; tone: "primary" | "positive" | "destructive" | "neutral" }) { return <div className="min-w-0 bg-background px-1 py-6 sm:px-5"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-2 break-words text-xl font-medium tabular-nums [overflow-wrap:anywhere]", tone === "primary" && "text-primary", tone === "positive" && "text-positive", tone === "destructive" && "text-destructive")}>{value}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{helper}</p></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replace(" de ", " "); }
function scheduleText(rule: RecurringRule) { const interval = rule.intervalCount > 1 ? `cada ${rule.intervalCount} ` : "cada "; if (rule.cadence === "weekly") return rule.intervalCount === 2 ? "cada 14 días" : `${interval}${rule.intervalCount > 1 ? "semanas" : "semana"}`; if (rule.cadence === "semimonthly") return `días ${rule.anchorDay ?? 15} y ${rule.secondAnchorDay ?? 31} de cada mes`; if (rule.cadence === "yearly") return `${interval}${rule.intervalCount > 1 ? "años" : "año"}`; return `día ${rule.anchorDay ?? Number(rule.startsOn.slice(8, 10))} de cada mes`; }
function registrationText(rule: RecurringRule, scheduledOn: string, effectiveOn: string) { if (!rule.autoPost) return effectiveOn === scheduledOn ? "Se revisa ese día" : `Disponible para revisar ${formatDate(effectiveOn)}`; return effectiveOn === scheduledOn ? "Se registra ese día" : `Moneva lo registra ${formatDate(effectiveOn)}`; }
function movementTypeLabel(kind: RecurringRule["kind"]) { if (kind === "expense") return "Gasto programado"; if (kind === "income") return "Ingreso programado"; return "Transferencia programada"; }
function addIsoDays(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
