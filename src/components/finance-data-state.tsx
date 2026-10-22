"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calculator, CheckCircle2, Gauge, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";

export type FinanceDataState = "confirmed" | "calculated" | "estimated" | "manual";

const statePresentation = {
  confirmed: {
    label: "Confirmado",
    description: "Coincide con una fuente verificada, como un extracto conciliado.",
    icon: CheckCircle2,
    className: "bg-positive/10",
    iconClassName: "text-positive",
  },
  calculated: {
    label: "Calculado",
    description: "Moneva lo calcula desde los movimientos registrados.",
    icon: Calculator,
    className: "bg-info/10",
    iconClassName: "text-info",
  },
  estimated: {
    label: "Aproximado",
    description: "Es una referencia que puede cambiar cuando confirmes la información.",
    icon: Gauge,
    className: "bg-warning/10",
    iconClassName: "text-warning",
  },
  manual: {
    label: "Manual",
    description: "Lo escribiste tú y puedes ajustarlo cuando cambie.",
    icon: PencilLine,
    className: "bg-secondary",
    iconClassName: "text-muted-foreground",
  },
} satisfies Record<FinanceDataState, { label: string; description: string; icon: typeof CheckCircle2; className: string; iconClassName: string }>;

export function FinanceDataStateBadge({ state, className }: { state: FinanceDataState; className?: string }) {
  const presentation = statePresentation[state];
  const Icon = presentation.icon;

  return (
    <Popover><PopoverTrigger asChild><button type="button"
      className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-foreground", presentation.className, className)}
      aria-label={`${presentation.label}: ver qué significa`}
    >
      <Icon className={cn("size-3.5", presentation.iconClassName)} aria-hidden="true" />
      {presentation.label}
    </button></PopoverTrigger><PopoverContent className="max-w-[calc(100vw-2rem)] p-4"><p className="font-medium">{presentation.label}</p><p className="text-xs leading-5 text-muted-foreground">{presentation.description}</p></PopoverContent></Popover>
  );
}
