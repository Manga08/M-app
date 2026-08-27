import type {
  Account,
  AccountEntity,
  FinanceSnapshot,
  FinancialTarget,
  RecurringRule,
  Transaction,
} from "@/lib/finance/types";

export type DashboardMode = "new" | "quiet" | "active";

type DashboardStateInput = {
  accounts: Account[];
  accountEntities: AccountEntity[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  financialTargets: FinancialTarget[];
  snapshot?: FinanceSnapshot;
  currentMonth: string;
  reportingCurrency: string;
  hasConfiguredBudget: boolean;
};

export function classifyDashboardState(input: DashboardStateInput) {
  const monthKey = input.currentMonth.slice(0, 7);
  const visibleTransactions = input.transactions.filter(isVisibleMovement);
  const snapshotHasMonthlyFlow = input.snapshot?.month.slice(0, 7) === monthKey
    && (Math.abs(input.snapshot.income) > 0.004 || Math.abs(input.snapshot.expense) > 0.004);
  const hasCurrentMonthActivity = snapshotHasMonthlyFlow
    || visibleTransactions.some((transaction) => transaction.occurredOn.slice(0, 7) === monthKey);
  const activeAccounts = input.accounts.filter((account) => !account.archived);
  const activeEntityIds = new Set(input.accountEntities.filter((entity) => !entity.archived).map((entity) => entity.id));
  const hasMeaningfulPortfolio = activeAccounts.length > 1
    || activeAccounts.some((account) => !isUntouchedDefaultAccount(account, input.reportingCurrency, input.snapshot))
    || activeAccounts.some((account) => Boolean(account.entityId && activeEntityIds.has(account.entityId)));
  const hasSupportingSetup = input.hasConfiguredBudget
    || input.recurringRules.some((rule) => rule.status !== "archived")
    || input.financialTargets.some((target) => target.status !== "archived");
  const hasFinancialHistory = visibleTransactions.length > 0 || snapshotHasMonthlyFlow;
  const mode: DashboardMode = !hasMeaningfulPortfolio && !hasFinancialHistory && !hasSupportingSetup
    ? "new"
    : hasCurrentMonthActivity
      ? "active"
      : "quiet";

  return {
    mode,
    hasCurrentMonthActivity,
    hasFinancialHistory,
    hasMeaningfulPortfolio,
    visibleTransactions,
  };
}

function isVisibleMovement(transaction: Transaction) {
  return transaction.kind !== "transfer_in" && !transaction.kind.startsWith("adjustment");
}

function isUntouchedDefaultAccount(account: Account, reportingCurrency: string, snapshot?: FinanceSnapshot) {
  const snapshotBalance = snapshot?.accountBalances[account.id];
  return account.name.trim().toLocaleLowerCase("es") === "efectivo"
    && account.type === "cash"
    && Math.abs(account.initialBalance) < 0.005
    && (snapshotBalance === undefined || Math.abs(snapshotBalance) < 0.005)
    && (account.currencyCode ?? reportingCurrency) === reportingCurrency
    && !account.entityId
    && account.expectedAnnualReturn === undefined;
}
