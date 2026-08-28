import { describe, expect, it } from "vitest";
import { liabilityKindLabel, liabilityPaymentBreakdown, liabilityPaymentStrategyLabel, nextLiabilityObligation, recalculateFixedLiabilityPrepayment } from "@/lib/finance/liabilities";
import type { LiabilityObligation, LiabilityOverviewItem } from "@/lib/finance/types";

function obligation(id: string, dueOn: string, status: LiabilityObligation["status"]): LiabilityObligation {
  return { id, accountId: "account", kind: "loan_installment", dueOn, principalDue: 100, interestDue: 10, feeDue: 0, minimumDue: 110, totalDue: 110, status, source: "contract", version: 1 };
}

describe("liability presentation helpers", () => {
  it("uses plain Spanish for products and payment strategies", () => {
    expect(liabilityKindLabel("personal_debt")).toBe("Deuda personal");
    expect(liabilityPaymentStrategyLabel("statement_total")).toBe("Todo el extracto");
  });

  it("prioritizes overdue items and ignores closed obligations", () => {
    expect(nextLiabilityObligation([
      obligation("paid", "2026-08-01", "paid"),
      obligation("future", "2026-09-01", "projected"),
      obligation("overdue", "2026-08-15", "overdue"),
    ], "2026-08-28")?.id).toBe("overdue");
  });

  it("keeps contractual interest and fees out of principal reduction", () => {
    expect(liabilityPaymentBreakdown({ amount: 310, feeDue: 10, interestDue: 50, includeContractCosts: true }))
      .toEqual({ fee: 10, interest: 50, principal: 250 });
  });

  it("continues the waterfall after a partial payment", () => {
    expect(liabilityPaymentBreakdown({ amount: 35, allocated: 20, feeDue: 10, interestDue: 40, includeContractCosts: true }))
      .toEqual({ fee: 0, interest: 30, principal: 5 });
  });

  it("treats card payments as ledger principal because statement charges are already posted", () => {
    expect(liabilityPaymentBreakdown({ amount: 310, feeDue: 10, interestDue: 50, includeContractCosts: false }))
      .toEqual({ fee: 0, interest: 0, principal: 310 });
  });

  it("reduces the remaining term after an extra capital payment", () => {
    const result = recalculateFixedLiabilityPrepayment({
      item: overview("reduce_term"), obligations: futureObligations(),
      paidOn: "2026-08-28", principalAfterPayment: 200, extraPrincipal: 100,
    });
    expect(result).toHaveLength(2);
    expect(result?.reduce((sum, row) => sum + row.principalDue, 0)).toBe(200);
    expect(result?.map((row) => row.id)).toEqual(["future-1", "future-2"]);
  });

  it("keeps the remaining term and lowers projected capital payments", () => {
    const result = recalculateFixedLiabilityPrepayment({
      item: overview("reduce_payment"), obligations: futureObligations(),
      paidOn: "2026-08-28", principalAfterPayment: 200, extraPrincipal: 100,
    });
    expect(result).toHaveLength(3);
    expect(result?.reduce((sum, row) => sum + row.principalDue, 0)).toBe(200);
    expect(result?.[0].principalDue).toBeLessThan(100);
  });
});

function futureObligations(): LiabilityObligation[] {
  return ["2026-09-30", "2026-10-31", "2026-11-30"].map((dueOn, index) => ({
    id: `future-${index + 1}`, accountId: "account", kind: "loan_installment",
    sequenceNumber: index + 2, periodStart: "2026-08-28", periodEnd: dueOn, dueOn,
    principalDue: 100, interestDue: 0, feeDue: 0, minimumDue: 100, totalDue: 100,
    status: "projected", source: "contract", version: 1,
  }));
}

function overview(prepaymentStrategy: "reduce_term" | "reduce_payment"): LiabilityOverviewItem {
  return {
    liability: { accountId: "account", kind: "loan", status: "active", migrationStatus: "native", version: 1 },
    accountId: "account", accountVersion: 1, liabilityVersion: 1, name: "Crédito",
    accountName: "Crédito", kind: "loan", status: "active", currencyCode: "COP",
    color: "#123456", accountColor: "#123456", migrationStatus: "native",
    nativeBalance: -300, nativeDebt: 300, reportingBalance: -300, reportingDebt: 300,
    reportingApproximate: false, currentRates: [{
      id: "rate", accountId: "account", rateKind: "principal", rateBasis: "effective_annual",
      reportedValue: 0, effectiveAnnualRate: 0, startsOn: "2026-01-01", source: "manual",
    }], rates: [], currentTerms: {
      id: "term", accountId: "account", startsOn: "2026-01-01", paymentFrequency: "monthly",
      intervalCount: 1, calculationMethod: "amortized", amortizationMethod: "constant_principal",
      installmentCount: 4, periodicFee: 0, periodicInsurance: 0, variableRate: false,
      prepaymentStrategy, source: "manual", version: 1,
    },
  };
}
