"use client";

import Link from "next/link";
import { Activity, useState } from "react";
import { FlaskConical, Network, WalletCards } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { BudgetsPage } from "@/components/budgets-page";
import { FinanceStructurePage } from "@/components/finance-structure-page";
import { MotionGesturesProvider } from "@/components/motion-provider";
import { PageHeader } from "@/components/page-header";
import { PlanSimulatorPage } from "@/components/plan-simulator-page";
import { Button } from "@/components/ui/button";
import { useFinance } from "@/components/finance-provider";
import { monthLabel } from "@/lib/finance/calculations";

export function PlanPage() {
  const params = useSearchParams();
  const rawView = params.get("vista");
  const view = rawView === "distribucion" ? "distribution" : rawView === "simulador" ? "simulator" : "budget";
  const { currentMonth } = useFinance();
  const [visited, setVisited] = useState(() => new Set([view]));
  const items = [
    { value: "budget", href: "/presupuestos", icon: WalletCards, label: "Presupuesto mensual" },
    { value: "distribution", href: "/presupuestos?vista=distribucion", icon: Network, label: "Repartir por porcentajes" },
    { value: "simulator", href: "/presupuestos?vista=simulador", icon: FlaskConical, label: "Probar en el simulador" },
  ];
  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Presupuesto" description="Decide cuánto quieres gastar y comprueba cuánto te queda. Es opcional: puedes registrar movimientos sin configurar límites." />
    <nav className="mb-8 flex flex-wrap gap-2" aria-label="Herramientas de planificación">
      {items.map(({ value, href, icon: Icon, label }) => <Button key={value} asChild variant={view === value ? "secondary" : "ghost"} className="min-h-11 h-auto whitespace-normal rounded-full text-left"><Link href={href} onClick={() => setVisited((current) => new Set([...current, value]))} aria-current={view === value ? "page" : undefined}><Icon className="size-4 shrink-0" />{label}</Link></Button>)}
    </nav>
    {view === "budget" || visited.has("budget") ? <Activity key="budget" mode={view === "budget" ? "visible" : "hidden"}><BudgetsPage embedded /></Activity> : null}
    {view === "distribution" || visited.has("distribution") ? <Activity key="distribution" mode={view === "distribution" ? "visible" : "hidden"}><MotionGesturesProvider><FinanceStructurePage embedded /></MotionGesturesProvider></Activity> : null}
    {view === "simulator" || visited.has("simulator") ? <Activity key="simulator" mode={view === "simulator" ? "visible" : "hidden"}><PlanSimulatorPage /></Activity> : null}
  </>;
}
