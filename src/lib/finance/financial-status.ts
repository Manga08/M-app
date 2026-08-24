export type FinancialTone = "positive" | "warning" | "destructive" | "neutral";

export const financialToneClass: Record<FinancialTone, string> = {
  positive: "text-positive",
  warning: "text-warning",
  destructive: "text-destructive",
  neutral: "text-foreground",
};

export function availableTone(value: number): FinancialTone {
  return value > 0 ? "positive" : value < 0 ? "destructive" : "neutral";
}

export function expenseTone(value: number): FinancialTone {
  return value > 0 ? "destructive" : value < 0 ? "positive" : "neutral";
}

export function budgetUsageTone(spent: number, budget: number): FinancialTone {
  if (budget <= 0) return spent > 0 ? "destructive" : "neutral";
  const percent = (spent / budget) * 100;
  if (percent > 100) return "destructive";
  if (percent >= 85) return "warning";
  return "positive";
}

export function allocationTone(percent: number, hasIncome: boolean): FinancialTone {
  if (!hasIncome) return percent > 0 ? "destructive" : "neutral";
  if (percent > 100) return "destructive";
  if (percent >= 90) return "warning";
  return "positive";
}
