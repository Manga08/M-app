import { describe, expect, it, vi } from "vitest";
import {
  creditCardStatementToLiabilityWrite,
  executeFinanceQueueItem,
  financialTargetDebtToRpc,
  liabilityAdjustmentToRpc,
  liabilityPaymentToRpc,
  liabilityTermsToRpc,
} from "./remote-mutations";
import type { QueueItem } from "./types";

function queue(operation: QueueItem["operation"], payload: unknown): QueueItem {
  return { id: "10000000-0000-4000-8000-000000000001", userId: "user-1", operation, payload, createdAt: "2026-08-28T12:00:00.000Z" };
}

describe("liability mutation adapters", () => {
  it("serializes terms, rates and nullable fields to the SQL contract", () => {
    expect(liabilityTermsToRpc({
      id: "term-1",
      accountId: "debt-1",
      startsOn: "2026-08-01",
      paymentFrequency: "biweekly",
      intervalCount: 1,
      calculationMethod: "amortized",
      amortizationMethod: "constant_payment",
      periodicFee: 0,
      periodicInsurance: 15,
      variableRate: false,
      prepaymentStrategy: "reduce_term",
      source: "manual",
      rates: [{
        id: "rate-1",
        rateKind: "principal",
        rateBasis: "effective_annual",
        reportedValue: 19.5,
        effectiveAnnualRate: 19.5,
        startsOn: "2026-08-01",
        source: "manual",
      }],
    })).toEqual({
      term: expect.objectContaining({
        id: "term-1",
        account_id: "debt-1",
        payment_frequency: "biweekly",
        installment_count: "",
        periodic_insurance: 15,
      }),
      rates: [{
        id: "rate-1",
        rate_kind: "principal",
        rate_basis: "effective_annual",
        reported_value: 19.5,
        effective_annual_rate: 19.5,
        starts_on: "2026-08-01",
        ends_on: null,
        source: "manual",
      }],
    });
  });

  it("persists the chosen funding account without inventing destructive clears", () => {
    expect(financialTargetDebtToRpc({
      creditor: "Banco Demo",
      liabilityAccountId: "debt-1",
      fundingAccountId: "cash-1",
      debtType: "loan",
      principal: 2_000_000,
      currencyCode: "COP",
    })).toEqual(expect.objectContaining({
      creditor: "Banco Demo",
      liability_account_id: "debt-1",
      funding_account_id: "cash-1",
      debt_type: "loan",
      principal: 2_000_000,
    }));
    expect(financialTargetDebtToRpc({ fundingAccountId: "cash-1" })).toEqual({ funding_account_id: "cash-1" });
  });

  it("omits absent rate and schedule keys and only clears them explicitly", () => {
    expect(financialTargetDebtToRpc({
      liabilityAccountId: "debt-1",
      creditor: undefined,
      rateValue: undefined,
      schedule: undefined,
    })).toEqual({ liability_account_id: "debt-1" });
    expect(financialTargetDebtToRpc({ clearFundingAccount: true, clearRate: true, clearSchedule: true })).toEqual({
      funding_account_id: null,
      rate_value: null,
      effective_annual_rate: null,
      annual_interest_rate: null,
      schedule: [],
    });
  });

  it("serializes exact two-sided payment values and allocations", () => {
    expect(liabilityPaymentToRpc({
      accountId: "debt-usd",
      fundingAccountId: "cash-cop",
      liabilityAmount: 25,
      fundingAmount: 100_000,
      occurredOn: "2026-08-28",
      fundingExchangeRate: 1,
      liabilityExchangeRate: 4000,
      liabilityExchangeRateSource: "manual",
      allocations: [{ obligationId: "due-1", amount: 25 }],
    })).toEqual({
      payment: expect.objectContaining({
        liability_account_id: "debt-usd",
        funding_account_id: "cash-cop",
        liability_amount: 25,
        funding_amount: 100_000,
        funding_exchange_rate: 1,
        liability_exchange_rate: 4000,
      }),
      allocations: [{ id: null, obligation_id: "due-1", amount: 25, allocated_on: null }],
    });
  });

  it("preserves reconciliation roles instead of sending generic transaction rows", () => {
    expect(liabilityAdjustmentToRpc({
      id: "adjustment-1",
      role: "interest",
      kind: "expense",
      amount: 42_000,
      description: "Interés del extracto",
    })).toEqual(expect.objectContaining({
      id: "adjustment-1",
      role: "interest",
      kind: "expense",
      amount: 42_000,
      description: "Interés del extracto",
      category_id: null,
    }));
  });

  it("does not mark a net statement balance as paid from its informational payments subtotal", () => {
    const base = {
      id: "statement-net",
      accountId: "card-1",
      periodStart: "2026-07-21",
      periodEnd: "2026-08-20",
      cutoffOn: "2026-08-20",
      dueOn: "2026-09-05",
      minimumDue: 50_000,
      purchases: 2_000_000,
      advances: 0,
      interest: 0,
      fees: 0,
      payments: 1_500_000,
      refunds: 0,
      status: "reconciled" as const,
      reconciledAt: "2026-08-28T15:00:00.000Z",
      version: 1,
    };

    expect(creditCardStatementToLiabilityWrite({ ...base, totalDue: 500_000 }).obligation.status).toBe("open");
    expect(creditCardStatementToLiabilityWrite({ ...base, totalDue: 0, minimumDue: 0 }).obligation.status).toBe("paid");
  });

  it("routes payment, target lifecycle and archive items through atomic RPCs", async () => {
    const rpc = vi.fn(async function (this: unknown, name: string, args: Record<string, unknown>) {
      expect(this).toBe(client);
      void name;
      void args;
      return { data: {}, error: null };
    });
    const client = { rpc };
    await executeFinanceQueueItem(client as never, "user-1", queue("liability.payment.record", {
      accountId: "debt-usd",
      fundingAccountId: "cash-cop",
      liabilityAmount: 25,
      fundingAmount: 100_000,
      fundingExchangeRate: 1,
      liabilityExchangeRate: 4000,
    }));
    await executeFinanceQueueItem(client as never, "user-1", queue("liability.archive", {
      accountId: "debt-usd",
      accountVersion: 4,
      liabilityVersion: 3,
    }));
    await executeFinanceQueueItem(client as never, "user-1", queue("financial-target.status", {
      id: "target-debt",
      status: "paused",
    }));

    expect(rpc.mock.calls[0]?.[0]).toBe("record_liability_payment_v2");
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_payment: { liability_amount: 25 }, p_allocations: [] });
    expect(rpc.mock.calls[1]).toEqual(["archive_liability_v2", {
      p_operation_id: "10000000-0000-4000-8000-000000000001",
      p_account_id: "debt-usd",
      p_expected_account_version: 4,
      p_expected_liability_version: 3,
    }]);
    expect(rpc.mock.calls[2]).toEqual(["set_financial_target_status_v2", {
      p_operation_id: "10000000-0000-4000-8000-000000000001",
      p_target_id: "target-debt",
      p_status: "paused",
    }]);
  });

  it("keeps an open card statement unconfirmed in the obligation RPC", async () => {
    const statement = {
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
      status: "open" as const,
      version: 2,
    };
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    await executeFinanceQueueItem({ rpc } as never, "user-1", queue("credit-card.statement.upsert", {
      ...creditCardStatementToLiabilityWrite(statement),
      expectedVersion: 7,
    }));

    expect(rpc).toHaveBeenCalledWith("upsert_liability_obligation_v2", expect.objectContaining({
      p_obligation: expect.objectContaining({ id: "statement-1", kind: "credit_card_statement", total_due: 500_000 }),
      p_statement: expect.objectContaining({ cutoff_on: "2026-08-20", status: "open", reconciled_at: null }),
      p_reconcile_difference: false,
      p_expected_version: 7,
    }));
  });

  it("only sends reconciliation metadata after explicit confirmation", async () => {
    const statement = {
      id: "statement-confirmed",
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
      version: 3,
    };
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    await executeFinanceQueueItem({ rpc } as never, "user-1", queue("credit-card.statement.upsert", {
      ...creditCardStatementToLiabilityWrite(statement),
      reconcileDifference: true,
      expectedVersion: 8,
    }));

    expect(rpc).toHaveBeenCalledWith("upsert_liability_obligation_v2", expect.objectContaining({
      p_statement: expect.objectContaining({ status: "reconciled", reconciled_at: "2026-08-28T15:00:00.000Z" }),
      p_reconcile_difference: true,
      p_expected_version: 8,
    }));
  });
});
