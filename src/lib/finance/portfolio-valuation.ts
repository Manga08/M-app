import { accountBalance, accountBaseBalance } from "@/lib/finance/calculations";
import { activeAccountEntities } from "@/lib/finance/account-entities";
import type { TrmQuote } from "@/lib/finance/exchange-rate";
import type { Account, AccountEntity, FinanceSnapshot, Transaction } from "@/lib/finance/types";

export type PortfolioRateStatus = "not-needed" | "current" | "registered";

export type PortfolioAccountValuation = {
  account: Account;
  balance: number;
  baseBalance: number;
  reportingBalance: number;
  nativeCurrencyCode: string;
  reportingCurrencyCode: string;
  rateStatus: PortfolioRateStatus;
};

export type PortfolioEntityValuation = {
  key: string;
  entity: AccountEntity | null;
  accounts: PortfolioAccountValuation[];
  reportingBalance: number;
  nativeTotals: Array<{ currencyCode: string; amount: number }>;
};

export type PortfolioValuation = {
  accounts: PortfolioAccountValuation[];
  entities: PortfolioEntityValuation[];
  reportingCurrencyCode: string;
  reportingBalance: number;
  hasForeignCurrency: boolean;
  rateStatus: PortfolioRateStatus;
  quote?: TrmQuote;
};

type PortfolioValuationInput = {
  accounts: Account[];
  entities: AccountEntity[];
  transactions: Transaction[];
  snapshot?: FinanceSnapshot;
  reportingCurrencyCode: string;
  quote?: TrmQuote;
};

export function convertPortfolioAmount(
  amount: number,
  nativeCurrencyCode: string,
  reportingCurrencyCode: string,
  quote: TrmQuote | undefined,
  registeredReportingBalance: number,
) {
  if (nativeCurrencyCode === reportingCurrencyCode) {
    return { amount, rateStatus: "not-needed" as const };
  }
  if (quote?.rate && quote.rate > 0) {
    if (nativeCurrencyCode === "USD" && reportingCurrencyCode === "COP") {
      return { amount: amount * quote.rate, rateStatus: "current" as const };
    }
    if (nativeCurrencyCode === "COP" && reportingCurrencyCode === "USD") {
      return { amount: amount / quote.rate, rateStatus: "current" as const };
    }
  }
  return { amount: registeredReportingBalance, rateStatus: "registered" as const };
}

export function buildPortfolioValuation(input: PortfolioValuationInput): PortfolioValuation {
  const activeAccounts = input.accounts.filter((account) => !account.archived);
  const accounts = activeAccounts.map<PortfolioAccountValuation>((account) => {
    const balance = accountBalance(account, input.transactions, input.snapshot);
    const baseBalance = accountBaseBalance(account, input.transactions, input.snapshot);
    const nativeCurrencyCode = account.currencyCode ?? input.reportingCurrencyCode;
    const converted = convertPortfolioAmount(
      balance,
      nativeCurrencyCode,
      input.reportingCurrencyCode,
      input.quote,
      baseBalance,
    );
    return {
      account,
      balance,
      baseBalance,
      reportingBalance: converted.amount,
      nativeCurrencyCode,
      reportingCurrencyCode: input.reportingCurrencyCode,
      rateStatus: converted.rateStatus,
    };
  });
  const entityById = new Map(activeAccountEntities(input.entities).map((entity) => [entity.id, entity]));
  const grouped = new Map<string, PortfolioAccountValuation[]>();
  for (const item of accounts) {
    const key = item.account.entityId && entityById.has(item.account.entityId) ? item.account.entityId : "ungrouped";
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const orderedKeys = [
    ...activeAccountEntities(input.entities).map((entity) => entity.id).filter((id) => grouped.has(id)),
    ...(grouped.has("ungrouped") ? ["ungrouped"] : []),
  ];
  const entities = orderedKeys.map<PortfolioEntityValuation>((key) => {
    const items = (grouped.get(key) ?? []).toSorted((a, b) => a.account.name.localeCompare(b.account.name, "es", { sensitivity: "base", numeric: true }));
    const nativeByCurrency = new Map<string, number>();
    for (const item of items) nativeByCurrency.set(item.nativeCurrencyCode, (nativeByCurrency.get(item.nativeCurrencyCode) ?? 0) + item.balance);
    return {
      key,
      entity: key === "ungrouped" ? null : entityById.get(key) ?? null,
      accounts: items,
      reportingBalance: items.reduce((sum, item) => sum + item.reportingBalance, 0),
      nativeTotals: [...nativeByCurrency]
        .map(([currencyCode, amount]) => ({ currencyCode, amount }))
        .toSorted((a, b) => a.currencyCode.localeCompare(b.currencyCode, "en", { sensitivity: "base" })),
    };
  });
  const hasForeignCurrency = accounts.some((item) => item.nativeCurrencyCode !== input.reportingCurrencyCode);
  return {
    accounts,
    entities,
    reportingCurrencyCode: input.reportingCurrencyCode,
    reportingBalance: accounts.reduce((sum, item) => sum + item.reportingBalance, 0),
    hasForeignCurrency,
    rateStatus: !hasForeignCurrency ? "not-needed" : input.quote ? "current" : "registered",
    quote: input.quote,
  };
}
