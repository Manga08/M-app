"use client";

import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FinanceIcon, financeIconCatalog, getFinanceIconLabel } from "@/lib/finance/icon-catalog";
import { cn } from "@/lib/utils";

export function FinanceIconPicker({ value, onValueChange, compact = false }: { value: string; onValueChange: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"generic" | "brand">("generic");
  const scrollRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase("es");
    return financeIconCatalog.filter((entry) => entry.kind === kind && (!clean || `${entry.label} ${entry.keywords}`.toLocaleLowerCase("es").includes(clean)));
  }, [kind, query]);

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" size={compact ? "icon" : "default"} className={cn("h-11 justify-start gap-3", compact ? "w-11 px-0" : "w-full")} aria-label={`Elegir icono. Actual: ${getFinanceIconLabel(value)}`}>
        <FinanceIcon name={value} className="size-4" />
        {!compact ? <span className="truncate">{getFinanceIconLabel(value)}</span> : null}
      </Button>
    </DialogTrigger>
    <DialogContent onOpenAutoFocus={(event) => event.preventDefault()} className="flex h-[min(720px,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-w-xl">
      <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5 pr-16">
        <DialogTitle className="text-xl">Elige un icono</DialogTitle>
        <DialogDescription>Busca una categoría general o una marca conocida.</DialogDescription>
        <div className="relative mt-3"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => { setQuery(event.target.value); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} className="h-12 pl-10" placeholder="Buscar icono o marca…" /></div>
        <div className="mt-2 grid grid-cols-2 rounded-xl bg-secondary/70 p-1" role="tablist" aria-label="Tipo de icono">
          <button type="button" role="tab" aria-selected={kind === "generic"} onClick={() => { setKind("generic"); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} className={cn("min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,transform] duration-150 active:scale-[.98]", kind === "generic" && "bg-background text-foreground shadow-sm")}>Generales</button>
          <button type="button" role="tab" aria-selected={kind === "brand"} onClick={() => { setKind("brand"); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} className={cn("min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,transform] duration-150 active:scale-[.98]", kind === "brand" && "bg-background text-foreground shadow-sm")}>Apps y marcas</button>
        </div>
      </DialogHeader>
      <div ref={scrollRef} className="mobile-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]" data-icon-scroll>
        {matches.length ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {matches.map((entry) => <button type="button" key={entry.value} onClick={() => { onValueChange(entry.value); setOpen(false); }} title={entry.label} aria-label={`Usar ${entry.label}`} aria-pressed={value === entry.value} className={cn("flex min-h-20 min-w-0 touch-manipulation flex-col items-center justify-center gap-2 rounded-2xl border px-1.5 py-2 text-muted-foreground transition-[transform,color,background-color,border-color] duration-150 hover:bg-secondary hover:text-foreground active:scale-[.96]", value === entry.value && "border-primary bg-primary/10 text-primary")}><FinanceIcon name={entry.value} className="size-5 shrink-0" /><span className="w-full truncate text-center text-[10px] leading-3.5">{entry.label}</span></button>)}
        </div> : <p className="grid min-h-48 place-items-center text-center text-sm text-muted-foreground">No encontramos ese icono.</p>}
      </div>
      <p className="shrink-0 border-t px-5 py-3 text-[10px] leading-4 text-muted-foreground">Las marcas solo identifican el comercio; no implican afiliación con Moneva.</p>
    </DialogContent>
  </Dialog>;
}
