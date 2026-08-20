"use client";

import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type { EventContentArg, EventClickArg, EventInput } from "@fullcalendar/core";
import { CalendarDays, CircleAlert } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { currencyFormatter } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

export function MovementCalendarClient() {
  const { profile, currentMonth, transactions, recurringOccurrences } = useFinance();
  const [compact, setCompact] = useState(false);
  const money = currencyFormatter(profile?.currencyCode);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const events = useMemo<EventInput[]>(() => {
    const real = transactions.map((transaction) => ({
      id: `transaction:${transaction.id}`,
      title: transaction.merchant || transaction.description,
      start: transaction.occurredOn,
      allDay: true,
      extendedProps: { kind: transaction.kind === "income" ? "income" : transaction.kind === "expense" ? "expense" : "transfer", amount: transaction.amount, sourceId: transaction.id, source: "transaction", status: transaction.syncStatus ?? "synced" },
    }));
    const scheduled = recurringOccurrences.filter((occurrence) => occurrence.status !== "posted" && occurrence.status !== "cancelled").map((occurrence) => ({
      id: `occurrence:${occurrence.id}`,
      title: occurrence.merchant || occurrence.description,
      start: occurrence.effectiveOn,
      allDay: true,
      extendedProps: { kind: occurrence.kind, amount: occurrence.amount, sourceId: occurrence.ruleId, source: "recurring", status: occurrence.status },
    }));
    return [...real, ...scheduled];
  }, [recurringOccurrences, transactions]);

  function openEvent(info: EventClickArg) {
    const props = info.event.extendedProps as { source: "transaction" | "recurring"; sourceId: string };
    window.dispatchEvent(new CustomEvent(props.source === "transaction" ? "moneva:edit-transaction" : "moneva:edit-recurring-rule", { detail: { id: props.sourceId } }));
  }

  function renderEvent(info: EventContentArg) {
    const props = info.event.extendedProps as { kind: "income" | "expense" | "transfer"; amount: number; source: string; status: string };
    return <div className="min-w-0"><div className="flex min-w-0 items-center gap-1.5"><i className={cn("size-1.5 shrink-0 rounded-full", props.kind === "income" ? "bg-positive" : props.kind === "expense" ? "bg-destructive" : "bg-info")} /><span className="truncate font-medium">{info.event.title}</span></div>{!compact ? <p className={cn("mt-0.5 truncate text-[10px] tabular-nums", props.kind === "income" ? "text-positive" : props.kind === "expense" ? "text-destructive" : "text-info")}>{props.kind === "income" ? "+" : props.kind === "expense" ? "−" : ""}{money.format(props.amount)}{props.source === "recurring" ? " · previsto" : ""}</p> : null}</div>;
  }

  return <div className="min-w-0">
    <div className="mb-6"><p className="text-[11px] font-medium uppercase tracking-[.14em] text-primary">Vista temporal</p><h2 className="mt-2 text-2xl font-medium tracking-[-.035em]">Tu mes, en contexto</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Combina movimientos reales y próximos cobros. Los previstos están señalados, pero no alteran saldos hasta publicarse.</p></div>
    <div className="moneva-calendar min-w-0 overflow-hidden rounded-[1.25rem] border bg-background p-2 sm:p-4">
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
        dateClick={() => window.dispatchEvent(new Event("moneva:quick-add"))}
        eventClassNames={(arg) => [`moneva-calendar-event`, `is-${arg.event.extendedProps.kind}`, arg.event.extendedProps.source === "recurring" ? "is-planned" : "is-real"]}
      />
    </div>
    {!events.length ? <div className="mt-5 flex items-start gap-3 rounded-2xl bg-secondary/35 p-4 text-sm text-muted-foreground" role="status"><CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" /><p>El calendario se llenará con tus movimientos y programaciones. Toca cualquier fecha para registrar el primero.</p></div> : null}
    {recurringOccurrences.some((item) => item.status === "failed") ? <div className="mt-4 flex items-start gap-3 rounded-2xl bg-destructive/8 p-4 text-sm text-destructive" role="alert"><CircleAlert className="mt-0.5 size-5 shrink-0" /><p>Hay programaciones que no pudieron publicarse. Revísalas en Programados antes de confiar en la proyección.</p></div> : null}
  </div>;
}
