"use client";

import { useEffect, useMemo, useState } from "react";
import { getOfficialTrm, type TrmQuote } from "@/lib/finance/exchange-rate";
import { buildPortfolioValuation } from "@/lib/finance/portfolio-valuation";
import type { Account, AccountEntity, FinanceSnapshot, Transaction } from "@/lib/finance/types";

type UsePortfolioValuationInput = {
  accounts: Account[];
  entities: AccountEntity[];
  transactions: Transaction[];
  snapshot?: FinanceSnapshot;
  reportingCurrencyCode: string;
  valuationDate: string;
};

export function usePortfolioValuation(input: UsePortfolioValuationInput) {
  const hasForeignCurrency = input.accounts.some((account) => !account.archived && (account.currencyCode ?? input.reportingCurrencyCode) !== input.reportingCurrencyCode);
  const [rate, setRate] = useState<{ date?: string; quote?: TrmQuote; error?: string }>({});

  useEffect(() => {
    if (!hasForeignCurrency) return;
    const controller = new AbortController();
    void getOfficialTrm(input.valuationDate, controller.signal)
      .then((quote) => setRate({ date: input.valuationDate, quote }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRate({ date: input.valuationDate, error: error instanceof Error ? error.message : "No pudimos consultar la TRM oficial." });
      });
    return () => controller.abort();
  }, [hasForeignCurrency, input.valuationDate]);

  const valuation = useMemo(() => buildPortfolioValuation({
    accounts: input.accounts,
    entities: input.entities,
    transactions: input.transactions,
    snapshot: input.snapshot,
    reportingCurrencyCode: input.reportingCurrencyCode,
    quote: rate.date === input.valuationDate ? rate.quote : undefined,
  }), [input.accounts, input.entities, input.reportingCurrencyCode, input.snapshot, input.transactions, input.valuationDate, rate.date, rate.quote]);

  const currentRate = rate.date === input.valuationDate ? rate : undefined;
  return {
    ...valuation,
    loadingRate: hasForeignCurrency && !currentRate,
    rateError: currentRate?.error,
  };
}
