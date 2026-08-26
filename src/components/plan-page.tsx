"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Network, WalletCards } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { BudgetsPage } from "@/components/budgets-page";
import { FinanceStructurePage } from "@/components/finance-structure-page";
import { MotionGesturesProvider } from "@/components/motion-provider";
import { PageHeader } from "@/components/page-header";
import { PlanSimulatorPage } from "@/components/plan-simulator-page";
import { RouteViewPanel, RouteViewTabs, type RouteViewChangeSource } from "@/components/route-view-tabs";
import { useFinance } from "@/components/finance-provider";
import { monthLabel } from "@/lib/finance/calculations";

type PlanView = "distribution" | "budget" | "simulator";

function viewFromParam(value: string | null): PlanView {
  if (value === "presupuesto" || value === "montos") return "budget";
  if (value === "simulador") return "simulator";
  return "distribution";
}

export function PlanPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawView = searchParams.get("vista");
  const view = viewFromParam(rawView);
  const [visitedViews, setVisitedViews] = useState<Set<PlanView>>(() => new Set([view]));
  const [instantPanelMotion, setInstantPanelMotion] = useState(false);
  const { currentMonth, groupAllocations } = useFinance();
  const activeCategories = groupAllocations.filter((category) => !category.archived);

  useEffect(() => {
    if (rawView !== "montos") return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("vista", "presupuesto");
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }, [pathname, rawView, searchParams]);

  useEffect(() => {
    if (!instantPanelMotion) return;
    const frame = requestAnimationFrame(() => setInstantPanelMotion(false));
    return () => cancelAnimationFrame(frame);
  }, [instantPanelMotion, view]);

  const selectView = (nextView: PlanView, source: RouteViewChangeSource) => {
    if (nextView === view) return;
    setInstantPanelMotion(source === "keyboard");
    setVisitedViews((current) => current.has(nextView) ? current : new Set([...current, nextView]));
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === "distribution") params.delete("vista");
    if (nextView === "budget") params.set("vista", "presupuesto");
    if (nextView === "simulator") params.set("vista", "simulador");
    const query = params.toString();
    window.history.pushState(null, "", `${pathname}${query ? `?${query}` : ""}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Plan" description="Define tu estructura, convierte el ingreso en un presupuesto mensual y prueba escenarios sin alterar tus datos." />
    <nav className="app-sticky-below-header sticky z-20 -mx-4 mb-7 border-b bg-background px-4 pb-3 shadow-[0_12px_22px_-24px_rgba(0,0,0,.8)] sm:static sm:mx-0 sm:mb-9 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:shadow-none" aria-label="Secciones del plan">
      <RouteViewTabs idPrefix="plan" label="Vista del plan" value={view} items={[
        { value: "distribution", icon: Network, label: "Distribución", detail: `${activeCategories.length} categorías` },
        { value: "budget", icon: WalletCards, label: "Presupuesto", detail: "Dinero real" },
        { value: "simulator", icon: FlaskConical, label: "Simulador", detail: "Sin guardar" },
      ]} onValueChange={selectView} />
    </nav>
    {view === "distribution" || visitedViews.has("distribution") ? <RouteViewPanel active={view === "distribution"} instant={instantPanelMotion} id="plan-panel-distribution" labelledBy="plan-tab-distribution"><MotionGesturesProvider><FinanceStructurePage embedded /></MotionGesturesProvider></RouteViewPanel> : null}
    {view === "budget" || visitedViews.has("budget") ? <RouteViewPanel active={view === "budget"} instant={instantPanelMotion} id="plan-panel-budget" labelledBy="plan-tab-budget"><BudgetsPage embedded /></RouteViewPanel> : null}
    {view === "simulator" || visitedViews.has("simulator") ? <RouteViewPanel active={view === "simulator"} instant={instantPanelMotion} id="plan-panel-simulator" labelledBy="plan-tab-simulator"><PlanSimulatorPage /></RouteViewPanel> : null}
  </>;
}
