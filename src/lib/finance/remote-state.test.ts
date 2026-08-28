import { describe, expect, it, vi } from "vitest";
import {
  liabilityBootstrapFromRows,
  liabilityCalendarFromRpc,
  liabilityOverviewFromRpc,
  liabilityReconciliationPreviewFromRpc,
  loadRemoteLiabilityCalendar,
  loadRemoteTransactionLiabilityRoles,
  previewRemoteLiabilityReconciliation,
} from "./remote-state";

describe("liability remote state adapters", () => {
  it("rehydrates liability ownership markers for protected ledger events", async () => {
    const inFilter = vi.fn(async () => ({
      data: [{ ledger_event_id: "event-1", role: "cash_advance" }],
      error: null,
    }));
    const select = vi.fn(() => ({ in: inFilter }));
    const from = vi.fn(function (this: unknown) {
      expect(this).toBe(client);
      return { select };
    });
    const client = { from };
    const roles = await loadRemoteTransactionLiabilityRoles(client as never, [{
      id: "movement-1",
      kind: "transfer_out",
      amount: 100,
      account_id: "card-1",
      category_id: null,
      transfer_group_id: "event-1",
      recurring_occurrence_id: null,
      financial_target_id: null,
      financial_target_effect: null,
      description: "Avance",
      merchant: null,
      note: null,
      icon: null,
      occurred_on: "2026-08-28",
      created_at: "2026-08-28T12:00:00Z",
      ledger_event_id: "event-1",
    }]);

    expect(from).toHaveBeenCalledWith("liability_event_metadata");
    expect(inFilter).toHaveBeenCalledWith("ledger_event_id", ["event-1"]);
    expect(roles.get("event-1")).toBe("cash_advance");
  });

  it("normalizes the overview without losing native or reporting values", () => {
    const overview = liabilityOverviewFromRpc({
      reportingCurrency: "COP",
      asOf: "2026-08-28",
      items: [{
        accountId: "liability-usd",
        accountVersion: "4",
        liabilityVersion: "3",
        name: "Crédito en dólares",
        kind: "loan",
        status: "active",
        creditorName: "Banco Demo",
        currencyCode: "USD",
        color: "#60a5fa",
        icon: "landmark",
        originalPrincipal: "1000.25",
        migrationStatus: "native",
        nativeBalance: "-820.25",
        nativeDebt: "820.25",
        reportingBalance: "-3281000",
        reportingDebt: "3281000",
        currentTerm: {
          id: "term-1",
          starts_on: "2026-08-01",
          ends_on: null,
          payment_frequency: "monthly",
          interval_count: "1",
          calculation_method: "amortized",
          amortization_method: "constant_payment",
          statement_cutoff_day: null,
          due_day: 15,
          first_due_on: "2026-09-15",
          installment_count: 12,
          scheduled_payment: "90.50",
          contractual_minimum: null,
          periodic_fee: "2",
          periodic_insurance: "3",
          variable_rate: false,
          index_name: null,
          spread_rate: null,
          prepayment_strategy: "reduce_term",
          source: "manual",
          version: "2",
        },
        currentRates: [{
          id: "rate-1",
          rate_kind: "principal",
          rate_basis: "effective_annual",
          reported_value: "18.25",
          effective_annual_rate: "18.25",
          starts_on: "2026-08-01",
          ends_on: null,
          source: "manual",
        }],
        nextObligation: {
          id: "due-1",
          kind: "loan_installment",
          sequenceNumber: 1,
          dueOn: "2026-09-15",
          minimumDue: "90.50",
          totalDue: "90.50",
          allocated: "20",
          remaining: "70.50",
          status: "partial",
          version: "2",
        },
        paymentRule: {
          id: "rule-1",
          fundingAccountId: "cash-1",
          strategy: "fixed",
          fixedAmount: "90.50",
          maximumAmount: null,
          daysBeforeDue: 2,
          recordingMode: "manual",
          active: true,
          version: 1,
        },
        card: null,
      }],
    });

    expect(overview.coverage).toBe("complete");
    expect(overview.totalReportingDebt).toBe(3_281_000);
    expect(overview.items[0]).toMatchObject({
      accountId: "liability-usd",
      currencyCode: "USD",
      nativeDebt: 820.25,
      reportingDebt: 3_281_000,
      reportingApproximate: true,
      liability: { accountId: "liability-usd", kind: "loan", version: 3 },
      currentTerms: { scheduledPayment: 90.5, periodicInsurance: 3, version: 2 },
      nextObligation: { allocated: 20, remaining: 70.5 },
      paymentRule: { fundingAccountId: "cash-1", fixedAmount: 90.5 },
    });
    expect(overview.items[0]?.currentRates).toEqual(overview.items[0]?.rates);
  });

  it("marks a server-limited calendar response as partial", () => {
    const range = liabilityCalendarFromRpc({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      items: [{
        date: "2026-08-15",
        type: "obligation",
        id: "due-1",
        accountId: "debt-1",
        accountName: "Préstamo",
        currencyCode: "COP",
        liabilityKind: "loan",
        status: "open",
        amount: "100000",
        remaining: "75000",
        minimumDue: "50000",
        sequenceNumber: "2",
        ledgerEventId: null,
        version: "1",
      }],
    }, "2026-08-01", "2026-08-31", 1);

    expect(range.coverage).toBe("partial");
    expect(range.items[0]).toMatchObject({ amount: 100_000, remaining: 75_000, sequenceNumber: 2 });
  });

  it("segments long ranges instead of silently truncating them", async () => {
    const rpc = vi.fn(async function (this: unknown, _name: string, args: Record<string, unknown>) {
      expect(this).toBe(client);
      return {
        data: { startDate: args.p_start_date, endDate: args.p_end_date, items: [] },
        error: null,
      };
    });
    const client = { rpc };

    const range = await loadRemoteLiabilityCalendar(client as never, "2026-01-01", "2026-08-01", 2000);

    expect(range.coverage).toBe("complete");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_start_date: "2026-01-01", p_end_date: "2026-06-29", p_limit: 2000 });
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_start_date: "2026-06-30", p_end_date: "2026-08-01", p_limit: 2000 });
  });

  it("normalizes and requests an authoritative reconciliation preview", async () => {
    const payload = {
      accountId: "card-1",
      cutoffOn: "2026-08-28",
      currencyCode: "COP",
      ledgerBalance: "-490000",
      ledgerDebtBeforeStatementCharges: "450000",
      ledgerDebt: "500000",
      reportingBalance: "-490000",
      statementTotal: "500000",
      postedInterest: "0",
      postedFees: "0",
      interestToPost: "40000",
      feesToPost: "10000",
      difference: "0",
      adjustmentKind: null,
      isBalanced: true,
      requiresExchangeRate: false,
    };
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => ({ data: payload, error: null, name, args }));

    const preview = await previewRemoteLiabilityReconciliation(
      { rpc } as never,
      "card-1",
      "2026-08-28",
      500_000,
      { id: "statement-1", periodStart: "2026-07-21", interest: 40_000, fees: 10_000 },
    );

    expect(preview).toEqual(liabilityReconciliationPreviewFromRpc(payload));
    expect(preview).toMatchObject({
      ledgerDebtBeforeStatementCharges: 450_000,
      ledgerDebt: 500_000,
      interestToPost: 40_000,
      feesToPost: 10_000,
      difference: 0,
      isBalanced: true,
    });
    expect(rpc).toHaveBeenCalledWith("preview_liability_reconciliation_v2", {
      p_account_id: "card-1",
      p_cutoff_on: "2026-08-28",
      p_total_due: 500_000,
      p_obligation_id: "statement-1",
      p_period_start: "2026-07-21",
      p_interest: 40_000,
      p_fees: 10_000,
    });
  });

  it("rehydrates stable schedule and reminder identifiers after a reload", () => {
    const bootstrap = liabilityBootstrapFromRows([{
      id: "10000000-0000-4000-8000-000000000011",
      account_id: "10000000-0000-4000-8000-000000000012",
      kind: "loan_installment",
      sequence_number: 7,
      period_start: "2027-02-01",
      period_end: "2027-03-01",
      due_on: "2027-03-01",
      principal_due: "310000",
      interest_due: "90000",
      fee_due: "10000",
      minimum_due: "410000",
      total_due: "410000",
      status: "projected",
      source: "contract",
      version: "4",
    }], [{
      id: "10000000-0000-4000-8000-000000000013",
      account_id: "10000000-0000-4000-8000-000000000012",
      rule_id: "10000000-0000-4000-8000-000000000014",
      obligation_id: "10000000-0000-4000-8000-000000000011",
      scheduled_for: "2027-02-27",
      planned_amount: "410000",
      status: "planned",
      ledger_event_id: null,
      failure_reason: null,
      version: "2",
    }]);

    expect(bootstrap.obligations[0]).toMatchObject({
      id: "10000000-0000-4000-8000-000000000011",
      sequenceNumber: 7,
      totalDue: 410_000,
      source: "contract",
      version: 4,
    });
    expect(bootstrap.intents[0]).toMatchObject({
      id: "10000000-0000-4000-8000-000000000013",
      obligationId: "10000000-0000-4000-8000-000000000011",
      ruleId: "10000000-0000-4000-8000-000000000014",
      plannedAmount: 410_000,
      status: "planned",
      version: 2,
    });
  });
});
