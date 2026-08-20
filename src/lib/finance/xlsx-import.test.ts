import { describe, expect, it } from "vitest";
import { cleanImportedCategoryName, findExistingImportDuplicates, parsePlannerWorkbook, suggestCategoryId, suggestImportGroupKey, type WorkbookCell } from "./xlsx-import";
import type { Category, Transaction } from "./types";

function sheet(version: "2025" | "2026", rows: WorkbookCell[][]) {
  const start = version === "2025" ? 28 : 29;
  const data: WorkbookCell[][] = Array.from({ length: 4 }, () => []);
  data[2][start] = "Categoria";
  data[2][start + 2] = "Monto";
  data[2][start + 4] = "Fecha";
  data[2][start + 6] = "Concepto";
  for (const [index, source] of rows.entries()) {
    const row: WorkbookCell[] = [];
    row[start] = source[0];
    row[start + 3] = source[1];
    row[start + 4] = source[2];
    row[start + 6] = source[3];
    data[index + 3] = row;
  }
  return { sheet: "Ene", data };
}

describe("importación de planificadores", () => {
  it("reconoce 2025, convierte fechas Excel y conserva ajustes negativos", () => {
    const result = parsePlannerWorkbook([sheet("2025", [
      ["Mercado", 120_000, 45_293, "Mercado - Éxito"],
      ["Deudas", -63_000, "15/01/2024", "Rappi CashBack"],
    ])]);
    expect(result.version).toBe("2025");
    expect(result.movements).toMatchObject([
      { amount: 120_000, occurredOn: "2024-01-02", merchant: "Éxito", adjustment: false },
      { amount: 63_000, occurredOn: "2024-01-15", adjustment: true },
    ]);
  });

  it("reconoce 2026 y conserva dos compras genuinas aunque tengan los mismos datos", () => {
    const result = parsePlannerWorkbook([sheet("2026", [
      ["Transporte", 25_000, new Date("2026-01-03T00:00:00Z"), "Uber"],
      ["Transporte", 25_000, new Date("2026-01-03T00:00:00Z"), "Uber"],
    ])]);
    expect(result.version).toBe("2026");
    expect(result.movements).toHaveLength(2);
  });

  it("detecta movimientos que ya existen aunque la categoría cambie", () => {
    const result = parsePlannerWorkbook([sheet("2026", [["Renta", 900_000, "01/01/2026", "Arriendo"]])]);
    const existing: Transaction[] = [{ id: "t", kind: "expense", amount: 900_000, accountId: "a", categoryId: "otra", description: "Arriendo", occurredOn: "2026-01-01", createdAt: "2026-01-01T00:00:00Z" }];
    expect(findExistingImportDuplicates(result.movements, existing)).toEqual([true]);
  });

  it("compara duplicados como cantidades para no borrar compras repetidas legítimas", () => {
    const result = parsePlannerWorkbook([sheet("2026", [
      ["Renta", 900_000, "01/01/2026", "Arriendo"],
      ["Renta", 900_000, "01/01/2026", "Arriendo"],
    ])]);
    const existing: Transaction[] = [{ id: "t", kind: "expense", amount: 900_000, accountId: "a", description: "Arriendo", occurredOn: "2026-01-01", createdAt: "2026-01-01T00:00:00Z" }];
    expect(findExistingImportDuplicates(result.movements, existing)).toEqual([true, false]);
  });

  it("solo propone equivalencias de categoría suficientemente claras", () => {
    const categories: Category[] = [
      { id: "food", name: "Alimentación", group: "needs", color: "#fff", icon: "food", kind: "expense" },
      { id: "home", name: "Vivienda", group: "needs", color: "#fff", icon: "home", kind: "expense" },
    ];
    expect(suggestCategoryId("Mercado", categories)).toBe("food");
    expect(suggestCategoryId("Apartamento", categories)).toBe("home");
    expect(suggestCategoryId("ChatGPT", categories)).toBe("");
  });

  it("prepara nombres limpios y propone un grupo para las categorías nuevas", () => {
    const groups = [
      { group: "needs", name: "Necesidades" },
      { group: "wants", name: "Gustos" },
      { group: "savings", name: "Ahorros" },
    ];
    expect(cleanImportedCategoryName("🚨  Emergencias")).toBe("Emergencias");
    expect(cleanImportedCategoryName("✈️ Viajes")).toBe("Viajes");
    expect(suggestImportGroupKey("Mercado", groups)).toBe("needs");
    expect(suggestImportGroupKey("ChatGPT", groups)).toBe("wants");
    expect(suggestImportGroupKey("Ahorro", groups)).toBe("savings");
  });
});
