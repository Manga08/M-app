import type { Account, AccountEntity, Category, DetailedFinanceReport, FinanceProfile, FinancialTarget, FinancialTargetDebtDetails, FinancialTargetEntry, ReportQuery, Transaction } from "@/lib/finance/types";
import { financialTargetProgress, targetKindLabel, targetStatusLabel } from "@/lib/finance/financial-targets";
import { transactionReportingAmount } from "@/lib/finance/currency";
import { reportPeriodLabel } from "@/lib/finance/report-query";
import {
  WORKBOOK_COLORS,
  addDocumentHeader,
  addMetricBand,
  addSectionLabel,
  addTransactionsSheet,
  configureSheet,
  createWorkbookContext,
  formatGeneratedAt,
  setColumnWidths,
  styleDataRows,
  styleTableHeader,
  workbookBlob,
  type WorkbookContext,
} from "@/lib/finance/workbook-standard";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

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
  accountEntities?: AccountEntity[];
  categories: Category[];
  profile: FinanceProfile;
  financialTargets?: FinancialTarget[];
  financialTargetEntries?: FinancialTargetEntry[];
  financialTargetDebts?: FinancialTargetDebtDetails[];
}) {
  const period = reportPeriodLabel(input.query);
  const context = await createWorkbookContext(input.profile, `Reporte financiero · ${period}`, `Reporte financiero filtrado: ${period}`);
  const accountById = new Map(input.accounts.map((item) => [item.id, item]));
  const categoryById = new Map(input.categories.map((item) => [item.id, item]));
  const groupByKey = new Map(input.report.groups.map((item) => [item.group, item]));

  addSummarySheet(input, context, period);
  addCashflowSheet(input, context);
  addCategorySheet(input, context);
  addIncomeSheet(input, context);
  addAccountsSheet(input, context);
  addMerchantsSheet(input, context);
  addWeekdaysSheet(input, context);
  if (input.financialTargets?.some((item) => item.status !== "archived")) addTargetsSheet(input, context, accountById);
  addTransactionsSheet(context.workbook, {
    transactions: input.transactions,
    accounts: input.accounts,
    accountEntities: input.accountEntities,
    categories: input.categories,
    profile: input.profile,
    groups: input.report.groups.map(({ group, name }) => ({ group, name })),
    financialTargets: input.financialTargets,
  }, context);
  addFiltersSheet(input, context, period, accountById, categoryById, groupByKey);

  context.workbook.worksheets.forEach((sheet, index) => {
    sheet.properties.tabColor = { argb: `FF${index === 0 ? context.accent : WORKBOOK_COLORS.line}` };
  });
  return workbookBlob(context.workbook);
}

type ReportWorkbookInput = Parameters<typeof createReportWorkbook>[0];

function addSummarySheet(input: ReportWorkbookInput, context: WorkbookContext, period: string) {
  const { workbook, accent, moneyFormat, percentFormat } = context;
  const sheet = workbook.addWorksheet("Resumen");
  configureSheet(sheet, { freezeRow: 7, landscape: true });
  addDocumentHeader(sheet, {
    kicker: "Moneva · Reporte financiero",
    title: "Tu periodo, explicado",
    subtitle: period,
    detail: `Generado ${formatGeneratedAt(new Date(), input.profile.timezone)} · ${input.report.coverage === "complete" ? "Cobertura completa" : "Cobertura parcial"}`,
    columns: 4,
    accent,
  });
  addMetricBand(sheet, 8, [
    { label: "Ingresos", value: input.report.summary.income, format: moneyFormat, tone: "positive" },
    { label: "Gastos", value: input.report.summary.expense, format: moneyFormat, tone: "negative" },
    { label: "Balance", value: input.report.summary.balance, format: moneyFormat, tone: input.report.summary.balance >= 0 ? "positive" : "negative" },
    { label: "Movimientos", value: input.report.summary.transactionCount, format: "0", tone: "neutral" },
  ], accent);
  addMetricBand(sheet, 12, [
    { label: "Tasa de ahorro", value: input.report.summary.savingsRate / 100, format: percentFormat, tone: input.report.summary.savingsRate >= 0 ? "positive" : "negative" },
    { label: "Presupuesto", value: input.report.summary.budget, format: moneyFormat, tone: "neutral" },
    { label: "Uso del presupuesto", value: input.report.summary.budgetUsage / 100, format: percentFormat, tone: input.report.summary.budgetUsage <= 100 ? "positive" : "negative" },
    { label: "Gasto diario promedio", value: input.report.summary.averageDailyExpense, format: moneyFormat, tone: "neutral" },
  ], accent);

  let row = 16;
  if (input.report.comparison) {
    addSectionLabel(sheet, row, "Comparación seleccionada", 4, accent);
    row += 1;
    sheet.getRow(row).values = ["Indicador", "Periodo actual", "Periodo comparado", "Variación"];
    styleTableHeader(sheet.getRow(row), accent);
    const comparisonRows: Array<[string, number, number, string]> = [
      ["Ingresos", input.report.summary.income, input.report.comparison.income, moneyFormat],
      ["Gastos", input.report.summary.expense, input.report.comparison.expense, moneyFormat],
      ["Balance", input.report.summary.balance, input.report.comparison.balance, moneyFormat],
      ["Tasa de ahorro", input.report.summary.savingsRate / 100, input.report.comparison.savingsRate / 100, percentFormat],
      ["Movimientos", input.report.summary.transactionCount, input.report.comparison.transactionCount, "0"],
    ];
    comparisonRows.forEach(([label, current, previous, format]) => {
      const added = sheet.addRow([label, current, previous, current - previous]);
      [2, 3, 4].forEach((column) => { added.getCell(column).numFmt = format; });
    });
    styleDataRows(sheet, row + 1, row + comparisonRows.length);
    sheet.autoFilter = { from: `A${row}`, to: `D${row + comparisonRows.length}` };
    row += comparisonRows.length + 2;
  }

  addSectionLabel(sheet, row, "Categorías principales", 4, accent);
  row += 1;
  sheet.getRow(row).values = ["Categoría", "Gastado", "Presupuesto", "Disponible"];
  styleTableHeader(sheet.getRow(row), accent);
  input.report.groups.forEach((group) => {
    const added = sheet.addRow([group.name, group.expense, group.budget, group.variance]);
    [2, 3, 4].forEach((column) => { added.getCell(column).numFmt = moneyFormat; });
  });
  if (input.report.groups.length) styleDataRows(sheet, row + 1, row + input.report.groups.length);
  setColumnWidths(sheet, [30, 24, 24, 24]);
}

function addCashflowSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Flujo de caja");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Evolución", title: "Flujo de caja", subtitle: "Ingresos, gastos y balance por periodo dentro del filtro actual.", columns: 4, accent: context.accent });
  const rows = input.report.series.map((point) => [new Date(`${point.period}T00:00:00Z`), point.income, point.expense, point.balance]);
  addTable(sheet, "FlujoCajaMoneva", ["Periodo", "Ingresos", "Gastos", "Balance"], rows, context, [18, 22, 22, 22]);
  sheet.getColumn(1).numFmt = input.report.granularity === "month" ? "[$-es-CO]mmm yyyy" : "[$-es-CO]dd mmm yyyy";
  [2, 3, 4].forEach((column) => { sheet.getColumn(column).numFmt = context.moneyFormat; });
}

function addCategorySheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Categorías");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Presupuesto", title: "Categorías y subcategorías", subtitle: "Ejecución, presupuesto y diferencia para cada nivel del plan financiero.", columns: 9, accent: context.accent });
  const rows = input.report.groups.flatMap((group) => group.categories.map((category) => [
    group.name, category.name, group.targetPercent / 100, category.expense, category.budget, category.variance,
    category.usage / 100, category.transactionCount, group.includedInPlan ? "Sí" : "No",
  ]));
  addTable(sheet, "CategoriasMoneva", ["Categoría principal", "Subcategoría", "% objetivo principal", "Gastado", "Presupuesto", "Disponible", "Uso", "Movimientos", "Incluida en el plan"], rows, context, [28, 29, 22, 20, 20, 20, 15, 15, 20]);
  sheet.getColumn(3).numFmt = context.percentFormat;
  [4, 5, 6].forEach((column) => { sheet.getColumn(column).numFmt = context.moneyFormat; });
  sheet.getColumn(7).numFmt = context.percentFormat;
}

function addIncomeSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Ingresos");
  configureSheet(sheet, { freezeRow: 9 });
  addDocumentHeader(sheet, { kicker: "Moneva · Entradas", title: "Tipos de ingreso", subtitle: "Origen y participación de los ingresos incluidos en el reporte.", columns: 4, accent: context.accent });
  const rows = input.report.incomeTypes.map((item) => [item.name, item.income, item.percent / 100, item.transactionCount]);
  addTable(sheet, "IngresosMoneva", ["Tipo de ingreso", "Total", "Participación", "Movimientos"], rows, context, [32, 22, 18, 16]);
  sheet.getColumn(2).numFmt = context.moneyFormat;
  sheet.getColumn(3).numFmt = context.percentFormat;
}

function addAccountsSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Cuentas");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Patrimonio", title: "Flujo por cuenta", subtitle: `Cada cuenta conserva su moneda exacta; las columnas contables están expresadas en ${input.report.reportingCurrencyCode}.`, columns: 18, accent: context.accent });
  const rows = input.report.accounts.map((account) => [
    account.entityName ?? "Sin entidad", account.name, accountTypeLabel(account.type), account.archived ? "Archivada" : "Activa", account.currencyCode,
    account.nativeOpeningBalance, account.nativeIncome, account.nativeExpense, account.nativeTransferIn, account.nativeTransferOut, account.nativeNetFlow, account.nativeClosingBalance,
    input.report.reportingCurrencyCode, account.reportingOpeningBalance, account.reportingIncome, account.reportingExpense, account.reportingNetFlow, account.reportingClosingBalance,
  ]);
  addTable(sheet, "CuentasMoneva", ["Entidad", "Cuenta", "Tipo", "Estado", "Moneda nativa", "Apertura nativa", "Ingresos nativos", "Gastos nativos", "Transferencias recibidas", "Transferencias enviadas", "Flujo neto nativo", "Cierre nativo", "Moneda contable", "Apertura contable", "Ingresos contables", "Gastos contables", "Flujo neto contable", "Cierre contable"], rows, context, [26, 30, 20, 14, 16, 20, 20, 20, 24, 24, 20, 20, 18, 22, 22, 22, 22, 22]);
  for (let column = 6; column <= 12; column += 1) sheet.getColumn(column).numFmt = '#,##0.00;[Red](#,##0.00);–';
  for (let column = 14; column <= 18; column += 1) sheet.getColumn(column).numFmt = context.moneyFormat;
}

function addMerchantsSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Comercios");
  configureSheet(sheet, { freezeRow: 9 });
  addDocumentHeader(sheet, { kicker: "Moneva · Hábitos", title: "Gasto por comercio", subtitle: "Todos los comercios y descripciones de gasto encontrados en los movimientos exportados.", columns: 4, accent: context.accent });
  const merchantMap = new Map<string, { amount: number; count: number }>();
  input.transactions.filter((item) => item.kind === "expense").forEach((item) => {
    const name = item.merchant?.trim() || item.description;
    const current = merchantMap.get(name) ?? { amount: 0, count: 0 };
    merchantMap.set(name, { amount: current.amount + transactionReportingAmount(item), count: current.count + 1 });
  });
  const total = [...merchantMap.values()].reduce((sum, item) => sum + item.amount, 0);
  const rows = [...merchantMap].map(([name, item]) => [name, item.amount, total > 0 ? item.amount / total : 0, item.count]).sort((left, right) => Number(right[1]) - Number(left[1]));
  addTable(sheet, "ComerciosMoneva", ["Comercio", "Gastado", "Participación", "Movimientos"], rows, context, [38, 22, 18, 16]);
  sheet.getColumn(2).numFmt = context.moneyFormat;
  sheet.getColumn(3).numFmt = context.percentFormat;
}

function addWeekdaysSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Días de la semana");
  configureSheet(sheet, { freezeRow: 9 });
  addDocumentHeader(sheet, { kicker: "Moneva · Ritmo", title: "Gasto por día de la semana", subtitle: "Patrón semanal de los gastos incluidos en el periodo.", columns: 3, accent: context.accent });
  const rows = input.report.weekdays.map((item) => [WEEKDAYS[item.weekday - 1] ?? `Día ${item.weekday}`, item.expense, item.transactionCount]);
  addTable(sheet, "DiasSemanaMoneva", ["Día", "Gastado", "Movimientos"], rows, context, [24, 22, 18]);
  sheet.getColumn(2).numFmt = context.moneyFormat;
}

function addTargetsSheet(input: ReportWorkbookInput, context: WorkbookContext, accountById: Map<string, Account>) {
  const sheet = context.workbook.addWorksheet("Metas y deudas");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Rumbo financiero", title: "Metas y deudas", subtitle: "Estado y avance vinculados a los movimientos del alcance exportado.", columns: 12, accent: context.accent });
  const rows = (input.financialTargets ?? []).filter((item) => item.status !== "archived").map((target) => {
    const progress = financialTargetProgress(target, input.financialTargetEntries ?? [], input.transactions);
    const debt = input.financialTargetDebts?.find((item) => item.targetId === target.id);
    return [
      target.title, targetKindLabel(target.kind), targetStatusLabel(target.status), target.targetAmount, progress.rawProgress,
      progress.remaining, progress.percent / 100, target.targetDate ? new Date(`${target.targetDate}T00:00:00Z`) : null,
      target.accountId ? accountById.get(target.accountId)?.name ?? null : null, debt?.creditor ?? null, debt?.annualInterestRate ? debt.annualInterestRate / 100 : null, debt?.minimumPayment ?? null,
    ];
  });
  addTable(sheet, "MetasMoneva", ["Nombre", "Tipo", "Estado", "Objetivo", "Avance", "Pendiente", "%", "Fecha objetivo", "Cuenta", "Acreedor", "Interés anual", "Pago mínimo"], rows, context, [32, 20, 17, 20, 20, 20, 12, 18, 25, 25, 18, 20]);
  [4, 5, 6, 12].forEach((column) => { sheet.getColumn(column).numFmt = context.moneyFormat; });
  sheet.getColumn(7).numFmt = context.percentFormat;
  sheet.getColumn(8).numFmt = "[$-es-CO]dd mmm yyyy";
  sheet.getColumn(11).numFmt = context.percentFormat;
}

function addFiltersSheet(
  input: ReportWorkbookInput,
  context: WorkbookContext,
  period: string,
  accountById: Map<string, Account>,
  categoryById: Map<string, Category>,
  groupByKey: Map<string, DetailedFinanceReport["groups"][number]>,
) {
  const sheet = context.workbook.addWorksheet("Configuración");
  configureSheet(sheet, { freezeRow: 9 });
  addDocumentHeader(sheet, { kicker: "Moneva · Trazabilidad", title: "Configuración del reporte", subtitle: "Los filtros que determinan cada cifra y cada fila de este libro.", columns: 2, accent: context.accent });
  const rows = [
    ["Periodo", period],
    ["Desde", new Date(`${input.query.startDate}T00:00:00Z`)],
    ["Hasta", new Date(`${input.query.endDate}T00:00:00Z`)],
    ["Tipo de movimiento", kindFilterLabel(input.query.kind)],
    ["Comparación", comparisonLabel(input.query.comparison)],
    ["Granularidad", granularityLabel(input.query.granularity)],
    ["Categorías principales", input.query.groupKeys.map((key) => groupByKey.get(key)?.name ?? key).join(", ") || "Todas"],
    ["Subcategorías", input.query.categoryIds.map((id) => categoryById.get(id)?.name ?? id).join(", ") || "Todas"],
    ["Tipos de ingreso", input.query.incomeTypeIds.map((id) => categoryById.get(id)?.name ?? id).join(", ") || "Todos"],
    ["Cuentas", input.query.accountIds.map((id) => accountById.get(id)?.name ?? id).join(", ") || "Todas"],
    ["Búsqueda", input.query.search || "Sin búsqueda"],
    ["Cobertura", input.report.coverage === "complete" ? "Completa" : "Parcial"],
    ["Fuente", input.report.source === "remote" ? "Base sincronizada" : "Copia local"],
    ["Moneda", input.profile.currencyCode],
    ["Zona horaria", input.profile.timezone],
  ];
  addTable(sheet, "ConfiguracionReporte", ["Filtro", "Valor"], rows, context, [30, 88]);
  sheet.getCell("B10").numFmt = "[$-es-CO]dd mmm yyyy";
  sheet.getCell("B11").numFmt = "[$-es-CO]dd mmm yyyy";
  sheet.getColumn(2).alignment = { vertical: "middle", wrapText: true };
}

function addTable(sheet: import("exceljs").Worksheet, name: string, columns: string[], rows: Array<Array<string | number | Date | null>>, context: WorkbookContext, widths: number[]) {
  sheet.addTable({
    name,
    ref: "A9",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleLight1", showRowStripes: false },
    columns: columns.map((column) => ({ name: column })),
    rows,
  });
  styleTableHeader(sheet.getRow(9), context.accent);
  if (rows.length) styleDataRows(sheet, 10, 9 + rows.length);
  setColumnWidths(sheet, widths);
  sheet.pageSetup.printTitlesRow = "9:9";
}

function accountTypeLabel(type: Account["type"]) {
  return ({ checking: "Cuenta corriente", savings: "Ahorros", cash: "Efectivo", credit: "Crédito", investment: "Inversión" } as const)[type];
}

function kindFilterLabel(kind: ReportQuery["kind"]) {
  return ({ all: "Todos", income: "Ingresos", expense: "Gastos", transfer: "Transferencias" } as const)[kind];
}

function comparisonLabel(comparison: ReportQuery["comparison"]) {
  return ({ none: "Sin comparación", previous: "Periodo anterior", year: "Mismo periodo del año anterior" } as const)[comparison];
}

function granularityLabel(granularity: ReportQuery["granularity"]) {
  return ({ day: "Día", week: "Semana", month: "Mes" } as const)[granularity];
}
