import type { Account, Category, DetailedFinanceReport, FinanceProfile, FinancialTarget, FinancialTargetDebtDetails, FinancialTargetEntry, ReportQuery, Transaction } from "@/lib/finance/types";
import { financialTargetProgress, targetKindLabel, targetStatusLabel } from "@/lib/finance/financial-targets";
import { reportPeriodLabel } from "@/lib/finance/report-query";

const PALETTE: Record<FinanceProfile["colorTheme"], string> = {
  moneva: "E13C4B",
  crimson: "B4233C",
  ocean: "176B87",
  violet: "7557B7",
  amber: "9A5B05",
};

const KIND_LABEL: Record<Transaction["kind"], string> = { income: "Ingreso", expense: "Gasto", transfer_out: "Transferencia", transfer_in: "Transferencia recibida" };

export function reportWorkbookFilename(query: ReportQuery) {
  const monthFormatter = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
  const compactDate = (date: Date) => {
    const parts = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("day")} ${value("month")} ${value("year")}`;
  };
  const start = new Date(`${query.startDate}T00:00:00Z`);
  const end = new Date(`${query.endDate}T00:00:00Z`);
  const sameWholeMonth = query.startDate.endsWith("-01") && query.endDate === new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const period = sameWholeMonth && query.startDate.slice(0, 7) === query.endDate.slice(0, 7)
    ? monthFormatter.format(start)
    : `${compactDate(start)} a ${compactDate(end)}`;
  return `Moneva - Reporte - ${period.replace(/[\\/:*?"<>|]/g, "-")}.xlsx`;
}

export async function createReportWorkbook(input: {
  report: DetailedFinanceReport;
  query: ReportQuery;
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  profile: FinanceProfile;
  financialTargets?: FinancialTarget[];
  financialTargetEntries?: FinancialTargetEntry[];
  financialTargetDebts?: FinancialTargetDebtDetails[];
}) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Moneva";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = `Reporte financiero: ${reportPeriodLabel(input.query)}`;
  workbook.title = "Reporte financiero de Moneva";
  const accent = PALETTE[input.profile.colorTheme] ?? PALETTE.moneva;
  const moneyFormat = input.profile.currencyCode === "COP" ? '[$$-es-CO] #,##0;[Red]-[$$-es-CO] #,##0' : `[$${input.profile.currencyCode}] #,##0.00;[Red]-[$${input.profile.currencyCode}] #,##0.00`;
  const percentFormat = "0.0%;[Red]-0.0%";
  const accountById = new Map(input.accounts.map((item) => [item.id, item]));
  const categoryById = new Map(input.categories.map((item) => [item.id, item]));
  const groupByKey = new Map(input.report.groups.map((item) => [item.group, item]));
  const targetById = new Map((input.financialTargets ?? []).map((item) => [item.id, item]));

  const summary = workbook.addWorksheet("Resumen", { views: [{ state: "frozen", ySplit: 4 }] });
  summary.mergeCells("A1:F1");
  summary.getCell("A1").value = "Moneva · Reporte financiero";
  summary.getCell("A1").font = { bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  summary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${accent}` } };
  summary.getCell("A2").value = "Periodo";
  summary.getCell("B2").value = reportPeriodLabel(input.query);
  summary.getCell("A3").value = "Generado";
  summary.getCell("B3").value = new Date();
  summary.getCell("B3").numFmt = "dd mmm yyyy, hh:mm";
  summary.addRows([
    ["Indicador", "Valor", "Lectura"],
    ["Ingresos", input.report.summary.income, "Entradas registradas"],
    ["Gastos", input.report.summary.expense, "Salidas registradas"],
    ["Balance", input.report.summary.balance, input.report.summary.balance >= 0 ? "Disponible" : "Déficit"],
    ["Tasa de ahorro", input.report.summary.savingsRate / 100, "Balance / ingresos"],
    ["Presupuesto", input.report.summary.budget, "Límites asignados"],
    ["Variación del presupuesto", input.report.summary.budgetVariance, input.report.summary.budgetVariance >= 0 ? "Por debajo del límite" : "Sobre el límite"],
    ["Movimientos", input.report.summary.transactionCount, "Sin duplicar transferencias"],
  ]);
  styleHeader(summary.getRow(4), accent);
  for (let row = 5; row <= 11; row += 1) summary.getCell(`B${row}`).numFmt = row === 8 ? percentFormat : moneyFormat;
  summary.getCell("B11").numFmt = "0";
  summary.addRow([]);
  const categoryHeader = summary.addRow(["Categoría principal", "Subcategoría", "Gastado", "Presupuesto", "Diferencia", "Uso"]);
  styleHeader(categoryHeader, accent);
  for (const group of input.report.groups) {
    for (const category of group.categories) {
      const row = summary.addRow([group.name, category.name, category.expense, category.budget, category.variance, category.usage / 100]);
      row.getCell(3).numFmt = moneyFormat;
      row.getCell(4).numFmt = moneyFormat;
      row.getCell(5).numFmt = moneyFormat;
      row.getCell(6).numFmt = percentFormat;
    }
  }
  summary.autoFilter = { from: { row: categoryHeader.number, column: 1 }, to: { row: Math.max(categoryHeader.number, summary.rowCount), column: 6 } };
  setWidths(summary, [24, 28, 18, 18, 18, 14]);

  const movements = workbook.addWorksheet("Movimientos", { views: [{ state: "frozen", ySplit: 1 }] });
  movements.addTable({
    name: "MovimientosMoneva",
    ref: "A1",
    headerRow: true,
    totalsRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: [
      { name: "Fecha" }, { name: "Tipo" }, { name: "Descripción" }, { name: "Comercio" },
      { name: "Categoría principal" }, { name: "Subcategoría" }, { name: "Cuenta" },
      { name: "Monto", totalsRowFunction: "sum" }, { name: "Meta o deuda" }, { name: "Notas" },
    ],
    rows: input.transactions.map((transaction) => {
      const category = transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined;
      return [
        new Date(`${transaction.occurredOn}T00:00:00Z`),
        KIND_LABEL[transaction.kind], transaction.description, transaction.merchant ?? "",
        category ? groupByKey.get(category.group)?.name ?? category.group : "",
        category?.name ?? "", accountById.get(transaction.accountId)?.name ?? "", transaction.amount,
        transaction.financialTargetId ? targetById.get(transaction.financialTargetId)?.title ?? "" : "", transaction.note ?? "",
      ];
    }),
  });
  movements.getColumn(1).numFmt = "dd mmm yyyy";
  movements.getColumn(8).numFmt = moneyFormat;
  setWidths(movements, [15, 18, 34, 24, 24, 24, 22, 18, 28, 36]);

  const cashflow = workbook.addWorksheet("Flujo de caja", { views: [{ state: "frozen", ySplit: 1 }] });
  const cashflowHeader = cashflow.addRow(["Periodo", "Ingresos", "Gastos", "Balance"]);
  styleHeader(cashflowHeader, accent);
  for (const point of input.report.series) {
    const row = cashflow.addRow([new Date(`${point.period}T00:00:00Z`), point.income, point.expense, point.balance]);
    row.getCell(1).numFmt = input.report.granularity === "month" ? "mmm yyyy" : "dd mmm yyyy";
    for (let column = 2; column <= 4; column += 1) row.getCell(column).numFmt = moneyFormat;
  }
  cashflow.autoFilter = `A1:D${Math.max(1, cashflow.rowCount)}`;
  setWidths(cashflow, [18, 20, 20, 20]);

  const income = workbook.addWorksheet("Ingresos");
  const incomeHeader = income.addRow(["Tipo de ingreso", "Total", "Participación", "Movimientos"]);
  styleHeader(incomeHeader, accent);
  for (const item of input.report.incomeTypes) {
    const row = income.addRow([item.name, item.income, item.percent / 100, item.transactionCount]);
    row.getCell(2).numFmt = moneyFormat;
    row.getCell(3).numFmt = percentFormat;
  }
  setWidths(income, [30, 20, 18, 16]);

  const accounts = workbook.addWorksheet("Cuentas");
  const accountsHeader = accounts.addRow(["Cuenta", "Tipo", "Saldo inicial", "Ingresos", "Gastos", "Transferencias netas", "Flujo neto", "Saldo final"]);
  styleHeader(accountsHeader, accent);
  for (const account of input.report.accounts) {
    const row = accounts.addRow([account.name, account.type, account.openingBalance, account.income, account.expense, account.transferIn - account.transferOut, account.netFlow, account.closingBalance]);
    for (let column = 3; column <= 8; column += 1) row.getCell(column).numFmt = moneyFormat;
  }
  setWidths(accounts, [28, 18, 20, 20, 20, 22, 20, 20]);

  if (input.financialTargets?.length) {
    const targets = workbook.addWorksheet("Metas y deudas", { views: [{ state: "frozen", ySplit: 1 }] });
    const targetsHeader = targets.addRow(["Nombre", "Tipo", "Estado", "Objetivo", "Avance", "Pendiente", "%", "Fecha objetivo", "Cuenta", "Acreedor", "Pago mínimo"]);
    styleHeader(targetsHeader, accent);
    for (const target of input.financialTargets.filter((item) => item.status !== "archived")) {
      const progress = financialTargetProgress(target, input.financialTargetEntries ?? [], input.transactions);
      const debt = input.financialTargetDebts?.find((item) => item.targetId === target.id);
      const row = targets.addRow([
        target.title, targetKindLabel(target.kind), targetStatusLabel(target.status), target.targetAmount,
        progress.rawProgress, progress.remaining, progress.percent / 100,
        target.targetDate ? new Date(`${target.targetDate}T00:00:00Z`) : "",
        target.accountId ? accountById.get(target.accountId)?.name ?? "" : "", debt?.creditor ?? "", debt?.minimumPayment ?? "",
      ]);
      [4, 5, 6, 11].forEach((column) => { row.getCell(column).numFmt = moneyFormat; });
      row.getCell(7).numFmt = percentFormat;
      row.getCell(8).numFmt = "dd mmm yyyy";
    }
    targets.autoFilter = `A1:K${Math.max(1, targets.rowCount)}`;
    setWidths(targets, [30, 20, 16, 20, 20, 20, 12, 18, 24, 24, 18]);
  }

  const filters = workbook.addWorksheet("Filtros");
  filters.addRows([
    ["Filtro", "Valor"],
    ["Periodo", reportPeriodLabel(input.query)],
    ["Tipo", input.query.kind],
    ["Comparación", input.query.comparison],
    ["Categorías principales", input.query.groupKeys.map((key) => groupByKey.get(key)?.name ?? key).join(", ") || "Todas"],
    ["Subcategorías", input.query.categoryIds.map((id) => categoryById.get(id)?.name ?? id).join(", ") || "Todas"],
    ["Tipos de ingreso", input.query.incomeTypeIds.map((id) => categoryById.get(id)?.name ?? id).join(", ") || "Todos"],
    ["Cuentas", input.query.accountIds.map((id) => accountById.get(id)?.name ?? id).join(", ") || "Todas"],
    ["Búsqueda", input.query.search || "Sin búsqueda"],
  ]);
  styleHeader(filters.getRow(1), accent);
  setWidths(filters, [28, 80]);

  workbook.eachSheet((sheet) => {
    sheet.properties.defaultRowHeight = 20;
    sheet.eachRow((row) => { row.alignment = { vertical: "middle", wrapText: false }; });
    sheet.getRow(1).height = Math.max(sheet.getRow(1).height ?? 20, 26);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function styleHeader(row: import("exceljs").Row, accent: string) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${accent}` } };
  row.alignment = { vertical: "middle" };
  row.height = 24;
}

function setWidths(sheet: import("exceljs").Worksheet, widths: number[]) {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}
