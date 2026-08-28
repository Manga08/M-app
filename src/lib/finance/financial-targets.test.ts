import { describe, expect, it } from "vitest";
import { estimatedTargetCompletion, financialTargetProgress, liabilityBackedTargetProgress, monthlyTargetPace, targetProgressDuringMonth } from "./financial-targets";
import type { FinancialTarget, FinancialTargetEntry, RecurringRule, Transaction } from "./types";

const target: FinancialTarget = {
  id: "target-1", mode: "accumulate", kind: "emergency", status: "active", title: "Fondo de emergencia",
  targetAmount: 1_000_000, initialProgress: 100_000, startsOn: "2026-08-01", priority: 1,
  color: "#34d399", icon: "shield-check", trackingMode: "movements",
  createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
};

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "tx-1", kind: "transfer_in", amount: 250_000, accountId: "account-1", description: "Aporte",
  occurredOn: "2026-08-10", createdAt: "2026-08-10T00:00:00Z", financialTargetId: target.id,
  financialTargetEffect: "advance", ...overrides,
});

const entry = (overrides: Partial<FinancialTargetEntry> = {}): FinancialTargetEntry => ({
  id: "entry-1", targetId: target.id, kind: "contribution", effect: "advance", amount: 50_000,
  occurredOn: "2026-08-12", createdAt: "2026-08-12T00:00:00Z", ...overrides,
});

describe("financialTargetProgress", () => {
  it("combina saldo inicial, movimientos y entradas sin duplicar", () => {
    expect(financialTargetProgress(target, [entry()], [transaction()])).toMatchObject({
      rawProgress: 400_000, currentProgress: 400_000, remaining: 600_000, percent: 40, reached: false,
    });
  });

  it("resta retiros o intereses y permite mostrar un saldo mayor al inicial", () => {
    const result = financialTargetProgress({ ...target, mode: "pay_down", kind: "debt" }, [entry({ effect: "reverse", amount: 150_000 })], []);
    expect(result.rawProgress).toBe(-50_000);
    expect(result.currentProgress).toBe(0);
    expect(result.remaining).toBe(1_050_000);
    expect(result.percent).toBe(0);
  });

  it("limita la barra a 100% pero conserva el excedente", () => {
    const result = financialTargetProgress(target, [], [transaction({ amount: 1_100_000 })]);
    expect(result.percent).toBe(100);
    expect(result.overage).toBe(200_000);
    expect(result.reached).toBe(true);
  });
});

describe("target progress projections", () => {
  it("derives debt progress from the live liability ledger", () => {
    expect(liabilityBackedTargetProgress(1_000_000, 640_000)).toMatchObject({
      rawProgress: 360_000, currentProgress: 360_000, remaining: 640_000, percent: 36, reached: false,
    });
    expect(liabilityBackedTargetProgress(1_000_000, 0)).toMatchObject({ percent: 100, reached: true });
  });

  it("filtra el avance del mes solicitado", () => {
    expect(targetProgressDuringMonth(target.id, "2026-08-01", [entry(), entry({ id: "entry-2", occurredOn: "2026-09-01" })], [transaction()])).toBe(300_000);
  });

  it("normaliza reglas semanales, mensuales y anuales", () => {
    const base: RecurringRule = {
      id: "rule-1", kind: "transfer", amount: 100_000, accountId: "a", destinationAccountId: "b",
      description: "Aporte", cadence: "monthly", intervalCount: 1, startsOn: "2026-08-01",
      exchangeRate: 1, exchangeRateDate: "2026-08-01", exchangeRateSource: "same_currency",
      postingPolicy: "scheduled_date", timezone: "America/Bogota", autoPost: true, includeInBudget: false,
      includeInIncomeTarget: false, status: "active", financialTargetId: target.id, financialTargetEffect: "advance",
      createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
    };
    expect(monthlyTargetPace(target.id, [base])).toBe(100_000);
    expect(monthlyTargetPace(target.id, [{ ...base, id: "rule-usd", amount: 25, exchangeRate: 4_100, exchangeRateSource: "manual" }])).toBe(102_500);
    expect(estimatedTargetCompletion(target, financialTargetProgress(target, [], []), [base])).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("mide metas con el valor contable de movimientos USD", () => {
    const usdMovement = transaction({ amount: 25, baseAmount: undefined, exchangeRate: 4_100 });
    expect(financialTargetProgress(target, [], [usdMovement]).rawProgress).toBe(202_500);
    expect(targetProgressDuringMonth(target.id, "2026-08-01", [], [usdMovement])).toBe(102_500);
  });
});
