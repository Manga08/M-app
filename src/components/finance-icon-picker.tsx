"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FinanceIcon, financeIconCatalog, getFinanceIconLabel } from "@/lib/finance/icon-catalog";
import { cn } from "@/lib/utils";

export function FinanceIconPicker({ value, onValueChange, compact = false }: { value: string; onValueChange: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"generic" | "brand">("generic");
  const matches = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase("es");
    return financeIconCatalog.filter((entry) => entry.kind === kind && (!clean || `${entry.label} ${entry.keywords}`.toLocaleLowerCase("es").includes(clean)));
  }, [kind, query]);

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className={cn("h-11 justify-start gap-3", compact ? "w-11 px-0" : "w-full")} aria-label={`Elegir icono. Actual: ${getFinanceIconLabel(value)}`}>
        <FinanceIcon name={value} className="size-4" />
        {!compact ? <span className="truncate">{getFinanceIconLabel(value)}</span> : null}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[min(360px,calc(100vw-2rem))] gap-3 rounded-2xl p-3">
      <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 pl-9" placeholder="Buscar icono o marca…" /></div>
      <div className="grid grid-cols-2 rounded-xl bg-secondary/70 p-1" role="tablist" aria-label="Tipo de icono">
        <button type="button" role="tab" aria-selected={kind === "generic"} onClick={() => setKind("generic")} className={cn("rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors", kind === "generic" && "bg-background text-foreground shadow-sm")}>Generales</button>
        <button type="button" role="tab" aria-selected={kind === "brand"} onClick={() => setKind("brand")} className={cn("rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors", kind === "brand" && "bg-background text-foreground shadow-sm")}>Apps y marcas</button>
      </div>
      <div className="grid max-h-64 grid-cols-5 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
        {matches.map((entry) => <button type="button" key={entry.value} onClick={() => { onValueChange(entry.value); setOpen(false); }} title={entry.label} aria-label={`Usar ${entry.label}`} className={cn("grid aspect-square place-items-center rounded-xl border text-muted-foreground transition-[transform,color,background-color,border-color] hover:-translate-y-0.5 hover:bg-secondary hover:text-foreground", value === entry.value && "border-primary bg-primary/10 text-primary")}><FinanceIcon name={entry.value} className="size-5" /></button>)}
      </div>
      {!matches.length ? <p className="py-6 text-center text-sm text-muted-foreground">No encontramos ese icono.</p> : null}
      <p className="text-[10px] leading-4 text-muted-foreground">Las marcas solo identifican el comercio; no implican afiliación con Moneva.</p>
    </PopoverContent>
  </Popover>;
}
