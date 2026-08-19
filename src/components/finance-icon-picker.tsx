"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InputControl } from "@/components/ui/form-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceIcon, financeIconCatalog, getFinanceIconLabel } from "@/lib/finance/icon-catalog";
import { cn } from "@/lib/utils";

type IconKind = "generic" | "bank" | "brand";
const iconTabs = [
  { value: "generic", label: "Generales" },
  { value: "bank", label: "Bancos CO" },
  { value: "brand", label: "Marcas" },
] as const satisfies ReadonlyArray<{ value: IconKind; label: string }>;

export function FinanceIconPicker({ value, onValueChange, compact = false, embedded = false, preferredKind }: { value: string; onValueChange: (value: string) => void; compact?: boolean; embedded?: boolean; preferredKind?: IconKind }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<IconKind>(() => preferredKind ?? iconKind(value));
  const pickerId = useId().replaceAll(":", "");
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedIconRef = useRef<HTMLButtonElement>(null);
  const matches = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase("es");
    return financeIconCatalog.filter((entry) => entry.kind === kind && (!clean || `${entry.label} ${entry.keywords}`.toLocaleLowerCase("es").includes(clean)));
  }, [kind, query]);
  const currentLabel = getFinanceIconLabel(value);

  useEffect(() => {
    if (!open || query || iconKind(value) !== kind) return;
    const frame = requestAnimationFrame(() => {
      selectedIconRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [kind, open, query, value]);

  function changeKind(nextKind: string) {
    setKind(nextKind as IconKind);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  const trigger = embedded ? (
    <button type="button" className="grid h-full w-[52px] shrink-0 touch-manipulation place-items-center self-stretch border-r border-input bg-transparent text-primary transition-colors duration-150 hover:bg-secondary/55 focus-visible:outline-none active:bg-secondary/70" aria-label={`Elegir icono. Actual: ${currentLabel}`} title={`Icono: ${currentLabel}`}>
      <FinanceIcon name={value} className="size-5" />
    </button>
  ) : (
    <Button type="button" variant="outline" size={compact ? "icon" : "default"} className={cn("h-[52px] max-sm:h-[52px] gap-3 rounded-[14px]", compact ? "size-[52px] max-sm:size-[52px] justify-center px-0" : "w-full justify-start")} aria-label={`Elegir icono. Actual: ${currentLabel}`} title={`Icono: ${currentLabel}`}>
      <FinanceIcon name={value} className="size-[18px]" />
      {!compact ? <span className="truncate">{currentLabel}</span> : null}
    </Button>
  );

  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) { setKind(preferredKind ?? iconKind(value)); setQuery(""); } }}>
    <DialogTrigger asChild>
      {trigger}
    </DialogTrigger>
    <DialogContent
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
      }}
      className="flex h-[min(720px,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:p-0 max-sm:pb-0 sm:max-w-xl"
    >
      <Tabs value={kind} onValueChange={changeKind} className="contents">
        <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-5 pr-14 min-[360px]:px-5 min-[360px]:pr-16">
          <DialogTitle className="text-xl">Elige un icono</DialogTitle>
          <DialogDescription>Busca un símbolo, un banco colombiano o una marca conocida.</DialogDescription>
          <InputControl ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} leading={<Search />} containerClassName="mt-3" placeholder="Buscar icono o marca…" aria-label="Buscar icono o marca" />
          <TabsList className="mt-2 grid h-auto w-full grid-cols-3 rounded-xl bg-secondary/70 p-1 group-data-horizontal/tabs:h-auto" aria-label="Tipo de icono">
            {iconTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                id={`${pickerId}-${tab.value}-tab`}
                aria-controls={`${pickerId}-${tab.value}-panel`}
                className="h-11 min-h-11 rounded-lg px-1 text-[11px] font-medium transition-[color,background-color,transform] duration-150 active:scale-[.98] min-[360px]:px-2 min-[360px]:text-xs"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </DialogHeader>
        {iconTabs.map((tab) => (
          <TabsContent
            key={tab.value}
            ref={tab.value === kind ? scrollRef : undefined}
            value={tab.value}
            id={`${pickerId}-${tab.value}-panel`}
            aria-labelledby={`${pickerId}-${tab.value}-tab`}
            tabIndex={0}
            className="mobile-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            data-icon-scroll
          >
            {tab.value === kind && matches.length ? <div className="grid grid-cols-3 gap-2 min-[360px]:grid-cols-4 sm:grid-cols-5">
              {matches.map((entry) => {
                const selected = value === entry.value;
                return <button
                  ref={selected ? selectedIconRef : undefined}
                  type="button"
                  key={entry.value}
                  onClick={() => { onValueChange(entry.value); setOpen(false); }}
                  title={entry.label}
                  aria-label={`Usar ${entry.label}`}
                  aria-pressed={selected}
                  className={cn("relative flex min-h-[86px] min-w-0 touch-manipulation flex-col items-center justify-center gap-2 rounded-2xl border px-1.5 py-2 text-muted-foreground transition-[transform,color,background-color,border-color] duration-150 hover:bg-secondary hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring active:scale-[.96]", selected && "border-primary bg-primary/10 text-primary")}
                >
                  <FinanceIcon name={entry.value} className="size-[22px] shrink-0" />
                  <span className="line-clamp-2 w-full text-center text-[11px] leading-3.5">{entry.label}</span>
                  {selected ? <span aria-hidden="true" className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-2.5" /></span> : null}
                </button>;
              })}
            </div> : tab.value === kind ? <p role="status" className="grid min-h-48 place-items-center text-center text-sm text-muted-foreground">No encontramos ese icono.</p> : null}
          </TabsContent>
        ))}
        <p className="shrink-0 border-t px-5 py-3 text-[10px] leading-4 text-muted-foreground">Las marcas solo identifican el comercio; no implican afiliación con Moneva.</p>
      </Tabs>
    </DialogContent>
  </Dialog>;
}

function iconKind(value: string): IconKind {
  if (value.startsWith("bank:")) return "bank";
  if (value.startsWith("brand:")) return "brand";
  return "generic";
}
