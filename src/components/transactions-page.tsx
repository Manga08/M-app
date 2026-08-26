"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Download, FilterX, LoaderCircle, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DateControl, MonthControl, SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { currencyFormatter, localIsoDate, monthLabel } from "@/lib/finance/calculations";
import { downloadBlob } from "@/lib/download";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { movementIdentityTone } from "@/lib/finance/movement-visuals";
import { announceMutation } from "@/lib/finance/mutation-feedback";
import type { Account, Category, Transaction, TransactionCursor, TransactionListFilter, TransactionPage } from "@/lib/finance/types";
import { createTransactionWorkbook, movementWorkbookFilename } from "@/lib/finance/workbook-standard";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
const ALL_FILTER = "all";
type PeriodMode = "current" | "day" | "month" | "range" | "all";
type MovementFilterState = {
  query: string;
  filter: TransactionListFilter;
  periodMode: PeriodMode;
  specificDay: string;
  specificMonth: string;
  rangeFrom: string;
  rangeTo: string;
  accountFilter: string;
  categoryFilter: string;
};

export function TransactionsPage({ embedded = false }: { embedded?: boolean }) {
  const { profile, transactions, accounts, categories, groupAllocations, financialTargets, currentMonth, hydrated, online, listTransactions, exportTransactions, mutate } = useFinance();
  const today = localIsoDate(new Date(), profile?.timezone);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TransactionListFilter>("all");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("current");
  const [specificDay, setSpecificDay] = useState(today);
  const [specificMonth, setSpecificMonth] = useState(currentMonth.slice(0, 7));
  const [rangeFrom, setRangeFrom] = useState(currentMonth);
  const [rangeTo, setRangeTo] = useState(lastDateOfMonth(currentMonth.slice(0, 7)));
  const [accountFilter, setAccountFilter] = useState(ALL_FILTER);
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterHistoryOwned = useRef(false);
  const [cursorHistory, setCursorHistory] = useState<Array<TransactionCursor | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageResult, setPageResult] = useState<{ key: string; data: TransactionPage | null; error: string | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const deferredQuery = useDeferredValue(query.trim());
  const money = currencyFormatter(profile?.currencyCode);
  const activeCursor = cursorHistory[pageIndex] ?? null;
  const period = resolvePeriod(periodMode, currentMonth, specificDay, specificMonth, rangeFrom, rangeTo);
  const selectedAccountId = accountFilter === ALL_FILTER ? undefined : accountFilter;
  const selectedCategoryId = categoryFilter === ALL_FILTER ? undefined : categoryFilter;
  const requestKey = [periodMode, period.dateFrom, period.dateTo, filter, selectedAccountId, selectedCategoryId, deferredQuery, activeCursor?.occurredOn, activeCursor?.createdAt, activeCursor?.id, refreshToken].join("|");
  const activeFilterCount = Number(filter !== "all") + Number(periodMode !== "current") + Number(Boolean(selectedAccountId)) + Number(Boolean(selectedCategoryId)) + Number(Boolean(query.trim()));
  const categoryOptions = categories
    .filter((category) => !category.archived || transactions.some((transaction) => transaction.categoryId === category.id))
    .toSorted((a, b) => a.name.localeCompare(b.name, "es"));

  useEffect(() => {
    if (!hydrated || period.error) return;
    let active = true;
    void listTransactions({
      limit: PAGE_SIZE,
      cursor: activeCursor,
      filter,
      query: deferredQuery,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      accountId: selectedAccountId,
      categoryId: selectedCategoryId,
    })
      .then((page) => {
        if (active) setPageResult({ key: requestKey, data: page, error: null });
      })
      .catch((error: unknown) => {
        if (active) setPageResult({ key: requestKey, data: null, error: error instanceof Error ? error.message : "No pudimos cargar los movimientos." });
      });
    return () => { active = false; };
  }, [activeCursor, deferredQuery, filter, hydrated, listTransactions, period.dateFrom, period.dateTo, period.error, requestKey, selectedAccountId, selectedCategoryId]);

  useEffect(() => {
    function refreshAfterMutation() {
      setCursorHistory([null]);
      setPageIndex(0);
      setRefreshToken((current) => current + 1);
    }
    window.addEventListener("moneva:transactions-changed", refreshAfterMutation);
    return () => window.removeEventListener("moneva:transactions-changed", refreshAfterMutation);
  }, []);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#movement-history-filters") changeFilterOpen(true);
    };
    const frame = window.requestAnimationFrame(openFromHash);
    window.addEventListener("hashchange", openFromHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", openFromHash);
    };
  }, []);

  useEffect(() => {
    const syncFromHistory = () => {
      const active = new URL(window.location.href).searchParams.get("panel") === "movement-filters";
      if (!active) filterHistoryOwned.current = false;
      setFilterOpen(active);
    };
    const frame = window.requestAnimationFrame(syncFromHistory);
    window.addEventListener("popstate", syncFromHistory);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("popstate", syncFromHistory); };
  }, []);

  const activeResult = pageResult?.key === requestKey ? pageResult : null;
  const pageData = activeResult?.data ?? null;
  const loadError = period.error ?? activeResult?.error ?? null;
  const loading = !period.error && activeResult === null;
  const visibleRows = pageData?.items ?? [];
  const relatedRows = pageData?.related ?? [];
  const allLoadedRows = [...transactions, ...visibleRows, ...relatedRows];

  function resetPagination() {
    setCursorHistory([null]);
    setPageIndex(0);
  }

  function applyQuickPeriod(value: "current" | "today" | "all") {
    setPeriodMode(value === "today" ? "day" : value);
    if (value === "today") setSpecificDay(today);
    resetPagination();
  }

  function applyFilters(next: MovementFilterState) {
    setQuery(next.query);
    setFilter(next.filter);
    setPeriodMode(next.periodMode);
    setSpecificDay(next.specificDay);
    setSpecificMonth(next.specificMonth);
    setRangeFrom(next.rangeFrom);
    setRangeTo(next.rangeTo);
    setAccountFilter(next.accountFilter);
    setCategoryFilter(next.categoryFilter);
    resetPagination();
  }

  function clearFilters() {
    setQuery("");
    setFilter("all");
    setPeriodMode("current");
    setSpecificDay(today);
    setSpecificMonth(currentMonth.slice(0, 7));
    setRangeFrom(currentMonth);
    setRangeTo(lastDateOfMonth(currentMonth.slice(0, 7)));
    setAccountFilter(ALL_FILTER);
    setCategoryFilter(ALL_FILTER);
    resetPagination();
  }

  function changeFilterOpen(next: boolean) {
    if (next) {
      const url = new URL(window.location.href);
      if (url.searchParams.get("panel") !== "movement-filters") {
        url.searchParams.set("panel", "movement-filters");
        window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
        filterHistoryOwned.current = true;
      }
      setFilterOpen(true);
      return;
    }
    setFilterOpen(false);
    const url = new URL(window.location.href);
    if (filterHistoryOwned.current && url.searchParams.get("panel") === "movement-filters") {
      window.history.back();
      return;
    }
    url.searchParams.delete("panel");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function goNext() {
    if (!pageData?.hasMore || !pageData.nextCursor) return;
    const nextIndex = pageIndex + 1;
    setCursorHistory((current) => current[nextIndex] ? current : [...current.slice(0, nextIndex), pageData.nextCursor]);
    setPageIndex(nextIndex);
  }

  async function downloadXlsx() {
    setExporting(true);
    try {
      if (!profile) throw new Error("Tu perfil todavía no está listo para crear el Excel.");
      const exportRows = await exportTransactions({
        filter,
        query: deferredQuery,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        accountId: selectedAccountId,
        categoryId: selectedCategoryId,
      });
      const filterSummary = [
        filter === "all" ? null : filter === "income" ? "Solo ingresos" : filter === "expense" ? "Solo gastos" : "Solo transferencias",
        deferredQuery ? `Búsqueda: ${deferredQuery}` : null,
        selectedAccountId ? `Cuenta: ${accounts.find((item) => item.id === selectedAccountId)?.name ?? "seleccionada"}` : null,
        selectedCategoryId ? `Categoría: ${categories.find((item) => item.id === selectedCategoryId)?.name ?? "seleccionada"}` : null,
      ].filter(Boolean).join(" · ");
      const blob = await createTransactionWorkbook({
        transactions: exportRows,
        accounts,
        categories,
        profile,
        groups: groupAllocations,
        financialTargets,
        title: "Movimientos exportados",
        periodLabel: period.label,
        scopeLabel: "Resultado de los filtros visibles",
        filterSummary,
      });
      downloadBlob(blob, movementWorkbookFilename(period.label));
      toast.success(`Excel creado con ${exportRows.length} movimientos`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos exportar los movimientos.");
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId || deleting) return;
    setDeleting(true);
    try {
      const loaded = allLoadedRows.find((transaction) => transaction.id === deleteId);
      const knownRows = loaded?.transferGroupId
        ? allLoadedRows.filter((transaction) => transaction.transferGroupId === loaded.transferGroupId)
        : loaded ? [loaded] : [];
      const result = await mutate.deleteTransaction(deleteId, loaded?.transferGroupId, knownRows);
      setDeleteId(null);
      setRefreshToken((current) => current + 1);
      announceMutation(result, "Movimiento eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos eliminar el movimiento.");
    } finally {
      setDeleting(false);
    }
  }

  const currentFilters: MovementFilterState = { query, filter, periodMode, specificDay, specificMonth, rangeFrom, rangeTo, accountFilter, categoryFilter };
  const customPeriod = periodMode === "range" || periodMode === "month" || (periodMode === "day" && specificDay !== today);
  const filterPanelKey = [query, filter, periodMode, specificDay, specificMonth, rangeFrom, rangeTo, accountFilter, categoryFilter].join("|");

  return <>
    {!embedded ? <PageHeader eyebrow={period.label} title="Movimientos" description="Encuentra cualquier entrada, salida o transferencia sin importar cuándo ocurrió." action={<div className="flex gap-2"><Button variant="outline" className="rounded-full" onClick={downloadXlsx} disabled={exporting || Boolean(period.error)} aria-busy={exporting}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}<span className="hidden sm:inline">{exporting ? "Creando Excel…" : "Exportar a Excel"}</span></Button><Button className="hidden rounded-full sm:flex" onClick={() => window.dispatchEvent(new Event("moneva:quick-add"))}><Plus className="size-4" />Nuevo</Button></div>} /> : <div className="mb-3 flex flex-col justify-between gap-3 max-[359px]:flex-row max-[359px]:items-center min-[360px]:mb-5 min-[360px]:gap-4 sm:flex-row sm:items-end"><div><h2 className="text-lg font-medium tracking-[-.025em] min-[360px]:text-xl">Historial completo</h2><p className="mt-1 text-sm text-muted-foreground max-[359px]:hidden">{period.label}. Busca y abre cualquier movimiento para ver todos sus detalles.</p></div><Button variant="outline" className="h-11 rounded-full max-[359px]:size-11 max-[359px]:p-0" aria-label={exporting ? "Creando Excel" : "Exportar movimientos a Excel"} onClick={downloadXlsx} disabled={exporting || Boolean(period.error)} aria-busy={exporting}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}<span className="max-[359px]:sr-only">{exporting ? "Creando Excel…" : "Exportar a Excel"}</span></Button></div>}

    <section aria-label="Historial de movimientos">
      <div id="movement-history-filters" data-movement-filters className="app-sticky-below-header sticky z-20 -mx-4 bg-background/96 px-4 py-3 shadow-[0_14px_22px_-24px_rgba(0,0,0,.85)] backdrop-blur-md supports-[backdrop-filter]:bg-background/90 sm:static sm:mx-0 sm:rounded-[1.25rem] sm:border sm:bg-secondary/18 sm:p-2 sm:shadow-none sm:backdrop-blur-none">
        <div className="flex min-w-0 items-center gap-2 sm:flex-wrap">
          <div className="hidden shrink-0 rounded-full bg-secondary/75 p-1 sm:flex" role="group" aria-label="Periodo rápido">
            <button type="button" aria-pressed={periodMode === "current"} onClick={() => applyQuickPeriod("current")} className={cn("coarse-target min-h-9 rounded-full px-3 text-xs font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", periodMode === "current" && "bg-background text-foreground shadow-sm")}>Este mes</button>
            <button type="button" aria-pressed={periodMode === "day" && specificDay === today} onClick={() => applyQuickPeriod("today")} className={cn("coarse-target min-h-9 rounded-full px-3 text-xs font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", periodMode === "day" && specificDay === today && "bg-background text-foreground shadow-sm")}>Hoy</button>
            <button type="button" aria-pressed={periodMode === "all"} onClick={() => applyQuickPeriod("all")} className={cn("coarse-target min-h-9 rounded-full px-3 text-xs font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", periodMode === "all" && "bg-background text-foreground shadow-sm")}>Todo</button>
          </div>
          <Button type="button" variant={customPeriod ? "secondary" : "ghost"} className="h-11 min-w-0 flex-1 justify-start rounded-full px-4 sm:h-9 sm:flex-none" onClick={() => changeFilterOpen(true)} title={period.label}><CalendarRange className="size-4 shrink-0" /><span className="truncate sm:hidden">{period.label}</span><span className="hidden sm:inline">{customPeriod ? period.label : "Otro periodo"}</span></Button>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <Sheet open={filterOpen} onOpenChange={changeFilterOpen}>
            <SheetTrigger asChild><Button type="button" variant="outline" className="h-11 shrink-0 rounded-full px-4 sm:h-9"><SlidersHorizontal className="size-4" />Filtros{activeFilterCount ? <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground" aria-label={`${activeFilterCount} filtros activos`}>{activeFilterCount}</span> : null}</Button></SheetTrigger>
            <SheetContent side="right" onOpenAutoFocus={(event) => { event.preventDefault(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-slot="sheet-content"][data-state="open"] [data-slot="sheet-close"]')?.focus()); }} className="mobile-scroll h-dvh w-full gap-0 overflow-y-auto overscroll-y-contain p-0 sm:max-w-md">
              <MovementFilters key={filterPanelKey} value={currentFilters} today={today} currentMonth={currentMonth} accounts={accounts} categories={categoryOptions} onApply={(next) => { applyFilters(next); changeFilterOpen(false); }} onReset={() => { clearFilters(); changeFilterOpen(false); }} />
            </SheetContent>
          </Sheet>
          <p className="ml-auto hidden px-2 text-xs text-muted-foreground lg:block">{period.label}</p>
        </div>
      </div>

      <div className="flex min-h-12 items-center justify-between gap-3 border-b py-3 text-xs text-muted-foreground" aria-live="polite"><span>{loading ? "Buscando movimientos…" : `${visibleRows.length} ${visibleRows.length === 1 ? "movimiento" : "movimientos"} en esta página`}</span><span className="truncate text-right">{period.label}</span></div>
      {!online ? <p className="border-b py-3 text-xs text-warning">Sin conexión: estás viendo el historial cifrado disponible en este dispositivo.</p> : pageData?.source === "local" ? <p className="border-b py-3 text-xs text-warning">Mostrando la copia local porque hay movimientos pendientes de sincronizar.</p> : null}
      <div role="list" aria-label="Movimientos" aria-busy={loading}><div aria-hidden="true" className="hidden grid-cols-[110px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(130px,1fr)_120px_44px] gap-4 border-b py-3 text-xs text-muted-foreground xl:grid"><span>Fecha</span><span>Concepto</span><span>Categoría</span><span>Cuenta</span><span className="text-right">Monto</span><span /></div>
      <div className={cn("divide-y transition-opacity duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] motion-reduce:duration-[var(--motion-duration-reduced)]", loading && "opacity-45")}>{visibleRows.map((transaction) => {
        const income = transaction.kind === "income" || transaction.kind === "transfer_in";
        const categoryItem = categories.find((item) => item.id === transaction.categoryId);
        const category = categoryItem?.name ?? "Transferencia";
        const transferDestination = transaction.transferGroupId ? allLoadedRows.find((item) => item.transferGroupId === transaction.transferGroupId && item.kind === "transfer_in") : undefined;
        const accountName = accounts.find((item) => item.id === transaction.accountId)?.name;
        const destinationName = accounts.find((item) => item.id === transferDestination?.accountId)?.name;
        const targetName = financialTargets.find((item) => item.id === (transaction.financialTargetId ?? transferDestination?.financialTargetId))?.title;
        const nativeCurrency = transaction.nativeCurrencyCode ?? accounts.find((item) => item.id === transaction.accountId)?.currencyCode ?? profile?.currencyCode ?? "COP";
        return <TransactionRowView key={transaction.id} transaction={transaction} category={category} targetName={targetName} icon={transaction.icon ?? categoryItem?.icon ?? (transaction.transferGroupId ? "hand-coins" : income ? "coins" : "receipt")} accountName={accountName} destinationName={destinationName} nativeMoney={currencyFormatter(nativeCurrency)} reportMoney={money} nativeCurrency={nativeCurrency} income={income} onDelete={setDeleteId} />;
      })}</div></div>
      {loading && !pageData ? <div className="grid place-items-center py-20 text-muted-foreground"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /><span className="mt-3 text-sm">Cargando historial…</span></div> : null}
      {loadError ? <div role="alert" className="py-16 text-center"><p className="text-sm text-destructive">{loadError}</p>{!period.error ? <Button variant="outline" className="mt-4 rounded-full" onClick={() => setRefreshToken((current) => current + 1)}>Reintentar</Button> : null}</div> : null}
      {!loading && !loadError && !visibleRows.length ? <div className="py-20 text-center" role="status"><p className="text-lg font-medium">No encontramos movimientos</p><p className="mt-2 text-sm text-muted-foreground">Cambia el periodo o limpia algún filtro para ampliar la búsqueda.</p>{activeFilterCount || query ? <Button type="button" variant="outline" className="mt-5 rounded-full" onClick={clearFilters}><FilterX className="size-4" />Limpiar filtros</Button> : null}</div> : null}
      {!loadError && (pageIndex > 0 || Boolean(pageData?.hasMore)) ? <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Paginación de movimientos"><p className="text-xs text-muted-foreground">Página {pageIndex + 1} · {visibleRows.length} {visibleRows.length === 1 ? "movimiento" : "movimientos"}</p><div className="flex gap-2"><Button type="button" variant="outline" size="icon-sm" disabled={loading || pageIndex === 0} onClick={() => setPageIndex((current) => Math.max(0, current - 1))} aria-label="Página anterior"><ChevronLeft className="size-4" /></Button><Button type="button" variant="outline" size="icon-sm" disabled={loading || !pageData?.hasMore || !pageData.nextCursor} onClick={goNext} aria-label="Página siguiente"><ChevronRight className="size-4" /></Button></div></nav> : null}
    </section>

    <AlertDialog open={Boolean(deleteId)} onOpenChange={(next) => !deleting && !next && setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle><AlertDialogDescription>{allLoadedRows.find((transaction) => transaction.id === deleteId)?.transferGroupId ? "Se eliminarán las dos partes de la transferencia. Los saldos se recalcularán inmediatamente." : "Esta acción recalculará el saldo de la cuenta y el presupuesto asociado."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleting} onClick={confirmDelete}>{deleting ? <LoaderCircle className="size-4 animate-spin" /> : null}{deleting ? "Eliminando…" : "Eliminar movimiento"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

function MovementFilters({ value, today, currentMonth, accounts, categories, onApply, onReset }: { value: MovementFilterState; today: string; currentMonth: string; accounts: Account[]; categories: Category[]; onApply: (value: MovementFilterState) => void; onReset: () => void }) {
  const [draft, setDraft] = useState(value);
  const draftPeriod = resolvePeriod(draft.periodMode, currentMonth, draft.specificDay, draft.specificMonth, draft.rangeFrom, draft.rangeTo);
  const periods: Array<{ value: PeriodMode; label: string }> = [
    { value: "current", label: "Este mes" },
    { value: "day", label: "Día" },
    { value: "month", label: "Mes" },
    { value: "range", label: "Rango" },
    { value: "all", label: "Todo" },
  ];

  return <>
    <SheetHeader className="safe-dialog-top border-b px-5 pb-4 pt-5"><SheetTitle>Filtrar movimientos</SheetTitle><SheetDescription>El periodo y estos filtros controlan el historial y el archivo exportado.</SheetDescription></SheetHeader>
    <div className="space-y-7 px-5 py-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Periodo</legend>
        <div className="grid grid-cols-2 gap-2">
          {periods.map((item) => <button key={item.value} type="button" aria-pressed={draft.periodMode === item.value} onClick={() => setDraft((current) => ({ ...current, periodMode: item.value, specificDay: item.value === "day" && !current.specificDay ? today : current.specificDay }))} className={cn("min-h-11 rounded-xl border px-3 text-sm text-muted-foreground transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", draft.periodMode === item.value && "border-primary bg-primary/8 text-foreground")}>{item.label}</button>)}
        </div>
      </fieldset>

      {draft.periodMode === "day" ? <div className="space-y-2"><Label htmlFor="movement-filter-day">Fecha exacta</Label><DateControl id="movement-filter-day" value={draft.specificDay} max={today} onValueChange={(specificDay) => setDraft((current) => ({ ...current, specificDay }))} aria-invalid={Boolean(draftPeriod.error)} aria-describedby={draftPeriod.error ? "movement-period-error" : undefined} /></div> : null}
      {draft.periodMode === "month" ? <div className="space-y-2"><Label htmlFor="movement-filter-month">Mes específico</Label><MonthControl id="movement-filter-month" value={draft.specificMonth} onValueChange={(specificMonth) => setDraft((current) => ({ ...current, specificMonth }))} aria-invalid={Boolean(draftPeriod.error)} aria-describedby={draftPeriod.error ? "movement-period-error" : undefined} /></div> : null}
      {draft.periodMode === "range" ? <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2"><div className="space-y-2"><Label htmlFor="movement-filter-from">Desde</Label><DateControl id="movement-filter-from" value={draft.rangeFrom} max={draft.rangeTo || undefined} onValueChange={(rangeFrom) => setDraft((current) => ({ ...current, rangeFrom }))} aria-invalid={Boolean(draftPeriod.error)} aria-describedby={draftPeriod.error ? "movement-period-error" : undefined} /></div><div className="space-y-2"><Label htmlFor="movement-filter-to">Hasta</Label><DateControl id="movement-filter-to" value={draft.rangeTo} min={draft.rangeFrom || undefined} onValueChange={(rangeTo) => setDraft((current) => ({ ...current, rangeTo }))} aria-invalid={Boolean(draftPeriod.error)} aria-describedby={draftPeriod.error ? "movement-period-error" : undefined} /></div></div> : null}
      {draftPeriod.error ? <p id="movement-period-error" role="alert" className="text-sm text-destructive">{draftPeriod.error}</p> : null}

      <div className="space-y-2"><Label htmlFor="movement-filter-type">Tipo</Label><SelectControl id="movement-filter-type" value={draft.filter} onValueChange={(filter) => setDraft((current) => ({ ...current, filter: filter as TransactionListFilter }))}><option value="all">Todos</option><option value="expense">Gastos</option><option value="income">Ingresos</option><option value="transfer">Transferencias</option></SelectControl></div>

      <div className="space-y-2"><Label htmlFor="movement-filter-search">Buscar</Label><div className="relative"><Search className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" /><Input id="movement-filter-search" value={draft.query} onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))} maxLength={100} className="pl-10" placeholder="Comercio, categoría o nota" /></div></div>

      <div className="space-y-2"><Label htmlFor="movement-filter-account">Cuenta</Label><SelectControl id="movement-filter-account" value={draft.accountFilter} onValueChange={(accountFilter) => setDraft((current) => ({ ...current, accountFilter }))}><option value={ALL_FILTER}>Todas las cuentas</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SelectControl></div>

      <div className="space-y-2"><Label htmlFor="movement-filter-category">Categoría o tipo de ingreso</Label><SelectControl id="movement-filter-category" value={draft.categoryFilter} onValueChange={(categoryFilter) => setDraft((current) => ({ ...current, categoryFilter }))}><option value={ALL_FILTER}>Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectControl></div>

      <div className="space-y-2 border-t pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5"><Button type="button" className="h-12 w-full rounded-full" onClick={() => onApply(draft)} disabled={Boolean(draftPeriod.error)}>Aplicar filtros</Button><Button type="button" variant="ghost" className="h-11 w-full rounded-full" onClick={onReset}>Restablecer</Button></div>
    </div>
  </>;
}

function TransactionRowView({ transaction, category, targetName, icon, accountName, destinationName, nativeMoney, reportMoney, nativeCurrency, income, onDelete }: { transaction: Transaction; category: string; targetName?: string; icon: string; accountName?: string; destinationName?: string; nativeMoney: Intl.NumberFormat; reportMoney: Intl.NumberFormat; nativeCurrency: string; income: boolean; onDelete: (id: string) => void }) {
  const shortDate = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${transaction.occurredOn}T00:00:00Z`));
  const account = transaction.transferGroupId ? `${accountName ?? "Cuenta"} → ${destinationName ?? "Cuenta"}` : accountName ?? "Cuenta";
  const title = transaction.merchant || transaction.description;
  const tone = movementIdentityTone(transaction.kind);
  const detailHref = `/movimientos?overlay=movement&transaction=${encodeURIComponent(transaction.id)}`;
  return <div role="listitem" data-transaction-id={transaction.id} className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-3 transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-secondary/25 xl:grid-cols-[110px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(130px,1fr)_120px_44px] xl:gap-4">
    <span className="hidden text-xs text-muted-foreground xl:block">{shortDate}</span>
    <span className="min-w-0"><Link href={detailHref} aria-label={`Abrir detalles de ${title}`} className="group flex min-h-11 min-w-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className={cn("grid size-9 shrink-0 place-items-center rounded-xl transition-transform duration-[var(--motion-duration-press)] ease-[var(--motion-ease-out)] group-active:scale-[var(--motion-press-scale)] motion-reduce:transition-none motion-reduce:group-active:scale-100", tone.surface, tone.text)}><FinanceIcon name={icon} className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium group-hover:text-primary">{title}</span><span className="line-clamp-2 text-[11px] leading-4 text-muted-foreground xl:hidden">{shortDate} · {category} · {account}{targetName ? ` · ${targetName}` : ""}</span><span className="hidden truncate text-xs text-muted-foreground xl:block">{transaction.description}{targetName ? ` · ${targetName}` : ""}{transaction.syncStatus === "pending" ? " · pendiente" : ""}</span></span></Link></span>
    <span className="hidden text-sm text-muted-foreground xl:block">{category}</span>
    <span className="hidden truncate text-sm text-muted-foreground xl:block">{account}</span>
    <span className="text-right"><span className={cn("block text-sm font-medium tabular-nums", tone.text)}>{income ? "+" : "−"}{nativeMoney.format(transaction.amount)}</span>{nativeCurrency !== "COP" ? <span className="block text-[10px] tabular-nums text-muted-foreground">≈ {reportMoney.format(transaction.baseAmount ?? transaction.amount)}</span> : null}</span>
    <span><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${transaction.description}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-40"><DropdownMenuItem asChild><Link href={detailHref}><Pencil />Ver y editar</Link></DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => onDelete(transaction.id)}><Trash2 />Eliminar</DropdownMenuItem></DropdownMenuContent></DropdownMenu></span>
  </div>;
}

function resolvePeriod(mode: PeriodMode, currentMonth: string, day: string, month: string, rangeFrom: string, rangeTo: string) {
  if (mode === "all") return { dateFrom: undefined, dateTo: undefined, label: "Todo tu historial", fileKey: "historial-completo", error: null };
  if (mode === "day") return { dateFrom: day, dateTo: day, label: humanDate(day), fileKey: day || "dia", error: validIsoDate(day) ? null : "Selecciona un día válido." };
  if (mode === "month") {
    const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
    return { dateFrom: valid ? `${month}-01` : "", dateTo: valid ? lastDateOfMonth(month) : "", label: valid ? monthLabel(`${month}-01`) : "Mes específico", fileKey: month || "mes", error: valid ? null : "Selecciona un mes válido." };
  }
  if (mode === "range") {
    const valid = validIsoDate(rangeFrom) && validIsoDate(rangeTo);
    const ordered = valid && rangeFrom <= rangeTo;
    return { dateFrom: rangeFrom, dateTo: rangeTo, label: valid ? `${shortHumanDate(rangeFrom)} – ${shortHumanDate(rangeTo)}` : "Rango personalizado", fileKey: valid ? `${rangeFrom}_${rangeTo}` : "rango", error: !valid ? "Completa las dos fechas del rango." : !ordered ? "La fecha inicial no puede ser posterior a la final." : null };
  }
  return { dateFrom: currentMonth, dateTo: lastDateOfMonth(currentMonth.slice(0, 7)), label: monthLabel(currentMonth), fileKey: currentMonth.slice(0, 7), error: null };
}

function validIsoDate(value: string) { return /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(value); }
function lastDateOfMonth(month: string) { const [year, monthNumber] = month.split("-").map(Number); return `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`; }
function humanDate(value: string) { return validIsoDate(value) ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "Día específico"; }
function shortHumanDate(value: string) { return validIsoDate(value) ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replaceAll(" de ", " ") : value; }
