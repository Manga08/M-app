import type { Category, Transaction } from "./types";

export type WorkbookCell = string | number | boolean | Date | null;
export type WorkbookSheet = { sheet: string; data: WorkbookCell[][] };
export type PlannerTemplateVersion = "v1.2" | "2025" | "2026";

export type ImportedMovement = {
  sourceSheet: string;
  sourceRow: number;
  sourceCategory: string;
  amount: number;
  occurredOn: string;
  description: string;
  merchant?: string;
  kind: "expense" | "income";
  /** Solo los gastos negativos del registro detallado; se convierten en reintegros. */
  adjustment: boolean;
};

export type PlannerImport = {
  version: PlannerTemplateVersion;
  movements: ImportedMovement[];
  invalidRows: number;
  sourceCategories: string[];
  sourceIncomeTypes: string[];
  expenseCount: number;
  incomeCount: number;
  dateStart: string;
  dateEnd: string;
  /** Saldo “Disponible para gastar” del último mes con datos. */
  endingBalance?: number;
  endingBalanceDate?: string;
  movementNet: number;
};

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;
const MONTH_SHEETS = new Set<string>(MONTH_NAMES);

export function normalizeImportText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

function text(value: WorkbookCell | undefined) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function excelDate(value: WorkbookCell | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value >= 1 && value < 1_000_000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const month = Number(match[2]);
  const day = Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function transactionHeader(data: WorkbookCell[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(data.length, 12); rowIndex += 1) {
    const row = data[rowIndex] ?? [];
    const category = row.findIndex((cell) => normalizeImportText(text(cell)) === "categoria");
    if (category < 0) continue;
    const amount = row.findIndex((cell, index) => index > category && normalizeImportText(text(cell)) === "monto");
    const date = row.findIndex((cell, index) => index > category && normalizeImportText(text(cell)) === "fecha");
    const description = row.findIndex((cell, index) => index > category && ["concepto", "descripcion"].includes(normalizeImportText(text(cell))));
    if (amount > category && date > amount && description > date) return { rowIndex, category, amount: amount + 1, date, description };
  }
  return null;
}

function incomeHeader(data: WorkbookCell[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(data.length, 30); rowIndex += 1) {
    const row = data[rowIndex] ?? [];
    const concept = row.findIndex((cell) => ["concepto", "cocepto"].includes(normalizeImportText(text(cell))));
    const actualLabel = row.findIndex((cell, index) => index > concept && normalizeImportText(text(cell)) === "actual");
    if (concept >= 0 && actualLabel > concept) return { rowIndex, concept, actualLabel, amount: actualLabel + 1 };
  }
  return null;
}

function merchantFromDescription(description: string) {
  const parts = description.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const candidate = parts.length > 1 ? parts.at(-1) : undefined;
  return candidate && candidate.length <= 120 ? candidate : undefined;
}

export function movementFingerprint(input: Pick<ImportedMovement, "kind" | "amount" | "occurredOn" | "description"> | Transaction) {
  const kind = input.kind;
  return `${kind}|${input.occurredOn}|${Math.abs(input.amount).toFixed(2)}|${normalizeImportText(input.description)}`;
}

export function findExistingImportDuplicates(movements: ImportedMovement[], transactions: Transaction[]) {
  const existing = new Map<string, number>();
  for (const transaction of transactions.filter((item) => item.kind === "income" || item.kind === "expense")) {
    const fingerprint = movementFingerprint(transaction);
    existing.set(fingerprint, (existing.get(fingerprint) ?? 0) + 1);
  }
  return movements.map((movement) => {
    const fingerprint = movementFingerprint(movement);
    const remaining = existing.get(fingerprint) ?? 0;
    if (!remaining) return false;
    existing.set(fingerprint, remaining - 1);
    return true;
  });
}

export function parsePlannerWorkbook(sheets: WorkbookSheet[]): PlannerImport {
  const monthly = sheets.filter((sheet) => MONTH_SHEETS.has(sheet.sheet));
  if (!monthly.length) throw new Error("Este archivo no contiene las hojas mensuales de la plantilla de Moneva.");

  let detectedColumn: number | null = null;
  let detectedIncomeColumn: number | null = null;
  let invalidRows = 0;
  const movements: ImportedMovement[] = [];
  const activeSheets = new Set<string>();

  for (const sheet of monthly) {
    const header = transactionHeader(sheet.data);
    if (!header) continue;
    detectedColumn ??= header.category;
    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex += 1) {
      const row = sheet.data[rowIndex] ?? [];
      const category = text(row[header.category]);
      const description = text(row[header.description]);
      const rawAmount = row[header.amount];
      const amount = typeof rawAmount === "number" ? rawAmount : Number(String(rawAmount ?? "").replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
      const occurredOn = excelDate(row[header.date]);
      const hasContent = Boolean(category || description || rawAmount || row[header.date]);
      if (!hasContent) continue;
      if (!category || !description || !Number.isFinite(amount) || amount === 0 || !occurredOn) {
        invalidRows += 1;
        continue;
      }
      const movement: ImportedMovement = {
        sourceSheet: sheet.sheet,
        sourceRow: rowIndex + 1,
        sourceCategory: category,
        amount: Math.abs(amount),
        occurredOn,
        description: description.slice(0, 200),
        merchant: merchantFromDescription(description),
        kind: amount < 0 ? "income" : "expense",
        adjustment: amount < 0,
      };
      movements.push(movement);
      activeSheets.add(sheet.sheet);
    }
  }

  for (const sheet of monthly) {
    const header = incomeHeader(sheet.data);
    if (header) {
      detectedIncomeColumn ??= header.actualLabel;
      break;
    }
  }
  const version = detectPlannerVersion(detectedColumn, detectedIncomeColumn);
  if (!version) throw new Error("Reconocimos el libro, pero no coincide con las plantillas v1.2, 2025 o 2026 admitidas.");
  const expenseAnchors = new Map<string, string>();
  for (const sheet of monthly) {
    const candidates = movements.filter((movement) => movement.sourceSheet === sheet.sheet).map((movement) => movement.occurredOn.slice(0, 7));
    if (!candidates.length) continue;
    const counts = new Map<string, number>();
    for (const candidate of candidates) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    expenseAnchors.set(sheet.sheet, [...counts].sort((left, right) => right[1] - left[1])[0][0]);
  }

  for (const sheet of monthly) {
    const header = incomeHeader(sheet.data);
    if (!header) continue;
    const occurredOn = incomeDateForSheet(sheet.sheet, expenseAnchors);
    for (let rowIndex = header.rowIndex + 1; rowIndex < Math.min(sheet.data.length, header.rowIndex + 12); rowIndex += 1) {
      const row = sheet.data[rowIndex] ?? [];
      const sourceIncomeType = text(row[header.concept]);
      if (normalizeImportText(sourceIncomeType) === "total") break;
      const rawAmount = row[header.amount];
      const amount = typeof rawAmount === "number" ? rawAmount : Number(String(rawAmount ?? "").replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
      if (!sourceIncomeType && !rawAmount) continue;
      if (!sourceIncomeType || !Number.isFinite(amount) || amount <= 0 || !occurredOn) {
        if (rawAmount && rawAmount !== "COP") invalidRows += 1;
        continue;
      }
      movements.push({
        sourceSheet: sheet.sheet,
        sourceRow: rowIndex + 1,
        sourceCategory: sourceIncomeType,
        amount,
        occurredOn,
        description: sourceIncomeType.slice(0, 200),
        kind: "income",
        adjustment: false,
      });
      activeSheets.add(sheet.sheet);
    }
  }

  if (!movements.length) throw new Error(`La plantilla ${version} es compatible, pero no contiene gastos ni ingresos reales válidos para importar.`);
  movements.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.sourceRow - b.sourceRow);
  const endingSheet = [...monthly].reverse().find((sheet) => activeSheets.has(sheet.sheet) && monthlyAvailableBalance(sheet.data) !== null);
  const endingBalance = endingSheet ? monthlyAvailableBalance(endingSheet.data) : null;
  const endingBalanceDate = endingSheet ? incomeDateForSheet(endingSheet.sheet, expenseAnchors) : null;
  const movementNet = movements.reduce((sum, movement) => sum + (movement.kind === "income" ? movement.amount : -movement.amount), 0);
  return {
    version,
    movements,
    invalidRows,
    sourceCategories: [...new Set(movements.filter((item) => item.kind === "expense").map((item) => item.sourceCategory))].sort((a, b) => a.localeCompare(b, "es")),
    sourceIncomeTypes: [...new Set(movements.filter((item) => item.kind === "income" && !item.adjustment).map((item) => item.sourceCategory))].sort((a, b) => a.localeCompare(b, "es")),
    expenseCount: movements.filter((item) => item.kind === "expense").length,
    incomeCount: movements.filter((item) => item.kind === "income").length,
    dateStart: movements[0].occurredOn,
    dateEnd: movements.at(-1)!.occurredOn,
    endingBalance: endingBalance ?? undefined,
    endingBalanceDate: endingBalanceDate ?? undefined,
    movementNet,
  };
}

function detectPlannerVersion(transactionColumn: number | null, incomeActualColumn: number | null): PlannerTemplateVersion | null {
  if (transactionColumn === 28) return "2025";
  if (transactionColumn === 29 && incomeActualColumn === 6) return "v1.2";
  if (transactionColumn === 29) return "2026";
  return null;
}

function monthlyAvailableBalance(data: WorkbookCell[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(data.length, 60); rowIndex += 1) {
    const row = data[rowIndex] ?? [];
    const labelColumn = row.findIndex((cell) => normalizeImportText(text(cell)) === "disponible para gastar");
    if (labelColumn < 0) continue;
    for (let candidateRow = rowIndex + 1; candidateRow <= Math.min(rowIndex + 3, data.length - 1); candidateRow += 1) {
      for (let candidateColumn = labelColumn; candidateColumn <= labelColumn + 4; candidateColumn += 1) {
        const value = data[candidateRow]?.[candidateColumn];
        if (typeof value === "number" && Number.isFinite(value)) return value;
      }
    }
  }
  return null;
}

function incomeDateForSheet(sheetName: string, anchors: Map<string, string>) {
  const exact = anchors.get(sheetName);
  if (exact) return lastDayOfMonth(exact);
  const targetIndex = MONTH_NAMES.indexOf(sheetName as (typeof MONTH_NAMES)[number]);
  if (targetIndex < 0 || !anchors.size) return null;
  const nearest = [...anchors.entries()]
    .map(([name, yearMonth]) => ({ index: MONTH_NAMES.indexOf(name as (typeof MONTH_NAMES)[number]), yearMonth }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => Math.abs(left.index - targetIndex) - Math.abs(right.index - targetIndex))[0];
  if (!nearest) return null;
  const [year, month] = nearest.yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + targetIndex - nearest.index + 1, 0));
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  alimentacion: ["mercado", "supermercado"],
  "comidas fuera": ["comida afuera", "restaurantes", "restaurante"],
  vivienda: ["renta", "apartamento", "arriendo"],
  transporte: ["transporte"],
  "pago de deudas": ["deudas", "deuda", "prestamo", "deuda madre"],
  "fondo de emergencia": ["emergencias", "ahorro de emergencia"],
  inversiones: ["inversiones", "inversion"],
};

export function suggestCategoryId(sourceName: string, categories: Category[]) {
  const source = normalizeImportText(sourceName);
  const active = categories.filter((category) => category.kind === "expense" && !category.archived);
  const exact = active.find((category) => normalizeImportText(category.name) === source);
  if (exact) return exact.id;
  return active.find((category) => (CATEGORY_ALIASES[normalizeImportText(category.name)] ?? []).includes(source))?.id ?? "";
}

const INCOME_ALIASES: Record<string, string[]> = {
  nomina: ["salario fijo", "sueldo", "salario"],
};

export function suggestIncomeTypeId(sourceName: string, categories: Category[]) {
  const source = normalizeImportText(sourceName);
  const active = categories.filter((category) => category.kind === "income" && !category.archived);
  const exact = active.find((category) => normalizeImportText(category.name) === source);
  if (exact) return exact.id;
  return active.find((category) => (INCOME_ALIASES[normalizeImportText(category.name)] ?? []).includes(source))?.id ?? "";
}

export function cleanImportedCategoryName(sourceName: string) {
  const cleaned = sourceName
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned || "Categoría importada";
}

const GROUP_HINTS: Record<string, string[]> = {
  needs: ["apartamento", "arriendo", "cuidado personal", "emcali", "emergencias", "gas", "internet", "mercado", "renta", "ropa", "salud", "servicios", "telefono", "transporte", "vivienda"],
  wants: ["chatgpt", "comida afuera", "compras", "donaciones", "desarrollo personal", "regalos", "restaurantes", "rappi", "salidas", "suscripciones", "viajes"],
  savings: ["ahorro", "fondo de emergencia"],
  investments: ["inversion", "inversiones"],
  debts: ["deuda", "deudas", "prestamo"],
};

export function suggestImportGroupKey(sourceName: string, groups: Array<{ group: string; name: string; archived?: boolean }>) {
  const active = groups.filter((group) => !group.archived);
  const source = normalizeImportText(sourceName);
  const exact = active.find((group) => normalizeImportText(group.name) === source || normalizeImportText(group.group) === source);
  if (exact) return exact.group;
  const hintedKey = Object.entries(GROUP_HINTS).find(([, hints]) => hints.some((hint) => source === hint || source.includes(hint)))?.[0];
  if (hintedKey) {
    const hinted = active.find((group) => normalizeImportText(group.group) === hintedKey);
    if (hinted) return hinted.group;
  }
  return active[0]?.group ?? "";
}
