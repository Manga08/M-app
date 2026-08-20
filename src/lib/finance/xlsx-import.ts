import type { Category, Transaction } from "./types";

export type WorkbookCell = string | number | boolean | Date | null;
export type WorkbookSheet = { sheet: string; data: WorkbookCell[][] };

export type ImportedMovement = {
  sourceSheet: string;
  sourceRow: number;
  sourceCategory: string;
  amount: number;
  occurredOn: string;
  description: string;
  merchant?: string;
  adjustment: boolean;
};

export type PlannerImport = {
  version: "2025" | "2026";
  movements: ImportedMovement[];
  invalidRows: number;
  sourceCategories: string[];
  dateStart: string;
  dateEnd: string;
};

const MONTH_SHEETS = new Set(["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]);

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

function merchantFromDescription(description: string) {
  const parts = description.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const candidate = parts.length > 1 ? parts.at(-1) : undefined;
  return candidate && candidate.length <= 120 ? candidate : undefined;
}

export function movementFingerprint(input: Pick<ImportedMovement, "adjustment" | "amount" | "occurredOn" | "description"> | Transaction) {
  const kind = "adjustment" in input ? (input.adjustment ? "income" : "expense") : input.kind;
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
  let invalidRows = 0;
  const movements: ImportedMovement[] = [];

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
        adjustment: amount < 0,
      };
      movements.push(movement);
    }
  }

  if (!movements.length) throw new Error("No encontramos movimientos válidos en el registro de transacciones.");
  const version = detectedColumn === 28 ? "2025" : detectedColumn === 29 ? "2026" : null;
  if (!version) throw new Error("Reconocimos el libro, pero no coincide con las plantillas 2025 o 2026 admitidas.");
  movements.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.sourceRow - b.sourceRow);
  return {
    version,
    movements,
    invalidRows,
    sourceCategories: [...new Set(movements.filter((item) => !item.adjustment).map((item) => item.sourceCategory))].sort((a, b) => a.localeCompare(b, "es")),
    dateStart: movements[0].occurredOn,
    dateEnd: movements.at(-1)!.occurredOn,
  };
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
