"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, LoaderCircle, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InputControl } from "@/components/ui/form-control";
import { currencyFormatter, monthLabel, toCsv } from "@/lib/finance/calculations";
import { downloadBlob } from "@/lib/download";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { announceMutation } from "@/lib/finance/mutation-feedback";
import type { Transaction, TransactionCursor, TransactionListFilter, TransactionPage } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

export function TransactionsPage({ embedded = false }: { embedded?: boolean }) {
  const { profile, transactions, accounts, categories, currentMonth, hydrated, online, listTransactions, exportTransactions, mutate } = useFinance();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TransactionListFilter>("all");
  const [cursorHistory, setCursorHistory] = useState<Array<TransactionCursor | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageResult, setPageResult] = useState<{ key: string; data: TransactionPage | null; error: string | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [canScrollFiltersRight, setCanScrollFiltersRight] = useState(false);
  const filterRailRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const money = currencyFormatter(profile?.currencyCode);
  const activeCursor = cursorHistory[pageIndex] ?? null;
  const requestKey = `${currentMonth}|${filter}|${deferredQuery}|${activeCursor?.occurredOn ?? ""}|${activeCursor?.createdAt ?? ""}|${activeCursor?.id ?? ""}|${refreshToken}`;

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void listTransactions({ limit: PAGE_SIZE, cursor: activeCursor, filter, query: deferredQuery, monthStart: currentMonth })
      .then((page) => {
        if (active) setPageResult({ key: requestKey, data: page, error: null });
      })
      .catch((error: unknown) => {
        if (active) setPageResult({ key: requestKey, data: null, error: error instanceof Error ? error.message : "No pudimos cargar los movimientos." });
      });
    return () => { active = false; };
  }, [activeCursor, currentMonth, deferredQuery, filter, hydrated, listTransactions, requestKey]);

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
    const rail = filterRailRef.current;
    if (!rail) return;
    const updateScrollCue = () => setCanScrollFiltersRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2);
    updateScrollCue();
    rail.addEventListener("scroll", updateScrollCue, { passive: true });
    window.addEventListener("resize", updateScrollCue);
    return () => {
      rail.removeEventListener("scroll", updateScrollCue);
      window.removeEventListener("resize", updateScrollCue);
    };
  }, []);

  const activeResult = pageResult?.key === requestKey ? pageResult : null;
  const pageData = activeResult?.data ?? null;
  const loadError = activeResult?.error ?? null;
  const loading = activeResult === null;
  const visibleRows = pageData?.items ?? [];
  const relatedRows = pageData?.related ?? [];
  const allLoadedRows = [...transactions, ...visibleRows, ...relatedRows];

  function goNext() {
    if (!pageData?.hasMore || !pageData.nextCursor) return;
    const nextIndex = pageIndex + 1;
    setCursorHistory((current) => current[nextIndex]
      ? current
      : [...current.slice(0, nextIndex), pageData.nextCursor]);
    setPageIndex(nextIndex);
  }

  async function downloadCsv() {
    setExporting(true);
    try {
      const exportRows = await exportTransactions({ filter, query: deferredQuery, monthStart: currentMonth });
      const blob = new Blob(["\ufeff", toCsv(exportRows, accounts, categories)], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, `moneva-movimientos-${currentMonth.slice(0, 7)}.csv`);
      toast.success(`${exportRows.length} movimientos exportados`);
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

  return <>
    {!embedded ? <PageHeader eyebrow={monthLabel(currentMonth)} title="Movimientos" description="Busca, edita y organiza las entradas y salidas de este mes. La paginación mantiene la vista rápida incluso con años de historial." action={<div className="flex gap-2"><Button variant="outline" className="rounded-full" onClick={downloadCsv} disabled={exporting}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}<span className="hidden sm:inline">{exporting ? "Preparando…" : "Exportar este mes"}</span></Button><Button className="hidden rounded-full sm:flex" onClick={() => window.dispatchEvent(new Event("moneva:quick-add"))}><Plus className="size-4" />Nuevo</Button></div>} /> : <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-xl font-medium tracking-[-.025em]">Historial de {monthLabel(currentMonth, "short")}</h2><p className="mt-1 text-sm text-muted-foreground">Movimientos reales que ya afectan tus saldos.</p></div><Button variant="outline" className="h-11 rounded-full" onClick={downloadCsv} disabled={exporting}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{exporting ? "Preparando…" : "Exportar mes"}</Button></div>}
    <section>
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <InputControl value={query} onChange={(event) => { setQuery(event.target.value); setCursorHistory([null]); setPageIndex(0); }} maxLength={100} leading={<Search />} containerClassName="lg:max-w-md" placeholder="Buscar comercio, categoría o nota…" aria-label="Buscar movimientos" />
        <div className="relative -mx-4 sm:mx-0">
          <div ref={filterRailRef} className="mobile-scroll-x flex gap-2 overflow-x-auto px-4 pb-2 pr-12 sm:px-0 sm:pr-0" role="group" aria-label="Filtrar por tipo de movimiento">{(["all", "expense", "income", "transfer"] as const).map((value) => <Button key={value} variant={filter === value ? "secondary" : "ghost"} size="sm" aria-pressed={filter === value} className={cn("shrink-0 rounded-full", filter === value && "text-primary")} onClick={() => { setFilter(value); setCursorHistory([null]); setPageIndex(0); }}>{value === "all" ? "Todos" : value === "expense" ? "Gastos" : value === "income" ? "Ingresos" : "Transferencias"}</Button>)}</div>
          <span aria-hidden="true" className={cn("horizontal-more-cue pointer-events-none absolute bottom-2 right-0 top-0 flex w-10 items-center justify-end pr-1 transition-opacity duration-150 sm:hidden", canScrollFiltersRight ? "opacity-100" : "opacity-0")}><ChevronRight className="size-4 text-muted-foreground" /></span>
        </div>
      </div>
      {!online ? <p className="border-b py-3 text-xs text-warning">Sin conexión: estás viendo el historial cifrado disponible en este dispositivo.</p> : pageData?.source === "local" ? <p className="border-b py-3 text-xs text-warning">Mostrando la copia local porque hay movimientos pendientes de sincronizar.</p> : null}
      <div role="table" aria-label="Movimientos" aria-busy={loading} aria-rowcount={visibleRows.length}><div role="row" className="hidden grid-cols-[110px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(130px,1fr)_120px_44px] gap-4 border-b py-3 text-xs text-muted-foreground lg:grid"><span role="columnheader">Fecha</span><span role="columnheader">Concepto</span><span role="columnheader">Categoría</span><span role="columnheader">Cuenta</span><span role="columnheader" className="text-right">Monto</span><span role="columnheader" aria-label="Acciones" /></div>
      <div role="rowgroup" className={cn("transition-opacity", loading && "opacity-45")}>{visibleRows.map((transaction) => {
        const income = transaction.kind === "income" || transaction.kind === "transfer_in";
        const categoryItem = categories.find((item) => item.id === transaction.categoryId);
        const category = categoryItem?.name ?? "Transferencia";
        const transferDestination = transaction.transferGroupId ? allLoadedRows.find((item) => item.transferGroupId === transaction.transferGroupId && item.kind === "transfer_in") : undefined;
        const accountName = accounts.find((item) => item.id === transaction.accountId)?.name;
        const destinationName = accounts.find((item) => item.id === transferDestination?.accountId)?.name;
        return <TransactionRowView key={transaction.id} transaction={transaction} category={category} icon={transaction.icon ?? categoryItem?.icon ?? (transaction.transferGroupId ? "hand-coins" : income ? "coins" : "receipt")} accountName={accountName} destinationName={destinationName} money={money} income={income} onDelete={setDeleteId} />;
      })}</div></div>
      {loading && !pageData ? <div className="grid place-items-center py-20 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /><span className="mt-3 text-sm">Cargando historial…</span></div> : null}
      {loadError ? <div role="alert" className="py-16 text-center"><p className="text-sm text-destructive">{loadError}</p><Button variant="outline" className="mt-4 rounded-full" onClick={() => setRefreshToken((current) => current + 1)}>Reintentar</Button></div> : null}
      {!loading && !loadError && !visibleRows.length ? <div className="py-20 text-center" role="status"><p className="text-lg font-medium">No encontramos movimientos</p><p className="mt-2 text-sm text-muted-foreground">Prueba otra búsqueda o registra uno nuevo.</p></div> : null}
      {!loadError && (pageIndex > 0 || Boolean(pageData?.hasMore)) ? <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Paginación de movimientos"><p className="text-xs text-muted-foreground">Página {pageIndex + 1} · {visibleRows.length} {visibleRows.length === 1 ? "movimiento" : "movimientos"}</p><div className="flex gap-2"><Button type="button" variant="outline" size="icon-sm" disabled={loading || pageIndex === 0} onClick={() => setPageIndex((current) => Math.max(0, current - 1))} aria-label="Página anterior"><ChevronLeft className="size-4" /></Button><Button type="button" variant="outline" size="icon-sm" disabled={loading || !pageData?.hasMore || !pageData.nextCursor} onClick={goNext} aria-label="Página siguiente"><ChevronRight className="size-4" /></Button></div></nav> : null}
    </section>

    <AlertDialog open={Boolean(deleteId)} onOpenChange={(next) => !deleting && !next && setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle><AlertDialogDescription>{allLoadedRows.find((transaction) => transaction.id === deleteId)?.transferGroupId ? "Se eliminarán las dos partes de la transferencia. Los saldos se recalcularán inmediatamente." : "Esta acción recalculará el saldo de la cuenta y el presupuesto asociado."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleting} onClick={confirmDelete}>{deleting ? <LoaderCircle className="size-4 animate-spin" /> : null}{deleting ? "Eliminando…" : "Eliminar movimiento"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

function TransactionRowView({ transaction, category, icon, accountName, destinationName, money, income, onDelete }: { transaction: Transaction; category: string; icon: string; accountName?: string; destinationName?: string; money: Intl.NumberFormat; income: boolean; onDelete: (id: string) => void }) {
  const shortDate = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${transaction.occurredOn}T00:00:00Z`));
  const account = transaction.transferGroupId ? `${accountName ?? "Cuenta"} → ${destinationName ?? "Cuenta"}` : accountName ?? "Cuenta";
  return <div role="row" className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b py-3 transition-colors active:bg-secondary/50 lg:grid-cols-[110px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(130px,1fr)_120px_44px] lg:gap-4">
    <span role="cell" className="hidden text-xs text-muted-foreground lg:block">{shortDate}</span>
    <span role="cell" className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><FinanceIcon name={icon} className="size-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{transaction.merchant || transaction.description}</span><span className="block truncate text-xs text-muted-foreground lg:hidden">{shortDate} · {category} · {account}</span><span className="hidden truncate text-xs text-muted-foreground lg:block">{transaction.description}{transaction.syncStatus === "pending" ? " · pendiente" : ""}</span></span></span>
    <span role="cell" className="hidden text-sm text-muted-foreground lg:block">{category}</span>
    <span role="cell" className="hidden truncate text-sm text-muted-foreground lg:block">{account}</span>
    <span role="cell" className={cn("text-right text-sm font-medium tabular-nums", income && "text-positive")}>{income ? "+" : "-"}{money.format(transaction.amount)}</span>
    <span role="cell"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${transaction.description}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-40"><DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("moneva:edit-transaction", { detail: { id: transaction.id } }))}><Pencil />Editar</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => onDelete(transaction.id)}><Trash2 />Eliminar</DropdownMenuItem></DropdownMenuContent></DropdownMenu></span>
  </div>;
}
