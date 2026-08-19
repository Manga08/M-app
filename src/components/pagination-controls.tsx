"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PaginationControls({ page, pageCount, onPageChange, total, label = "elementos" }: { page: number; pageCount: number; onPageChange: (page: number) => void; total: number; label?: string }) {
  if (pageCount <= 1) return null;
  return <nav className="mt-6 flex items-center justify-between gap-3" aria-label={`Paginación de ${label}`}>
    <p className="text-xs text-muted-foreground">{total} {label} · página {page} de {pageCount}</p>
    <div className="flex gap-2"><Button type="button" variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior"><ChevronLeft className="size-4" /></Button><Button type="button" variant="outline" size="icon-sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="Página siguiente"><ChevronRight className="size-4" /></Button></div>
  </nav>;
}
