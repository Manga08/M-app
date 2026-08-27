import { describe, expect, it } from "vitest";
import { classifyDashboardState } from "./dashboard-state";
import type { Account, FinanceState, Transaction } from "./types";

const cash: Account = {
  id: "cash",
  name: "Efectivo",
  type: "cash",
  initialBalance: 0,
  color: "#34d399",
  currencyCode: "COP",
};

function input(overrides: Partial<FinanceState> & { currentMonth?: string; hasConfiguredBudget?: boolean } = {}) {
  return {
    accounts: overrides.accounts ?? [cash],
    accountEntities: overrides.accountEntities ?? [],
    transactions: overrides.transactions ?? [],
    recurringRules: overrides.recurringRules ?? [],
    financialTargets: overrides.financialTargets ?? [],
    snapshot: overrides.snapshot,
    currentMonth: overrides.currentMonth ?? "2026-08-01",
    reportingCurrency: "COP",
    hasConfiguredBudget: overrides.hasConfiguredBudget ?? false,
  };
}

function movement(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "movement",
    kind: "expense",
    amount: 20_000,
    accountId: "cash",
    description: "Compra",
    occurredOn: "2026-08-12",
    createdAt: "2026-08-12T12:00:00Z",
    ...overrides,
  };
}

describe("classifyDashboardState", () => {
  it("recognizes the untouched provisioned account as a new dashboard", () => {
    expect(classifyDashboardState(input()).mode).toBe("new");
  });

  it("keeps a configured zero-balance account out of onboarding", () => {
    const accounts = [{ ...cash, name: "Bancolombia", type: "checking" as const }];
    expect(classifyDashboardState(input({ accounts })).mode).toBe("quiet");
  });

  it("shows a quiet month when only earlier history exists", () => {
    expect(classifyDashboardState(input({ transactions: [movement({ occurredOn: "2026-07-31" })] })).mode).toBe("quiet");
  });

  it("treats a current transfer as monthly activity without double-counting its pair", () => {
    const transactions = [
      movement({ id: "out", kind: "transfer_out", occurredOn: "2026-08-20" }),
      movement({ id: "in", kind: "transfer_in", occurredOn: "2026-08-20" }),
    ];
    const result = classifyDashboardState(input({ transactions }));
    expect(result.mode).toBe("active");
    expect(result.visibleTransactions).toHaveLength(1);
  });

  it("uses the authoritative monthly snapshot even when the local page is partial", () => {
    const snapshot = {
      month: "2026-08-01",
      income: 1_000_000,
      expense: 200_000,
      accountBalances: { cash: 800_000 },
      accountBalancesBase: { cash: 800_000 },
      categorySpending: {},
    };
    expect(classifyDashboardState(input({ snapshot })).mode).toBe("active");
  });
});
