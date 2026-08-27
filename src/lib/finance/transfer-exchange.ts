import type { Transaction } from "@/lib/finance/types";

type PostingFx = { baseAmount: number; exchangeRate: number };

type TransferPostingFxInput = {
  sourceAmount: number;
  destinationAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  reportingCurrency: string;
  quotedRate?: number;
};

function positiveAmount(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} debe ser mayor que cero.`);
  return value;
}

function positiveRate(value: number | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    throw new Error("Necesitamos una tasa de cambio válida para esta transferencia.");
  }
  return value;
}

function fixedEightInteger(value: number) {
  return BigInt(value.toFixed(8).replace(".", ""));
}

/** Serializes an exact decimal ratio for PostgreSQL NUMERIC.
 * JSON numbers lose enough precision to break an 8-decimal ledger invariant
 * at very large balances, while a decimal string is parsed without that loss.
 */
export function exactPostingExchangeRate(baseAmount: number, nativeAmount: number) {
  const numerator = fixedEightInteger(positiveAmount(baseAmount, "El valor contable"));
  const denominator = fixedEightInteger(positiveAmount(nativeAmount, "El monto del movimiento"));
  const integer = numerator / denominator;
  let remainder = numerator % denominator;
  let fraction = "";
  for (let index = 0; index < 40 && remainder !== BigInt(0); index += 1) {
    remainder *= BigInt(10);
    fraction += (remainder / denominator).toString();
    remainder %= denominator;
  }
  return fraction ? `${integer}.${fraction}` : integer.toString();
}

/**
 * A transfer is one ledger event expressed in two native currencies. Both
 * postings therefore share one reporting-currency value, while each posting
 * keeps its own native-to-reporting rate.
 */
export function transferPostingFx(input: TransferPostingFxInput): { source: PostingFx; destination: PostingFx } {
  const sourceAmount = positiveAmount(input.sourceAmount, "El monto enviado");
  const destinationAmount = positiveAmount(input.destinationAmount, "El monto recibido");
  const sourceIsReporting = input.sourceCurrency === input.reportingCurrency;
  const destinationIsReporting = input.destinationCurrency === input.reportingCurrency;

  let baseAmount: number;
  if (sourceIsReporting) baseAmount = sourceAmount;
  else if (destinationIsReporting) baseAmount = destinationAmount;
  else baseAmount = sourceAmount * positiveRate(input.quotedRate);

  return {
    source: {
      baseAmount,
      exchangeRate: sourceIsReporting ? 1 : baseAmount / sourceAmount,
    },
    destination: {
      baseAmount,
      exchangeRate: destinationIsReporting ? 1 : baseAmount / destinationAmount,
    },
  };
}

/** Repairs transfer pairs created by older clients before they reach the RPC.
 * This also makes already-persisted offline queue entries safe to retry.
 */
export function normalizeTransferPostings<T extends Transaction>(transactions: T[]): T[] {
  const groups = new Map<string, T[]>();
  transactions.forEach((transaction) => {
    if (!transaction.transferGroupId) return;
    groups.set(transaction.transferGroupId, [...(groups.get(transaction.transferGroupId) ?? []), transaction]);
  });

  const replacements = new Map<string, T>();
  groups.forEach((rows) => {
    const outgoing = rows.find((row) => row.kind === "transfer_out");
    const incoming = rows.find((row) => row.kind === "transfer_in");
    if (!outgoing || !incoming) return;

    const reportingCurrency = outgoing.baseCurrencyCode ?? incoming.baseCurrencyCode;
    const sourceCurrency = outgoing.nativeCurrencyCode;
    const destinationCurrency = incoming.nativeCurrencyCode;
    if (!reportingCurrency || !sourceCurrency || !destinationCurrency) return;

    const foreignPosting = [outgoing, incoming].find((row) => row.nativeCurrencyCode !== reportingCurrency);
    const quotedRate = foreignPosting?.exchangeRate
      ?? (foreignPosting?.baseAmount && foreignPosting.amount > 0 ? foreignPosting.baseAmount / foreignPosting.amount : undefined);
    const fx = transferPostingFx({
      sourceAmount: outgoing.amount,
      destinationAmount: incoming.amount,
      sourceCurrency,
      destinationCurrency,
      reportingCurrency,
      quotedRate,
    });

    replacements.set(outgoing.id, {
      ...outgoing,
      ...fx.source,
      exchangeRateSource: sourceCurrency === reportingCurrency ? "same_currency" : outgoing.exchangeRateSource ?? "manual",
    });
    replacements.set(incoming.id, {
      ...incoming,
      ...fx.destination,
      exchangeRateSource: destinationCurrency === reportingCurrency ? "same_currency" : incoming.exchangeRateSource ?? "manual",
    });
  });

  return transactions.map((transaction) => replacements.get(transaction.id) ?? transaction);
}
