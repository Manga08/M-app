import type { Transaction } from "./types";

const MONTH_START_PATTERN = /^(\d{4})-(\d{2})-01$/;

export type TransactionMonthBounds = {
  start: string;
  end: string;
  key: string;
};

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
