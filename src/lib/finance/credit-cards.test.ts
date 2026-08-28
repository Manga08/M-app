import { describe, expect, it } from "vitest";
import {
  buildInstallmentSchedule,
  creditCardAvailable,
  creditCardCycle,
  creditCardDebt,
  creditCardStatementIsReconciled,
  creditCardUtilization,
  prepareCreditCardStatementSave,
  previewLocalCreditCardReconciliation,
} from "@/lib/finance/credit-cards";

describe("credit cards", () => {
  it("interprets a negative ledger balance as debt", () => {
    expect(creditCardDebt(-1_250_000)).toBe(1_250_000);
    expect(creditCardDebt(12_000)).toBe(0);
    expect(creditCardAvailable(4_000_000, 1_250_000)).toBe(2_750_000);
    expect(creditCardUtilization(4_000_000, 1_000_000)).toBe(0.25);
  });

  it("builds the next Colombian-style cutoff and due dates", () => {
    expect(creditCardCycle({ cutoffDay: 20, dueDay: 5 }, new Date("2026-08-18T12:00:00Z"))).toMatchObject({
      periodStart: "2026-07-21",
      cutoffOn: "2026-08-20",
      dueOn: "2026-09-05",
      daysUntilCutoff: 2,
      daysUntilDue: 18,
      upcomingDueOn: "2026-09-05",
      daysUntilUpcomingDue: 18,
    });
  });

  it("keeps the previous cut payment visible after cutoff", () => {
    expect(creditCardCycle({ cutoffDay: 20, dueDay: 5 }, new Date("2026-08-25T12:00:00Z"))).toMatchObject({
      cutoffOn: "2026-09-20",
      dueOn: "2026-10-05",
      upcomingDueOn: "2026-09-05",
      daysUntilUpcomingDue: 11,
    });
  });

  it("clamps end-of-month cycle dates", () => {
    expect(creditCardCycle({ cutoffDay: 31, dueDay: 15 }, new Date("2026-02-28T12:00:00Z"))).toMatchObject({
      cutoffOn: "2026-02-28",
      dueOn: "2026-03-15",
    });
  });

  it("distributes installment principal exactly without inventing money", () => {
    const rows = buildInstallmentSchedule({
      planId: "plan",
      amount: 100,
      installmentCount: 3,
      firstDueOn: "2026-01-31",
      financingType: "no_interest",
    });
    expect(rows.map((row) => row.principal)).toEqual([33.34, 33.33, 33.33]);
    expect(rows.reduce((sum, row) => sum + row.principal, 0)).toBeCloseTo(100, 2);
    expect(rows.map((row) => row.dueOn)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("calculates equal-payment card installments when the issuer rate is known", () => {
    const rows = buildInstallmentSchedule({
      planId: "plan-with-rate",
      amount: 1_000_000,
      installmentCount: 12,
      firstDueOn: "2026-09-05",
      financingType: "known_rate",
      annualEffectiveRate: 24,
      currencyCode: "COP",
    });
    const totals = rows.map((row) => row.principal + row.estimatedInterest);
    expect(rows).toHaveLength(12);
    expect(rows.reduce((sum, row) => sum + row.principal, 0)).toBe(1_000_000);
    expect(rows[0].estimatedInterest).toBeGreaterThan(0);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
  });

  it("only treats an extract as reconciled when both status and timestamp confirm it", () => {
    expect(creditCardStatementIsReconciled({ status: "open", reconciledAt: undefined })).toBe(false);
    expect(creditCardStatementIsReconciled({ status: "reconciled", reconciledAt: undefined })).toBe(false);
    expect(creditCardStatementIsReconciled({ status: "reconciled", reconciledAt: "2026-08-28T12:00:00.000Z" })).toBe(true);
    expect(creditCardStatementIsReconciled({ status: "paid", reconciledAt: "2026-08-28T12:00:00.000Z" })).toBe(true);
  });

  it("projects bank interest and fees before calculating the residual difference", () => {
    const preview = previewLocalCreditCardReconciliation({
      id: "card-1",
      name: "Tarjeta demo",
      type: "credit",
      initialBalance: 0,
      color: "#f43f5e",
      currencyCode: "USD",
    }, [{
      id: "purchase-1",
      kind: "expense",
      amount: 450,
      accountId: "card-1",
      description: "Compra",
      occurredOn: "2026-08-20",
      createdAt: "2026-08-20T12:00:00.000Z",
    }], "2026-08-28", 500, { interest: 40, fees: 10 });

    expect(preview).toMatchObject({
      ledgerDebtBeforeStatementCharges: 450,
      ledgerDebt: 500,
      interestToPost: 40,
      feesToPost: 10,
      difference: 0,
      isBalanced: true,
      requiresExchangeRate: true,
    });
  });

  it("previews a local statement difference without changing the ledger", () => {
    const preview = previewLocalCreditCardReconciliation({
      id: "card-1",
      name: "Tarjeta demo",
      type: "credit",
      initialBalance: 0,
      color: "#f43f5e",
      currencyCode: "COP",
    }, [{
      id: "purchase-1",
      kind: "expense",
      amount: 125_000,
      accountId: "card-1",
      description: "Compra",
      occurredOn: "2026-08-20",
      createdAt: "2026-08-20T12:00:00.000Z",
    }], "2026-08-28", 130_000);

    expect(preview).toMatchObject({
      ledgerBalance: -125_000,
      ledgerDebt: 125_000,
      statementTotal: 130_000,
      difference: 5_000,
      adjustmentKind: "adjustment_out",
      isBalanced: false,
    });
  });

  it("keeps save-open separate from an explicitly confirmed reconciliation", () => {
    const input = {
      accountId: "card-1",
      periodStart: "2026-07-21",
      periodEnd: "2026-08-20",
      cutoffOn: "2026-08-20",
      dueOn: "2026-09-05",
      totalDue: 500_000,
      minimumDue: 50_000,
      purchases: 450_000,
      advances: 0,
      interest: 40_000,
      fees: 10_000,
      payments: 0,
      refunds: 0,
    };
    const open = prepareCreditCardStatementSave({ ...input, saveMode: "open" }, {
      generatedId: "statement-1",
      reconciledAt: "2026-08-28T15:00:00.000Z",
    });
    expect(open).toMatchObject({
      statement: { status: "open", reconciledAt: undefined },
      reconcileDifference: false,
    });

    const reconciled = prepareCreditCardStatementSave({ ...input, saveMode: "reconcile" }, {
      generatedId: "statement-1",
      reconciledAt: "2026-08-28T15:00:00.000Z",
      preview: {
        accountId: "card-1",
        cutoffOn: "2026-08-20",
        currencyCode: "COP",
        ledgerDebtBeforeStatementCharges: 490_000,
        ledgerBalance: -490_000,
        ledgerDebt: 490_000,
        reportingBalance: -490_000,
        statementTotal: 500_000,
        postedInterest: 0,
        postedFees: 0,
        interestToPost: 0,
        feesToPost: 0,
        difference: 10_000,
        adjustmentKind: "adjustment_out",
        isBalanced: false,
        requiresExchangeRate: false,
      },
    });
    expect(reconciled).toMatchObject({
      statement: { status: "reconciled", reconciledAt: "2026-08-28T15:00:00.000Z" },
      reconcileDifference: true,
    });
  });

  it("does not allow a reconciled extract to be silently downgraded to open", () => {
    const existing = {
      id: "statement-1",
      accountId: "card-1",
      periodStart: "2026-07-21",
      periodEnd: "2026-08-20",
      cutoffOn: "2026-08-20",
      dueOn: "2026-09-05",
      totalDue: 500_000,
      minimumDue: 50_000,
      purchases: 450_000,
      advances: 0,
      interest: 40_000,
      fees: 10_000,
      payments: 0,
      refunds: 0,
      status: "reconciled" as const,
      reconciledAt: "2026-08-28T15:00:00.000Z",
      version: 2,
    };
    const editable = {
      id: existing.id,
      accountId: existing.accountId,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      cutoffOn: existing.cutoffOn,
      dueOn: existing.dueOn,
      totalDue: existing.totalDue,
      minimumDue: existing.minimumDue,
      purchases: existing.purchases,
      advances: existing.advances,
      interest: existing.interest,
      fees: existing.fees,
      payments: existing.payments,
      refunds: existing.refunds,
    };
    expect(() => prepareCreditCardStatementSave({
      ...editable,
      saveMode: "open",
    }, {
      existing,
      generatedId: "unused",
      reconciledAt: "2026-08-29T15:00:00.000Z",
    })).toThrow("no puede volver a quedar abierto");
    expect(() => prepareCreditCardStatementSave({
      ...editable,
      saveMode: "open",
    }, {
      existing: { ...existing, status: "paid" as const },
      generatedId: "unused",
      reconciledAt: "2026-08-29T15:00:00.000Z",
    })).toThrow("no puede volver a quedar abierto");
  });
});
