"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, LoaderCircle, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { currencyFormatter, monthLabel, toCsv } from "@/lib/finance/calculations";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import type { Transaction, TransactionCursor, TransactionListFilter, TransactionPage } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

export function TransactionsPage() {
  const { profile, transactions, accounts, categories, currentMonth, hydrated, online, listTransactions, exportTransactions, deleteTransaction } = useFinance();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TransactionListFilter>("all");
  const [cursorHistory, setCursorHistory] = useState<Array<TransactionCursor | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageResult, setPageResult] = useState<{ key: string; data: TransactionPage | null; error: string | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const deferredQuery = useDeferredValue(query.trim());
  const money = currencyFormatter(profile?.currencyCode);
  const activeCursor = cursorHistory[pageIndex] ?? null;
  const requestKey = `${filter}|${deferredQuery}|${activeCursor?.occurredOn ?? ""}|${activeCursor?.createdAt ?? ""}|${activeCursor?.id ?? ""}|${refreshToken}`;

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void listTransactions({ limit: PAGE_SIZE, cursor: activeCursor, filter, query: deferredQuery })
      .then((page) => {
        if (active) setPageResult({ key: requestKey, data: page, error: null });
      })
      .catch((error: unknown) => {
        if (active) setPageResult({ key: requestKey, data: null, error: error instanceof Error ? error.message : "No pudimos cargar los movimientos." });
      });
    return () => { active = false; };
  }, [activeCursor, deferredQuery, filter, hydrated, listTransactions, requestKey]);

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
      const exportRows = await exportTransactions({ filter, query: deferredQuery });
      const blob = new Blob(["\ufeff", toCsv(exportRows, accounts, categories)], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `moneva-movimientos-${currentMonth.slice(0, 7)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`${exportRows.length} movimientos exportados`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos exportar los movimientos.");
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    await deleteTransaction(deleteId);
    setDeleteId(null);
    setRefreshToken((current) => current + 1);
    toast.success("Movimiento eliminado");
  }

  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Movimientos" description="Busca, edita y organiza cada entrada o salida. El historial se carga por páginas para seguir siendo rápido aunque crezca durante años." action={<div className="flex gap-2"><Button variant="outline" className="rounded-full" onClick={downloadCsv} disabled={exporting}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}<span className="hidden sm:inline">{exporting ? "Preparando…" : "Exportar CSV"}</span></Button><Button className="hidden rounded-full sm:flex" onClick={() => window.dispatchEvent(new Event("moneva:quick-add"))}><Plus className="size-4" />Nuevo</Button></div>} />
    <section>
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setCursorHistory([null]); setPageIndex(0); }} maxLength={100} className="h-11 pl-10" placeholder="Buscar comercio, categoría o nota…" aria-label="Buscar movimientos" /></div>
        <div className="mobile-scroll-x -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">{(["all", "expense", "income", "transfer"] as const).map((value) => <Button key={value} variant={filter === value ? "secondary" : "ghost"} size="sm" className={cn("shrink-0 rounded-full", filter === value && "text-primary")} onClick={() => { setFilter(value); setCursorHistory([null]); setPageIndex(0); }}>{value === "all" ? "Todos" : value === "expense" ? "Gastos" : value === "income" ? "Ingresos" : "Transferencias"}</Button>)}</div>
      </div>
      {!online || pageData?.source === "local" ? <p className="border-b py-3 text-xs text-amber-600 dark:text-amber-300">Sin conexión: estás viendo el historial cifrado disponible en este dispositivo.</p> : null}
      <div className="hidden grid-cols-[110px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(130px,1fr)_120px_36px] gap-4 border-b py-3 text-xs text-muted-foreground md:grid"><span>Fecha</span><span>Concepto</span><span>Categoría</span><span>Cuenta</span><span className="text-right">Monto</span><span /></div>
      <div className={cn("transition-opacity", loading && "opacity-45")}>{visibleRows.map((transaction) => {
        const income = transaction.kind === "income" || transaction.kind === "transfer_in";
        const categoryItem = categories.find((item) => item.id === transaction.categoryId);
        const category = categoryItem?.name ?? "Transferencia";
        const transferDestination = transaction.transferGroupId ? allLoadedRows.find((item) => item.transferGroupId === transaction.transferGroupId && item.kind === "transfer_in") : undefined;
        const accountName = accounts.find((item) => item.id === transaction.accountId)?.name;
        const destinationName = accounts.find((item) => item.id === transferDestination?.accountId)?.name;
        return <TransactionRowView key={transaction.id} transaction={transaction} category={category} icon={transaction.icon ?? categoryItem?.icon ?? (transaction.transferGroupId ? "hand-coins" : income ? "coins" : "receipt")} accountName={accountName} destinationName={destinationName} money={money} income={income} onDelete={setDeleteId} />;
      })}</div>
      {loading && !pageData ? <div className="grid place-items-center py-20 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /><span className="mt-3 text-sm">Cargando historial…</span></div> : null}
      {loadError ? <div role="alert" className="py-16 text-center"><p className="text-sm text-destructive">{loadError}</p><Button variant="outline" className="mt-4 rounded-full" onClick={() => setRefreshToken((current) => current + 1)}>Reintentar</Button></div> : null}
      {!loading && !loadError && !visibleRows.length ? <div className="py-20 text-center"><p className="text-lg font-medium">No encontramos movimientos</p><p className="mt-2 text-sm text-muted-foreground">Prueba otra búsqueda o registra uno nuevo.</p></div> : null}
      {!loadError && (pageIndex > 0 || Boolean(pageData?.hasMore)) ? <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Paginación de movimientos"><p className="text-xs text-muted-foreground">Página {pageIndex + 1} · {visibleRows.length} {visibleRows.length === 1 ? "movimiento" : "movimientos"}</p><div className="flex gap-2"><Button type="button" variant="outline" size="icon-sm" disabled={loading || pageIndex === 0} onClick={() => setPageIndex((current) => Math.max(0, current - 1))} aria-label="Página anterior"><ChevronLeft className="size-4" /></Button><Button type="button" variant="outline" size="icon-sm" disabled={loading || !pageData?.hasMore || !pageData.nextCursor} onClick={goNext} aria-label="Página siguiente"><ChevronRight className="size-4" /></Button></div></nav> : null}
    </section>

    <AlertDialog open={Boolean(deleteId)} onOpenChange={(next) => !next && setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle><AlertDialogDescription>{allLoadedRows.find((transaction) => transaction.id === deleteId)?.transferGroupId ? "Se eliminarán las dos partes de la transferencia. Los saldos se recalcularán inmediatamente." : "Esta acción recalculará el saldo de la cuenta y el presupuesto asociado."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={confirmDelete}>Eliminar movimiento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

function TransactionRowView({ transaction, category, icon, accountName, destinationName, money, income, onDelete }: { transaction: Transaction; category: string; icon: string; accountName?: string; destinationName?: string; money: Intl.NumberFormat; income: boolean; onDelete: (id: string) => void }) {
  return <div className="grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b py-3 md:grid-cols-[110px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(130px,1fr)_120px_36px] md:gap-4">
    <span className="hidden text-xs text-muted-foreground md:block">{new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${transaction.occurredOn}T00:00:00Z`))}</span>
    <span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><FinanceIcon name={icon} className="size-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{transaction.merchant || transaction.description}</span><span className="block truncate text-xs text-muted-foreground">{transaction.description}{transaction.syncStatus === "pending" ? " · pendiente" : ""}</span></span></span>
    <span className="hidden text-sm text-muted-foreground md:block">{category}</span>
    <span className="hidden truncate text-sm text-muted-foreground md:block">{transaction.transferGroupId ? `${accountName ?? "Cuenta"} → ${destinationName ?? "Cuenta"}` : accountName}</span>
    <span className={cn("text-right text-sm font-medium tabular-nums", income && "text-emerald-500 dark:text-emerald-300")}>{income ? "+" : "-"}{money.format(transaction.amount)}</span>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${transaction.description}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-40"><DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("moneva:edit-transaction", { detail: { id: transaction.id } }))}><Pencil />Editar</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => onDelete(transaction.id)}><Trash2 />Eliminar</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div>;
}
