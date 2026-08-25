import { describe, expect, it } from "vitest";
import { createStressFinanceState, STRESS_TRANSACTION_COUNT } from "./fixtures/stress-finance-state";

describe("escenario financiero de alta escala", () => {
  it("genera 10.000 movimientos deterministas dentro del rango seguro de JavaScript", () => {
    const first = createStressFinanceState();
    const second = createStressFinanceState();
    expect(first.transactions).toHaveLength(STRESS_TRANSACTION_COUNT);
    expect(first.transactions).toEqual(second.transactions);
    expect(Math.max(...first.transactions.map((transaction) => transaction.amount))).toBe(4_500_000_000_000);
    expect(first.transactions.every((transaction) => Number.isSafeInteger(transaction.amount))).toBe(true);
    expect(first.accounts.some((account) => account.initialBalance >= 100_000_000_000)).toBe(true);
    expect(new Set(first.transactions.map((transaction) => transaction.occurredOn.slice(0, 7))).size).toBe(48);
  });
});
