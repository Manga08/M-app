import { describe, expect, it } from "vitest";
import {
  buildInstallmentSchedule,
  creditCardAvailable,
  creditCardCycle,
  creditCardDebt,
  creditCardUtilization,
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
});
