"use client";

import { useEffect, useState } from "react";
import { CalendarDays, History, Plus, Repeat2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { MovementCalendar } from "@/components/movement-calendar";
import { PageHeader } from "@/components/page-header";
import { ScheduledMovementsPage } from "@/components/scheduled-movements-page";
import { TransactionsPage } from "@/components/transactions-page";
import { RouteViewPanel, RouteViewTabs, type RouteViewChangeSource } from "@/components/route-view-tabs";
import { Button } from "@/components/ui/button";
import { useFinance } from "@/components/finance-provider";
import { monthLabel } from "@/lib/finance/calculations";

type MovementView = "history" | "scheduled" | "calendar";

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
  const [instantPanelMotion, setInstantPanelMotion] = useState(false);
  const { currentMonth, recurringRules, recurringOccurrences } = useFinance();
  const activeRules = recurringRules.filter((rule) => rule.status !== "archived");
  const upcoming = recurringOccurrences.filter((occurrence) => occurrence.status === "planned");

  useEffect(() => {
    if (!rawView || ["historial", "programados", "calendario"].includes(rawView)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("vista");
    window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
  }, [pathname, rawView, searchParams]);

  useEffect(() => {
    if (!instantPanelMotion) return;
    const frame = requestAnimationFrame(() => setInstantPanelMotion(false));
    return () => cancelAnimationFrame(frame);
  }, [instantPanelMotion, view]);

  function selectView(next: MovementView, source: RouteViewChangeSource) {
    if (next === view) return;
    setInstantPanelMotion(source === "keyboard");
    setVisitedViews((current) => current.has(next) ? current : new Set([...current, next]));
    const params = new URLSearchParams(searchParams.toString());
    if (next === "history") params.delete("vista");
    if (next === "scheduled") params.set("vista", "programados");
    if (next === "calendar") params.set("vista", "calendario");
    window.history.pushState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Movimientos" description="Registra lo que pasó, automatiza lo que se repite y entiende tu mes en el calendario." className="max-[359px]:mb-3 max-[359px]:gap-2 max-[359px]:pb-3" descriptionClassName="max-[359px]:hidden" action={<Button className="h-11 rounded-full px-5 max-sm:hidden" onClick={() => window.dispatchEvent(new Event("moneva:quick-add"))}><Plus className="size-4" />Nuevo movimiento</Button>} />
    <nav data-movement-tabs className="-mx-4 mb-4 px-4 pb-3 max-[359px]:mb-2 max-[359px]:pb-2 min-[360px]:mb-7 sm:mx-0 sm:mb-9 sm:px-0 sm:pb-0" aria-label="Secciones de movimientos">
      <RouteViewTabs idPrefix="movement" label="Vista de movimientos" value={view} compactOnSmall items={[
        { value: "history", icon: History, label: "Historial", detail: "Reales" },
        { value: "scheduled", icon: Repeat2, label: "Programados", detail: `${activeRules.length} reglas` },
        { value: "calendar", icon: CalendarDays, label: "Calendario", detail: `${upcoming.length} próximos` },
      ]} onValueChange={selectView} />
    </nav>
    {view === "history" || visitedViews.has("history") ? <RouteViewPanel active={view === "history"} instant={instantPanelMotion} id="movement-panel-history" labelledBy="movement-tab-history"><TransactionsPage embedded /></RouteViewPanel> : null}
    {view === "scheduled" || visitedViews.has("scheduled") ? <RouteViewPanel active={view === "scheduled"} instant={instantPanelMotion} id="movement-panel-scheduled" labelledBy="movement-tab-scheduled"><ScheduledMovementsPage /></RouteViewPanel> : null}
    {view === "calendar" || visitedViews.has("calendar") ? <RouteViewPanel active={view === "calendar"} instant={instantPanelMotion} id="movement-panel-calendar" labelledBy="movement-tab-calendar"><MovementCalendar /></RouteViewPanel> : null}
  </>;
}
