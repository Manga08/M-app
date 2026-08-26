import { describe, expect, it } from "vitest";
import { buildPortfolioValuation, convertPortfolioAmount } from "@/lib/finance/portfolio-valuation";
import type { Account, AccountEntity, FinanceSnapshot, Transaction } from "@/lib/finance/types";

const entities: AccountEntity[] = [
  { id: "global", name: "Global66", color: "#f43f5e", icon: "bank:global66", sortOrder: 0 },
];
const accounts: Account[] = [
  { id: "cop", entityId: "global", name: "Pesos", type: "checking", initialBalance: 1_000_000, currencyCode: "COP", color: "#34d399" },
  { id: "usd", entityId: "global", name: "Dólares", type: "savings", initialBalance: 100, openingExchangeRate: 4_000, currencyCode: "USD", color: "#60a5fa" },
  { id: "cash", name: "Efectivo", type: "cash", initialBalance: 50_000, currencyCode: "COP", color: "#f59e0b" },
];
const transactions: Transaction[] = [
  { id: "income", kind: "income", amount: 25, baseAmount: 102_500, accountId: "usd", nativeCurrencyCode: "USD", baseCurrencyCode: "COP", exchangeRate: 4_100, description: "Venta", occurredOn: "2026-08-20", createdAt: "2026-08-20T12:00:00Z" },
];
const snapshot: FinanceSnapshot = {
  month: "2026-08-01",
  income: 102_500,
  expense: 0,
  accountBalances: { cop: 1_000_000, usd: 125, cash: 50_000 },
  accountBalancesBase: { cop: 1_000_000, usd: 502_500, cash: 50_000 },
  categorySpending: {},
};

describe("valoración transversal del portafolio", () => {
  it("mantiene saldos nativos exactos y usa la TRM vigente solo para el equivalente", () => {
    const valuation = buildPortfolioValuation({
      accounts,
      entities,
      transactions,
      snapshot,
      reportingCurrencyCode: "COP",
      quote: { rate: 4_250, validFrom: "2026-08-26", validTo: "2026-08-26", source: "sfc_trm", provider: "SFC" },
    });

    expect(valuation.reportingBalance).toBe(1_581_250);
    expect(valuation.accounts.find((item) => item.account.id === "usd")).toMatchObject({ balance: 125, baseBalance: 502_500, reportingBalance: 531_250, rateStatus: "current" });
    expect(valuation.entities[0].nativeTotals).toEqual([{ currencyCode: "COP", amount: 1_000_000 }, { currencyCode: "USD", amount: 125 }]);
    expect(valuation.entities[0].reportingBalance).toBe(1_531_250);
  });

  it("cae al valor contable registrado si la TRM no está disponible", () => {
    const valuation = buildPortfolioValuation({ accounts, entities, transactions, snapshot, reportingCurrencyCode: "COP" });
    expect(valuation.reportingBalance).toBe(1_552_500);
    expect(valuation.rateStatus).toBe("registered");
    expect(valuation.accounts.find((item) => item.account.id === "usd")?.reportingBalance).toBe(502_500);
  });

  it("invierte la TRM al reportar una cuenta COP en USD", () => {
    expect(convertPortfolioAmount(4_250_000, "COP", "USD", { rate: 4_250, validFrom: "2026-08-26", validTo: "2026-08-26", source: "sfc_trm", provider: "SFC" }, 950)).toEqual({ amount: 1_000, rateStatus: "current" });
  });

  it("deja Sin entidad como agrupación explícita sin alterar el dinero", () => {
    const valuation = buildPortfolioValuation({ accounts, entities, transactions, snapshot, reportingCurrencyCode: "COP" });
    expect(valuation.entities.map((item) => item.entity?.name ?? "Sin entidad")).toEqual(["Global66", "Sin entidad"]);
    expect(valuation.entities[1].accounts.map((item) => item.account.id)).toEqual(["cash"]);
  });
});
