import type {
  FinancialTarget,
  FinancialTargetEffect,
  FinancialTargetEntry,
  RecurringRule,
  Transaction,
} from "@/lib/finance/types";

export type FinancialTargetProgress = {
  rawProgress: number;
  currentProgress: number;
  remaining: number;
  overage: number;
  percent: number;
  reached: boolean;
};

function signedAmount(amount: number, effect: FinancialTargetEffect) {
  return effect === "advance" ? amount : -amount;
}

export function financialTargetProgress(
  target: FinancialTarget,
  entries: FinancialTargetEntry[],
  transactions: Transaction[],
): FinancialTargetProgress {
  if (target.progressAmount !== undefined) {
    const rawProgress = target.progressAmount;
    const currentProgress = Math.max(0, rawProgress);
    const remaining = Math.max(0, target.targetAmount - rawProgress);
    const overage = Math.max(0, rawProgress - target.targetAmount);
    const percent = Math.max(0, Math.min(100, (rawProgress / Math.max(target.targetAmount, 1)) * 100));
    return { rawProgress, currentProgress, remaining, overage, percent, reached: rawProgress >= target.targetAmount };
  }
  const entryProgress = entries.reduce((sum, entry) => (
    entry.targetId === target.id ? sum + signedAmount(entry.amount, entry.effect) : sum
  ), 0);
  const movementProgress = transactions.reduce((sum, transaction) => (
    transaction.financialTargetId === target.id
      ? sum + signedAmount(transaction.baseAmount ?? transaction.amount, transaction.financialTargetEffect ?? "advance")
      : sum
  ), 0);
  const rawProgress = target.initialProgress + entryProgress + movementProgress;
  const currentProgress = Math.max(0, rawProgress);
  const remaining = Math.max(0, target.targetAmount - rawProgress);
  const overage = Math.max(0, rawProgress - target.targetAmount);
  const percent = Math.max(0, Math.min(100, (rawProgress / Math.max(target.targetAmount, 1)) * 100));
  return { rawProgress, currentProgress, remaining, overage, percent, reached: rawProgress >= target.targetAmount };
}

export function targetProgressDuringMonth(
  targetId: string,
  month: string,
  entries: FinancialTargetEntry[],
  transactions: Transaction[],
) {
  const prefix = month.slice(0, 7);
  const entryProgress = entries.reduce((sum, entry) => (
    entry.targetId === targetId && entry.occurredOn.startsWith(prefix)
      ? sum + signedAmount(entry.amount, entry.effect)
      : sum
  ), 0);
  return transactions.reduce((sum, transaction) => (
    transaction.financialTargetId === targetId && transaction.occurredOn.startsWith(prefix)
      ? sum + signedAmount(transaction.baseAmount ?? transaction.amount, transaction.financialTargetEffect ?? "advance")
      : sum
  ), entryProgress);
}

export function monthlyTargetPace(targetId: string, rules: RecurringRule[]) {
  return rules.reduce((sum, rule) => {
    if (rule.financialTargetId !== targetId || rule.status !== "active") return sum;
    const signed = signedAmount(rule.amount, rule.financialTargetEffect ?? "advance");
    if (rule.cadence === "weekly") return sum + (signed * 52) / (12 * Math.max(1, rule.intervalCount));
    if (rule.cadence === "yearly") return sum + signed / (12 * Math.max(1, rule.intervalCount));
    return sum + signed / Math.max(1, rule.intervalCount);
  }, 0);
}

export function estimatedTargetCompletion(target: FinancialTarget, progress: FinancialTargetProgress, rules: RecurringRule[]) {
  if (progress.reached) return target.completedAt ?? target.updatedAt.slice(0, 10);
  const monthlyPace = monthlyTargetPace(target.id, rules);
  if (monthlyPace <= 0) return null;
  const months = Math.ceil(progress.remaining / monthlyPace);
  const from = new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`);
  from.setUTCMonth(from.getUTCMonth() + months);
  return from.toISOString().slice(0, 10);
}

export function defaultTargetEffect(target: FinancialTarget, transactionType: "income" | "expense" | "transfer") {
  if (target.mode === "pay_down") return "advance" as const;
  return transactionType === "expense" ? "reverse" as const : "advance" as const;
}

export function targetKindLabel(kind: FinancialTarget["kind"]) {
  if (kind === "savings") return "Ahorro";
  if (kind === "emergency") return "Emergencia";
  if (kind === "investment") return "Inversión";
  if (kind === "purchase") return "Compra o proyecto";
  if (kind === "debt") return "Deuda";
  return "Otro objetivo";
}

export function targetStatusLabel(status: FinancialTarget["status"]) {
  if (status === "active") return "Activa";
  if (status === "paused") return "Pausada";
  if (status === "completed") return "Finalizada";
  return "Archivada";
}
