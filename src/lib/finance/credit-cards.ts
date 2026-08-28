import type {
  Account,
  CreditCardFinancingType,
  CreditCardInstallment,
  CreditCardProfile,
  CreditCardStatement,
  CreditCardStatementInput,
  LiabilityReconciliationPreview,
  Transaction,
} from "@/lib/finance/types";
import { generateObligationSchedule } from "@/lib/finance/obligations";

export type CreditCardCycle = {
  periodStart: string;
  cutoffOn: string;
  dueOn: string;
  daysUntilCutoff: number;
  daysUntilDue: number;
  /** The payment that actually comes next, including the previous cut cycle. */
  upcomingDueOn: string;
  daysUntilUpcomingDue: number;
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

export function creditCardStatementIsReconciled(statement: Pick<CreditCardStatement, "status" | "reconciledAt"> | undefined) {
  return (statement?.status === "reconciled" || statement?.status === "paid") && Boolean(statement.reconciledAt);
}

/**
 * Demo/local-only counterpart of the authoritative database preview. Real
 * accounts use preview_liability_reconciliation_v2 because the local cache can
 * contain only a window of the ledger.
 */
export function previewLocalCreditCardReconciliation(
  account: Account,
  transactions: Transaction[],
  cutoffOn: string,
  statementTotal: number,
  statement?: Pick<CreditCardStatement, "interest" | "fees">,
): LiabilityReconciliationPreview {
  const openingApplies = !account.openingBalanceDate || account.openingBalanceDate <= cutoffOn;
  const openingRate = account.currencyCode === "USD" ? account.openingExchangeRate ?? 1 : 1;
  let nativeBalance = openingApplies ? account.initialBalance : 0;
  let reportingBalance = openingApplies ? account.initialBalance * openingRate : 0;

  for (const transaction of transactions) {
    if (transaction.accountId !== account.id || transaction.occurredOn > cutoffOn) continue;
    const direction = transaction.kind === "income" || transaction.kind === "transfer_in" || transaction.kind === "adjustment_in" ? 1 : -1;
    nativeBalance += direction * transaction.amount;
    reportingBalance += direction * (transaction.baseAmount ?? transaction.amount * (transaction.exchangeRate ?? openingRate));
  }

  const ledgerDebtBeforeStatementCharges = Math.max(-nativeBalance, 0);
  // Demo data has no persisted liability metadata. Project the explicit bank
  // charges so the local preview follows the same accounting model as the RPC.
  const interestToPost = statement?.interest ?? 0;
  const feesToPost = statement?.fees ?? 0;
  const ledgerDebt = Math.max(-(nativeBalance - interestToPost - feesToPost), 0);
  const difference = Math.round((statementTotal - ledgerDebt) * 100) / 100;
  return {
    accountId: account.id,
    cutoffOn,
    currencyCode: account.currencyCode === "USD" ? "USD" : "COP",
    ledgerDebtBeforeStatementCharges,
    ledgerBalance: nativeBalance,
    ledgerDebt,
    reportingBalance,
    statementTotal,
    postedInterest: 0,
    postedFees: 0,
    interestToPost,
    feesToPost,
    difference,
    adjustmentKind: difference > 0.01 ? "adjustment_out" : difference < -0.01 ? "adjustment_in" : undefined,
    isBalanced: Math.abs(difference) <= 0.01,
    requiresExchangeRate: account.currencyCode === "USD"
      && (Math.abs(difference) > 0.01 || interestToPost > 0.01 || feesToPost > 0.01),
  };
}

export function prepareCreditCardStatementSave(
  input: CreditCardStatementInput,
  options: {
    existing?: CreditCardStatement;
    generatedId: string;
    reconciledAt: string;
    preview?: LiabilityReconciliationPreview;
  },
) {
  if (creditCardStatementIsReconciled(options.existing) && input.saveMode === "open") {
    throw new Error("Un extracto conciliado no puede volver a quedar abierto. Revisa y confirma su actualización.");
  }
  if (input.saveMode === "reconcile" && !options.preview) {
    throw new Error("Revisa la diferencia del extracto antes de confirmar la conciliación.");
  }
  const { saveMode, ...statementInput } = input;
  const reconciled = saveMode === "reconcile";
  const statement: CreditCardStatement = {
    ...statementInput,
    id: input.id ?? options.existing?.id ?? options.generatedId,
    status: reconciled ? "reconciled" : "open",
    reconciledAt: reconciled ? options.reconciledAt : undefined,
    reconciliationTransactionId: reconciled ? statementInput.reconciliationTransactionId : undefined,
    reconciliationExchangeRate: reconciled ? statementInput.reconciliationExchangeRate : undefined,
    reconciliationExchangeRateSource: reconciled ? statementInput.reconciliationExchangeRateSource : undefined,
    version: (options.existing?.version ?? 0) + 1,
  };
  return {
    statement,
    reconcileDifference: reconciled && !options.preview?.isBalanced,
  };
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
  const previousDueCandidate = clampedUtcDate(previousCutoff.getUTCFullYear(), previousCutoff.getUTCMonth(), profile.dueDay);
  const previousDue = previousDueCandidate > previousCutoff
    ? previousDueCandidate
    : clampedUtcDate(previousCutoff.getUTCFullYear(), previousCutoff.getUTCMonth() + 1, profile.dueDay);
  const upcomingDue = current > previousCutoff && current <= previousDue ? previousDue : due;
  return {
    periodStart: iso(addDays(previousCutoff, 1)),
    cutoffOn: iso(cutoff),
    dueOn: iso(due),
    daysUntilCutoff: differenceInDays(cutoff, current),
    daysUntilDue: differenceInDays(due, current),
    upcomingDueOn: iso(upcomingDue),
    daysUntilUpcomingDue: differenceInDays(upcomingDue, current),
  };
}

export function buildInstallmentSchedule(input: {
  planId: string;
  amount: number;
  installmentCount: number;
  firstDueOn: string;
  financingType: CreditCardFinancingType;
  annualEffectiveRate?: number;
  currencyCode?: "COP" | "USD";
}): CreditCardInstallment[] {
  const count = Math.min(120, Math.max(1, Math.trunc(input.installmentCount)));
  if (input.financingType === "known_rate" && input.annualEffectiveRate !== undefined && input.annualEffectiveRate > 0) {
    const schedule = generateObligationSchedule({
      principal: input.amount,
      currencyCode: input.currencyCode ?? "COP",
      startOn: addMonthsIso(input.firstDueOn, -1),
      firstDueOn: input.firstDueOn,
      installmentCount: count,
      paymentFrequency: "monthly",
      amortization: "constant_payment",
      rate: { kind: "fixed", rate: { percent: input.annualEffectiveRate, convention: "EA" } },
    });
    return schedule.rows.map((row) => ({
      id: crypto.randomUUID(),
      planId: input.planId,
      installmentNumber: row.installmentNumber,
      dueOn: row.dueOn,
      principal: row.principal,
      estimatedInterest: row.interest,
      estimatedFee: row.fees + row.insurance + row.otherCharges,
      status: "planned" as const,
    }));
  }
  const amountInMinor = Math.round(input.amount * 100);
  const basePrincipal = Math.floor(amountInMinor / count);
  let remainder = amountInMinor - basePrincipal * count;
  return Array.from({ length: count }, (_, index) => {
    const principalMinor = basePrincipal + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    const principal = principalMinor / 100;
    return {
      id: crypto.randomUUID(),
      planId: input.planId,
      installmentNumber: index + 1,
      dueOn: addMonthsIso(input.firstDueOn, index),
      principal,
      estimatedInterest: 0,
      estimatedFee: 0,
      status: "planned" as const,
    };
  });
}

export function creditCardUrgency(cycle: CreditCardCycle, debt: number) {
  if (debt <= 0) return 3;
  if (cycle.daysUntilUpcomingDue <= 3) return 0;
  if (cycle.daysUntilUpcomingDue <= 7) return 1;
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
