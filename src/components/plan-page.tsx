"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarRange, Network } from "lucide-react";
import { useState } from "react";
import { BudgetsPage } from "@/components/budgets-page";
import { FinanceStructurePage } from "@/components/finance-structure-page";
import { PageHeader } from "@/components/page-header";
import { useFinance } from "@/components/finance-provider";
import { monthLabel } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

type PlanView = "structure" | "budgets";

export function PlanPage() {
  const [view, setView] = useState<PlanView>("structure");
  const reduceMotion = useReducedMotion();
  const { currentMonth, groupAllocations } = useFinance();
  const activeGroups = groupAllocations.filter((group) => !group.archived);

  return <>
    <PageHeader eyebrow={monthLabel(currentMonth)} title="Plan" description="Tu modelo financiero y sus montos mensuales viven juntos: primero distribuyes el 100%; después asignas límites a cada subcategoría." />
    <nav className="sticky top-[68px] z-10 -mx-4 mb-8 border-b bg-background/92 px-4 backdrop-blur-xl sm:static sm:mx-0 sm:bg-transparent sm:px-0" aria-label="Secciones del plan">
      <div className="grid max-w-xl grid-cols-2 gap-1 rounded-2xl bg-secondary/65 p-1.5">
        <PlanTab active={view === "structure"} icon={Network} label="Distribución" detail={`${activeGroups.length} grupos`} onClick={() => setView("structure")} />
        <PlanTab active={view === "budgets"} icon={CalendarRange} label="Montos" detail="Este mes" onClick={() => setView("budgets")} />
      </div>
    </nav>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={view} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -5 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
        {view === "structure" ? <FinanceStructurePage embedded /> : <BudgetsPage embedded />}
      </motion.div>
    </AnimatePresence>
  </>;
}

function PlanTab({ active, icon: Icon, label, detail, onClick }: { active: boolean; icon: typeof Network; label: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-14 items-center gap-3 rounded-xl px-3 text-left text-muted-foreground transition-colors", active && "bg-background text-foreground shadow-sm")}>
    <span className={cn("grid size-8 place-items-center rounded-lg bg-background/70", active && "bg-primary/12 text-primary")}><Icon className="size-4" /></span>
    <span className="min-w-0"><span className="block text-sm font-medium">{label}</span><span className="block truncate text-[10px] text-muted-foreground">{detail}</span></span>
  </button>;
}
