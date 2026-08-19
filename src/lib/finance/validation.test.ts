import { describe, expect, it } from "vitest";
import { assertFinanceAmount, cleanRequiredText, MAX_FINANCE_AMOUNT } from "./validation";

describe("finance write validation", () => {
  it("accepts values representable as numeric(18,2) with safe cents", () => {
    expect(() => assertFinanceAmount(12_345.67)).not.toThrow();
    expect(() => assertFinanceAmount(MAX_FINANCE_AMOUNT)).not.toThrow();
  });

  it("rejects poison values before they can enter the offline queue", () => {
    expect(() => assertFinanceAmount(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => assertFinanceAmount(MAX_FINANCE_AMOUNT + 1)).toThrow();
    expect(() => assertFinanceAmount(10.123)).toThrow(/dos decimales/);
    expect(() => assertFinanceAmount(0)).toThrow(/mayor que cero/);
  });

  it("normalizes and constrains required database text", () => {
    expect(cleanRequiredText("  Davivienda  ", "El nombre", 100)).toBe("Davivienda");
    expect(() => cleanRequiredText("   ", "El nombre", 100)).toThrow();
    expect(() => cleanRequiredText("x".repeat(101), "El nombre", 100)).toThrow();
  });
});
