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
    <span
      className={cn("inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-foreground", presentation.className, className)}
      title={presentation.description}
    >
      <Icon className={cn("size-3.5", presentation.iconClassName)} aria-hidden="true" />
      {presentation.label}
    </span>
  );
}
