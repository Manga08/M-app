import { describe, expect, it } from "vitest";
import { cleanImportedCategoryName, findExistingImportDuplicates, parsePlannerWorkbook, suggestCategoryId, suggestImportGroupKey, suggestIncomeTypeId, type WorkbookCell } from "./xlsx-import";
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
      { amount: 120_000, occurredOn: "2024-01-02", merchant: "Éxito", kind: "expense", adjustment: false },
      { amount: 63_000, occurredOn: "2024-01-15", kind: "income", adjustment: true },
    ]);
  });

  it("lee ingresos reales de 2025 por encabezado y omite el estimado", () => {
    const source = sheet("2025", [["Mercado", 120_000, "02/01/2024", "Mercado"]]);
    source.data[14] = [];
    source.data[14][1] = "Cocepto";
    source.data[14][3] = "Estimado";
    source.data[14][5] = "Actual";
    source.data[15] = [];
    source.data[15][1] = "Salario Fijo";
    source.data[15][4] = 4_000_000;
    source.data[15][6] = 3_945_000;
    source.data[16] = [];
    source.data[16][1] = "Total";
    const result = parsePlannerWorkbook([source]);
    expect(result.incomeCount).toBe(1);
    expect(result.sourceIncomeTypes).toEqual(["Salario Fijo"]);
    expect(result.movements).toContainEqual(expect.objectContaining({ kind: "income", amount: 3_945_000, occurredOn: "2024-01-01", description: "Salario Fijo" }));
  });

  it("lee la columna Actual desplazada de 2026 sin duplicar el total", () => {
    const source = sheet("2026", [["Transporte", 25_000, "03/08/2026", "Uber"]]);
    source.data[14] = [];
    source.data[14][1] = "Concepto";
    source.data[14][4] = "Actual";
    source.data[15] = [];
    source.data[15][1] = "Sueldo";
    source.data[15][5] = 5_974_317;
    source.data[16] = [];
    source.data[16][1] = "Cashback";
    source.data[16][5] = 75_000;
    source.data[17] = [];
    source.data[17][1] = "Total";
    source.data[17][5] = 6_049_317;
    const result = parsePlannerWorkbook([source]);
    expect(result.incomeCount).toBe(2);
    expect(result.movements.filter((movement) => movement.kind === "income")).toMatchObject([
      { sourceCategory: "Sueldo", amount: 5_974_317, occurredOn: "2026-08-01" },
      { sourceCategory: "Cashback", amount: 75_000, occurredOn: "2026-08-01" },
    ]);
  });

  it("distingue la plantilla v1.2 por su columna de ingresos", () => {
    const source = sheet("2026", [["Mercado", 120_000, "02/01/2026", "Mercado"]]);
    source.data[14] = [];
    source.data[14][1] = "Concepto";
    source.data[14][6] = "Actual";
    source.data[15] = [];
    source.data[15][1] = "Salario";
    source.data[15][7] = 900_000;
    source.data[16] = [];
    source.data[16][1] = "Total";
    const result = parsePlannerWorkbook([source]);
    expect(result.version).toBe("v1.2");
    expect(result.incomeCount).toBe(1);
    expect(result.movements).toContainEqual(expect.objectContaining({ kind: "income", amount: 900_000, occurredOn: "2026-01-01" }));
  });

  it("lee el saldo disponible final y calcula la diferencia real de movimientos", () => {
    const source = sheet("2026", [["Mercado", 120_000, "02/08/2026", "Mercado"]]);
    source.data[14] = [];
    source.data[14][1] = "Concepto";
    source.data[14][4] = "Actual";
    source.data[15] = [];
    source.data[15][1] = "Sueldo";
    source.data[15][5] = 900_000;
    source.data[16] = [];
    source.data[16][1] = "Total";
    source.data[20] = [];
    source.data[20][3] = "Disponible para gastar";
    source.data[22] = [];
    source.data[22][4] = 780_000;
    const result = parsePlannerWorkbook([source]);
    expect(result.endingBalance).toBe(780_000);
    expect(result.endingBalanceDate).toBe("2026-08-31");
    expect(result.movementNet).toBe(780_000);
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

  it("propone tipos de ingreso claros sin confundirlos con categorías de gasto", () => {
    const categories: Category[] = [
      { id: "salary", name: "Nómina", group: "income", color: "#fff", icon: "briefcase", kind: "income" },
      { id: "other", name: "Otros ingresos", group: "income", color: "#fff", icon: "coins", kind: "income" },
    ];
    expect(suggestIncomeTypeId("Sueldo", categories)).toBe("salary");
    expect(suggestIncomeTypeId("Cashback Rappi", categories)).toBe("");
    expect(suggestIncomeTypeId("Renta", categories)).toBe("");
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
