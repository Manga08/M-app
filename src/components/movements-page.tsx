"use client";

import { Activity, type KeyboardEvent, useEffect, useState } from "react";
import { CalendarDays, History, Plus, Repeat2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { MovementCalendar } from "@/components/movement-calendar";
import { PageHeader } from "@/components/page-header";
import { ScheduledMovementsPage } from "@/components/scheduled-movements-page";
import { TransactionsPage } from "@/components/transactions-page";
import { Button } from "@/components/ui/button";
import { useFinance } from "@/components/finance-provider";
import { monthLabel } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

type MovementView = "history" | "scheduled" | "calendar";
const views: MovementView[] = ["history", "scheduled", "calendar"];

function viewFromParam(value: string | null): MovementView {
  if (value === "programados") return "scheduled";
  if (value === "calendario") return "calendar";
  return "history";
}

export function MovementsPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawView = searchParams.get("vista");
  const view = viewFromParam(rawView);
  const [visitedViews, setVisitedViews] = useState<Set<MovementView>>(() => new Set([view]));
  const { currentMonth, recurringRules, recurringOccurrences } = useFinance();
  const activeRules = recurringRules.filter((rule) => rule.status !== "archived");
  const upcoming = recurringOccurrences.filter((occurrence) => occurrence.status === "planned");

  useEffect(() => {
    if (!rawView || ["historial", "programados", "calendario"].includes(rawView)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("vista");
    window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
  }, [pathname, rawView, searchParams]);

  function selectView(next: MovementView) {
    if (next === view) return;
    setVisitedViews((current) => current.has(next) ? current : new Set([...current, next]));
    const params = new URLSearchParams(searchParams.toString());
    if (next === "history") params.delete("vista");
    if (next === "scheduled") params.set("vista", "programados");
    if (next === "calendar") params.set("vista", "calendario");
    window.history.pushState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, current: MovementView) {
    const index = views.indexOf(current);
    let next: number | undefined;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    if (event.key === "ArrowLeft") next = (index - 1 + views.length) % views.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = views.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    selectView(views[next]);
    requestAnimationFrame(() => document.getElementById(`movement-tab-${views[next]}`)?.focus());
  }

  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Movimientos" description="Registra lo que pasó, automatiza lo que se repite y entiende tu mes en el calendario." className="max-[359px]:mb-3 max-[359px]:gap-2 max-[359px]:pb-3" descriptionClassName="max-[359px]:hidden" action={<Button className="h-11 rounded-full px-5 max-sm:hidden" onClick={() => window.dispatchEvent(new Event("moneva:quick-add"))}><Plus className="size-4" />Nuevo movimiento</Button>} />
    <nav className="app-sticky-below-header sticky z-20 -mx-4 mb-4 border-b bg-background px-4 pb-3 shadow-[0_12px_22px_-24px_rgba(0,0,0,.8)] max-[359px]:mb-2 max-[359px]:pb-2 min-[360px]:mb-7 sm:static sm:mx-0 sm:mb-9 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:shadow-none" aria-label="Secciones de movimientos">
      <div role="tablist" aria-label="Vista de movimientos" className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-1.5 rounded-[1.35rem] border border-border/70 bg-secondary/35 p-1.5">
        <MovementTab view="history" active={view === "history"} icon={History} label="Historial" detail="Reales" onClick={() => selectView("history")} onKeyDown={(event) => moveFocus(event, "history")} />
        <MovementTab view="scheduled" active={view === "scheduled"} icon={Repeat2} label="Programados" detail={`${activeRules.length} reglas`} onClick={() => selectView("scheduled")} onKeyDown={(event) => moveFocus(event, "scheduled")} />
        <MovementTab view="calendar" active={view === "calendar"} icon={CalendarDays} label="Calendario" detail={`${upcoming.length} próximos`} onClick={() => selectView("calendar")} onKeyDown={(event) => moveFocus(event, "calendar")} />
      </div>
    </nav>
    {view === "history" || visitedViews.has("history") ? <Activity mode={view === "history" ? "visible" : "hidden"}><section id="movement-panel-history" role="tabpanel" aria-labelledby="movement-tab-history"><TransactionsPage embedded /></section></Activity> : null}
    {view === "scheduled" || visitedViews.has("scheduled") ? <Activity mode={view === "scheduled" ? "visible" : "hidden"}><section id="movement-panel-scheduled" role="tabpanel" aria-labelledby="movement-tab-scheduled"><ScheduledMovementsPage /></section></Activity> : null}
    {view === "calendar" || visitedViews.has("calendar") ? <Activity mode={view === "calendar" ? "visible" : "hidden"}><section id="movement-panel-calendar" role="tabpanel" aria-labelledby="movement-tab-calendar"><MovementCalendar /></section></Activity> : null}
  </>;
}

function MovementTab({ view, active, icon: Icon, label, detail, onClick, onKeyDown }: { view: MovementView; active: boolean; icon: typeof History; label: string; detail: string; onClick: () => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void }) {
  return <button id={`movement-tab-${view}`} type="button" role="tab" aria-selected={active} aria-controls={`movement-panel-${view}`} tabIndex={active ? 0 : -1} onClick={onClick} onKeyDown={onKeyDown} className={cn("relative flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-[1rem] px-1.5 text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none max-[359px]:min-h-[52px] sm:min-h-[4.25rem] sm:flex-row sm:justify-start sm:gap-3 sm:px-5", active && "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,.08),0_6px_18px_rgba(0,0,0,.03)]")}>
    <span className={cn("grid size-7 shrink-0 place-items-center rounded-[10px] transition-colors sm:size-8 sm:rounded-xl", active ? "bg-primary/12 text-primary" : "text-muted-foreground")} aria-hidden="true"><Icon className="size-4 sm:size-[17px]" /></span>
    <span className="min-w-0 text-center sm:text-left"><span className="block truncate text-[11px] font-medium min-[360px]:text-xs sm:text-sm">{label}</span><span className="hidden truncate text-[11px] leading-4 text-muted-foreground sm:block">{detail}</span></span>
  </button>;
}
