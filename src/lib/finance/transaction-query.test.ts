import { describe, expect, it } from "vitest";
import { transactionDateBounds, transactionIsInDateRange, transactionIsInMonth, transactionMonthBounds } from "./transaction-query";

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

  it("convierte un rango inclusivo en límites seguros para la consulta", () => {
    const bounds = transactionDateBounds("2025-12-31", "2026-01-02");
    expect(bounds).toEqual({ start: "2025-12-31", end: "2026-01-03", key: "2025-12-31_2026-01-02" });
    expect(transactionIsInDateRange({ occurredOn: "2026-01-02" }, bounds)).toBe(true);
    expect(transactionIsInDateRange({ occurredOn: "2026-01-03" }, bounds)).toBe(false);
  });

  it("acepta un solo día y rechaza rangos incompletos o invertidos", () => {
    expect(transactionDateBounds("2026-08-23", "2026-08-23")?.end).toBe("2026-08-24");
    expect(() => transactionDateBounds("2026-08-23", undefined)).toThrow(/inicial.*final/);
    expect(() => transactionDateBounds("2026-08-24", "2026-08-23")).toThrow(/posterior/);
    expect(() => transactionDateBounds("2026-02-31", "2026-03-01")).toThrow(/inválida/);
  });
});
