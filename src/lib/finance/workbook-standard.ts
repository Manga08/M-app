import { accessibleAccentOnWhite } from "@/lib/custom-theme";
import type { Account, Category, FinanceProfile, FinancialTarget, GroupAllocation, Transaction } from "@/lib/finance/types";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ACCENTS: Record<FinanceProfile["colorTheme"], string> = {
  moneva: "1F765B",
  crimson: "A82A40",
  ocean: "176B87",
  violet: "6D4DB0",
  amber: "8B5608",
  custom: "5B6EF5",
};

export const WORKBOOK_COLORS = {
  ink: "18221D",
  muted: "667169",
  paper: "FBFAF6",
  surface: "F1F3EE",
  line: "D7DDD8",
  white: "FFFFFF",
  positive: "087A4B",
  negative: "C72C41",
  warning: "9A6107",
};

export type WorkbookContext = {
  workbook: import("exceljs").Workbook;
  accent: string;
  moneyFormat: string;
  percentFormat: string;
};

export type TransactionWorkbookInput = {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  profile: FinanceProfile;
  groups?: Array<Pick<GroupAllocation, "group" | "name">>;
  financialTargets?: Array<Pick<FinancialTarget, "id" | "title">>;
  title: string;
  periodLabel: string;
  scopeLabel: string;
  filterSummary?: string;
};

export async function createWorkbookContext(profile: FinanceProfile, title: string, subject: string): Promise<WorkbookContext> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Moneva";
  workbook.company = "Moneva";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.lastPrinted = new Date();
  workbook.title = title;
  workbook.subject = subject;
  workbook.description = "Libro financiero generado por Moneva. Los importes son valores numéricos editables y las hojas de datos incluyen filtros.";
  workbook.keywords = "Moneva, finanzas personales, movimientos, reporte";

  return {
    workbook,
    accent: workbookAccent(profile),
    moneyFormat: workbookMoneyFormat(profile.currencyCode),
    percentFormat: "0.0%;[Red](0.0%);–",
  };
}

export function workbookAccent(profile: FinanceProfile) {
  return profile.colorTheme === "custom"
    ? accessibleAccentOnWhite(profile.customThemeColor).replace("#", "").toUpperCase()
    : ACCENTS[profile.colorTheme] ?? ACCENTS.moneva;
}

export function workbookMoneyFormat(currencyCode: string) {
  if (currencyCode === "COP") return '[$$-es-CO] #,##0;[Red]([$$-es-CO] #,##0);–';
  return `[$${currencyCode}] #,##0.00;[Red]([$${currencyCode}] #,##0.00);–`;
}

export function addDocumentHeader(sheet: import("exceljs").Worksheet, input: {
  kicker: string;
  title: string;
  subtitle: string;
  detail?: string;
  columns: number;
  accent: string;
}) {
  const end = columnLetter(input.columns);
  sheet.mergeCells(`A1:${end}1`);
  sheet.getCell("A1").fill = solid(input.accent);
  sheet.getRow(1).height = 8;

  sheet.mergeCells(`A3:${end}3`);
  sheet.getCell("A3").value = input.kicker.toLocaleUpperCase("es");
  sheet.getCell("A3").font = { name: "Aptos", bold: true, size: 10, color: argb(input.accent) };
  sheet.getCell("A3").alignment = { vertical: "middle" };

  sheet.mergeCells(`A4:${end}4`);
  sheet.getCell("A4").value = input.title;
  sheet.getCell("A4").font = { name: "Aptos Display", bold: true, size: 22, color: argb(WORKBOOK_COLORS.ink) };
  sheet.getRow(4).height = 31;

  sheet.mergeCells(`A5:${end}5`);
  sheet.getCell("A5").value = input.subtitle;
  sheet.getCell("A5").font = { name: "Aptos", size: 11, color: argb(WORKBOOK_COLORS.muted) };
  sheet.getCell("A5").alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(5).height = 23;

  if (input.detail) {
    sheet.mergeCells(`A6:${end}6`);
    sheet.getCell("A6").value = input.detail;
    sheet.getCell("A6").font = { name: "Aptos", italic: true, size: 9, color: argb(WORKBOOK_COLORS.muted) };
  }
  sheet.getRow(7).height = 8;
}

export function addMetricBand(sheet: import("exceljs").Worksheet, startRow: number, metrics: Array<{
  label: string;
  value: string | number;
  format?: string;
  tone?: "positive" | "negative" | "neutral";
}>, accent: string) {
  metrics.forEach((metric, index) => {
    const column = index + 1;
    const label = sheet.getCell(startRow, column);
    const value = sheet.getCell(startRow + 1, column);
    label.value = metric.label;
    label.font = { name: "Aptos", bold: true, size: 9, color: argb(WORKBOOK_COLORS.muted) };
    label.fill = solid(WORKBOOK_COLORS.surface);
    label.alignment = { vertical: "middle" };
    value.value = metric.value;
    value.numFmt = metric.format ?? "General";
    value.font = {
      name: "Aptos Display",
      bold: true,
      size: 15,
      color: argb(metric.tone === "positive" ? WORKBOOK_COLORS.positive : metric.tone === "negative" ? WORKBOOK_COLORS.negative : WORKBOOK_COLORS.ink),
    };
    value.fill = solid(WORKBOOK_COLORS.surface);
    value.alignment = { vertical: "middle" };
    value.border = { bottom: { style: "medium", color: argb(index === 0 ? accent : WORKBOOK_COLORS.line) } };
  });
  sheet.getRow(startRow).height = 22;
  sheet.getRow(startRow + 1).height = 29;
}

export function addSectionLabel(sheet: import("exceljs").Worksheet, rowNumber: number, title: string, columns: number, accent: string) {
  const end = columnLetter(columns);
  sheet.mergeCells(`A${rowNumber}:${end}${rowNumber}`);
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = title;
  cell.font = { name: "Aptos", bold: true, size: 10, color: argb(accent) };
  cell.alignment = { vertical: "middle" };
  cell.border = { bottom: { style: "thin", color: argb(WORKBOOK_COLORS.line) } };
  sheet.getRow(rowNumber).height = 25;
}

export function styleTableHeader(row: import("exceljs").Row, accent: string) {
  const cellCount = Math.max(1, row.actualCellCount);
  for (let column = 1; column <= cellCount; column += 1) {
    const cell = row.getCell(column);
    cell.font = { name: "Aptos", bold: true, size: 10, color: argb(WORKBOOK_COLORS.white) };
    cell.fill = solid(accent);
    cell.alignment = { vertical: "middle", wrapText: true };
  }
  row.height = 27;
}

export function styleDataRows(sheet: import("exceljs").Worksheet, fromRow: number, toRow = sheet.rowCount) {
  for (let rowNumber = fromRow; rowNumber <= toRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = Math.max(row.height ?? 0, 22);
    const cellCount = Math.max(1, row.actualCellCount, sheet.columnCount);
    for (let column = 1; column <= cellCount; column += 1) {
      const cell = row.getCell(column);
      cell.font = { name: "Aptos", size: 10, color: argb(WORKBOOK_COLORS.ink) };
      cell.alignment = { vertical: "middle", wrapText: false };
      if ((rowNumber - fromRow) % 2 === 1) cell.fill = solid(WORKBOOK_COLORS.paper);
      cell.border = { bottom: { style: "hair", color: argb(WORKBOOK_COLORS.line) } };
    }
  }
}

export function setColumnWidths(sheet: import("exceljs").Worksheet, widths: number[]) {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

export function configureSheet(sheet: import("exceljs").Worksheet, options: { freezeRow?: number; landscape?: boolean } = {}) {
  sheet.views = [{ state: "frozen", ySplit: options.freezeRow ?? 0, showGridLines: false }];
  sheet.properties.defaultRowHeight = 21;
  sheet.pageSetup = {
    orientation: options.landscape ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter.oddFooter = "&LMoneva&C&P de &N&RGenerado &D";
}

export async function workbookBlob(workbook: import("exceljs").Workbook) {
  workbook.calcProperties.fullCalcOnLoad = true;
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

export async function createTransactionWorkbook(input: TransactionWorkbookInput) {
  const context = await createWorkbookContext(input.profile, input.title, `${input.scopeLabel}: ${input.periodLabel}`);
  const { workbook, accent, moneyFormat } = context;
  const summary = workbook.addWorksheet("Resumen");
  configureSheet(summary, { freezeRow: 7 });
  addDocumentHeader(summary, {
    kicker: "Moneva · Libro de movimientos",
    title: input.title,
    subtitle: input.periodLabel,
    detail: `Generado ${formatGeneratedAt(new Date(), input.profile.timezone)} · ${input.scopeLabel}`,
    columns: 4,
    accent,
  });

  const totals = transactionTotals(input.transactions);
  addMetricBand(summary, 8, [
    { label: "Ingresos", value: totals.income, format: moneyFormat, tone: "positive" },
    { label: "Gastos", value: totals.expense, format: moneyFormat, tone: "negative" },
    { label: "Balance operativo", value: totals.balance, format: moneyFormat, tone: totals.balance >= 0 ? "positive" : "negative" },
    { label: "Movimientos", value: input.transactions.length, format: "0", tone: "neutral" },
  ], accent);
  addSectionLabel(summary, 12, "Alcance de la exportación", 4, accent);
  summary.addRows([
    ["Periodo", input.periodLabel, "Moneda", input.profile.currencyCode],
    ["Contenido", input.scopeLabel, "Cobertura", `${input.transactions.length} registros`],
    ["Filtros", input.filterSummary || "Sin filtros adicionales", "Zona horaria", input.profile.timezone],
  ]);
  styleDataRows(summary, 13, 15);
  for (let row = 13; row <= 15; row += 1) {
    [1, 3].forEach((column) => { summary.getCell(row, column).font = { name: "Aptos", bold: true, color: argb(WORKBOOK_COLORS.muted) }; });
  }
  addSectionLabel(summary, 17, "Distribución por tipo", 4, accent);
  const typeHeader = summary.getRow(18);
  typeHeader.values = ["Tipo", "Registros", "Monto", "Lectura"];
  styleTableHeader(typeHeader, accent);
  const typeRows = [
    ["Ingresos", totals.incomeCount, totals.income, "Entradas"],
    ["Gastos", totals.expenseCount, totals.expense, "Salidas"],
    ["Transferencias", totals.transferCount, totals.transferVolume, "Movimiento entre cuentas"],
  ];
  summary.addRows(typeRows);
  summary.getColumn(3).numFmt = moneyFormat;
  styleDataRows(summary, 19, 21);
  summary.autoFilter = { from: "A18", to: "D21" };
  setColumnWidths(summary, [24, 28, 24, 38]);

  addTransactionsSheet(workbook, input, context);
  addAccountSummarySheet(workbook, input, context);
  addCategorySummarySheet(workbook, input, context);

  return workbookBlob(workbook);
}

export function addTransactionsSheet(workbook: import("exceljs").Workbook, input: Omit<TransactionWorkbookInput, "title" | "periodLabel" | "scopeLabel"> & { transactions: Transaction[] }, context: WorkbookContext, sheetName = "Movimientos") {
  const sheet = workbook.addWorksheet(sheetName);
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, {
    kicker: "Moneva · Datos trazables",
    title: sheetName,
    subtitle: "Una fila por registro. Los importes conservan su tipo numérico para ordenar, filtrar y calcular.",
    columns: 17,
    accent: context.accent,
  });
  const tableRow = 9;
  const maps = transactionMaps(input);
  const rows = input.transactions.map((transaction) => transactionRow(transaction, maps));
  const columns = [
    "Fecha", "Tipo", "Descripción", "Comercio", "Categoría principal", "Subcategoría", "Cuenta", "Cuenta relacionada",
    "Monto", "Impacto en saldo", "Moneda", "Meta o deuda", "Efecto en meta", "Notas", "Estado", "Creado", "Id del movimiento",
  ];
  sheet.addTable({
    name: uniqueTableName(workbook, "MovimientosMoneva"),
    ref: `A${tableRow}`,
    headerRow: true,
    totalsRow: rows.length > 0,
    style: { theme: "TableStyleLight1", showRowStripes: false },
    columns: columns.map((name) => ({ name, ...(name === "Impacto en saldo" ? { totalsRowFunction: "sum" as const } : {}) })),
    rows,
  });
  styleTableHeader(sheet.getRow(tableRow), context.accent);
  styleDataRows(sheet, tableRow + 1, tableRow + Math.max(rows.length, 1));
  sheet.getColumn(1).numFmt = "[$-es-CO]dd mmm yyyy";
  sheet.getColumn(9).numFmt = context.moneyFormat;
  sheet.getColumn(10).numFmt = context.moneyFormat;
  sheet.getColumn(16).numFmt = "[$-es-CO]dd mmm yyyy, hh:mm";
  sheet.getColumn(3).alignment = { vertical: "middle", wrapText: true };
  sheet.getColumn(14).alignment = { vertical: "middle", wrapText: true };
  setColumnWidths(sheet, [15, 22, 34, 24, 24, 24, 24, 24, 18, 19, 12, 27, 18, 38, 16, 21, 40]);
  sheet.pageSetup.printTitlesRow = `${tableRow}:${tableRow}`;
  return sheet;
}

function addAccountSummarySheet(workbook: import("exceljs").Workbook, input: TransactionWorkbookInput, context: WorkbookContext) {
  const sheet = workbook.addWorksheet("Por cuenta");
  configureSheet(sheet, { freezeRow: 9, landscape: true });
  addDocumentHeader(sheet, { kicker: "Moneva · Patrimonio", title: "Flujo por cuenta", subtitle: "Entradas, salidas y transferencias dentro del alcance exportado.", columns: 8, accent: context.accent });
  const rows = input.accounts.map((account) => {
    const records = input.transactions.filter((item) => item.accountId === account.id);
    const income = records.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const expense = records.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    const transferIn = records.filter((item) => item.kind === "transfer_in").reduce((sum, item) => sum + item.amount, 0);
    const transferOut = records.filter((item) => item.kind === "transfer_out").reduce((sum, item) => sum + item.amount, 0);
    return [account.name, accountTypeLabel(account.type), records.length, income, expense, transferIn, transferOut, income + transferIn - expense - transferOut];
  }).filter((row) => Number(row[2]) > 0);
  sheet.addTable({
    name: uniqueTableName(workbook, "FlujoPorCuenta"), ref: "A9", headerRow: true, totalsRow: rows.length > 0,
    style: { theme: "TableStyleLight1", showRowStripes: false },
    columns: ["Cuenta", "Tipo", "Movimientos", "Ingresos", "Gastos", "Transferencias recibidas", "Transferencias enviadas", "Flujo neto"].map((name) => ({ name, ...(name === "Flujo neto" ? { totalsRowFunction: "sum" as const } : {}) })),
    rows,
  });
  styleTableHeader(sheet.getRow(9), context.accent);
  styleDataRows(sheet, 10, 9 + Math.max(rows.length, 1));
  for (let column = 4; column <= 8; column += 1) sheet.getColumn(column).numFmt = context.moneyFormat;
  setColumnWidths(sheet, [28, 20, 15, 20, 20, 24, 24, 20]);
}

function addCategorySummarySheet(workbook: import("exceljs").Workbook, input: TransactionWorkbookInput, context: WorkbookContext) {
  const sheet = workbook.addWorksheet("Por categoría");
  configureSheet(sheet, { freezeRow: 9 });
  addDocumentHeader(sheet, { kicker: "Moneva · Organización", title: "Flujo por categoría", subtitle: "Categorías principales y subcategorías usadas por los movimientos exportados.", columns: 7, accent: context.accent });
  const groupByKey = new Map((input.groups ?? []).map((group) => [group.group, group.name]));
  const rows = input.categories.map((category) => {
    const records = input.transactions.filter((item) => item.categoryId === category.id);
    const income = records.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const expense = records.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    return [category.kind === "income" ? "Ingresos" : groupByKey.get(category.group) ?? category.group, category.name, category.kind === "income" ? "Ingreso" : "Gasto", records.length, income, expense, income - expense];
  }).filter((row) => Number(row[3]) > 0);
  sheet.addTable({
    name: uniqueTableName(workbook, "FlujoPorCategoria"), ref: "A9", headerRow: true, totalsRow: rows.length > 0,
    style: { theme: "TableStyleLight1", showRowStripes: false },
    columns: ["Categoría principal", "Subcategoría", "Tipo", "Movimientos", "Ingresos", "Gastos", "Balance"].map((name) => ({ name, ...(name === "Balance" ? { totalsRowFunction: "sum" as const } : {}) })),
    rows,
  });
  styleTableHeader(sheet.getRow(9), context.accent);
  styleDataRows(sheet, 10, 9 + Math.max(rows.length, 1));
  for (let column = 5; column <= 7; column += 1) sheet.getColumn(column).numFmt = context.moneyFormat;
  setColumnWidths(sheet, [27, 29, 16, 15, 20, 20, 20]);
}

function transactionMaps(input: Pick<TransactionWorkbookInput, "accounts" | "categories" | "groups" | "financialTargets" | "transactions" | "profile">) {
  const accountById = new Map(input.accounts.map((item) => [item.id, item]));
  const categoryById = new Map(input.categories.map((item) => [item.id, item]));
  const groupByKey = new Map((input.groups ?? []).map((item) => [item.group, item]));
  const targetById = new Map((input.financialTargets ?? []).map((item) => [item.id, item]));
  const transferPeers = new Map<string, Transaction[]>();
  for (const transaction of input.transactions) {
    if (!transaction.transferGroupId) continue;
    transferPeers.set(transaction.transferGroupId, [...(transferPeers.get(transaction.transferGroupId) ?? []), transaction]);
  }
  return { accountById, categoryById, groupByKey, targetById, transferPeers, currencyCode: input.profile.currencyCode };
}

function transactionRow(transaction: Transaction, maps: ReturnType<typeof transactionMaps>) {
  const category = transaction.categoryId ? maps.categoryById.get(transaction.categoryId) : undefined;
  const peer = transaction.transferGroupId ? maps.transferPeers.get(transaction.transferGroupId)?.find((item) => item.id !== transaction.id) : undefined;
  const mainCategory = category?.kind === "income" ? "Ingresos" : category ? maps.groupByKey.get(category.group)?.name ?? category.group : transaction.kind.startsWith("transfer") ? "Transferencias" : "Sin categoría";
  return [
    isoDate(transaction.occurredOn), kindLabel(transaction.kind), transaction.description, transaction.merchant ?? null, mainCategory,
    category?.name ?? null, maps.accountById.get(transaction.accountId)?.name ?? "Cuenta no disponible", peer ? maps.accountById.get(peer.accountId)?.name ?? null : null,
    transaction.amount, transactionImpact(transaction), maps.currencyCode,
    transaction.financialTargetId ? maps.targetById.get(transaction.financialTargetId)?.title ?? "Meta no disponible" : null,
    transaction.financialTargetEffect === "advance" ? "Avanza" : transaction.financialTargetEffect === "reverse" ? "Revierte" : null,
    transaction.note ?? null, syncLabel(transaction.syncStatus), isoDateTime(transaction.createdAt), transaction.id,
  ];
}

function transactionTotals(transactions: Transaction[]) {
  const incomeRows = transactions.filter((item) => item.kind === "income");
  const expenseRows = transactions.filter((item) => item.kind === "expense");
  const transferRows = transactions.filter((item) => item.kind.startsWith("transfer_"));
  const income = incomeRows.reduce((sum, item) => sum + item.amount, 0);
  const expense = expenseRows.reduce((sum, item) => sum + item.amount, 0);
  return {
    income,
    expense,
    balance: income - expense,
    incomeCount: incomeRows.length,
    expenseCount: expenseRows.length,
    transferCount: transferRows.length,
    transferVolume: transferRows.filter((item) => item.kind === "transfer_out").reduce((sum, item) => sum + item.amount, 0),
  };
}

export function movementWorkbookFilename(scope: string) {
  return `Moneva - Movimientos - ${safeFilenamePart(scope)}.xlsx`;
}

export function completeHistoryWorkbookFilename(generatedAt = new Date()) {
  return `Moneva - Todos mis movimientos - ${new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(generatedAt)}.xlsx`;
}

export function formatGeneratedAt(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short", timeZone }).format(date);
}

function kindLabel(kind: Transaction["kind"]) {
  return ({ income: "Ingreso", expense: "Gasto", transfer_out: "Transferencia enviada", transfer_in: "Transferencia recibida" } as const)[kind];
}

function syncLabel(status: Transaction["syncStatus"]) {
  return status === "pending" ? "Pendiente" : status === "error" ? "Requiere atención" : "Sincronizado";
}

function accountTypeLabel(type: Account["type"]) {
  return ({ checking: "Cuenta corriente", savings: "Ahorros", cash: "Efectivo", credit: "Crédito", investment: "Inversión" } as const)[type];
}

function transactionImpact(transaction: Transaction) {
  return transaction.kind === "income" || transaction.kind === "transfer_in" ? transaction.amount : -transaction.amount;
}

function isoDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date;
}

function isoDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function safeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "resultado";
}

function uniqueTableName(workbook: import("exceljs").Workbook, preferred: string) {
  const used = new Set<string>();
  workbook.eachSheet((sheet) => (sheet.getTables() as unknown as import("exceljs").Table[]).forEach((table) => used.add(table.name)));
  let candidate = preferred.replace(/[^A-Za-z0-9_]/g, "");
  let suffix = 2;
  while (used.has(candidate)) candidate = `${preferred}${suffix++}`;
  return candidate;
}

function columnLetter(column: number) {
  let result = "";
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(((value - 1) % 26) + 65) + result;
  return result;
}

function argb(hex: string) {
  return { argb: `FF${hex.replace("#", "").toUpperCase()}` };
}

function solid(hex: string): import("exceljs").FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: argb(hex) };
}
