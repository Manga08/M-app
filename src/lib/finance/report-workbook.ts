import type { Account, AccountEntity, Category, CreditCardInstallment, CreditCardProfile, CreditCardPurchasePlan, CreditCardStatement, DetailedFinanceReport, FinanceProfile, FinancialTarget, FinancialTargetDebtDetails, FinancialTargetEntry, LiabilityOverview, ReportQuery, Transaction } from "@/lib/finance/types";
import { creditCardStatementIsReconciled } from "@/lib/finance/credit-cards";
import { transactionReportingAmount } from "@/lib/finance/currency";
import { reportBudgetIsComparable, reportComparisonRange, reportDateMatchesQuery, reportPeriodLabel } from "@/lib/finance/report-query";
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
  creditCards?: CreditCardProfile[];
  creditCardStatements?: CreditCardStatement[];
  creditCardPurchasePlans?: CreditCardPurchasePlan[];
  creditCardInstallments?: CreditCardInstallment[];
  liabilityOverview?: LiabilityOverview;
}) {
  const period = reportPeriodLabel(input.query);
  const context = await createWorkbookContext(input.profile, `Reporte financiero · ${period}`, `Reporte financiero filtrado: ${period}`);
  const accountById = new Map(input.accounts.map((item) => [item.id, item]));
  const categoryById = new Map(input.categories.map((item) => [item.id, item]));
  const groupByKey = new Map(input.report.groups.map((item) => [item.group, item]));

  addSummarySheet(input, context, period);
  if (input.report.summary.income || input.report.summary.expense) addCashflowSheet(input, context);
  if (input.report.summary.expense > 0) addCategorySheet(input, context);
  if (input.report.summary.income > 0) addIncomeSheet(input, context);
  if (input.report.accounts.length) addAccountsSheet(input, context);
  if (input.creditCards?.some((card) => input.report.accounts.some((account) => account.id === card.accountId && (account.nativeOpeningBalance || account.nativeClosingBalance || account.nativeExpense || account.nativeTransferIn)))) addCreditCardsSheet(input, context);
  if (input.liabilityOverview?.items.some((item) => item.liability.kind !== "credit_card" && input.report.accounts.some((account) => account.id === item.accountId && (account.nativeOpeningBalance || account.nativeClosingBalance || account.nativeExpense || account.nativeTransferIn)))) addLiabilitiesSheet(input, context);
  if (input.report.summary.expense > 0) { addMerchantsSheet(input, context); addWeekdaysSheet(input, context); }
  if (input.report.targetActivity?.length) addTargetsSheet(input, context);
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

function addLiabilitiesSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Deudas");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Deudas", title: "Deudas en el periodo", subtitle: "Saldos históricos completos. Los gastos y transferencias recibidas respetan los filtros de actividad; no se mezclan cuotas futuras ni condiciones actuales.", columns: 8, accent: context.accent });
  const ids = new Set((input.liabilityOverview?.items ?? []).filter((item) => item.liability.kind !== "credit_card").map((item) => item.accountId));
  const rows = input.report.accounts.filter((account) => ids.has(account.id) && (account.nativeOpeningBalance || account.nativeClosingBalance || account.nativeExpense || account.nativeTransferIn)).map((account) => [account.entityName ?? "Sin entidad", account.name, account.currencyCode, Math.max(0, -account.nativeOpeningBalance), account.nativeExpense, account.nativeTransferIn, Math.max(0, -account.nativeClosingBalance), Math.max(0, -account.reportingClosingBalance)]);
  addTable(sheet, "DeudasMoneva", ["Entidad", "Deuda", "Moneda", "Deuda inicial nativa", "Gastos encontrados", "Pagos recibidos encontrados", "Deuda final nativa", "Deuda contable COP"], rows, context, [24, 30, 12, 24, 24, 28, 24, 24]);
  for (let column = 4; column <= 8; column += 1) sheet.getColumn(column).numFmt = '#,##0.00;[Red](#,##0.00);–';
}

type ReportWorkbookInput = Parameters<typeof createReportWorkbook>[0];

function addSummarySheet(input: ReportWorkbookInput, context: WorkbookContext, period: string) {
  const { workbook, accent, moneyFormat } = context;
  const sheet = workbook.addWorksheet("Resumen");
  configureSheet(sheet, { freezeRow: 7, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Reporte financiero", title: "Tu periodo, explicado", subtitle: period, detail: `Generado ${formatGeneratedAt(new Date(), input.profile.timezone)} · ${input.report.coverage === "complete" ? "Cobertura completa" : "Cobertura parcial"}`, columns: 4, accent });
  addMetricBand(sheet, 8, [
    { label: "Ingresos registrados", value: input.report.summary.income, format: moneyFormat, tone: "positive" },
    { label: "Gastos registrados", value: input.report.summary.expense, format: moneyFormat, tone: "negative" },
    { label: "Diferencia del periodo", value: input.report.summary.balance, format: moneyFormat, tone: input.report.summary.balance >= 0 ? "positive" : "negative" },
    { label: "Movimientos", value: input.report.summary.transactionCount, format: "0", tone: "neutral" },
  ], accent);
  let row = 13;
  const definitions = [
    ["Diferencia del periodo", "Ingresos menos gastos. No es saldo disponible ni ahorro depositado."],
    ["Saldos de cuentas", "Apertura + todos los movimientos hasta el cierre. Los filtros de actividad no modifican esos saldos."],
    ["Transferencias y crédito", "Transferir entre cuentas o pagar capital no crea otro gasto. Una compra con tarjeta se contabiliza una sola vez."],
    ["Moneda contable", `${input.report.reportingCurrencyCode}. Cada movimiento usa su tasa histórica guardada, nunca la TRM actual.`],
    ["Programados", "Solo registros ya publicados, con su fecha financiera; no se incluyen previsiones pendientes."],
    ["Gasto diario promedio", input.report.summary.averageDailyExpense],
  ];
  definitions.forEach((values) => { sheet.getRow(row++).values = values; });
  sheet.getCell(`B${row - 1}`).numFmt = moneyFormat;
  row += 1;
  if (input.report.summary.budget > 0 && reportBudgetIsComparable(input.query)) {
    addSectionLabel(sheet, row++, "Presupuestos mensuales completos (no prorrateados)", 4, accent);
    for (const values of [["Límites configurados", input.report.summary.budget], ["Gasto cubierto por límites", input.report.summary.budgetExpense ?? 0], ["Gasto sin presupuesto", input.report.summary.unbudgetedExpense ?? 0], ["Disponible dentro de los límites", input.report.summary.budgetVariance]]) {
      sheet.getRow(row).values = values; sheet.getCell(`B${row++}`).numFmt = moneyFormat;
    }
    row += 1;
  }
  if (input.report.comparison) {
    const range = reportComparisonRange(input.query);
    addSectionLabel(sheet, row++, `Comparación: ${range?.startDate} a ${range?.endDate}`, 4, accent);
    sheet.getRow(row).values = ["Indicador", "Periodo elegido", "Periodo comparado", "Diferencia"];
    styleTableHeader(sheet.getRow(row++), accent);
    for (const [name, current, previous] of [["Ingresos", input.report.summary.income, input.report.comparison.income], ["Gastos", input.report.summary.expense, input.report.comparison.expense], ["Diferencia del periodo", input.report.summary.balance, input.report.comparison.balance]] as const) {
      sheet.getRow(row).values = [name, current, previous, current - previous];
      [2, 3, 4].forEach((column) => { sheet.getRow(row).getCell(column).numFmt = moneyFormat; }); row++;
    }
  }
  setColumnWidths(sheet, [36, 55, 24, 24]);
  for (let index = 13; index <= 17; index++) sheet.mergeCells(index, 2, index, 4);
  sheet.getColumn(2).alignment = { vertical: "middle", wrapText: true };
  for (let index = 13; index < row; index++) sheet.getRow(index).height = 44;
}

function addCashflowSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Ingresos y gastos");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Evolución", title: "Ingresos y gastos", subtitle: "Ingresos menos gastos es la diferencia del periodo, no saldo disponible. Solo fechas seleccionadas.", columns: 4, accent: context.accent });
  const rows = input.report.series.map((point) => [new Date(`${point.period}T00:00:00Z`), point.income, point.expense, point.balance]);
  addTable(sheet, "FlujoCajaMoneva", ["Periodo", "Ingresos", "Gastos", "Diferencia"], rows, context, [18, 22, 22, 22]);
  sheet.getColumn(1).numFmt = input.report.granularity === "month" ? "[$-es-CO]mmm yyyy" : "[$-es-CO]dd mmm yyyy";
  [2, 3, 4].forEach((column) => { sheet.getColumn(column).numFmt = context.moneyFormat; });
}

function addCategorySheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const hasBudget = input.report.summary.budget > 0 && reportBudgetIsComparable(input.query);
  const sheet = context.workbook.addWorksheet("Categorías");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  const columns = ["Categoría principal", "Subcategoría", "Gastado", "% del gasto", "Movimientos", ...(hasBudget ? ["Límite mensual", "Gasto con límite", "Disponible con límite", "% del límite"] : [])];
  addDocumentHeader(sheet, { kicker: "Moneva · Gastos", title: "En qué gastaste", subtitle: hasBudget ? "Los límites mensuales no se prorratean. Los importes sin límite no representan incumplimiento." : "Participación en el gasto real; no requiere distribución ni presupuesto.", columns: columns.length, accent: context.accent });
  const rows = input.report.groups.flatMap((group) => group.categories.filter((item) => item.expense > 0 || (hasBudget && item.budget > 0)).map((item) => [
    group.name, item.name, item.expense, input.report.summary.expense > 0 ? item.expense / input.report.summary.expense : 0, item.transactionCount,
    ...(hasBudget ? [item.budget > 0 ? item.budget : null, item.budget > 0 ? item.budgetExpense ?? 0 : null, item.budget > 0 ? item.variance : null, item.budget > 0 ? item.usage / 100 : null] : []),
  ]));
  addTable(sheet, "CategoriasMoneva", columns, rows, context, [28, 29, 22, 18, 16, ...(hasBudget ? [24, 24, 25, 18] : [])]);
  sheet.getColumn(3).numFmt = context.moneyFormat;
  sheet.getColumn(4).numFmt = context.percentFormat;
  if (hasBudget) { [6, 7, 8].forEach((column) => { sheet.getColumn(column).numFmt = context.moneyFormat; }); sheet.getColumn(9).numFmt = context.percentFormat; }
}

function addIncomeSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Ingresos");
  configureSheet(sheet, { freezeRow: 9 });
  addDocumentHeader(sheet, { kicker: "Moneva · Entradas", title: "Tipos de ingreso", subtitle: "Origen y participación de los ingresos incluidos en el reporte.", columns: 4, accent: context.accent });
  const rows = input.report.incomeTypes.filter((item) => item.income > 0).map((item) => [item.name, item.income, item.percent / 100, item.transactionCount]);
  addTable(sheet, "IngresosMoneva", ["Tipo de ingreso", "Total", "Participación", "Movimientos"], rows, context, [32, 22, 18, 16]);
  sheet.getColumn(2).numFmt = context.moneyFormat;
  sheet.getColumn(3).numFmt = context.percentFormat;
}

function addAccountsSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Cuentas");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Patrimonio", title: "Saldos y actividad por cuenta", subtitle: `Apertura/cierre incluyen todo el libro; ingresos/gastos/transferencias son actividad filtrada. Los cierres abarcan meses intermedios cuando se eligen meses sueltos. Equivalente histórico en ${input.report.reportingCurrencyCode}.`, columns: 18, accent: context.accent });
  const rows = input.report.accounts.map((account) => [
    account.entityName ?? "Sin entidad", account.name, accountTypeLabel(account.type), account.archived ? "Archivada" : "Activa", account.currencyCode,
    account.nativeOpeningBalance, account.nativeIncome, account.nativeExpense, account.nativeTransferIn, account.nativeTransferOut, account.nativeNetFlow, account.nativeClosingBalance,
    input.report.reportingCurrencyCode, account.reportingOpeningBalance, account.reportingIncome, account.reportingExpense, account.reportingNetFlow, account.reportingClosingBalance,
  ]);
  addTable(sheet, "CuentasMoneva", ["Entidad", "Cuenta", "Tipo", "Estado", "Moneda nativa", "Apertura nativa", "Ingresos nativos", "Gastos nativos", "Transferencias recibidas", "Transferencias enviadas", "Flujo neto nativo", "Cierre nativo", "Moneda contable", "Apertura contable", "Ingresos contables", "Gastos contables", "Flujo neto contable", "Cierre contable"], rows, context, [26, 30, 20, 14, 16, 20, 20, 20, 24, 24, 20, 20, 18, 22, 22, 22, 22, 22]);
  for (let column = 6; column <= 12; column += 1) sheet.getColumn(column).numFmt = '#,##0.00;[Red](#,##0.00);–';
  for (let column = 14; column <= 18; column += 1) sheet.getColumn(column).numFmt = context.moneyFormat;
}

function addCreditCardsSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Tarjetas");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Crédito", title: "Tarjetas en el periodo", subtitle: "Deuda histórica completa; compras/pagos filtrados. Intereses y cargos son de extractos conciliados y no se suman otra vez. No se mezclan cupos actuales ni cuotas futuras.", columns: 11, accent: context.accent });
  const profiles = new Map((input.creditCards ?? []).map((card) => [card.accountId, card]));
  const includeStatements = !input.query.search && input.query.kind === "all" && !input.query.groupKeys.length && !input.query.categoryIds.length && !input.query.incomeTypeIds.length;
  const rows = input.report.accounts.flatMap((account) => {
    const card = profiles.get(account.id);
    if (!card || !(account.nativeOpeningBalance || account.nativeClosingBalance || account.nativeExpense || account.nativeTransferIn)) return [];
    const statements = includeStatements ? (input.creditCardStatements ?? []).filter((item) => item.accountId === account.id && reportDateMatchesQuery(item.cutoffOn, input.query) && creditCardStatementIsReconciled(item)) : [];
    return [[account.entityName ?? "Sin entidad", account.name, card.network.toUpperCase(), card.lastFour ? `•••• ${card.lastFour}` : null, account.currencyCode, Math.max(0, -account.nativeOpeningBalance), account.nativeExpense, account.nativeTransferIn, Math.max(0, -account.nativeClosingBalance), statements.length ? statements.reduce((sum, item) => sum + item.interest, 0) : null, statements.length ? statements.reduce((sum, item) => sum + item.fees, 0) : null]];
  });
  addTable(sheet, "TarjetasMoneva", ["Entidad", "Tarjeta", "Red", "Terminación", "Moneda", "Deuda inicial", "Gastos encontrados", "Pagos recibidos encontrados", "Deuda final", "Intereses conciliados", "Cargos conciliados"], rows, context, [24, 28, 16, 18, 12, 22, 22, 28, 22, 24, 24]);
  for (let column = 6; column <= 11; column++) sheet.getColumn(column).numFmt = '#,##0.00;[Red](#,##0.00);–';
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

function addTargetsSheet(input: ReportWorkbookInput, context: WorkbookContext) {
  const sheet = context.workbook.addWorksheet("Aportes a metas");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Metas", title: "Aportes y retiros del periodo", subtitle: "Actividad histórica filtrada, no saldo acumulado actual. Los ajustes manuales no crean ingresos ni gastos adicionales.", columns: 6, accent: context.accent });
  const rows = (input.report.targetActivity ?? []).map((item) => [item.name, item.advanced, item.reversed, item.manualNet, item.advanced - item.reversed + item.manualNet, item.transactionCount]);
  addTable(sheet, "MetasMoneva", ["Meta", "Aportes vinculados", "Retiros vinculados", "Ajuste manual neto", "Avance neto del periodo", "Movimientos"], rows, context, [32, 24, 24, 24, 28, 18]);
  [2, 3, 4, 5].forEach((column) => { sheet.getColumn(column).numFmt = context.moneyFormat; });
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
  addDocumentHeader(sheet, { kicker: "Moneva · Trazabilidad", title: "Configuración del reporte", subtitle: "Actividad con estos filtros; saldos de cuentas con historia completa entre apertura y cierre.", columns: 2, accent: context.accent });
  const rows = [
    ["Periodo", period],
    ["Desde", new Date(`${input.query.startDate}T00:00:00Z`)],
    ["Hasta", new Date(`${input.query.endDate}T00:00:00Z`)],
    ["Tipo de movimiento", kindFilterLabel(input.query.kind)],
    ["Comparación", reportComparisonRange(input.query) ? `${comparisonLabel(input.query.comparison)}: ${reportComparisonRange(input.query)!.startDate} a ${reportComparisonRange(input.query)!.endDate}` : "Sin comparación"],
    ["Meses seleccionados", input.query.selectedMonths.join(", ") || "Periodo continuo"],
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
