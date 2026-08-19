"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, Network } from "lucide-react";
import { Activity, type KeyboardEvent } from "react";
import { BudgetsPage } from "@/components/budgets-page";
import { FinanceStructurePage } from "@/components/finance-structure-page";
import { PageHeader } from "@/components/page-header";
import { useFinance } from "@/components/finance-provider";
import { monthLabel } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

type PlanView = "structure" | "budgets";

export function PlanPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view: PlanView = searchParams.get("vista") === "montos" ? "budgets" : "structure";
  const { currentMonth, groupAllocations } = useFinance();
  const activeGroups = groupAllocations.filter((group) => !group.archived);

  const selectView = (nextView: PlanView) => {
    if (nextView === view) return;
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === "budgets") params.set("vista", "montos");
    else params.delete("vista");
    const query = params.toString();
    window.history.pushState(null, "", `${pathname}${query ? `?${query}` : ""}`);
  };

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, current: PlanView) => {
    let next: PlanView | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") next = current === "structure" ? "budgets" : "structure";
    else if (event.key === "Home") next = "structure";
    else if (event.key === "End") next = "budgets";
    if (!next) return;
    event.preventDefault();
    selectView(next);
    requestAnimationFrame(() => document.getElementById(`plan-tab-${next}`)?.focus());
  };

  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Plan" description="Tu modelo financiero y sus montos mensuales viven juntos: primero distribuyes el 100%; después asignas límites a cada subcategoría." />
    <nav className="sticky top-[calc(68px+env(safe-area-inset-top))] z-10 -mx-4 mb-8 border-b bg-background px-4 sm:static sm:mx-0 sm:bg-transparent sm:px-0" aria-label="Secciones del plan">
      <div role="tablist" aria-label="Vista del plan" className="grid max-w-xl grid-cols-2 gap-1 rounded-2xl bg-secondary/65 p-1.5">
        <PlanTab view="structure" active={view === "structure"} icon={Network} label="Distribución" detail={`${activeGroups.length} grupos`} onClick={() => selectView("structure")} onKeyDown={(event) => moveTabFocus(event, "structure")} />
        <PlanTab view="budgets" active={view === "budgets"} icon={CalendarRange} label="Montos" detail="Este mes" onClick={() => selectView("budgets")} onKeyDown={(event) => moveTabFocus(event, "budgets")} />
      </div>
    </nav>
    <Activity mode={view === "structure" ? "visible" : "hidden"}><section id="plan-panel-structure" role="tabpanel" aria-labelledby="plan-tab-structure"><FinanceStructurePage embedded /></section></Activity>
    <Activity mode={view === "budgets" ? "visible" : "hidden"}><section id="plan-panel-budgets" role="tabpanel" aria-labelledby="plan-tab-budgets"><BudgetsPage embedded /></section></Activity>
  </>;
}

function PlanTab({ view, active, icon: Icon, label, detail, onClick, onKeyDown }: { view: PlanView; active: boolean; icon: typeof Network; label: string; detail: string; onClick: () => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void }) {
  return <button id={`plan-tab-${view}`} type="button" role="tab" aria-selected={active} aria-controls={`plan-panel-${view}`} tabIndex={active ? 0 : -1} onClick={onClick} onKeyDown={onKeyDown} className={cn("relative flex min-h-14 items-center gap-3 rounded-xl px-3 text-left text-muted-foreground transition-[color,transform] duration-150 ease-out active:scale-[.985] motion-reduce:transition-none", active && "text-foreground")}>
    {active ? <span className="absolute inset-0 rounded-xl bg-background shadow-sm ring-1 ring-foreground/5" aria-hidden="true" /> : null}
    <span className={cn("relative grid size-8 place-items-center rounded-lg bg-background/70 transition-colors", active && "bg-primary/12 text-primary")}><Icon className="size-4" /></span>
    <span className="relative min-w-0"><span className="block text-sm font-medium">{label}</span><span className="block truncate text-[11px] text-muted-foreground">{detail}</span></span>
  </button>;
}
