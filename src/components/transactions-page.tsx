"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Download, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { currencyFormatter, monthLabel, toCsv } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

export function TransactionsPage() {
  const { profile, transactions, accounts, categories, currentMonth, deleteTransaction } = useFinance();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "expense" | "income" | "transfer">("all");
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.toLocaleLowerCase("es"));
  const money = currencyFormatter(profile?.currencyCode);
  const rows = useMemo(() => [...transactions].filter((transaction) => {
    if (transaction.kind === "transfer_in" && transactions.some((item) => item.transferGroupId === transaction.transferGroupId && item.kind === "transfer_out")) return false;
    const typeMatch = filter === "all" || (filter === "transfer" ? transaction.kind.startsWith("transfer") : transaction.kind === filter);
    const category = categories.find((item) => item.id === transaction.categoryId)?.name ?? "transferencia";
    return typeMatch && `${transaction.description} ${transaction.merchant ?? ""} ${transaction.note ?? ""} ${category}`.toLocaleLowerCase("es").includes(deferredQuery);
  }).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt)), [transactions, categories, filter, deferredQuery]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function downloadCsv() {
    const exportRows = rows.flatMap((row) => row.transferGroupId ? transactions.filter((transaction) => transaction.transferGroupId === row.transferGroupId) : [row]);
    const blob = new Blob(["\ufeff", toCsv(exportRows, accounts, categories)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `moneva-movimientos-${currentMonth.slice(0, 7)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("CSV exportado");
  }

  async function confirmDelete() {
    if (!deleteId) return;
    await deleteTransaction(deleteId);
    setDeleteId(null);
    toast.success("Movimiento eliminado");
  }

  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Movimientos" description="Busca, edita y organiza cada entrada o salida. Los cambios se reflejan inmediatamente en cuentas y presupuestos." action={<div className="flex gap-2"><Button variant="outline" className="rounded-full" onClick={downloadCsv}><Download className="size-4" /><span className="hidden sm:inline">Exportar CSV</span></Button><Button className="hidden rounded-full sm:flex" onClick={() => window.dispatchEvent(new Event("moneva:quick-add"))}><Plus className="size-4" />Nuevo</Button></div>} />
    <section>
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="h-11 pl-10" placeholder="Buscar comercio, categoría o nota…" aria-label="Buscar movimientos" /></div>
        <div className="flex gap-2 overflow-x-auto pb-1">{(["all", "expense", "income", "transfer"] as const).map((value) => <Button key={value} variant={filter === value ? "secondary" : "ghost"} size="sm" className={cn("shrink-0 rounded-full", filter === value && "text-primary")} onClick={() => { setFilter(value); setPage(1); }}>{value === "all" ? "Todos" : value === "expense" ? "Gastos" : value === "income" ? "Ingresos" : "Transferencias"}</Button>)}</div>
      </div>
      <div className="hidden grid-cols-[110px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(130px,1fr)_120px_36px] gap-4 border-b py-3 text-xs text-muted-foreground md:grid"><span>Fecha</span><span>Concepto</span><span>Categoría</span><span>Cuenta</span><span className="text-right">Monto</span><span /></div>
      <div>{visibleRows.map((transaction) => {
        const income = transaction.kind === "income" || transaction.kind === "transfer_in";
        const category = categories.find((item) => item.id === transaction.categoryId)?.name ?? "Transferencia";
        const transferDestination = transaction.transferGroupId ? transactions.find((item) => item.transferGroupId === transaction.transferGroupId && item.kind === "transfer_in") : undefined;
        const accountName = accounts.find((item) => item.id === transaction.accountId)?.name;
        const destinationName = accounts.find((item) => item.id === transferDestination?.accountId)?.name;
        return <div key={transaction.id} className="grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b py-3 md:grid-cols-[110px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(130px,1fr)_120px_36px] md:gap-4">
          <span className="hidden text-xs text-muted-foreground md:block">{new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${transaction.occurredOn}T00:00:00Z`))}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{transaction.merchant || transaction.description}</span><span className="block truncate text-xs text-muted-foreground">{transaction.description}{transaction.syncStatus === "pending" ? " · pendiente" : ""}</span></span>
          <span className="hidden text-sm text-muted-foreground md:block">{category}</span>
          <span className="hidden truncate text-sm text-muted-foreground md:block">{transaction.transferGroupId ? `${accountName} → ${destinationName}` : accountName}</span>
          <span className={cn("text-right text-sm font-medium tabular-nums", income && "text-emerald-500 dark:text-emerald-300")}>{income ? "+" : "-"}{money.format(transaction.amount)}</span>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${transaction.description}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-40"><DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("moneva:edit-transaction", { detail: { id: transaction.id } }))}><Pencil />Editar</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => setDeleteId(transaction.id)}><Trash2 />Eliminar</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>;
      })}</div>
      {!rows.length ? <div className="py-20 text-center"><p className="text-lg font-medium">No encontramos movimientos</p><p className="mt-2 text-sm text-muted-foreground">Prueba otra búsqueda o registra uno nuevo.</p></div> : null}
      <PaginationControls page={safePage} pageCount={pageCount} onPageChange={setPage} total={rows.length} label="movimientos" />
    </section>

    <AlertDialog open={Boolean(deleteId)} onOpenChange={(next) => !next && setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle><AlertDialogDescription>{transactions.find((transaction) => transaction.id === deleteId)?.transferGroupId ? "Se eliminarán las dos partes de la transferencia. Los saldos se recalcularán inmediatamente." : "Esta acción recalculará el saldo de la cuenta y el presupuesto asociado."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={confirmDelete}>Eliminar movimiento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
