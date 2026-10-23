import { describe, expect, it } from "vitest";
import { demoFinanceState } from "./demo-data";
import { buildDetailedFinanceReport, transactionMatchesReportQuery } from "./detailed-report";
import { defaultReportQuery, normalizeReportQuery, reportBudgetIsComparable, reportComparisonRange } from "./report-query";
import type { Transaction } from "./types";
import { createReportWorkbook } from "./report-workbook";

function fixture() {
  const state = structuredClone(demoFinanceState);
  state.transactions = []; state.budgets = []; state.financialTargets = []; state.financialTargetEntries = [];
  state.creditCards = []; state.creditCardStatements = []; state.liabilityOverview.items = [];
  state.accounts = [{ ...state.accounts[0], initialBalance: 5_000_000, openingBalanceDate: "2026-01-01", currencyCode: "COP" }];
  const categories = state.categories.filter((item) => item.kind === "expense" && item.group === "needs");
  const income = state.categories.find((item) => item.kind === "income")!;
  const query = defaultReportQuery(new Date("2026-08-20T12:00:00Z"));
  const movement = (amount: number, categoryId = categories[0].id, date = "2026-08-20", kind: Transaction["kind"] = "expense"): Transaction => ({ id: `tx-${state.transactions.length}`, kind, amount, accountId: state.accounts[0].id, categoryId, description: "Movimiento de prueba", occurredOn: date, createdAt: `${date}T12:00:00Z` });
  return { state, query, categories, income, movement };
}

describe("contrato de claridad de reportes", () => {
  it("no inventa déficit ni consumo cuando no hay presupuesto", () => {
    const { state, query, movement } = fixture(); state.transactions.push(movement(200_000));
    const report = buildDetailedFinanceReport(state, query, "complete");
    expect(report.summary).toMatchObject({ expense: 200_000, budget: 0, budgetUsage: 0, budgetVariance: 0, budgetExpense: 0, unbudgetedExpense: 200_000 });
    expect(report.groups.every((item) => item.usage === 0)).toBe(true);
  });
  it("solo compara gasto del mismo mes/subcategoría con límite positivo", () => {
    const { state, query, categories, movement } = fixture();
    state.budgets.push({ id: "b", month: "2026-08-01", categoryId: categories[0].id, amount: 100_000 });
    state.transactions.push(movement(100_000), movement(300_000, categories[1].id), movement(500_000, categories[0].id, "2026-09-20"));
    const report = buildDetailedFinanceReport(state, normalizeReportQuery({ ...query, preset: "custom", endDate: "2026-09-30" }), "complete");
    expect(report.summary).toMatchObject({ expense: 900_000, budgetExpense: 100_000, unbudgetedExpense: 800_000, budgetUsage: 100, budgetVariance: 0 });
    expect(report.groups.find((item) => item.group === "needs")?.usage).toBe(100);
  });
  it("intersecta categoría principal/subcategoría y reconcilia el desglose", () => {
    const { state, query, categories, movement } = fixture();
    state.transactions.push(movement(200_000), movement(300_000, categories[1].id));
    const filtered = { ...query, groupKeys: ["needs"], categoryIds: [categories[0].id] };
    const report = buildDetailedFinanceReport(state, filtered, "complete");
    expect(report.summary.expense).toBe(200_000);
    expect(report.groups.reduce((sum, item) => sum + item.expense, 0)).toBe(report.summary.expense);
    expect(state.transactions.filter((item) => transactionMatchesReportQuery(item, state, filtered))).toHaveLength(1);
  });
  it("separa arrastre y saldos reales del subtotal buscado", () => {
    const { state, query, income, movement } = fixture();
    state.transactions.push(movement(1_000_000, income.id, "2026-08-20", "income"), movement(200_000));
    const report = buildDetailedFinanceReport(state, { ...query, kind: "expense" }, "complete");
    expect(report.summary.balance).toBe(-200_000);
    expect(report.accounts[0]).toMatchObject({ nativeOpeningBalance: 5_000_000, nativeClosingBalance: 5_800_000 });
  });
  it("no introduce meses intermedios ni días ajenos en el promedio", () => {
    const { state, query, movement } = fixture();
    state.transactions.push(movement(310_000), movement(9_000_000, undefined, "2026-09-20"), movement(310_000, undefined, "2026-10-20"));
    const selected = normalizeReportQuery({ ...query, preset: "months", selectedMonths: ["2026-08", "2026-10"], comparison: "previous" });
    const report = buildDetailedFinanceReport(state, selected, "complete");
    expect(report.series.map((item) => item.period)).toEqual(["2026-08-01", "2026-10-01"]);
    expect(report.summary.averageDailyExpense).toBe(10_000); expect(report.comparison).toBeNull();
  });
  it("compara meses completos de calendario y conserva febrero bisiesto", () => {
    const { query } = fixture();
    expect(reportComparisonRange({ ...query, startDate: "2026-09-01", endDate: "2026-09-30", comparison: "previous" })).toEqual({ startDate: "2026-08-01", endDate: "2026-08-31" });
    expect(reportComparisonRange({ ...query, startDate: "2024-02-01", endDate: "2024-02-29", comparison: "year" })).toEqual({ startDate: "2023-02-01", endDate: "2023-02-28" });
  });
  it("no compara límites globales con una búsqueda o una cuenta parcial", () => {
    const { query } = fixture();
    expect(reportBudgetIsComparable(query)).toBe(true);
    expect(reportBudgetIsComparable({ ...query, accountIds: ["a"] })).toBe(false);
    expect(reportBudgetIsComparable({ ...query, search: "comida" })).toBe(false);
  });
  it("no duplica transferencias ni usa la TRM vigente para USD", () => {
    const { state, query, movement } = fixture();
    state.accounts[0] = { ...state.accounts[0], currencyCode: "USD", initialBalance: 100, openingExchangeRate: 4_000 };
    state.transactions.push({ ...movement(25), baseAmount: 102_500, nativeCurrencyCode: "USD", baseCurrencyCode: "COP", exchangeRate: 4_100 }, movement(10, undefined, undefined, "transfer_in"), movement(10, undefined, undefined, "transfer_out"));
    const report = buildDetailedFinanceReport(state, query, "complete");
    expect(report.summary.expense).toBe(102_500); expect(report.accounts[0].nativeClosingBalance).toBe(75);
    expect(report.transactions).toHaveLength(2);
  });
  it("expone solo actividad histórica de metas, nunca su progreso vivo", () => {
    const { state, query, movement } = fixture();
    state.financialTargets = [structuredClone(demoFinanceState.financialTargets[0])];
    const target = state.financialTargets[0]; target.progressAmount = 99_999_999;
    state.transactions.push({ ...movement(100_000), financialTargetId: target.id, financialTargetEffect: "advance" });
    state.financialTargetEntries.push({ id: "e", targetId: target.id, kind: "contribution", effect: "advance", amount: 30_000, occurredOn: "2026-08-10", createdAt: "2026-08-10T12:00:00Z" });
    expect(buildDetailedFinanceReport(state, query, "complete").targetActivity?.[0]).toMatchObject({ advanced: 100_000, manualNet: 30_000 });
    expect(buildDetailedFinanceReport(state, { ...query, accountIds: [state.accounts[0].id] }, "complete").targetActivity?.[0].manualNet).toBe(0);
  });
  it("procesa 10.000 movimientos y montos grandes conservando sumas", () => {
    const { state, query, movement } = fixture();
    state.transactions = Array.from({ length: 10_000 }, (_, index) => ({ ...movement(100_000_000), id: String(index) }));
    const report = buildDetailedFinanceReport(state, query, "complete");
    expect(report.summary.expense).toBe(1_000_000_000_000); expect(report.summary.transactionCount).toBe(10_000);
    expect(report.groups.reduce((sum, item) => sum + item.expense, 0)).toBe(report.summary.expense);
  });
  it("el Excel básico no incluye funciones sin usar ni columnas de límites", async () => {
    const { state, query, movement } = fixture(); state.transactions.push(movement(200_000));
    const report = buildDetailedFinanceReport(state, query, "complete");
    const blob = await createReportWorkbook({ report, query, transactions: state.transactions, accounts: state.accounts, categories: state.categories, profile: state.profile! });
    const { Workbook } = await import("exceljs"); const workbook = new Workbook(); await workbook.xlsx.load(await blob.arrayBuffer());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Resumen", "Ingresos y gastos", "Categorías", "Cuentas", "Comercios", "Días de la semana", "Movimientos", "Configuración"]);
    expect(workbook.getWorksheet("Categorías")!.getRow(9).values).toEqual([undefined, "Categoría principal", "Subcategoría", "Gastado", "% del gasto", "Movimientos"]);
    expect(JSON.stringify(workbook.getWorksheet("Resumen")!.model)).not.toContain("Tasa de ahorro");
  }, 20_000);
});
