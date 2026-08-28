import { describe, expect, it } from "vitest";
import {
  applyObligationPrepayment,
  calculateObligationArrears,
  convertObligationRate,
  convertUvrToCop,
  effectiveObligationRate,
  generateObligationSchedule,
  reconcileObligationSchedule,
} from "@/lib/finance/obligations";
import type { ObligationScheduleInput } from "@/lib/finance/types";

function fixedInput(overrides: Partial<ObligationScheduleInput> = {}): ObligationScheduleInput {
  return {
    principal: 1_200_000,
    currencyCode: "COP",
    startOn: "2026-01-15",
    firstDueOn: "2026-02-15",
    installmentCount: 12,
    amortization: "constant_payment",
    rate: { kind: "fixed", rate: { percent: 12, convention: "EA" } },
    ...overrides,
  } as ObligationScheduleInput;
}

describe("obligation rate conventions", () => {
  it("converts EA, EM and NMV without confusing percent with decimal", () => {
    const monthly = convertObligationRate({ percent: 12, convention: "EA" }, "EM");
    expect(monthly).toBeCloseTo(0.9488792935, 9);
    expect(convertObligationRate({ percent: monthly, convention: "EM" }, "EA")).toBeCloseTo(12, 8);
    expect(convertObligationRate({ percent: 12, convention: "NMV" }, "EM")).toBeCloseTo(1, 12);
    expect(convertObligationRate({ percent: 12, convention: "NMV" }, "EA")).toBeCloseTo(12.6825030132, 9);
  });

  it("supports generic nominal rates with explicit compounding base", () => {
    expect(convertObligationRate({ percent: 16, convention: "nominal", periodsPerYear: 4 }, "nominal", 4))
      .toBeCloseTo(16, 10);
    expect(convertObligationRate({ percent: 36, convention: "nominal", dayCountBasis: 360 }, "EA"))
      .toBeCloseTo((Math.pow(1 + 0.36 / 360, 360) - 1) * 100, 8);
    expect(() => convertObligationRate({ percent: 12, convention: "nominal" }, "EA"))
      .toThrow("base");
  });

  it("derives daily accrual using the contractual 360/365 base", () => {
    const rate360 = effectiveObligationRate(
      { percent: 24, convention: "EA", dayCountBasis: 360 },
      { days: 31, dayCountBasis: 360 },
    );
    const rate365 = effectiveObligationRate(
      { percent: 24, convention: "EA", dayCountBasis: 365 },
      { days: 31, dayCountBasis: 365 },
    );
    expect(rate360).toBeGreaterThan(rate365);
    expect(rate365).toBeCloseTo(Math.pow(1.24, 31 / 365) - 1, 12);
  });
});

describe("obligation schedules", () => {
  it("absorbs a zero-rate COP residue without inventing or losing capital", () => {
    const schedule = generateObligationSchedule(fixedInput({
      principal: 100,
      installmentCount: 3,
      rate: { kind: "fixed", rate: { percent: 0, convention: "EA" } },
    }));
    expect(schedule.rows.map((row) => row.principal)).toEqual([34, 33, 33]);
    expect(schedule.totalPrincipal).toBe(100);
    expect(schedule.totalInterest).toBe(0);
    expect(schedule.remainingPrincipal).toBe(0);
  });

  it("keeps a 29-31 anchor across short months and leap years", () => {
    const schedule = generateObligationSchedule(fixedInput({
      principal: 400,
      startOn: "2024-01-01",
      firstDueOn: "2024-01-31",
      installmentCount: 4,
      rate: { kind: "fixed", rate: { percent: 0, convention: "EA" } },
    }));
    expect(schedule.rows.map((row) => row.dueOn)).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
      "2024-04-30",
    ]);
  });

  it("models weekly and biweekly as exact 7/14-day blocks", () => {
    const weekly = generateObligationSchedule(fixedInput({
      principal: 300,
      startOn: "2026-01-01",
      firstDueOn: "2026-01-08",
      installmentCount: 3,
      paymentFrequency: "weekly",
      rate: { kind: "fixed", rate: { percent: 0, convention: "EA" } },
    }));
    const biweekly = generateObligationSchedule(fixedInput({
      principal: 300,
      startOn: "2026-01-01",
      firstDueOn: "2026-01-15",
      installmentCount: 3,
      paymentFrequency: "biweekly",
      rate: { kind: "fixed", rate: { percent: 0, convention: "EA" } },
    }));
    expect(weekly.rows.map((row) => row.dueOn)).toEqual(["2026-01-08", "2026-01-15", "2026-01-22"]);
    expect(biweekly.rows.map((row) => row.dueOn)).toEqual(["2026-01-15", "2026-01-29", "2026-02-12"]);
  });

  it("supports two monthly anchors and deduplicates clamped month ends", () => {
    const schedule = generateObligationSchedule(fixedInput({
      principal: 500,
      startOn: "2026-01-01",
      firstDueOn: "2026-01-15",
      firstDueDay: 15,
      secondDueDay: 31,
      paymentFrequency: "semimonthly",
      installmentCount: 5,
      rate: { kind: "fixed", rate: { percent: 0, convention: "EA" } },
    }));
    expect(schedule.rows.map((row) => row.dueOn)).toEqual([
      "2026-01-15",
      "2026-01-31",
      "2026-02-15",
      "2026-02-28",
      "2026-03-15",
    ]);
  });

  it("anchors quarterly and yearly calendars through leap-day clamps", () => {
    const quarterly = generateObligationSchedule(fixedInput({
      principal: 300,
      startOn: "2023-11-30",
      firstDueOn: "2024-02-29",
      firstDueDay: 29,
      paymentFrequency: "quarterly",
      installmentCount: 3,
      rate: { kind: "fixed", rate: { percent: 0, convention: "EA" } },
    }));
    const yearly = generateObligationSchedule(fixedInput({
      principal: 300,
      startOn: "2023-01-01",
      firstDueOn: "2024-02-29",
      firstDueDay: 29,
      paymentFrequency: "yearly",
      installmentCount: 3,
      rate: { kind: "fixed", rate: { percent: 0, convention: "EA" } },
    }));
    expect(quarterly.rows.map((row) => row.dueOn)).toEqual(["2024-02-29", "2024-05-29", "2024-08-29"]);
    expect(yearly.rows.map((row) => row.dueOn)).toEqual(["2024-02-29", "2025-02-28", "2026-02-28"]);
  });

  it("uses the effective rate of each payment frequency", () => {
    const annualRate = 12;
    const weekly = generateObligationSchedule(fixedInput({
      principal: 1_000_000,
      startOn: "2026-01-01",
      firstDueOn: "2026-01-08",
      installmentCount: 1,
      paymentFrequency: "weekly",
      amortization: "balloon",
      rate: { kind: "fixed", rate: { percent: annualRate, convention: "EA" } },
    }));
    const quarterly = generateObligationSchedule(fixedInput({
      principal: 1_000_000,
      startOn: "2026-01-01",
      firstDueOn: "2026-04-01",
      installmentCount: 1,
      paymentFrequency: "quarterly",
      amortization: "balloon",
      rate: { kind: "fixed", rate: { percent: annualRate, convention: "EA" } },
    }));
    expect(weekly.rows[0].interest).toBe(Math.round(1_000_000 * (Math.pow(1.12, 1 / 52) - 1)));
    expect(quarterly.rows[0].interest).toBe(Math.round(1_000_000 * (Math.pow(1.12, 1 / 4) - 1)));
  });

  it("calculates constant payments and closes the balance exactly", () => {
    const schedule = generateObligationSchedule(fixedInput());
    expect(schedule.rows).toHaveLength(12);
    expect(schedule.rows[0].principal).toBeGreaterThan(0);
    expect(schedule.rows[0].interest).toBeGreaterThan(schedule.rows[11].interest);
    expect(schedule.totalPrincipal).toBe(1_200_000);
    expect(schedule.remainingPrincipal).toBe(0);
    expect(schedule.certainty).toBe("calculated");
  });

  it("uses USD cents and gives constant-principal residues to real installments", () => {
    const schedule = generateObligationSchedule(fixedInput({
      principal: 100,
      currencyCode: "USD",
      installmentCount: 3,
      amortization: "constant_principal",
      rate: { kind: "fixed", rate: { percent: 0, convention: "EA" } },
    }));
    expect(schedule.rows.map((row) => row.principal)).toEqual([33.34, 33.33, 33.33]);
    expect(schedule.totalPrincipal).toBe(100);
  });

  it("distinguishes interest-only from a final balloon", () => {
    const interestOnly = generateObligationSchedule(fixedInput({
      principal: 1_000,
      installmentCount: 3,
      amortization: "interest_only",
    }));
    const balloon = generateObligationSchedule(fixedInput({
      principal: 1_000,
      installmentCount: 3,
      amortization: "balloon",
    }));
    expect(interestOnly.rows.map((row) => row.principal)).toEqual([0, 0, 0]);
    expect(interestOnly.remainingPrincipal).toBe(1_000);
    expect(balloon.rows.map((row) => row.principal)).toEqual([0, 0, 1_000]);
    expect(balloon.remainingPrincipal).toBe(0);
  });

  it("keeps insurance, fees and other charges separate from interest", () => {
    const schedule = generateObligationSchedule(fixedInput({
      principal: 1_000_000,
      installmentCount: 2,
      rate: { kind: "fixed", rate: { percent: 0, convention: "EA" } },
      charges: [
        { id: "life", name: "Seguro de vida", kind: "insurance", calculation: "fixed", amount: 12_000 },
        { id: "fee", name: "Administración", kind: "fee", calculation: "fixed", amount: 5_000 },
        { id: "guarantee", name: "Garantía", kind: "other", calculation: "opening_balance_percent", percent: 0.1 },
      ],
    }));
    expect(schedule.totalInsurance).toBe(24_000);
    expect(schedule.totalFees).toBe(10_000);
    expect(schedule.totalOtherCharges).toBe(1_500);
    expect(schedule.totalInterest).toBe(0);
    expect(schedule.rows[0].total).toBe(518_000);
  });

  it("accepts a manual calendar while preserving its provenance", () => {
    const schedule = generateObligationSchedule({
      principal: 100,
      currencyCode: "USD",
      startOn: "2026-01-01",
      firstDueOn: "2026-02-01",
      installmentCount: 2,
      amortization: "manual",
      manualPayments: [
        { dueOn: "2026-02-01", principal: 40, interest: 2, charges: [{ id: "s", name: "Seguro", kind: "insurance", amount: 1 }] },
        { dueOn: "2026-03-01", principal: 60, interest: 1.2 },
      ],
    });
    expect(schedule.certainty).toBe("manual");
    expect(schedule.totalPrincipal).toBe(100);
    expect(schedule.totalInterest).toBe(3.2);
    expect(schedule.totalInsurance).toBe(1);
    expect(schedule.remainingPrincipal).toBe(0);
  });

  it("marks uncovered future variable rates as approximate", () => {
    const schedule = generateObligationSchedule(fixedInput({
      principal: 300_000,
      installmentCount: 3,
      rate: {
        kind: "variable",
        benchmark: "IBR",
        snapshots: [{
          effectiveOn: "2026-01-01",
          validUntil: "2026-02-28",
          rate: { percent: 14, convention: "EA" },
          certainty: "confirmed",
        }],
      },
    }));
    expect(schedule.rows.map((row) => row.certainty)).toEqual(["calculated", "approximate", "approximate"]);
    expect(schedule.certainty).toBe("approximate");
  });

  it("keeps UVR as units and values each due date separately in COP", () => {
    const schedule = generateObligationSchedule({
      principal: 100.12345678,
      currencyCode: "UVR",
      startOn: "2026-01-15",
      firstDueOn: "2026-02-15",
      installmentCount: 2,
      amortization: "constant_principal",
      rate: {
        kind: "indexed",
        index: "UVR",
        principalMode: "unit",
        rate: { percent: 0, convention: "EA" },
        indexValues: [
          { on: "2026-01-15", value: 390.1, certainty: "confirmed" },
          { on: "2026-02-15", value: 392.2, certainty: "confirmed" },
          { on: "2026-03-15", value: 394.4, certainty: "confirmed" },
        ],
      },
    });
    expect(schedule.totalPrincipal).toBe(100.12345678);
    expect(schedule.rows[0].indexAdjustment).toBe(0);
    expect(schedule.rows[0].reportingTotal).toBe(convertUvrToCop(schedule.rows[0].total, 392.2));
    expect(schedule.rows[1].reportingClosingPrincipal).toBe(0);
  });

  it("applies an IPC-style index adjustment without mixing it with interest", () => {
    const schedule = generateObligationSchedule(fixedInput({
      principal: 1_000_000,
      installmentCount: 1,
      rate: {
        kind: "indexed",
        index: "IPC",
        principalMode: "balance_adjustment",
        rate: { percent: 0, convention: "EA" },
        indexValues: [
          { on: "2026-01-15", value: 100, certainty: "confirmed" },
          { on: "2026-02-15", value: 101, certainty: "confirmed" },
        ],
      },
    }));
    expect(schedule.rows[0].indexAdjustment).toBe(10_000);
    expect(schedule.rows[0].interest).toBe(0);
    expect(schedule.rows[0].principal).toBe(1_010_000);
  });

  it("keeps very large COP balances arithmetically closed", () => {
    const principal = 100_000_000_000;
    const schedule = generateObligationSchedule(fixedInput({
      principal,
      installmentCount: 360,
      rate: { kind: "fixed", rate: { percent: 18, convention: "EA" } },
    }));
    expect(schedule.rows).toHaveLength(360);
    expect(schedule.totalPrincipal).toBe(principal);
    expect(schedule.remainingPrincipal).toBe(0);
    expect(Number.isFinite(schedule.totalPayments)).toBe(true);
  });

  it("uses actual leap-year day counts when requested", () => {
    const schedule = generateObligationSchedule(fixedInput({
      principal: 1_000_000,
      startOn: "2024-01-31",
      firstDueOn: "2024-02-29",
      installmentCount: 1,
      amortization: "balloon",
      interestAccrual: "actual_days",
      rate: { kind: "fixed", rate: { percent: 12, convention: "EA", dayCountBasis: 365 } },
    }));
    const expected = Math.round(1_000_000 * (Math.pow(1.12, 29 / 365) - 1));
    expect(schedule.rows[0].interest).toBe(expected);
  });
});

describe("arrears, prepayments and reconciliation", () => {
  it("never hides default interest inside principal or collection costs", () => {
    const result = calculateObligationArrears({
      currencyCode: "COP",
      overduePrincipal: 1_000_000,
      dueOn: "2026-01-01",
      asOf: "2026-01-31",
      defaultRate: { percent: 24, convention: "EA", dayCountBasis: 365 },
      currentInterest: 10_000,
      insurance: 2_000,
      fees: 3_000,
      collectionCosts: 4_000,
    });
    expect(result.daysLate).toBe(30);
    expect(result.defaultInterest).toBe(Math.round(1_000_000 * (Math.pow(1.24, 30 / 365) - 1)));
    expect(result.total).toBe(
      result.overduePrincipal + result.currentInterest + result.defaultInterest
      + result.insurance + result.fees + result.collectionCosts,
    );
  });

  it("applies a prepayment to charges, interest and then principal", () => {
    const input = fixedInput({ principal: 1_200_000, installmentCount: 12 });
    const schedule = generateObligationSchedule(input);
    const result = applyObligationPrepayment(input, schedule, {
      on: "2026-03-15",
      amount: 220_000,
      dueCharges: 10_000,
      dueInterest: 10_000,
      strategy: "reduce_payment",
    });
    expect(result.appliedToCharges).toBe(10_000);
    expect(result.appliedToInterest).toBe(10_000);
    expect(result.appliedToPrincipal).toBe(200_000);
    expect(result.lockedRows).toEqual(schedule.rows.slice(0, 2));
    expect(result.futureSchedule.rows).toHaveLength(10);
    expect(result.futureSchedule.remainingPrincipal).toBe(0);
  });

  it("can shorten the term while keeping the reference payment", () => {
    const input = fixedInput({ principal: 12_000_000, installmentCount: 24 });
    const schedule = generateObligationSchedule(input);
    const result = applyObligationPrepayment(input, schedule, {
      on: "2026-03-15",
      amount: 5_000_000,
      strategy: "reduce_term",
    });
    expect(result.futureSchedule.rows.length).toBeLessThan(schedule.rows.length - 2);
    expect(result.futureSchedule.remainingPrincipal).toBe(0);
    expect(result.lockedRows).toEqual(schedule.rows.slice(0, 2));
  });

  it("reconciles a confirmed snapshot and recalculates only the future", () => {
    const input = fixedInput({ principal: 1_200_000, installmentCount: 12 });
    const original = generateObligationSchedule(input);
    const reconciled = reconcileObligationSchedule(input, original, {
      asOf: "2026-03-15",
      confirmedPrincipal: original.rows[1].closingPrincipal + 25_000,
      confirmedAccruedInterest: 3_000,
      confirmedFees: 500,
      sourceReference: "extracto-2026-03",
    });
    expect(reconciled.certainty).toBe("confirmed");
    expect(reconciled.principalDifference).toBe(25_000);
    expect(reconciled.lockedRows).toEqual(original.rows.slice(0, 2));
    expect(reconciled.futureSchedule.rows[0].dueOn).toBe(original.rows[2].dueOn);
    expect(reconciled.futureSchedule.rows[0].installmentNumber).toBe(3);
    expect(reconciled.futureSchedule.remainingPrincipal).toBe(0);
  });

  it("rejects unsafe automatic rewrites of manual calendars", () => {
    const input: ObligationScheduleInput = {
      principal: 100,
      currencyCode: "USD",
      startOn: "2026-01-01",
      firstDueOn: "2026-02-01",
      installmentCount: 1,
      amortization: "manual",
      manualPayments: [{ dueOn: "2026-02-01", principal: 100 }],
    };
    const schedule = generateObligationSchedule(input);
    expect(() => applyObligationPrepayment(input, schedule, {
      on: "2026-01-15",
      amount: 10,
      strategy: "reduce_payment",
    })).toThrow("calendario manual");
    expect(() => reconcileObligationSchedule(input, schedule, {
      asOf: "2026-01-15",
      confirmedPrincipal: 90,
    })).toThrow("calendario manual");
  });
});

describe("obligation validation", () => {
  it("requires UVR values and refuses double indexation", () => {
    expect(() => generateObligationSchedule(fixedInput({ currencyCode: "UVR" }))).toThrow("serie de valores UVR");
    expect(() => generateObligationSchedule({
      ...fixedInput({ currencyCode: "UVR" }),
      rate: {
        kind: "indexed",
        index: "UVR",
        principalMode: "balance_adjustment",
        rate: { percent: 0, convention: "EA" },
        indexValues: [{ on: "2026-01-15", value: 390 }],
      },
    })).toThrow("no se indexa dos veces");
  });

  it("does not invent a variable rate before its first snapshot", () => {
    expect(() => generateObligationSchedule(fixedInput({
      rate: {
        kind: "variable",
        benchmark: "IBR",
        snapshots: [{ effectiveOn: "2026-02-01", rate: { percent: 12, convention: "EA" } }],
      },
    }))).toThrow("No hay una tasa IBR vigente");
  });

  it("rejects over-amortized or non-chronological manual calendars", () => {
    expect(() => generateObligationSchedule({
      principal: 100,
      currencyCode: "USD",
      startOn: "2026-01-01",
      firstDueOn: "2026-02-01",
      installmentCount: 1,
      amortization: "manual",
      manualPayments: [{ dueOn: "2026-02-01", principal: 101 }],
    })).toThrow("más capital");
  });
});
