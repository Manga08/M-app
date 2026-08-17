"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Download, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toCsv } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function TransactionsPage() {
  const { transactions, accounts, categories, deleteTransaction } = useFinance();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "expense" | "income" | "transfer">("all");
  const deferredQuery = useDeferredValue(query.toLowerCase());
  const rows = useMemo(() => [...transactions].filter((transaction) => {
    const typeMatch = filter === "all" || (filter === "transfer" ? transaction.kind.startsWith("transfer") : transaction.kind === filter);
    const category = categories.find((item) => item.id === transaction.categoryId)?.name ?? "transferencia";
    return typeMatch && `${transaction.description} ${transaction.merchant ?? ""} ${category}`.toLowerCase().includes(deferredQuery);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [transactions, categories, filter, deferredQuery]);

  function downloadCsv() {
    const blob = new Blob(["\ufeff", toCsv(rows, accounts, categories)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "moneva-movimientos-agosto-2026.csv"; link.click(); URL.revokeObjectURL(link.href);
    toast.success("CSV exportado");
  }

  return <>
    <PageHeader eyebrow="Agosto 2026" title="Movimientos" description="Busca, filtra y entiende cada entrada o salida. La lista se actualiza al instante, incluso si estás sin conexión." action={<div className="flex gap-2"><Button variant="outline" className="rounded-full" onClick={downloadCsv}><Download className="size-4" />Exportar CSV</Button><Button className="hidden rounded-full sm:flex" onClick={() => window.dispatchEvent(new Event("moneva:quick-add"))}><Plus className="size-4" />Nuevo</Button></div>} />
    <section>
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 pl-10" placeholder="Buscar comercio, categoría o nota…" aria-label="Buscar movimientos" /></div>
        <div className="flex gap-2 overflow-x-auto pb-1">{(["all", "expense", "income", "transfer"] as const).map((value) => <Button key={value} variant={filter === value ? "secondary" : "ghost"} size="sm" className={cn("shrink-0 rounded-full", filter === value && "text-primary")} onClick={() => setFilter(value)}>{value === "all" ? "Todos" : value === "expense" ? "Gastos" : value === "income" ? "Ingresos" : "Transferencias"}</Button>)}</div>
      </div>
      <div className="hidden grid-cols-[110px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(130px,1fr)_120px_36px] gap-4 border-b py-3 text-xs text-muted-foreground md:grid"><span>Fecha</span><span>Concepto</span><span>Categoría</span><span>Cuenta</span><span className="text-right">Monto</span><span /></div>
      <div>{rows.map((transaction) => { const income = transaction.kind === "income" || transaction.kind === "transfer_in"; const category = categories.find((item) => item.id === transaction.categoryId)?.name ?? "Transferencia"; return <div key={transaction.id} className="grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b py-3 md:grid-cols-[110px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(130px,1fr)_120px_36px] md:gap-4"><span className="hidden text-xs text-muted-foreground md:block">{transaction.occurredOn}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{transaction.merchant || transaction.description}</span><span className="block truncate text-xs text-muted-foreground">{transaction.description}{transaction.syncStatus === "pending" ? " · pendiente" : ""}</span></span><span className="hidden text-sm text-muted-foreground md:block">{category}</span><span className="hidden truncate text-sm text-muted-foreground md:block">{accounts.find((item) => item.id === transaction.accountId)?.name}</span><span className={cn("text-right text-sm font-medium tabular-nums", income && "text-emerald-300")}>{income ? "+" : "-"}{money.format(transaction.amount)}</span><Button variant="ghost" size="icon-sm" aria-label={`Eliminar ${transaction.description}`} onClick={async () => { await deleteTransaction(transaction.id); toast.success("Movimiento eliminado"); }}><Trash2 className="size-4 text-muted-foreground" /><MoreHorizontal className="hidden" /></Button></div>; })}</div>
      {!rows.length && <div className="py-20 text-center"><p className="text-lg font-medium">No encontramos movimientos</p><p className="mt-2 text-sm text-muted-foreground">Prueba otra búsqueda o registra uno nuevo.</p></div>}
    </section>
  </>;
}
