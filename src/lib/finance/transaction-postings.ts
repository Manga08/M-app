import { nativeToReportingRate } from "@/lib/finance/currency";
import { transferPostingFx } from "@/lib/finance/transfer-exchange";
import type { Account, Transaction, TransactionInput } from "@/lib/finance/types";
import { assertExchangeRate } from "@/lib/finance/currency";
import { assertFinanceAmount, assertOptionalText, cleanRequiredText } from "@/lib/finance/validation";

type BuildContext = {
  idFactory?: () => string;
  now?: string;
  syncStatus?: Transaction["syncStatus"];
};

function defaultIdFactory() {
  return crypto.randomUUID();
}

export function buildTransactions(
  input: TransactionInput,
  accounts: Account[],
  reportingCurrency = "COP",
  context: BuildContext = {},
): Transaction[] {
  const now = context.now ?? new Date().toISOString();
  const idFactory = context.idFactory ?? defaultIdFactory;
  const status = context.syncStatus ?? "synced";
  const sourceAccount = accounts.find((account) => account.id === input.accountId && !account.archived);
  if (!sourceAccount) throw new Error("La cuenta seleccionada ya no está disponible.");
  const sourceCurrency = sourceAccount.currencyCode ?? reportingCurrency;
  const rateFor = (currency: string) => nativeToReportingRate(currency, reportingCurrency, input.exchangeRate);
  const sourceRate = rateFor(sourceCurrency);
  const commonFx = (currency: string, amount: number, override?: { baseAmount: number; exchangeRate: number }) => ({
    nativeCurrencyCode: currency,
    baseCurrencyCode: reportingCurrency,
    baseAmount: override?.baseAmount ?? amount * rateFor(currency),
    exchangeRate: override?.exchangeRate ?? rateFor(currency),
    exchangeRateDate: input.exchangeRateDate ?? input.occurredOn,
    exchangeRateSource: currency === reportingCurrency ? "same_currency" as const : input.exchangeRateSource ?? "manual" as const,
    referenceExchangeRate: input.referenceExchangeRate,
    referenceRateSource: input.referenceRateSource,
  });

  if (input.type === "transfer" && input.destinationAccountId) {
    const destinationAccount = accounts.find((account) => account.id === input.destinationAccountId && !account.archived);
    if (!destinationAccount) throw new Error("La cuenta de destino ya no está disponible.");
    const destinationCurrency = destinationAccount.currencyCode ?? reportingCurrency;
    const destinationRate = rateFor(destinationCurrency);
    const destinationAmount = sourceCurrency === destinationCurrency
      ? input.amount
      : input.destinationAmount ?? (input.amount * sourceRate) / destinationRate;
    const transferFx = transferPostingFx({
      sourceAmount: input.amount,
      destinationAmount,
      sourceCurrency,
      destinationCurrency,
      reportingCurrency,
      quotedRate: input.exchangeRate,
    });
    const groupId = idFactory();
    const transferRows: Transaction[] = [
      { id: idFactory(), kind: "transfer_out", amount: input.amount, accountId: input.accountId, transferGroupId: groupId, description: input.description || "Transferencia", merchant: input.merchant, note: input.note, icon: input.icon ?? "transfer", occurredOn: input.occurredOn, createdAt: now, syncStatus: status, ...commonFx(sourceCurrency, input.amount, transferFx.source) },
      { id: idFactory(), kind: "transfer_in", amount: destinationAmount, accountId: input.destinationAccountId, transferGroupId: groupId, financialTargetId: input.financialTargetId, financialTargetEffect: input.financialTargetEffect, description: input.description || "Transferencia", merchant: input.merchant, note: input.note, icon: input.icon ?? "transfer", occurredOn: input.occurredOn, createdAt: now, syncStatus: status, ...commonFx(destinationCurrency, destinationAmount, transferFx.destination) },
    ];
    if (input.feeAmount && input.feeAmount > 0) transferRows.push({
      id: idFactory(), kind: "expense", amount: input.feeAmount, accountId: input.accountId,
      description: "Comisión de cambio", note: input.description || "Transferencia entre monedas",
      icon: "receipt", occurredOn: input.occurredOn, createdAt: now, syncStatus: status,
      ...commonFx(sourceCurrency, input.feeAmount, {
        baseAmount: input.feeAmount * transferFx.source.exchangeRate,
        exchangeRate: transferFx.source.exchangeRate,
      }),
    });
    return transferRows;
  }

  return [{
    id: idFactory(),
    kind: input.type === "income" ? "income" : "expense",
    amount: input.amount,
    accountId: input.accountId,
    categoryId: input.categoryId,
    financialTargetId: input.financialTargetId,
    financialTargetEffect: input.financialTargetEffect,
    description: input.description || (input.type === "income" ? "Ingreso" : "Gasto"),
    merchant: input.merchant,
    note: input.note,
    icon: input.icon,
    occurredOn: input.occurredOn,
    createdAt: now,
    syncStatus: status,
    ...commonFx(sourceCurrency, input.amount),
  }];
}

export function buildUpdatedTransfer(
  existing: Transaction[],
  input: TransactionInput,
  accounts: Account[],
  reportingCurrency = "COP",
  context: BuildContext = {},
): Transaction[] {
  const outgoing = existing.find((transaction) => transaction.kind === "transfer_out");
  const incoming = existing.find((transaction) => transaction.kind === "transfer_in");
  if (!outgoing || !incoming || !input.destinationAccountId) throw new Error("La transferencia está incompleta.");
  const [nextOutgoing, nextIncoming] = buildTransactions(input, accounts, reportingCurrency, context);
  return [
    { ...outgoing, ...nextOutgoing, id: outgoing.id, transferGroupId: outgoing.transferGroupId, ledgerEventId: outgoing.ledgerEventId },
    { ...incoming, ...nextIncoming, id: incoming.id, transferGroupId: incoming.transferGroupId, ledgerEventId: incoming.ledgerEventId },
  ];
}

export function validateTransactionWrite(input: TransactionInput) {
  assertFinanceAmount(input.amount);
  if (input.destinationAmount !== undefined) assertFinanceAmount(input.destinationAmount, { label: "El monto recibido" });
  if (input.feeAmount !== undefined) assertFinanceAmount(input.feeAmount, { label: "La comisión" });
  if (input.exchangeRate !== undefined) assertExchangeRate(input.exchangeRate);
  if (input.referenceExchangeRate !== undefined) assertExchangeRate(input.referenceExchangeRate, "La tasa de referencia");
  cleanRequiredText(input.description, "La descripción", 200);
  assertOptionalText(input.merchant, "El comercio", 120);
  assertOptionalText(input.note, "La nota", 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) throw new Error("La fecha del movimiento no es válida.");
  if (input.exchangeRateDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.exchangeRateDate)) throw new Error("La fecha de la tasa no es válida.");
  if (input.type === "transfer" && (!input.destinationAccountId || input.destinationAccountId === input.accountId)) {
    throw new Error("Selecciona dos cuentas diferentes para la transferencia.");
  }
  if (input.type !== "transfer" && !input.categoryId) throw new Error("Selecciona una categoría.");
  if (Boolean(input.financialTargetId) !== Boolean(input.financialTargetEffect)) throw new Error("La relación con la meta está incompleta.");
}
