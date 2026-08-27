import type { RecurringOccurrence, RecurringRule, Transaction } from "@/lib/finance/types";

/**
 * Moneva currently keeps one immutable accounting currency (COP) while each
 * account preserves its native COP or USD balance. Expanding this list needs a
 * rate provider and a database migration before it can appear in the UI.
 */
export const REPORTING_CURRENCY_CODE = "COP" as const;
export const SUPPORTED_ACCOUNT_CURRENCIES = ["COP", "USD"] as const;

export type SupportedAccountCurrency = (typeof SUPPORTED_ACCOUNT_CURRENCIES)[number];

const MAX_EXCHANGE_RATE = 9_999_999_999.99999999;

export function isSupportedAccountCurrency(value: string): value is SupportedAccountCurrency {
  return SUPPORTED_ACCOUNT_CURRENCIES.includes(value as SupportedAccountCurrency);
}

export function assertSupportedAccountCurrency(value: string): asserts value is SupportedAccountCurrency {
  if (!isSupportedAccountCurrency(value)) {
    throw new Error("Por ahora Moneva admite cuentas en COP o USD.");
  }
}

export function assertExchangeRate(value: number | undefined, label = "La tasa de cambio"): asserts value is number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} debe ser mayor que cero.`);
  }
  if (value > MAX_EXCHANGE_RATE) throw new Error(`${label} supera el máximo admitido.`);
  const eightDecimals = value * 100_000_000;
  if (Math.abs(eightDecimals - Math.round(eightDecimals)) > 1e-4) {
    throw new Error(`${label} admite como máximo ocho decimales.`);
  }
}

/**
 * Converts the public COP-per-USD quote into the multiplier needed to turn one
 * unit of a native currency into the chosen reporting currency.
 */
export function nativeToReportingRate(
  nativeCurrency: string,
  reportingCurrency: string,
  copPerUsd?: number,
) {
  assertSupportedAccountCurrency(nativeCurrency);
  assertSupportedAccountCurrency(reportingCurrency);
  if (nativeCurrency === reportingCurrency) return 1;
  assertExchangeRate(copPerUsd);
  return nativeCurrency === "USD" ? copPerUsd : 1 / copPerUsd;
}

export function convertNativeToReporting(
  amount: number,
  nativeCurrency: string,
  reportingCurrency: string,
  copPerUsd?: number,
) {
  if (!Number.isFinite(amount)) throw new Error("El monto debe ser un número válido.");
  return amount * nativeToReportingRate(nativeCurrency, reportingCurrency, copPerUsd);
}

/** Recurrences already store the fixed native-to-reporting rate snapshot. */
export function recurringOccurrenceReportingAmount(occurrence: Pick<RecurringOccurrence, "amount" | "exchangeRate">) {
  assertExchangeRate(occurrence.exchangeRate, "La tasa guardada de la programación");
  return occurrence.amount * occurrence.exchangeRate;
}

/**
 * Durable rows always include baseAmount. The rate fallback also keeps old
 * offline/demo rows correct while they are migrated to the current schema.
 */
export function transactionReportingAmount(
  transaction: Pick<Transaction, "amount" | "baseAmount" | "exchangeRate">,
) {
  if (transaction.baseAmount !== undefined) return transaction.baseAmount;
  const rate = transaction.exchangeRate ?? 1;
  assertExchangeRate(rate, "La tasa guardada del movimiento");
  return transaction.amount * rate;
}

export function recurringRuleReportingAmount(
  rule: Pick<RecurringRule, "amount" | "exchangeRate">,
) {
  assertExchangeRate(rule.exchangeRate, "La tasa guardada de la programación");
  return rule.amount * rule.exchangeRate;
}
