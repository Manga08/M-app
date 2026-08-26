"use client";

import { Check, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InputControl } from "@/components/ui/form-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceIcon, financeIconCatalog, getFinanceIconLabel } from "@/lib/finance/icon-catalog";
import { cn } from "@/lib/utils";

export type IconKind = "generic" | "bank" | "brand";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const historyOwned = useRef(false);
  const historyValue = `icon-${pickerId}`;
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const syncFromHistory = () => {
      const active = new URL(window.location.href).searchParams.get("surface") === historyValue;
      if (!active) {
        historyOwned.current = false;
        setOpen(false);
      }
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, [historyValue]);

  function changeOpen(next: boolean) {
    if (next) {
      if (!historyOwned.current) {
        const url = new URL(window.location.href);
        url.searchParams.set("surface", historyValue);
        window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
        historyOwned.current = true;
      }
      setKind(preferredKind ?? iconKind(value));
      setQuery("");
      setOpen(true);
      return;
    }
    setOpen(false);
    const url = new URL(window.location.href);
    if (historyOwned.current && url.searchParams.get("surface") === historyValue) {
      window.history.back();
      return;
    }
    url.searchParams.delete("surface");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function changeKind(nextKind: string) {
    setKind(nextKind as IconKind);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  const trigger = embedded ? (
    <button data-slot="dialog-trigger" type="button" onClick={() => changeOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="grid h-full w-[52px] shrink-0 touch-manipulation place-items-center self-stretch border-r border-input bg-transparent text-primary transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-secondary/55 focus-visible:outline-none active:bg-secondary/70" aria-label={`Elegir icono. Actual: ${currentLabel}`} title={`Icono: ${currentLabel}`}>
      <FinanceIcon name={value} className="size-5" />
    </button>
  ) : (
    <Button data-slot="dialog-trigger" type="button" onClick={() => changeOpen(true)} aria-haspopup="dialog" aria-expanded={open} variant="outline" size={compact ? "icon" : "default"} className={cn("h-[52px] max-sm:h-[52px] gap-3 rounded-[14px]", compact ? "size-[52px] max-sm:size-[52px] justify-center px-0" : "w-full justify-start")} aria-label={`Elegir icono. Actual: ${currentLabel}`} title={`Icono: ${currentLabel}`}>
      <FinanceIcon name={value} className="size-[18px]" />
      {!compact ? <span className="truncate">{currentLabel}</span> : null}
    </Button>
  );

  return <>
    {trigger}
    <dialog
      ref={dialogRef}
      aria-labelledby={`${pickerId}-title`}
      aria-describedby={`${pickerId}-description`}
      onCancel={(event) => { event.preventDefault(); changeOpen(false); }}
      className="m-auto flex h-[min(720px,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-[24px] border-0 bg-popover p-0 text-sm text-popover-foreground shadow-2xl outline-none backdrop:bg-black/45 [&:not([open])]:hidden max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:max-w-none max-sm:rounded-none"
    >
      <Tabs value={kind} onValueChange={changeKind} className="contents">
        <div className="safe-dialog-top relative shrink-0 border-b px-4 pb-4 pt-5 pr-14 min-[360px]:px-5 min-[360px]:pr-16">
          <h2 id={`${pickerId}-title`} className="font-heading text-xl font-medium leading-tight">Elige un icono</h2>
          <p id={`${pickerId}-description`} className="mt-2 text-sm text-muted-foreground">Busca un símbolo, un banco colombiano o una marca conocida.</p>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => changeOpen(false)} className="absolute right-3 top-[max(.75rem,env(safe-area-inset-top))]" aria-label="Cerrar selector de iconos"><X className="size-4" /></Button>
          <InputControl ref={searchRef} autoFocus value={query} onChange={(event) => { setQuery(event.target.value); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} leading={<Search />} containerClassName="mt-3" placeholder="Buscar icono o marca…" aria-label="Buscar icono o marca" />
          <TabsList className="mt-2 grid h-auto w-full grid-cols-3 rounded-xl bg-secondary/70 p-1 group-data-horizontal/tabs:h-auto" aria-label="Tipo de icono">
            {iconTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                id={`${pickerId}-${tab.value}-tab`}
                aria-controls={`${pickerId}-${tab.value}-panel`}
                className="h-11 min-h-11 rounded-lg px-1 text-[11px] font-medium transition-[color,background-color,transform] duration-[var(--motion-duration-press)] ease-[var(--motion-ease-out)] active:scale-[var(--motion-press-scale)] motion-reduce:transition-[color,background-color] motion-reduce:active:scale-100 min-[360px]:px-2 min-[360px]:text-xs"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
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
                  onClick={() => { onValueChange(entry.value); changeOpen(false); }}
                  title={entry.label}
                  aria-label={`Usar ${entry.label}`}
                  aria-pressed={selected}
                  className={cn("relative flex min-h-[86px] min-w-0 touch-manipulation flex-col items-center justify-center gap-2 rounded-2xl border px-1.5 py-2 text-muted-foreground transition-[transform,color,background-color,border-color] duration-[var(--motion-duration-press)] ease-[var(--motion-ease-out)] hover:bg-secondary hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring active:scale-[var(--motion-press-scale)] motion-reduce:transition-[color,background-color,border-color] motion-reduce:active:scale-100", selected && "border-primary bg-primary/10 text-primary")}
                >
                  <FinanceIcon name={entry.value} className="size-[22px] shrink-0" />
                  <span className="line-clamp-2 w-full text-center text-[11px] leading-3.5">{entry.label}</span>
                  {selected ? <span aria-hidden="true" className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-2.5" /></span> : null}
                </button>;
              })}
            </div> : tab.value === kind ? <p role="status" className="grid min-h-48 place-items-center text-center text-sm text-muted-foreground">No encontramos ese icono.</p> : null}
          </TabsContent>
        ))}
        <p className="shrink-0 border-t px-5 py-3 text-[11px] leading-4 text-muted-foreground">Las marcas solo identifican el comercio; no implican afiliación con Moneva.</p>
      </Tabs>
    </dialog>
  </>;
}

function iconKind(value: string): IconKind {
  if (value.startsWith("bank:")) return "bank";
  if (value.startsWith("brand:")) return "brand";
  return "generic";
}
