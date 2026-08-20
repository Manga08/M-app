"use client";

import { Activity, type KeyboardEvent, useEffect } from "react";
import { FlaskConical, Network, WalletCards } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { BudgetsPage } from "@/components/budgets-page";
import { FinanceStructurePage } from "@/components/finance-structure-page";
import { PageHeader } from "@/components/page-header";
import { PlanSimulatorPage } from "@/components/plan-simulator-page";
import { useFinance } from "@/components/finance-provider";
import { monthLabel } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

type PlanView = "distribution" | "budget" | "simulator";
const views: PlanView[] = ["distribution", "budget", "simulator"];

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
  const { currentMonth, groupAllocations } = useFinance();
  const activeCategories = groupAllocations.filter((category) => !category.archived);

  useEffect(() => {
    if (rawView !== "montos") return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("vista", "presupuesto");
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }, [pathname, rawView, searchParams]);

  const selectView = (nextView: PlanView) => {
    if (nextView === view) return;
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === "distribution") params.delete("vista");
    if (nextView === "budget") params.set("vista", "presupuesto");
    if (nextView === "simulator") params.set("vista", "simulador");
    const query = params.toString();
    window.history.pushState(null, "", `${pathname}${query ? `?${query}` : ""}`);
  };

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, current: PlanView) => {
    const currentIndex = views.indexOf(current);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % views.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + views.length) % views.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = views.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const next = views[nextIndex];
    selectView(next);
    requestAnimationFrame(() => document.getElementById(`plan-tab-${next}`)?.focus());
  };

  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Plan" description="Define tu estructura, convierte el ingreso en un presupuesto mensual y prueba escenarios sin alterar tus datos." />
    <nav className="sticky top-[calc(68px+env(safe-area-inset-top))] z-10 -mx-4 mb-8 border-b bg-background/96 px-4 pb-3 backdrop-blur-md sm:static sm:mx-0 sm:mb-10 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none" aria-label="Secciones del plan">
      <div role="tablist" aria-label="Vista del plan" className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-1 rounded-[1.25rem] bg-secondary/55 p-1">
        <PlanTab view="distribution" active={view === "distribution"} icon={Network} label="Distribución" detail={`${activeCategories.length} categorías`} onClick={() => selectView("distribution")} onKeyDown={(event) => moveTabFocus(event, "distribution")} />
        <PlanTab view="budget" active={view === "budget"} icon={WalletCards} label="Presupuesto" detail="Dinero real" onClick={() => selectView("budget")} onKeyDown={(event) => moveTabFocus(event, "budget")} />
        <PlanTab view="simulator" active={view === "simulator"} icon={FlaskConical} label="Simulador" detail="Sin guardar" onClick={() => selectView("simulator")} onKeyDown={(event) => moveTabFocus(event, "simulator")} />
      </div>
    </nav>
    <Activity mode={view === "distribution" ? "visible" : "hidden"}><section id="plan-panel-distribution" role="tabpanel" aria-labelledby="plan-tab-distribution"><FinanceStructurePage embedded /></section></Activity>
    <Activity mode={view === "budget" ? "visible" : "hidden"}><section id="plan-panel-budget" role="tabpanel" aria-labelledby="plan-tab-budget"><BudgetsPage embedded /></section></Activity>
    <Activity mode={view === "simulator" ? "visible" : "hidden"}><section id="plan-panel-simulator" role="tabpanel" aria-labelledby="plan-tab-simulator"><PlanSimulatorPage /></section></Activity>
  </>;
}

function PlanTab({ view, active, icon: Icon, label, detail, onClick, onKeyDown }: { view: PlanView; active: boolean; icon: typeof Network; label: string; detail: string; onClick: () => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void }) {
  return <button id={`plan-tab-${view}`} type="button" role="tab" aria-selected={active} aria-controls={`plan-panel-${view}`} tabIndex={active ? 0 : -1} onClick={onClick} onKeyDown={onKeyDown} className={cn("relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out active:scale-[.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:min-h-[4.25rem] sm:flex-row sm:gap-3 sm:px-5", active && "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]")}>
    <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg sm:size-8 sm:rounded-xl", active ? "bg-primary/12 text-primary" : "text-muted-foreground")} aria-hidden="true"><Icon className="size-4 sm:size-[17px]" /></span>
    <span className="min-w-0 text-center sm:text-left"><span className="block text-[11px] font-medium min-[360px]:text-xs sm:text-sm">{label}</span><span className="hidden truncate text-[11px] leading-4 text-muted-foreground sm:block">{detail}</span></span>
  </button>;
}
