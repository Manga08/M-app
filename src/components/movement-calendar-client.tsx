"use client";

import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Clock3, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, animate, useIsPresent, useMotionValue, useReducedMotion, type Variants } from "motion/react";
import * as m from "motion/react-m";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { accountContextLabel } from "@/lib/finance/account-entities";
import { currencyFormatter, localIsoDate, monthLabel } from "@/lib/finance/calculations";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { creditCardCycle } from "@/lib/finance/credit-cards";
import { projectedOccurrences } from "@/lib/finance/recurrence";
import { recurringOccurrenceReportingAmount, transactionReportingAmount } from "@/lib/finance/currency";
import { motionDurations, motionEasings, motionSprings } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Account, AccountEntity, RecurringOccurrence, Transaction, TransactionCursor } from "@/lib/finance/types";
import styles from "./movement-calendar.module.css";

type CalendarEntry = {
  id: string;
  source: "transaction" | "recurring" | "card";
  sourceId: string;
  date: string;
  kind: "income" | "expense" | "transfer";
  amount: number;
  reportAmount: number;
  currencyCode: string;
  title: string;
  description: string;
  icon?: string;
  accountId: string;
  categoryId?: string;
  planned: boolean;
  status: string;
};

type MobileCalendarMode = "week" | "month";

type PeriodDirection = -1 | 0 | 1;

type PeriodMotion = {
  direction: PeriodDirection;
  input: "control" | "direct" | "gesture";
  distance: number;
  offset: number;
  velocity: number;
};

type PeriodMotionContext = PeriodMotion & {
  reduced: boolean;
};

type SwipePointerSession = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  axis: "x" | "y" | null;
  samples: Array<{ x: number; at: number }>;
};

const INITIAL_PERIOD_MOTION: PeriodMotion = { direction: 0, input: "direct", distance: 0, offset: 0, velocity: 0 };
const SWIPE_DISTANCE_THRESHOLD = 56;
const SWIPE_DECELERATION_RATE = 0.99;

const periodVariants: Variants = {
  enter: (context: PeriodMotionContext) => ({
    opacity: context.reduced || context.direction === 0 ? 0 : 1,
    x: periodOffset(context, false),
    transition: periodTransition(context),
  }),
  center: (context: PeriodMotionContext) => ({
    opacity: 1,
    x: 0,
    transition: periodTransition(context),
  }),
  exit: (context: PeriodMotionContext) => ({
    opacity: context.reduced || context.direction === 0 ? 0 : 1,
    x: periodOffset(context, true),
    transition: periodTransition(context),
  }),
};

export function MovementCalendarClient() {
  const router = useRouter();
  const {
    profile,
    currentMonth,
    transactions,
    recurringRules,
    recurringOccurrences,
    creditCards,
    accounts,
    accountEntities,
    categories,
    listTransactions,
  } = useFinance();
  const today = useMemo(() => localIsoDate(new Date(), profile?.timezone), [profile?.timezone]);
  const initialDate = today.slice(0, 7) === currentMonth.slice(0, 7) ? today : currentMonth;
  const [compact, setCompact] = useState(false);
  const [mobileMode, setMobileMode] = useState<MobileCalendarMode>("week");
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(initialDate));
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [calendarTransactions, setCalendarTransactions] = useState<Transaction[]>([]);
  const [rangeResult, setRangeResult] = useState<{ key: string; error: string | null }>({ key: "", error: null });
  const [rangeRetry, setRangeRetry] = useState(0);
  const [periodMotion, setPeriodMotion] = useState<PeriodMotion>(INITIAL_PERIOD_MOTION);
  const calendarViewportRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const weekStartsOn = normalizeWeekStart(profile?.weekStartsOn);
  const money = currencyFormatter(profile?.currencyCode);
  const compactMoney = currencyFormatter(profile?.currencyCode, true);
  const gridDays = useMemo(() => calendarGridDays(visibleMonth, weekStartsOn), [visibleMonth, weekStartsOn]);
  const visibleRange = useMemo(() => ({ dateFrom: gridDays[0], dateTo: gridDays.at(-1) ?? gridDays[0] }), [gridDays]);
  const rangeKey = `${visibleRange.dateFrom}|${visibleRange.dateTo}|${rangeRetry}`;
  const loadingRange = rangeResult.key !== rangeKey;
  const rangeError = rangeResult.key === rangeKey ? rangeResult.error : null;
  const displayedTransactions = useMemo(() => mergeTransactions(calendarTransactions, transactions), [calendarTransactions, transactions]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setPeriodMotion(INITIAL_PERIOD_MOTION);
      setCompact(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
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
    const projected = recurringRules.flatMap((rule) => projectedOccurrences(rule, visibleRange.dateFrom, visibleRange.dateTo));
    const actualKeys = new Set(recurringOccurrences.map((occurrence) => `${occurrence.ruleId}:${occurrence.scheduledOn}`));
    return [...recurringOccurrences, ...projected.filter((occurrence) => !actualKeys.has(`${occurrence.ruleId}:${occurrence.scheduledOn}`))];
  }, [recurringOccurrences, recurringRules, visibleRange]);

  const entries = useMemo<CalendarEntry[]>(() => {
    const real = displayedTransactions
      .filter((transaction) => isInRange(transaction.occurredOn, visibleRange))
      .filter((transaction) => !transaction.kind.startsWith("adjustment"))
      .map((transaction) => ({
        id: `transaction:${transaction.id}`,
        source: "transaction" as const,
        sourceId: transaction.id,
        date: transaction.occurredOn,
        kind: transaction.kind === "income" ? "income" as const : transaction.kind === "expense" ? "expense" as const : "transfer" as const,
        amount: transaction.amount,
        reportAmount: transactionReportingAmount(transaction),
        currencyCode: transaction.nativeCurrencyCode ?? accounts.find((account) => account.id === transaction.accountId)?.currencyCode ?? profile?.currencyCode ?? "COP",
        title: transaction.merchant || transaction.description,
        description: transaction.description,
        icon: transaction.icon,
        accountId: transaction.accountId,
        categoryId: transaction.categoryId,
        planned: false,
        status: transaction.syncStatus ?? "synced",
      }));
    const scheduled = displayOccurrences
      .filter((occurrence) => occurrence.status !== "posted" && occurrence.status !== "cancelled")
      .filter((occurrence) => isInRange(occurrence.effectiveOn, visibleRange))
      .map((occurrence) => occurrenceEntry(occurrence, accounts.find((account) => account.id === occurrence.accountId)?.currencyCode ?? profile?.currencyCode ?? "COP"));
    const cardMilestones = creditCards.flatMap((card) => {
      const account = accounts.find((candidate) => candidate.id === card.accountId && !candidate.archived);
      if (!account) return [];
      return calendarDates(visibleRange.dateFrom, visibleRange.dateTo).flatMap((date) => {
        const cycle = creditCardCycle(card, parseIsoDate(date));
        const entries: CalendarEntry[] = [];
        if (cycle.cutoffOn === date) entries.push(cardMilestone(account, date, "cutoff"));
        if (cycle.dueOn === date) entries.push(cardMilestone(account, date, "payment"));
        return entries;
      });
    });
    const uniqueMilestones = [...new Map(cardMilestones.map((entry) => [entry.id, entry])).values()];
    return [...real, ...scheduled, ...uniqueMilestones].toSorted((left, right) => left.date.localeCompare(right.date) || Number(left.planned) - Number(right.planned) || left.title.localeCompare(right.title, "es"));
  }, [accounts, creditCards, displayOccurrences, displayedTransactions, profile?.currencyCode, visibleRange]);

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEntry[]>();
    for (const entry of entries) grouped.set(entry.date, [...(grouped.get(entry.date) ?? []), entry]);
    return grouped;
  }, [entries]);
  const monthEntries = useMemo(() => entries.filter((entry) => entry.date.slice(0, 7) === visibleMonth.slice(0, 7)), [entries, visibleMonth]);
  const monthPulse = useMemo(() => summarizeEntries(monthEntries), [monthEntries]);
  const selectedEntries = useMemo(() => entriesByDate.get(selectedDate) ?? [], [entriesByDate, selectedDate]);
  const selectedPulse = useMemo(() => summarizeEntries(selectedEntries), [selectedEntries]);
  const selectedWeek = useMemo(() => calendarWeekDays(selectedDate, weekStartsOn), [selectedDate, weekStartsOn]);

  function selectDate(date: string) {
    const nextMonth = monthStart(date);
    const changesVisiblePeriod = compact && mobileMode === "week"
      ? calendarWeekDays(date, weekStartsOn)[0] !== selectedWeek[0]
      : nextMonth !== visibleMonth;
    if (changesVisiblePeriod) setPeriodMotion(INITIAL_PERIOD_MOTION);
    setSelectedDate(date);
    if (nextMonth !== visibleMonth) setVisibleMonth(nextMonth);
  }

  function navigatePeriod(direction: -1 | 1, gesture?: { distance: number; offset: number; velocity: number }) {
    setPeriodMotion({
      direction,
      input: gesture ? "gesture" : "control",
      distance: gesture?.distance ?? 0,
      offset: gesture?.offset ?? 0,
      velocity: gesture?.velocity ?? 0,
    });
    if (compact && mobileMode === "week") {
      const next = addDays(selectedDate, direction * 7);
      setSelectedDate(next);
      const nextMonth = monthStart(next);
      if (nextMonth !== visibleMonth) setVisibleMonth(nextMonth);
      return;
    }
    const next = addMonthsClamped(selectedDate, direction);
    setVisibleMonth(monthStart(next));
    setSelectedDate(next);
  }

  function goToday() {
    setPeriodMotion({ direction: today < selectedDate ? -1 : today > selectedDate ? 1 : 0, input: "control", distance: 0, offset: 0, velocity: 0 });
    setVisibleMonth(monthStart(today));
    setSelectedDate(today);
  }

  function changeMobileMode(mode: MobileCalendarMode) {
    if (mode === mobileMode) return;
    setPeriodMotion(INITIAL_PERIOD_MOTION);
    setMobileMode(mode);
  }

  function createOnSelectedDate() {
    window.dispatchEvent(new CustomEvent("moneva:quick-add", { detail: { occurredOn: selectedDate } }));
  }

  function openEntry(entry: CalendarEntry) {
    if (entry.source === "card") {
      router.push(`/cuentas/tarjetas/${entry.sourceId}`);
      return;
    }
    window.dispatchEvent(new CustomEvent(entry.source === "transaction" ? "moneva:edit-transaction" : "moneva:edit-recurring-rule", { detail: { id: entry.sourceId } }));
  }

  function moveDayFocus(event: KeyboardEvent<HTMLButtonElement>, date: string, mode: MobileCalendarMode) {
    let nextDate: string | null = null;
    if (event.key === "ArrowLeft") nextDate = addDays(date, -1);
    if (event.key === "ArrowRight") nextDate = addDays(date, 1);
    if (event.key === "ArrowUp") nextDate = addDays(date, -7);
    if (event.key === "ArrowDown") nextDate = addDays(date, 7);
    if (event.key === "Home") nextDate = addDays(date, -weekOffset(date, weekStartsOn));
    if (event.key === "End") nextDate = addDays(date, 6 - weekOffset(date, weekStartsOn));
    if (event.key === "PageUp") nextDate = addMonthsClamped(date, -1);
    if (event.key === "PageDown") nextDate = addMonthsClamped(date, 1);
    if (!nextDate) return;
    event.preventDefault();
    selectDate(nextDate);
    requestAnimationFrame(() => {
      const activePanel = calendarViewportRef.current?.querySelector<HTMLElement>("[data-calendar-period-slide]:not([aria-hidden='true']):not([inert])");
      activePanel?.querySelector<HTMLButtonElement>(`[data-calendar-mode="${mode}"][data-calendar-date="${nextDate}"]`)?.focus();
    });
  }

  const monthTitle = capitalize(monthLabel(visibleMonth));
  const compactMonthTitle = capitalize(monthLabel(visibleMonth, "short"));
  const previousLabel = compact && mobileMode === "week" ? "Semana anterior" : "Mes anterior";
  const nextLabel = compact && mobileMode === "week" ? "Semana siguiente" : "Mes siguiente";
  const activePeriodLabel = compact && mobileMode === "week"
    ? `Semana del ${shortCalendarDate(selectedWeek[0])} al ${shortCalendarDate(selectedWeek.at(-1) ?? selectedWeek[0])}`
    : monthTitle;
  const activePeriodKey = compact && mobileMode === "week" ? `week:${selectedWeek[0]}` : `month:${visibleMonth}`;
  const periodMotionContext: PeriodMotionContext = { ...periodMotion, reduced: Boolean(reduceMotion) };

  return <div className="min-w-0">
    <div className="mb-6">
      <p className="text-[11px] font-medium uppercase tracking-[.14em] text-primary">Vista temporal</p>
      <h2 className="mt-2 text-2xl font-medium tracking-[-.035em]">Tu mes, en contexto</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Lee el pulso de cada día y abre cualquier movimiento sin perderte. Las programaciones y fechas de tarjetas se muestran aparte y no alteran el saldo.</p>
    </div>

    <section className={styles.calendar} data-financial-calendar aria-label="Calendario financiero" aria-busy={loadingRange}>
      <header className={styles.toolbar}>
        <div className="min-w-0">
          <p className={styles.toolbarEyebrow}>{compact && mobileMode === "week" ? "Semana financiera" : "Mes financiero"}</p>
          <h3 className={styles.toolbarTitle} aria-live="polite"><span className={styles.compactMonthTitle}>{compactMonthTitle}</span><span className={styles.fullMonthTitle}>{monthTitle}</span></h3>
        </div>
        <div className={styles.toolbarActions}>
          <div className={styles.navGroup}>
            <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label={previousLabel} onClick={() => navigatePeriod(-1)}><ChevronLeft aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" className="rounded-full px-3" onClick={goToday}>Hoy</Button>
            <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label={nextLabel} onClick={() => navigatePeriod(1)}><ChevronRight aria-hidden="true" /></Button>
          </div>
        </div>
      </header>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{activePeriodLabel}</p>

      <div className={styles.mobileMode} role="group" aria-label="Formato del calendario">
        <button type="button" aria-pressed={mobileMode === "week"} onClick={() => changeMobileMode("week")}>Semana</button>
        <button type="button" aria-pressed={mobileMode === "month"} onClick={() => changeMobileMode("month")}>Mes</button>
      </div>

      <MonthPulse income={monthPulse.income} expense={monthPulse.expense} balance={monthPulse.balance} plannedCount={monthPulse.plannedCount} money={money} />

      <div className={styles.workspace}>
        <div className={styles.calendarPane}>
          <div
            ref={calendarViewportRef}
            className={styles.swipeViewport}
            data-calendar-swipe-surface
            data-calendar-period={activePeriodLabel}
            role="group"
            aria-label={`${activePeriodLabel}. Desliza horizontalmente para cambiar de periodo.`}
          >
            <AnimatePresence initial={false} custom={periodMotionContext} mode="sync">
              <CalendarPeriodSlide
                key={activePeriodKey}
                motionContext={periodMotionContext}
                swipeEnabled={compact}
                onNavigate={(direction, gesture) => navigatePeriod(direction, gesture)}
              >
                <div className={cn(styles.weekView, mobileMode !== "week" && styles.mobileHidden)} aria-label="Semana seleccionada">
                  <div className={styles.weekStrip}>
                    {selectedWeek.map((date) => <WeekDayButton key={date} date={date} selected={date === selectedDate} today={date === today} entries={entriesByDate.get(date) ?? []} money={money} onSelect={selectDate} onKeyDown={(event) => moveDayFocus(event, date, "week")} />)}
                  </div>
                </div>

                <div className={cn(styles.monthView, mobileMode === "month" && styles.mobileMonthActive)}>
                  <CalendarMonthGrid days={gridDays} visibleMonth={visibleMonth} selectedDate={selectedDate} today={today} weekStartsOn={weekStartsOn} entriesByDate={entriesByDate} compactMoney={compactMoney} money={money} onSelect={selectDate} onKeyDown={(event, date) => moveDayFocus(event, date, "month")} />
                </div>
              </CalendarPeriodSlide>
            </AnimatePresence>
          </div>
        </div>

        <DayLedger date={selectedDate} today={today} entries={selectedEntries} pulse={selectedPulse} accounts={accounts} accountEntities={accountEntities} categories={categories} money={money} summaryMoney={compact ? compactMoney : money} onAdd={createOnSelectedDate} onOpen={openEntry} />
      </div>
    </section>

    {loadingRange ? <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">Completando los movimientos de este periodo…</p> : null}
    {rangeError ? <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/8 p-4 text-sm sm:flex-row sm:items-center sm:justify-between" role="alert"><p>El calendario puede estar incompleto: {rangeError}</p><Button type="button" variant="outline" className="h-11 shrink-0 rounded-full" onClick={() => setRangeRetry((value) => value + 1)}>Reintentar</Button></div> : null}
    {!entries.length && !loadingRange ? <div className="mt-5 flex items-start gap-3 rounded-2xl bg-secondary/35 p-4 text-sm text-muted-foreground" role="status"><CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" /><p>El calendario se llenará con tus movimientos y programaciones. Selecciona un día y registra el primero.</p></div> : null}
    {recurringOccurrences.some((item) => item.status === "failed") ? <div className="mt-4 flex items-start gap-3 rounded-2xl bg-destructive/8 p-4 text-sm text-destructive" role="alert"><CircleAlert className="mt-0.5 size-5 shrink-0" /><p>Hay programaciones que no pudieron publicarse. Revísalas en Programados antes de confiar en la proyección.</p></div> : null}
  </div>;
}

function CalendarPeriodSlide({
  children,
  motionContext,
  swipeEnabled,
  onNavigate,
}: {
  children: ReactNode;
  motionContext: PeriodMotionContext;
  swipeEnabled: boolean;
  onNavigate: (direction: -1 | 1, gesture: { distance: number; offset: number; velocity: number }) => void;
}) {
  const isPresent = useIsPresent();
  const dragOffset = useMotionValue(0);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pointerSession = useRef<SwipePointerSession | null>(null);
  const settleAnimation = useRef<{ stop: () => void } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => settleAnimation.current?.stop(), []);

  useEffect(() => {
    if (swipeEnabled) return;
    settleAnimation.current?.stop();
    dragOffset.set(0);
    const frame = requestAnimationFrame(() => setDragging(false));
    return () => cancelAnimationFrame(frame);
  }, [dragOffset, swipeEnabled]);

  function settleDrag(velocity: number) {
    settleAnimation.current?.stop();
    setDragging(false);
    if (motionContext.reduced) {
      dragOffset.set(0);
      return;
    }
    settleAnimation.current = animate(dragOffset, 0, {
      ...motionSprings.direct,
      velocity,
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!swipeEnabled || !isPresent || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0) || pointerSession.current) return;
    settleAnimation.current?.stop();
    pointerSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.get(),
      axis: null,
      samples: [{ x: event.clientX, at: event.timeStamp }],
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const session = pointerSession.current;
    if (!swipeEnabled || !isPresent || !session || session.pointerId !== event.pointerId) return;
    const offsetX = event.clientX - session.startX;
    const offsetY = event.clientY - session.startY;

    if (!session.axis) {
      if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) < 10) return;
      session.axis = Math.abs(offsetX) > Math.abs(offsetY) ? "x" : "y";
      if (session.axis === "x") event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (session.axis !== "x") return;

    event.preventDefault();
    if (!dragging) setDragging(true);
    session.samples.push({ x: event.clientX, at: event.timeStamp });
    if (session.samples.length > 4) session.samples.shift();
    dragOffset.set(motionContext.reduced ? 0 : session.originX + offsetX);
  }

  function finishPointerGesture(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const session = pointerSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    pointerSession.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (cancelled || !swipeEnabled || !isPresent || session.axis !== "x") {
      settleDrag(0);
      return;
    }

    session.samples.push({ x: event.clientX, at: event.timeStamp });
    if (session.samples.length > 4) session.samples.shift();
    const firstSample = session.samples[0];
    const lastSample = session.samples.at(-1) ?? firstSample;
    const elapsed = Math.max(1, lastSample.at - firstSample.at);
    const velocity = ((lastSample.x - firstSample.x) / elapsed) * 1000;
    const offset = event.clientX - session.startX;
    const releaseOffset = motionContext.reduced ? 0 : dragOffset.get();

    const projectedEndpoint = (motionContext.reduced ? offset : releaseOffset) + projectSwipeDistance(velocity);
    const committed = Math.abs(offset) >= SWIPE_DISTANCE_THRESHOLD
      || Math.abs(projectedEndpoint) >= SWIPE_DISTANCE_THRESHOLD;
    if (!committed || projectedEndpoint === 0) {
      settleDrag(velocity);
      return;
    }

    setDragging(false);
    const direction = projectedEndpoint < 0 ? 1 : -1;
    onNavigate(direction, {
      distance: surfaceRef.current?.clientWidth ?? 0,
      offset: releaseOffset,
      velocity,
    });
  }

  return <m.div
    className={styles.periodSlide}
    data-calendar-period-slide
    data-calendar-drag-layer
    data-calendar-dragging={dragging ? "true" : "false"}
    custom={motionContext}
    variants={periodVariants}
    initial="enter"
    animate="center"
    exit="exit"
    aria-hidden={!isPresent}
    inert={isPresent ? undefined : true}
    style={{ x: dragOffset, willChange: dragging ? "transform" : "auto" }}
  >
    <div
      ref={surfaceRef}
      className={styles.swipeSurface}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerGesture}
      onPointerCancel={(event) => finishPointerGesture(event, true)}
      onLostPointerCapture={(event) => {
        if (event.target === event.currentTarget) finishPointerGesture(event, true);
      }}
      style={{ touchAction: "pan-y" }}
    >
      {children}
    </div>
  </m.div>;
}

function MonthPulse({ income, expense, balance, plannedCount, money }: { income: number; expense: number; balance: number; plannedCount: number; money: Intl.NumberFormat }) {
  return <div className={styles.monthPulse} aria-label="Resumen del mes visible">
    <PulseMetric label="Ingresado" value={`+${money.format(income)}`} tone="positive" />
    <PulseMetric label="Gastado" value={`−${money.format(expense)}`} tone="destructive" />
    <PulseMetric label="Balance" value={`${balance > 0 ? "+" : balance < 0 ? "−" : ""}${money.format(Math.abs(balance))}`} tone={balance >= 0 ? "positive" : "destructive"} />
    <PulseMetric label="Próximos" value={plannedCount ? `${plannedCount} previstos` : "Sin movimientos"} tone="muted" />
  </div>;
}

function PulseMetric({ label, value, tone }: { label: string; value: string; tone: "positive" | "destructive" | "muted" }) {
  return <div className={styles.pulseMetric}><span>{label}</span><strong className={cn(tone === "positive" && "text-positive", tone === "destructive" && "text-destructive")}>{value}</strong></div>;
}

function CalendarMonthGrid({ days, visibleMonth, selectedDate, today, weekStartsOn, entriesByDate, compactMoney, money, onSelect, onKeyDown }: { days: string[]; visibleMonth: string; selectedDate: string; today: string; weekStartsOn: number; entriesByDate: Map<string, CalendarEntry[]>; compactMoney: Intl.NumberFormat; money: Intl.NumberFormat; onSelect: (date: string) => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, date: string) => void }) {
  const weekdays = weekdayLabels(weekStartsOn);
  const weeks = chunk(days, 7);
  return <div className={styles.monthGrid} role="grid" aria-label={`Calendario de ${monthLabel(visibleMonth)}`}>
    <div className={styles.monthHeader} role="row">{weekdays.map((weekday) => <span key={weekday.long} role="columnheader" aria-label={weekday.long}>{weekday.short}</span>)}</div>
    {weeks.map((week) => <div className={styles.monthRow} role="row" key={week[0]}>
      {week.map((date) => {
        const dayEntries = entriesByDate.get(date) ?? [];
        const pulse = summarizeEntries(dayEntries);
        const selected = date === selectedDate;
        const isToday = date === today;
        const outside = date.slice(0, 7) !== visibleMonth.slice(0, 7);
        return <div key={date} role="gridcell" aria-selected={selected} className={styles.monthCell}>
          <button type="button" data-calendar-mode="month" data-calendar-date={date} className={cn(styles.dayButton, outside && styles.outsideDay, selected && styles.selectedDay, isToday && styles.today)} aria-label={dayAriaLabel(date, pulse, money, isToday)} aria-pressed={selected} tabIndex={selected ? 0 : -1} onClick={() => onSelect(date)} onKeyDown={(event) => onKeyDown(event, date)}>
            <span className={styles.dayTop}><span className={styles.dayNumber}>{Number(date.slice(8, 10))}</span>{isToday ? <span className={styles.todayLabel}>Hoy</span> : null}</span>
            <span className={styles.dayAmounts} aria-hidden="true">
              {pulse.income ? <span className="text-positive">+ {compactMoney.format(pulse.income)}</span> : null}
              {pulse.expense ? <span className="text-destructive">− {compactMoney.format(pulse.expense)}</span> : null}
              {!pulse.income && !pulse.expense && pulse.transferCount ? <span className="text-info"><ArrowLeftRight /> {pulse.transferCount}</span> : null}
            </span>
            <span className={styles.dayMeta} aria-hidden="true"><span className={!dayEntries.length ? styles.emptyDay : undefined}>{dayEntries.length ? `${dayEntries.length} mov.` : "Sin actividad"}</span>{pulse.plannedCount ? <span className={styles.plannedMeta}><Clock3 /> {pulse.plannedCount}</span> : null}</span>
          </button>
        </div>;
      })}
    </div>)}
  </div>;
}

function WeekDayButton({ date, selected, today, entries, money, onSelect, onKeyDown }: { date: string; selected: boolean; today: boolean; entries: CalendarEntry[]; money: Intl.NumberFormat; onSelect: (date: string) => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void }) {
  const pulse = summarizeEntries(entries);
  const weekday = new Intl.DateTimeFormat("es-CO", { weekday: "narrow", timeZone: "UTC" }).format(parseIsoDate(date));
  return <button type="button" data-calendar-mode="week" data-calendar-date={date} className={cn(styles.weekDay, selected && styles.selectedWeekDay, today && styles.currentWeekDay)} aria-label={dayAriaLabel(date, pulse, money, today)} aria-pressed={selected} tabIndex={selected ? 0 : -1} onClick={() => onSelect(date)} onKeyDown={onKeyDown}>
    <span className={styles.weekdayName}>{weekday}</span><strong>{Number(date.slice(8, 10))}</strong><span className={styles.weekdayActivity}>{entries.length ? `${entries.length} mov.` : "Libre"}</span>
  </button>;
}

function DayLedger({ date, today, entries, pulse, accounts, accountEntities, categories, money, summaryMoney, onAdd, onOpen }: { date: string; today: string; entries: CalendarEntry[]; pulse: ReturnType<typeof summarizeEntries>; accounts: Account[]; accountEntities: AccountEntity[]; categories: Array<{ id: string; name: string; icon: string }>; money: Intl.NumberFormat; summaryMoney: Intl.NumberFormat; onAdd: () => void; onOpen: (entry: CalendarEntry) => void }) {
  const longDate = capitalize(new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parseIsoDate(date)));
  return <aside className={styles.dayLedger} aria-label={`Detalle del ${longDate}`}>
    <div className={styles.ledgerHeader}>
      <div className="min-w-0"><p className={styles.ledgerEyebrow}>{date === today ? "Hoy" : "Día seleccionado"}</p><h4>{longDate}</h4><p>{entries.length ? `${entries.length} ${entries.length === 1 ? "movimiento" : "movimientos"} en el día` : "Sin movimientos registrados"}</p></div>
      <Button type="button" className="h-11 rounded-full px-4" onClick={onAdd}><Plus aria-hidden="true" />Agregar</Button>
    </div>

    <div className={styles.dayPulse} aria-label="Balance del día">
      <PulseMetric label="Ingresos" value={`+${summaryMoney.format(pulse.income)}`} tone="positive" />
      <PulseMetric label="Gastos" value={`−${summaryMoney.format(pulse.expense)}`} tone="destructive" />
      <PulseMetric label="Balance" value={`${pulse.balance > 0 ? "+" : pulse.balance < 0 ? "−" : ""}${summaryMoney.format(Math.abs(pulse.balance))}`} tone={pulse.balance >= 0 ? "positive" : "destructive"} />
    </div>

    {entries.length ? <div className={styles.entryList}>{entries.map((entry) => {
      const category = categories.find((item) => item.id === entry.categoryId);
      const account = accounts.find((item) => item.id === entry.accountId);
      const fallbackIcon = entry.kind === "income" ? "briefcase" : entry.kind === "transfer" ? "hand-coins" : category?.icon ?? "receipt";
      return <button type="button" key={entry.id} className={styles.entryButton} onClick={() => onOpen(entry)} aria-label={`Abrir ${entry.title}, ${entryAmountLabel(entry, money)}`}>
        <span className={cn(styles.entryIcon, entry.kind === "income" ? styles.incomeIcon : entry.kind === "expense" ? styles.expenseIcon : styles.transferIcon)}><FinanceIcon name={entry.icon ?? fallbackIcon} /></span>
        <span className={styles.entryCopy}><span className={styles.entryTitle}>{entry.title}</span><span className={styles.entryMeta}>{entry.planned ? statusLabel(entry.status) : entry.description}{category ? ` · ${category.name}` : ""}{account ? ` · ${accountContextLabel(account, accountEntities)}` : ""}</span></span>
        <span className={styles.entryTrailing}><strong className={cn(entry.kind === "income" ? "text-positive" : entry.kind === "expense" ? "text-destructive" : "text-info")}>{entryAmountLabel(entry, money)}</strong><span>{entry.planned ? <><Clock3 /> Previsto</> : entry.status === "pending" ? "Pendiente" : "Registrado"}</span></span>
      </button>;
    })}</div> : <div className={styles.emptyLedger}><span><CalendarDays aria-hidden="true" /></span><strong>El día está libre</strong><p>Selecciona Agregar para registrar un movimiento directamente en esta fecha.</p></div>}
    {pulse.plannedCount ? <p className={styles.plannedNote}><Clock3 aria-hidden="true" />Los movimientos previstos todavía no modifican el balance real del día.</p> : null}
  </aside>;
}

function summarizeEntries(entries: CalendarEntry[]) {
  return entries.reduce((summary, entry) => {
    if (entry.planned) {
      summary.plannedCount += 1;
      if (entry.kind === "expense") summary.plannedExpense += entry.reportAmount;
      if (entry.kind === "income") summary.plannedIncome += entry.reportAmount;
      return summary;
    }
    if (entry.kind === "income") summary.income += entry.reportAmount;
    if (entry.kind === "expense") summary.expense += entry.reportAmount;
    if (entry.kind === "transfer") summary.transferCount += 1;
    summary.balance = summary.income - summary.expense;
    return summary;
  }, { income: 0, expense: 0, balance: 0, transferCount: 0, plannedCount: 0, plannedExpense: 0, plannedIncome: 0 });
}

function occurrenceEntry(occurrence: RecurringOccurrence, currencyCode: string): CalendarEntry {
  return { id: `occurrence:${occurrence.id}`, source: "recurring", sourceId: occurrence.ruleId, date: occurrence.effectiveOn, kind: occurrence.kind, amount: occurrence.amount, reportAmount: recurringOccurrenceReportingAmount(occurrence), currencyCode, title: occurrence.merchant || occurrence.description, description: occurrence.description, icon: occurrence.icon, accountId: occurrence.accountId, categoryId: occurrence.categoryId, planned: true, status: occurrence.status };
}

function cardMilestone(account: Account, date: string, status: "cutoff" | "payment"): CalendarEntry {
  const isCutoff = status === "cutoff";
  return { id: `card:${account.id}:${status}:${date}`, source: "card", sourceId: account.id, date, kind: "transfer", amount: 0, reportAmount: 0, currencyCode: account.currencyCode ?? "COP", title: `${isCutoff ? "Corte" : "Pago"} · ${account.name}`, description: isCutoff ? "Cierra el ciclo estimado" : "Fecha límite estimada", icon: isCutoff ? "calendar-range" : "credit-card", accountId: account.id, planned: true, status };
}

function dayAriaLabel(date: string, pulse: ReturnType<typeof summarizeEntries>, money: Intl.NumberFormat, today: boolean) {
  const label = new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeZone: "UTC" }).format(parseIsoDate(date));
  const activity = [pulse.income ? `${money.format(pulse.income)} de ingresos` : "", pulse.expense ? `${money.format(pulse.expense)} de gastos` : "", pulse.transferCount ? `${pulse.transferCount} transferencias` : "", pulse.plannedCount ? `${pulse.plannedCount} previstos` : ""].filter(Boolean).join(", ");
  return `${today ? "Hoy, " : ""}${label}${activity ? `. ${activity}` : ". Sin actividad"}`;
}

function entryAmountLabel(entry: CalendarEntry, money: Intl.NumberFormat) {
  if (entry.source === "card") return entry.status === "cutoff" ? "Corte" : "Pago";
  const nativeMoney = entry.currencyCode ? currencyFormatter(entry.currencyCode) : money;
  if (entry.kind === "income") return `+${nativeMoney.format(entry.amount)}`;
  if (entry.kind === "expense") return `−${nativeMoney.format(entry.amount)}`;
  return nativeMoney.format(entry.amount);
}

function statusLabel(status: string) {
  if (status === "cutoff") return "Corte estimado de la tarjeta";
  if (status === "payment") return "Fecha límite estimada";
  if (status === "failed") return "No se pudo publicar";
  if (status === "skipped") return "Omitido";
  return "Movimiento previsto";
}

function mergeTransactions(current: Transaction[], incoming: Transaction[]) {
  const merged = new Map(current.map((transaction) => [transaction.id, transaction]));
  incoming.forEach((transaction) => merged.set(transaction.id, transaction));
  return [...merged.values()];
}

function normalizeWeekStart(value?: number) {
  return Number.isInteger(value) && value !== undefined ? ((value % 7) + 7) % 7 : 1;
}

function calendarGridDays(month: string, weekStartsOn: number) {
  const first = monthStart(month);
  const leading = weekOffset(first, weekStartsOn);
  const lastOfMonth = addDays(addMonthsClamped(first, 1), -1);
  const cellCount = Math.ceil((leading + Number(lastOfMonth.slice(8, 10))) / 7) * 7;
  const start = addDays(first, -leading);
  return Array.from({ length: cellCount }, (_, index) => addDays(start, index));
}

function calendarDates(dateFrom: string, dateTo: string) {
  const dates: string[] = [];
  for (let date = dateFrom; date <= dateTo; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function calendarWeekDays(date: string, weekStartsOn: number) {
  const start = addDays(date, -weekOffset(date, weekStartsOn));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function weekdayLabels(weekStartsOn: number) {
  const sunday = "2024-01-07";
  return Array.from({ length: 7 }, (_, index) => {
    const date = parseIsoDate(addDays(sunday, (weekStartsOn + index) % 7));
    return { short: capitalize(new Intl.DateTimeFormat("es-CO", { weekday: "short", timeZone: "UTC" }).format(date).replace(".", "")), long: capitalize(new Intl.DateTimeFormat("es-CO", { weekday: "long", timeZone: "UTC" }).format(date)) };
  });
}

function weekOffset(date: string, weekStartsOn: number) {
  return (parseIsoDate(date).getUTCDay() - weekStartsOn + 7) % 7;
}

function addDays(date: string, amount: number) {
  const next = parseIsoDate(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

function addMonthsClamped(date: string, amount: number) {
  const parsed = parseIsoDate(date);
  const requestedDay = parsed.getUTCDate();
  const absoluteMonth = parsed.getUTCFullYear() * 12 + parsed.getUTCMonth() + amount;
  const year = Math.floor(absoluteMonth / 12);
  const monthIndex = ((absoluteMonth % 12) + 12) % 12;
  const maxDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(requestedDay, maxDay))).toISOString().slice(0, 10);
}

function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isInRange(date: string, range: { dateFrom: string; dateTo: string }) { return date >= range.dateFrom && date <= range.dateTo; }

function capitalize(value: string) { return value ? value[0].toLocaleUpperCase("es-CO") + value.slice(1) : value; }

function shortCalendarDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(parseIsoDate(value)).replace(" de ", " ");
}

function chunk<T>(items: T[], size: number) { return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size)); }

function periodOffset(context: PeriodMotionContext, exiting: boolean) {
  if (context.reduced || context.direction === 0) return 0;
  const direction = context.direction * (exiting ? -1 : 1);
  if (!context.distance) return `${direction * 100}%`;
  return direction * context.distance + (exiting ? 0 : context.offset);
}

function periodTransition(context: PeriodMotionContext) {
  const opacity = { duration: context.reduced ? motionDurations.reduced : motionDurations.menu, ease: motionEasings.out };
  if (context.reduced || context.direction === 0) return { x: { duration: 0 }, opacity };
  if (context.input === "gesture") {
    return {
      x: { ...motionSprings.gesture, velocity: context.velocity },
      opacity,
    };
  }
  return { x: { duration: motionDurations.menu, ease: motionEasings.move }, opacity };
}

function projectSwipeDistance(velocity: number) {
  return (velocity / 1000) * SWIPE_DECELERATION_RATE / (1 - SWIPE_DECELERATION_RATE);
}
