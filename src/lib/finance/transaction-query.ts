import type { Transaction } from "./types";

const MONTH_START_PATTERN = /^(\d{4})-(\d{2})-01$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type TransactionMonthBounds = {
  start: string;
  end: string;
  key: string;
};

export type TransactionDateBounds = TransactionMonthBounds;

function parseIsoDate(value: string, field: string) {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError(`${field} debe usar el formato YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError(`${field} contiene una fecha inválida.`);
  }
  return date;
}

function isoDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Convierte un rango inclusivo del usuario en límites [inicio, fin) para Postgres. */
export function transactionDateBounds(dateFrom?: string, dateTo?: string): TransactionDateBounds | null {
  if (!dateFrom && !dateTo) return null;
  if (!dateFrom || !dateTo) throw new RangeError("El rango necesita una fecha inicial y una fecha final.");
  const start = parseIsoDate(dateFrom, "dateFrom");
  const inclusiveEnd = parseIsoDate(dateTo, "dateTo");
  if (start.getTime() > inclusiveEnd.getTime()) throw new RangeError("La fecha inicial no puede ser posterior a la fecha final.");
  const exclusiveEnd = new Date(Date.UTC(inclusiveEnd.getUTCFullYear(), inclusiveEnd.getUTCMonth(), inclusiveEnd.getUTCDate() + 1));
  return { start: isoDate(start), end: isoDate(exclusiveEnd), key: dateFrom === dateTo ? dateFrom : `${dateFrom}_${dateTo}` };
}

export function transactionMonthBounds(monthStart?: string): TransactionMonthBounds | null {
  if (monthStart === undefined || monthStart === "") return null;
  const match = MONTH_START_PATTERN.exec(monthStart);
  if (!match) throw new RangeError("monthStart debe usar el formato YYYY-MM-01.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new RangeError("monthStart contiene un mes inválido.");
  const next = new Date(Date.UTC(year, month, 1));
  return {
    start: monthStart,
    end: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`,
    key: monthStart.slice(0, 7),
  };
}

export function transactionIsInMonth(transaction: Pick<Transaction, "occurredOn">, bounds: TransactionMonthBounds | null) {
  return !bounds || (transaction.occurredOn >= bounds.start && transaction.occurredOn < bounds.end);
}

export const transactionIsInDateRange = transactionIsInMonth;
