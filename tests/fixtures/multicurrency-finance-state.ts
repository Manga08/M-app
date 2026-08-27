import { demoFinanceState } from "../../src/lib/finance/demo-data";
import type { FinanceState, RecurringOccurrence, RecurringRule, Transaction } from "../../src/lib/finance/types";

const usdAccount = {
  id: "acc-global-usd",
  name: "Reserva USD",
  type: "savings" as const,
  initialBalance: 100,
  color: "#3b82f6",
  icon: "bank:global66",
  currencyCode: "USD",
  openingBalanceDate: "2026-08-01",
  openingExchangeRate: 4_000,
  entityId: "entity-bancolombia",
};

const transactions: Transaction[] = [
  {
    id: "tx-usd-income", kind: "income", amount: 25, baseAmount: 102_500,
    nativeCurrencyCode: "USD", baseCurrencyCode: "COP", exchangeRate: 4_100,
    exchangeRateDate: "2026-08-21", exchangeRateSource: "provider",
    accountId: usdAccount.id, categoryId: "cat-other-income", description: "Ingreso en dólares",
    occurredOn: "2026-08-21", createdAt: "2026-08-21T12:00:00Z", syncStatus: "synced",
  },
  {
    id: "tx-usd-expense", kind: "expense", amount: 10, baseAmount: 41_000,
    nativeCurrencyCode: "USD", baseCurrencyCode: "COP", exchangeRate: 4_100,
    exchangeRateDate: "2026-08-22", exchangeRateSource: "manual",
    accountId: usdAccount.id, categoryId: "cat-fun", description: "Servicio internacional",
    occurredOn: "2026-08-22", createdAt: "2026-08-22T12:00:00Z", syncStatus: "synced",
  },
  {
    id: "tx-cop-usd-out", kind: "transfer_out", amount: 410_000, baseAmount: 410_000,
    nativeCurrencyCode: "COP", baseCurrencyCode: "COP", exchangeRate: 1,
    exchangeRateDate: "2026-08-23", exchangeRateSource: "same_currency",
    accountId: "acc-bancolombia", transferGroupId: "transfer-cop-usd", description: "Compra USD",
    occurredOn: "2026-08-23", createdAt: "2026-08-23T12:00:00Z", syncStatus: "synced",
  },
  {
    id: "tx-cop-usd-in", kind: "transfer_in", amount: 100, baseAmount: 410_000,
    nativeCurrencyCode: "USD", baseCurrencyCode: "COP", exchangeRate: 4_100,
    exchangeRateDate: "2026-08-23", exchangeRateSource: "manual",
    accountId: usdAccount.id, transferGroupId: "transfer-cop-usd", description: "Compra USD",
    occurredOn: "2026-08-23", createdAt: "2026-08-23T12:00:00Z", syncStatus: "synced",
  },
  {
    id: "tx-usd-cop-out", kind: "transfer_out", amount: 20, baseAmount: 82_000,
    nativeCurrencyCode: "USD", baseCurrencyCode: "COP", exchangeRate: 4_100,
    exchangeRateDate: "2026-08-24", exchangeRateSource: "manual",
    accountId: usdAccount.id, transferGroupId: "transfer-usd-cop", description: "Venta USD",
    occurredOn: "2026-08-24", createdAt: "2026-08-24T12:00:00Z", syncStatus: "synced",
  },
  {
    id: "tx-usd-cop-in", kind: "transfer_in", amount: 82_000, baseAmount: 82_000,
    nativeCurrencyCode: "COP", baseCurrencyCode: "COP", exchangeRate: 1,
    exchangeRateDate: "2026-08-24", exchangeRateSource: "same_currency",
    accountId: "acc-bancolombia", transferGroupId: "transfer-usd-cop", description: "Venta USD",
    occurredOn: "2026-08-24", createdAt: "2026-08-24T12:00:00Z", syncStatus: "synced",
  },
];

const usdRule: RecurringRule = {
  id: "rule-usd-subscription", kind: "expense", amount: 12, accountId: usdAccount.id,
  categoryId: "cat-fun", description: "Suscripción USD", cadence: "monthly", intervalCount: 1,
  exchangeRate: 4_100, exchangeRateDate: "2026-08-28", exchangeRateSource: "provider",
  startsOn: "2026-08-28", anchorDay: 28, postingPolicy: "scheduled_date", timezone: "America/Bogota",
  autoPost: true, includeInBudget: true, includeInIncomeTarget: false, status: "active", nextRunOn: "2026-08-28",
  createdAt: "2026-08-01T12:00:00Z", updatedAt: "2026-08-01T12:00:00Z", syncStatus: "synced",
};

const usdOccurrence: RecurringOccurrence = {
  id: "occ-usd-subscription", ruleId: usdRule.id, kind: "expense", scheduledOn: "2026-08-28", effectiveOn: "2026-08-28",
  amount: 12, accountId: usdAccount.id, categoryId: "cat-fun", description: "Suscripción USD",
  exchangeRate: 4_100, exchangeRateDate: "2026-08-28", exchangeRateSource: "provider",
  status: "planned", createdAt: "2026-08-01T12:00:00Z",
};

export const multicurrencyFinanceState: FinanceState = {
  ...structuredClone(demoFinanceState),
  accounts: [...demoFinanceState.accounts, usdAccount],
  transactions: [...demoFinanceState.transactions, ...transactions],
  recurringRules: [...demoFinanceState.recurringRules, usdRule],
  recurringOccurrences: [...demoFinanceState.recurringOccurrences, usdOccurrence],
};
