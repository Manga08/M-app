import { describe, expect, it } from "vitest";
import { applyFinancialTargetLiabilityDraft, normalizeExistingDebtOpeningState } from "./finance-provider";
import { demoFinanceState } from "@/lib/finance/demo-data";
import type { FinanceState, FinancialTarget, FinancialTargetDebtInput } from "@/lib/finance/types";

function baseState(target: FinancialTarget): FinanceState {
  return {
    ...demoFinanceState,
    accounts: demoFinanceState.accounts.filter((account) => account.type !== "credit"),
    creditCards: [],
    creditCardStatements: [],
    creditCardPurchasePlans: [],
    creditCardInstallments: [],
    liabilities: [],
    liabilityTerms: [],
    liabilityRatePeriods: [],
    liabilityObligations: [],
    liabilityPaymentRules: [],
    liabilityPaymentIntents: [],
    liabilityOverview: { asOf: "2026-08-28", reportingCurrencyCode: "COP", totalReportingDebt: 0, items: [], coverage: "complete" },
    liabilityCalendar: [],
    financialTargets: [target],
    snapshot: {
      month: "2026-08-01",
      income: 0,
      expense: 0,
      netWorth: 0,
      accountBalances: {},
      accountBalancesBase: {},
      accountMovementCounts: {},
      categorySpending: {},
    },
  };
}

describe("local debt target provisioning", () => {
  const target: FinancialTarget = {
    id: "target-debt-1",
    mode: "pay_down",
    kind: "debt",
    status: "active",
    title: "Crédito educativo",
    targetAmount: 12_000_000,
    initialProgress: 2_000_000,
    progressAmount: 2_000_000,
    startsOn: "2026-08-01",
    targetDate: "2028-08-01",
    priority: 2,
    color: "#60a5fa",
    icon: "graduation-cap",
    accountId: "liability-1",
    trackingMode: "movements",
    createdAt: "2026-08-28T12:00:00.000Z",
    updatedAt: "2026-08-28T12:00:00.000Z",
    syncStatus: "pending",
  };

  it("creates a coherent credit account, liability, terms, rate and calendar before the RPC returns", () => {
    const debt: FinancialTargetDebtInput = {
      liabilityAccountId: "liability-1",
      debtType: "loan",
      creditor: "Banco Demo",
      principal: 10_000_000,
      currencyCode: "COP",
      termId: "term-1",
      termsStartOn: "2026-08-01",
      paymentFrequency: "monthly",
      intervalCount: 1,
      calculationMethod: "amortized",
      amortizationMethod: "constant_payment",
      installmentCount: 24,
      scheduledPayment: 520_000,
      periodicFee: 0,
      periodicInsurance: 15_000,
      rateId: "rate-1",
      rateBasis: "effective_annual",
      rateValue: 18,
      effectiveAnnualRate: 18,
      schedule: [{
        id: "due-1",
        accountId: "liability-1",
        kind: "loan_installment",
        sequenceNumber: 1,
        dueOn: "2026-09-01",
        principalDue: 370_000,
        interestDue: 135_000,
        feeDue: 15_000,
        minimumDue: 520_000,
        totalDue: 520_000,
        status: "projected",
        source: "contract",
      }],
    };

    const state = applyFinancialTargetLiabilityDraft(baseState(target), target, debt);

    expect(state.accounts.find((account) => account.id === "liability-1")).toMatchObject({
      type: "credit",
      initialBalance: -10_000_000,
      currencyCode: "COP",
    });
    expect(state.liabilities[0]).toMatchObject({ accountId: "liability-1", kind: "loan", legacyTargetId: "target-debt-1" });
    expect(state.liabilityTerms[0]).toMatchObject({ id: "term-1", scheduledPayment: 520_000 });
    expect(state.liabilityRatePeriods[0]).toMatchObject({ id: "rate-1", reportedValue: 18 });
    expect(state.liabilityObligations[0]).toMatchObject({ id: "due-1", version: 1 });
    expect(state.liabilityCalendar[0]).toMatchObject({ id: "due-1", date: "2026-09-01", remaining: 520_000 });
    expect(state.liabilityOverview.items[0]).toMatchObject({ accountId: "liability-1", nativeDebt: 10_000_000, reportingDebt: 10_000_000 });
    expect(state.snapshot?.accountBalances["liability-1"]).toBe(-10_000_000);
  });

  it("does not invent a reporting rate for a new USD debt", () => {
    expect(() => applyFinancialTargetLiabilityDraft(baseState(target), target, {
      liabilityAccountId: "liability-1",
      currencyCode: "USD",
      principal: 1000,
    })).toThrow("tasa inicial");
  });

  it("keeps the payment source, stable schedule and reminders in the optimistic cache", () => {
    const state = baseState(target);
    const fundingAccountId = state.accounts[0]!.id;
    const provisioned = applyFinancialTargetLiabilityDraft(state, target, {
      liabilityAccountId: "liability-1",
      fundingAccountId,
      currencyCode: "COP",
      principal: 1_000_000,
      schedule: [{
        id: "due-stable",
        accountId: "liability-1",
        kind: "loan_installment",
        sequenceNumber: 1,
        dueOn: "2026-09-15",
        principalDue: 90_000,
        interestDue: 10_000,
        feeDue: 0,
        minimumDue: 100_000,
        totalDue: 100_000,
        status: "projected",
        source: "contract",
      }],
    });
    provisioned.liabilityPaymentIntents = [{
      id: "intent-stable",
      accountId: "liability-1",
      ruleId: provisioned.liabilityPaymentRules[0]!.id,
      obligationId: "due-stable",
      scheduledFor: "2026-09-14",
      plannedAmount: 100_000,
      status: "planned",
      version: 1,
    }];

    const edited = applyFinancialTargetLiabilityDraft(provisioned, { ...target, title: "Crédito actualizado" }, {
      liabilityAccountId: "liability-1",
      fundingAccountId,
      currencyCode: "COP",
      principal: 1_000_000,
    });

    expect(edited.liabilityPaymentRules[0]).toMatchObject({
      accountId: "liability-1",
      fundingAccountId,
      strategy: "current_balance",
      recordingMode: "manual",
      active: false,
    });
    expect(edited.liabilityObligations.map((item) => item.id)).toEqual(["due-stable"]);
    expect(edited.liabilityPaymentIntents.map((item) => item.id)).toEqual(["intent-stable"]);
  });

  it("rejects principal edits and COP↔USD changes for an existing debt", () => {
    const existing = { accountId: "liability-1", currencyCode: "COP" as const, currentPrincipal: 500_000, openingExchangeRate: 1 };

    expect(() => normalizeExistingDebtOpeningState({
      liabilityAccountId: "liability-1",
      currencyCode: "COP",
      principal: 700_000,
    }, existing)).toThrow("saldo pendiente");
    expect(() => normalizeExistingDebtOpeningState({
      liabilityAccountId: "liability-1",
      currencyCode: "USD",
      principal: 500_000,
    }, existing)).toThrow("moneda");
    expect(() => normalizeExistingDebtOpeningState({
      liabilityAccountId: "usd-liability",
      currencyCode: "COP",
      principal: 100,
    }, { accountId: "usd-liability", currencyCode: "USD", currentPrincipal: 100, openingExchangeRate: 4_000 })).toThrow("moneda");
  });

  it("uses the live ledger balance for replanning without rewriting opening principal", () => {
    const provisioned = applyFinancialTargetLiabilityDraft(baseState(target), target, {
      liabilityAccountId: "liability-1",
      currencyCode: "COP",
      principal: 1_000_000,
    });
    provisioned.snapshot = {
      ...provisioned.snapshot!,
      accountBalances: { ...provisioned.snapshot!.accountBalances, "liability-1": -800_000 },
      accountBalancesBase: { ...provisioned.snapshot!.accountBalancesBase, "liability-1": -800_000 },
    };

    const edited = applyFinancialTargetLiabilityDraft(provisioned, target, {
      liabilityAccountId: "liability-1",
      currencyCode: "COP",
      principal: 800_000,
    });

    expect(edited.accounts.find((account) => account.id === "liability-1")?.initialBalance).toBe(-1_000_000);
    expect(edited.liabilities.find((item) => item.accountId === "liability-1")?.originalPrincipal).toBe(1_000_000);
    expect(edited.liabilityOverview.items.find((item) => item.accountId === "liability-1")?.nativeDebt).toBe(800_000);
  });

  it("replaces only editable projected rows and clears an explicitly removed rate", () => {
    const provisioned = applyFinancialTargetLiabilityDraft(baseState(target), target, {
      liabilityAccountId: "liability-1",
      currencyCode: "COP",
      principal: 10_000_000,
      termId: "term-edit",
      termsStartOn: "2026-08-01",
      rateId: "rate-edit",
      rateValue: 18,
      effectiveAnnualRate: 18,
      schedule: [{
        id: "old-projected",
        accountId: "liability-1",
        kind: "loan_installment",
        sequenceNumber: 1,
        dueOn: "2026-09-01",
        principalDue: 100_000,
        interestDue: 10_000,
        feeDue: 0,
        minimumDue: 110_000,
        totalDue: 110_000,
        status: "projected",
        source: "contract",
      }],
    });
    const paid = { ...provisioned.liabilityObligations[0]!, id: "paid-history", sequenceNumber: 0, dueOn: "2026-08-01", status: "paid" as const };
    provisioned.liabilityObligations.push(paid);
    provisioned.liabilityCalendar.push({
      date: paid.dueOn,
      type: "obligation",
      id: paid.id,
      accountId: paid.accountId,
      accountName: target.title,
      currencyCode: "COP",
      liabilityKind: "loan",
      status: "paid",
      amount: paid.totalDue,
      remaining: 0,
      minimumDue: paid.minimumDue,
      sequenceNumber: paid.sequenceNumber,
      version: paid.version,
    });

    const edited = applyFinancialTargetLiabilityDraft(provisioned, target, {
      liabilityAccountId: "liability-1",
      currencyCode: "COP",
      principal: 10_000_000,
      termId: "term-edit",
      termsStartOn: "2026-08-01",
      clearRate: true,
      schedule: [{
        ...provisioned.liabilityObligations[0]!,
        id: "new-projected",
        dueOn: "2026-10-01",
      }],
    });

    expect(edited.liabilityRatePeriods).toEqual([]);
    expect(edited.liabilityObligations.map((item) => item.id).sort()).toEqual(["new-projected", "paid-history"]);
    expect(edited.liabilityCalendar.filter((item) => item.type === "obligation").map((item) => item.id).sort()).toEqual(["new-projected", "paid-history"]);
  });
});
