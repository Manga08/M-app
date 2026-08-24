"use client";

import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type { DatesSetArg, DayCellMountArg, EventContentArg, EventClickArg, EventInput, EventMountArg } from "@fullcalendar/core";
import { CalendarDays, CircleAlert } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { currencyFormatter } from "@/lib/finance/calculations";
import { projectedOccurrences } from "@/lib/finance/recurrence";
import { cn } from "@/lib/utils";
import type { Transaction, TransactionCursor } from "@/lib/finance/types";

export function MovementCalendarClient() {
  const { profile, currentMonth, transactions, recurringRules, recurringOccurrences, listTransactions } = useFinance();
  const [compact, setCompact] = useState(false);
  const [visibleRange, setVisibleRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
  const [calendarTransactions, setCalendarTransactions] = useState<Transaction[]>([]);
  const [rangeResult, setRangeResult] = useState<{ key: string; error: string | null }>({ key: "", error: null });
  const [rangeRetry, setRangeRetry] = useState(0);
  const money = currencyFormatter(profile?.currencyCode);
  const rangeKey = visibleRange ? `${visibleRange.dateFrom}|${visibleRange.dateTo}|${rangeRetry}` : "";
  const loadingRange = Boolean(visibleRange && rangeResult.key !== rangeKey);
  const rangeError = rangeResult.key === rangeKey ? rangeResult.error : null;
  const displayedTransactions = useMemo(() => mergeTransactions(calendarTransactions, transactions), [calendarTransactions, transactions]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!visibleRange) return;
    let active = true;
    void (async () => {
      const loaded: Transaction[] = [];
      let cursor: TransactionCursor | null = null;
      for (let pageIndex = 0; pageIndex < 25; pageIndex += 1) {
        const page = await listTransactions({ ...visibleRange, limit: 100, cursor });
        loaded.push(...page.items, ...page.related);
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
      }
      if (active) {
        setCalendarTransactions((current) => mergeTransactions(current, loaded));
        setRangeResult({ key: rangeKey, error: null });
      }
    })().catch((error: unknown) => {
      if (active) setRangeResult({ key: rangeKey, error: error instanceof Error ? error.message : "No pudimos completar este periodo." });
    });
    return () => { active = false; };
  }, [listTransactions, rangeKey, visibleRange]);

  const displayOccurrences = useMemo(() => {
    if (!visibleRange) return recurringOccurrences;
    const projected = recurringRules.flatMap((rule) => projectedOccurrences(rule, visibleRange.dateFrom, visibleRange.dateTo));
    const actualKeys = new Set(recurringOccurrences.map((occurrence) => `${occurrence.ruleId}:${occurrence.scheduledOn}`));
    return [...recurringOccurrences, ...projected.filter((occurrence) => !actualKeys.has(`${occurrence.ruleId}:${occurrence.scheduledOn}`))];
  }, [recurringOccurrences, recurringRules, visibleRange]);

  const events = useMemo<EventInput[]>(() => {
    const real = displayedTransactions.map((transaction) => ({
      id: `transaction:${transaction.id}`,
      title: transaction.merchant || transaction.description,
      start: transaction.occurredOn,
      allDay: true,
      extendedProps: { kind: transaction.kind === "income" ? "income" : transaction.kind === "expense" ? "expense" : "transfer", amount: transaction.amount, sourceId: transaction.id, source: "transaction", status: transaction.syncStatus ?? "synced" },
    }));
    const scheduled = displayOccurrences.filter((occurrence) => occurrence.status !== "posted" && occurrence.status !== "cancelled").map((occurrence) => ({
      id: `occurrence:${occurrence.id}`,
      title: occurrence.merchant || occurrence.description,
      start: occurrence.effectiveOn,
      allDay: true,
      extendedProps: { kind: occurrence.kind, amount: occurrence.amount, sourceId: occurrence.ruleId, source: "recurring", status: occurrence.status },
    }));
    return [...real, ...scheduled];
  }, [displayOccurrences, displayedTransactions]);

  function openEvent(info: EventClickArg) {
    const props = info.event.extendedProps as { source: "transaction" | "recurring"; sourceId: string };
    window.dispatchEvent(new CustomEvent(props.source === "transaction" ? "moneva:edit-transaction" : "moneva:edit-recurring-rule", { detail: { id: props.sourceId } }));
  }

  function createOnDate(info: DateClickArg) {
    window.dispatchEvent(new CustomEvent("moneva:quick-add", { detail: { occurredOn: info.dateStr.slice(0, 10) } }));
  }

  function updateVisibleRange(info: DatesSetArg) {
    const dateFrom = info.startStr.slice(0, 10);
    const dateTo = previousIsoDate(info.endStr.slice(0, 10));
    setVisibleRange((current) => current?.dateFrom === dateFrom && current.dateTo === dateTo ? current : { dateFrom, dateTo });
  }

  function makeEventInteractive(info: EventMountArg) {
    const props = info.event.extendedProps as { kind: "income" | "expense" | "transfer"; amount: number; source: string };
    info.el.tabIndex = 0;
    info.el.setAttribute("role", "button");
    info.el.setAttribute("aria-label", `${info.event.title}, ${money.format(props.amount)}${props.source === "recurring" ? ", previsto" : ""}`);
    info.el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      info.el.click();
    });
  }

  function makeDayInteractive(info: DayCellMountArg) {
    info.el.tabIndex = 0;
    info.el.setAttribute("aria-label", `Registrar movimiento el ${new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(info.date)}`);
    info.el.addEventListener("keydown", (event) => {
      if (event.target !== info.el || event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("moneva:quick-add", { detail: { occurredOn: localDateIso(info.date) } }));
    });
  }

  function renderEvent(info: EventContentArg) {
    const props = info.event.extendedProps as { kind: "income" | "expense" | "transfer"; amount: number; source: string; status: string };
    return <div className="min-w-0"><div className="flex min-w-0 items-center gap-1.5"><i className={cn("size-1.5 shrink-0 rounded-full", props.kind === "income" ? "bg-positive" : props.kind === "expense" ? "bg-destructive" : "bg-info")} /><span className="truncate font-medium">{info.event.title}</span></div>{!compact ? <p className={cn("mt-0.5 truncate text-[11px] tabular-nums", props.kind === "income" ? "text-positive" : props.kind === "expense" ? "text-destructive" : "text-info")}>{props.kind === "income" ? "+" : props.kind === "expense" ? "−" : ""}{money.format(props.amount)}{props.source === "recurring" ? " · previsto" : ""}</p> : null}</div>;
  }

  return <div className="min-w-0">
    <div className="mb-6"><p className="text-[11px] font-medium uppercase tracking-[.14em] text-primary">Vista temporal</p><h2 className="mt-2 text-2xl font-medium tracking-[-.035em]">Tu mes, en contexto</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Combina movimientos reales y próximos cobros. Los previstos están señalados, pero no alteran saldos hasta publicarse.</p></div>
    <div className="moneva-calendar min-w-0 overflow-hidden rounded-[1.25rem] border bg-background p-2 sm:p-4" aria-busy={loadingRange}>
      <FullCalendar
        key={compact ? "compact" : "wide"}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        locale={esLocale}
        initialDate={currentMonth}
        initialView={compact ? "listMonth" : "dayGridMonth"}
        headerToolbar={compact ? { left: "prev,next", center: "title", right: "dayGridMonth,listMonth" } : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridThreeDay,listMonth" }}
        views={{ timeGridThreeDay: { type: "timeGrid", duration: { days: 3 }, buttonText: "3 días" } }}
        buttonText={{ today: "Hoy", month: "Mes", week: "Semana", list: "Agenda" }}
        height="auto"
        dayMaxEvents={compact ? 2 : 4}
        fixedWeekCount={false}
        nowIndicator
        events={events}
        eventClick={openEvent}
        eventContent={renderEvent}
        dateClick={createOnDate}
        datesSet={updateVisibleRange}
        eventDidMount={makeEventInteractive}
        dayCellDidMount={makeDayInteractive}
        eventClassNames={(arg) => [`moneva-calendar-event`, `is-${arg.event.extendedProps.kind}`, arg.event.extendedProps.source === "recurring" ? "is-planned" : "is-real"]}
      />
    </div>
    {loadingRange ? <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">Completando los movimientos de este periodo…</p> : null}
    {rangeError ? <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/8 p-4 text-sm sm:flex-row sm:items-center sm:justify-between" role="alert"><p>El calendario puede estar incompleto: {rangeError}</p><Button type="button" variant="outline" className="h-11 shrink-0 rounded-full" onClick={() => setRangeRetry((value) => value + 1)}>Reintentar</Button></div> : null}
    {!events.length ? <div className="mt-5 flex items-start gap-3 rounded-2xl bg-secondary/35 p-4 text-sm text-muted-foreground" role="status"><CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" /><p>El calendario se llenará con tus movimientos y programaciones. Toca cualquier fecha para registrar el primero.</p></div> : null}
    {recurringOccurrences.some((item) => item.status === "failed") ? <div className="mt-4 flex items-start gap-3 rounded-2xl bg-destructive/8 p-4 text-sm text-destructive" role="alert"><CircleAlert className="mt-0.5 size-5 shrink-0" /><p>Hay programaciones que no pudieron publicarse. Revísalas en Programados antes de confiar en la proyección.</p></div> : null}
  </div>;
}

function mergeTransactions(current: Transaction[], incoming: Transaction[]) {
  const merged = new Map(current.map((transaction) => [transaction.id, transaction]));
  incoming.forEach((transaction) => merged.set(transaction.id, transaction));
  return [...merged.values()];
}

function previousIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function localDateIso(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
