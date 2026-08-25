import { describe, expect, it } from "vitest";
import { demoFinanceState } from "@/lib/finance/demo-data";
import { buildDetailedFinanceReport, transactionMatchesReportQuery } from "@/lib/finance/detailed-report";
import { defaultReportQuery } from "@/lib/finance/report-query";
import { createReportWorkbook } from "@/lib/finance/report-workbook";
import { createTransactionWorkbook } from "@/lib/finance/workbook-standard";

async function readWorkbook(blob: Blob) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return workbook;
}

function exportedMovementCount(sheet: import("exceljs").Worksheet | undefined) {
  let count = 0;
  sheet?.eachRow((row, rowNumber) => { if (rowNumber > 9 && row.getCell(17).value) count += 1; });
  return count;
}

describe("Moneva workbook standard", () => {
  it("creates a structured movement book with summary and traceable data", async () => {
    const transactions = demoFinanceState.transactions.slice(0, 6).map((transaction, index) => index === 0 ? { ...transaction, description: "=2+2" } : transaction);
    const blob = await createTransactionWorkbook({
      transactions,
      accounts: demoFinanceState.accounts,
      categories: demoFinanceState.categories,
      groups: demoFinanceState.groupAllocations,
      financialTargets: demoFinanceState.financialTargets,
      profile: demoFinanceState.profile!,
      title: "Movimientos exportados",
      periodLabel: "agosto de 2026",
      scopeLabel: "Resultado de los filtros visibles",
      filterSummary: "Solo gastos",
    });
    const workbook = await readWorkbook(blob);

    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Resumen", "Movimientos", "Por cuenta", "Por categoría"]);
    expect(workbook.title).toBe("Movimientos exportados");
    expect(workbook.getWorksheet("Resumen")?.views[0]?.showGridLines).toBe(false);

    const movementSheet = workbook.getWorksheet("Movimientos");
    expect(movementSheet?.getCell("A9").value).toBe("Fecha");
    expect(movementSheet?.getCell("J9").value).toBe("Impacto en saldo");
    expect(movementSheet?.getCell("C10").value).toBe("=2+2");
    expect(movementSheet?.getCell("C10").type).toBe(3);
    expect(movementSheet?.getColumn(10).numFmt).toContain("es-CO");
    expect(exportedMovementCount(movementSheet)).toBe(transactions.length);
  });

  it("exports the complete filtered report instead of the short on-screen sample", async () => {
    const query = { ...defaultReportQuery(new Date("2026-08-17T12:00:00Z")), comparison: "previous" as const };
    const report = buildDetailedFinanceReport(demoFinanceState, query, "complete");
    const transactions = demoFinanceState.transactions.filter((transaction) => transactionMatchesReportQuery(transaction, demoFinanceState, query));
    const blob = await createReportWorkbook({
      report,
      query,
      transactions,
      accounts: demoFinanceState.accounts,
      categories: demoFinanceState.categories,
      profile: demoFinanceState.profile!,
      financialTargets: demoFinanceState.financialTargets,
      financialTargetEntries: demoFinanceState.financialTargetEntries,
      financialTargetDebts: demoFinanceState.financialTargetDebts,
    });
    const workbook = await readWorkbook(blob);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumen", "Flujo de caja", "Categorías", "Ingresos", "Cuentas", "Comercios", "Días de la semana", "Metas y deudas", "Movimientos", "Configuración",
    ]);
    expect(exportedMovementCount(workbook.getWorksheet("Movimientos"))).toBe(transactions.length);
    expect(workbook.getWorksheet("Configuración")?.getCell("A9").value).toBe("Filtro");
    expect(workbook.getWorksheet("Categorías")?.getCell("G9").value).toBe("Uso");
    expect(workbook.getWorksheet("Resumen")?.getCell("A4").value).toBe("Tu periodo, explicado");
  });
});
