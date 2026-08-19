import { describe, expect, it } from "vitest";
import { transactionIsInMonth, transactionMonthBounds } from "./transaction-query";

describe("filtro mensual de movimientos", () => {
  it("calcula límites exactos incluso al cambiar de año", () => {
    expect(transactionMonthBounds("2026-12-01")).toEqual({ start: "2026-12-01", end: "2027-01-01", key: "2026-12" });
  });

  it("incluye únicamente fechas del mes solicitado", () => {
    const bounds = transactionMonthBounds("2026-08-01");
    expect(transactionIsInMonth({ occurredOn: "2026-08-31" }, bounds)).toBe(true);
    expect(transactionIsInMonth({ occurredOn: "2026-09-01" }, bounds)).toBe(false);
  });

  it("rechaza formatos ambiguos en vez de filtrar silenciosamente", () => {
    expect(() => transactionMonthBounds("2026-08")).toThrow(/YYYY-MM-01/);
    expect(() => transactionMonthBounds("2026-13-01")).toThrow(/inválido/);
  });
});
