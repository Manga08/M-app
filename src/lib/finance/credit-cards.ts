import type {
  CreditCardFinancingType,
  CreditCardInstallment,
  CreditCardProfile,
} from "@/lib/finance/types";

export type CreditCardCycle = {
  periodStart: string;
  cutoffOn: string;
  dueOn: string;
  daysUntilCutoff: number;
  daysUntilDue: number;
};

export function creditCardDebt(accountBalance: number) {
  return Math.max(0, -accountBalance);
}

export function creditCardAvailable(creditLimit: number, debt: number) {
  return Math.max(0, creditLimit - debt);
}

export function creditCardUtilization(creditLimit: number, debt: number) {
  return creditLimit > 0 ? Math.max(0, debt / creditLimit) : 0;
}

export function creditCardCycle(profile: Pick<CreditCardProfile, "cutoffDay" | "dueDay">, today = new Date()):
CreditCardCycle {
  const current = utcDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const thisCutoff = clampedUtcDate(current.getUTCFullYear(), current.getUTCMonth(), profile.cutoffDay);
  const cutoff = current <= thisCutoff
    ? thisCutoff
    : clampedUtcDate(current.getUTCFullYear(), current.getUTCMonth() + 1, profile.cutoffDay);
  const previousCutoff = clampedUtcDate(cutoff.getUTCFullYear(), cutoff.getUTCMonth() - 1, profile.cutoffDay);
  const sameMonthDue = clampedUtcDate(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), profile.dueDay);
  const due = sameMonthDue > cutoff
    ? sameMonthDue
    : clampedUtcDate(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, profile.dueDay);
  return {
    periodStart: iso(addDays(previousCutoff, 1)),
    cutoffOn: iso(cutoff),
    dueOn: iso(due),
    daysUntilCutoff: differenceInDays(cutoff, current),
    daysUntilDue: differenceInDays(due, current),
  };
}

export function buildInstallmentSchedule(input: {
  planId: string;
  amount: number;
  installmentCount: number;
  firstDueOn: string;
  financingType: CreditCardFinancingType;
  annualEffectiveRate?: number;
}): CreditCardInstallment[] {
  const count = Math.min(120, Math.max(1, Math.trunc(input.installmentCount)));
  const amountInMinor = Math.round(input.amount * 100);
  const basePrincipal = Math.floor(amountInMinor / count);
  let remainder = amountInMinor - basePrincipal * count;
  const monthlyRate = input.financingType === "known_rate" && input.annualEffectiveRate
    ? Math.pow(1 + input.annualEffectiveRate / 100, 1 / 12) - 1
    : 0;
  let outstanding = amountInMinor / 100;

  return Array.from({ length: count }, (_, index) => {
    const principalMinor = basePrincipal + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    const principal = principalMinor / 100;
    const estimatedInterest = Math.round(outstanding * monthlyRate * 100) / 100;
    outstanding = Math.max(0, outstanding - principal);
    return {
      id: crypto.randomUUID(),
      planId: input.planId,
      installmentNumber: index + 1,
      dueOn: addMonthsIso(input.firstDueOn, index),
      principal,
      estimatedInterest,
      estimatedFee: 0,
      status: "planned" as const,
    };
  });
}

export function creditCardUrgency(cycle: CreditCardCycle, debt: number) {
  if (debt <= 0) return 3;
  if (cycle.daysUntilDue <= 3) return 0;
  if (cycle.daysUntilDue <= 7) return 1;
  return 2;
}

function addMonthsIso(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  return iso(clampedUtcDate(year, month - 1 + months, day));
}

function clampedUtcDate(year: number, month: number, day: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return utcDate(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay));
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

function addDays(date: Date, days: number) {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days);
}

function differenceInDays(later: Date, earlier: Date) {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
