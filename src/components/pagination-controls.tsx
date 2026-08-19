"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function normalizePagination(page: number, pageCount: number, total: number) {
  const pages = Math.max(0, Math.floor(Number.isFinite(pageCount) ? pageCount : 0));
  const current = pages ? Math.min(pages, Math.max(1, Math.floor(Number.isFinite(page) ? page : 1))) : 0;
  return { page: current, pageCount: pages, total: Math.max(0, Math.floor(Number.isFinite(total) ? total : 0)) };
}

export function PaginationControls({ page, pageCount, onPageChange, total, label = "elementos" }: { page: number; pageCount: number; onPageChange: (page: number) => void; total: number; label?: string }) {
  const state = normalizePagination(page, pageCount, total);
  if (state.pageCount <= 1) return null;

  const previousPage = state.page - 1;
  const nextPage = state.page + 1;
  return <nav className="mt-6 flex items-center justify-between gap-3" aria-label={`Paginación de ${label}`}>
    <p className="text-xs leading-5 text-muted-foreground" aria-live="polite" aria-atomic="true"><span className="tabular-nums">{state.total}</span> {label} · página <span className="tabular-nums">{state.page}</span> de <span className="tabular-nums">{state.pageCount}</span></p>
    <div className="flex shrink-0 gap-2">
      <Button type="button" variant="outline" size="icon" className="size-11 rounded-xl" disabled={state.page <= 1} onClick={() => onPageChange(previousPage)} aria-label={state.page <= 1 ? `No hay una página anterior de ${label}` : `Ir a la página ${previousPage} de ${label}`}><ChevronLeft className="size-4" /></Button>
      <Button type="button" variant="outline" size="icon" className="size-11 rounded-xl" disabled={state.page >= state.pageCount} onClick={() => onPageChange(nextPage)} aria-label={state.page >= state.pageCount ? `No hay una página siguiente de ${label}` : `Ir a la página ${nextPage} de ${label}`}><ChevronRight className="size-4" /></Button>
    </div>
  </nav>;
}
