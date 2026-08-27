import { describe, expect, it } from "vitest";
import type { Account, TransactionInput } from "./types";
import { buildTransactions, buildUpdatedTransfer, validateTransactionWrite } from "./transaction-postings";
import { MAX_FINANCE_AMOUNT } from "./validation";

const accounts: Account[] = [
  { id: "cop-a", name: "COP A", type: "checking", initialBalance: 0, color: "#111111", currencyCode: "COP" },
  { id: "cop-b", name: "COP B", type: "savings", initialBalance: 0, color: "#222222", currencyCode: "COP" },
  { id: "usd-a", name: "USD A", type: "checking", initialBalance: 0, color: "#333333", currencyCode: "USD", openingExchangeRate: 4_000 },
  { id: "usd-b", name: "USD B", type: "savings", initialBalance: 0, color: "#444444", currencyCode: "USD", openingExchangeRate: 4_000 },
];

function input(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    type: "expense",
    amount: 10_000,
    accountId: "cop-a",
    categoryId: "category",
    description: "Prueba multimoneda",
    occurredOn: "2026-08-27",
    ...overrides,
  };
}

function context() {
  let sequence = 0;
  return { idFactory: () => `id-${++sequence}`, now: "2026-08-27T12:00:00.000Z", syncStatus: "pending" as const };
}

function expectBalancedTransfer(rows: ReturnType<typeof buildTransactions>) {
  const outgoing = rows.find((row) => row.kind === "transfer_out")!;
  const incoming = rows.find((row) => row.kind === "transfer_in")!;
  expect(outgoing.transferGroupId).toBe(incoming.transferGroupId);
  expect(outgoing.accountId).not.toBe(incoming.accountId);
  expect(outgoing.baseCurrencyCode).toBe("COP");
  expect(incoming.baseCurrencyCode).toBe("COP");
  expect(outgoing.baseAmount).toBeCloseTo(incoming.baseAmount!, 8);
}

describe("creación de postings multimoneda", () => {
  it.each([
    ["income", "cop-a", 250_000, undefined, 250_000, 1],
    ["expense", "cop-a", 83_500, undefined, 83_500, 1],
    ["income", "usd-a", 25.5, 4_100, 104_550, 4_100],
    ["expense", "usd-a", 9.99, 4_123.45, 41_193.2655, 4_123.45],
  ] as const)("convierte %s desde %s sin perder moneda nativa", (type, accountId, amount, exchangeRate, baseAmount, storedRate) => {
    const [posting] = buildTransactions(input({ type, accountId, amount, exchangeRate }), accounts, "COP", context());
    expect(posting).toMatchObject({ kind: type, amount, accountId, nativeCurrencyCode: accountId.startsWith("usd") ? "USD" : "COP", baseCurrencyCode: "COP", exchangeRate: storedRate, syncStatus: "pending" });
    expect(posting.baseAmount).toBeCloseTo(baseAmount, 8);
  });

  it.each([
    ["cop-a", "cop-b", 120_000, undefined, undefined],
    ["usd-a", "usd-b", 30, undefined, 4_100],
    ["cop-a", "usd-a", 100_000, 24.39, 4_100],
    ["usd-a", "cop-a", 24.39, 99_950, 4_100],
  ] as const)("balancea la transferencia %s → %s", (accountId, destinationAccountId, amount, destinationAmount, exchangeRate) => {
    const rows = buildTransactions(input({ type: "transfer", categoryId: undefined, accountId, destinationAccountId, amount, destinationAmount, exchangeRate }), accounts, "COP", context());
    expect(rows).toHaveLength(2);
    expectBalancedTransfer(rows);
  });

  it("registra la comisión USD con la misma tasa efectiva de la transferencia", () => {
    const rows = buildTransactions(input({
      type: "transfer", categoryId: undefined, accountId: "usd-a", destinationAccountId: "cop-a",
      amount: 24.39, destinationAmount: 99_950, exchangeRate: 4_100, feeAmount: 1.25,
    }), accounts, "COP", context());
    expect(rows).toHaveLength(3);
    expectBalancedTransfer(rows);
    const outgoing = rows[0];
    const fee = rows[2];
    expect(fee.kind).toBe("expense");
    expect(fee.nativeCurrencyCode).toBe("USD");
    expect(fee.exchangeRate).toBeCloseTo(outgoing.exchangeRate!, 12);
    expect(fee.baseAmount).toBeCloseTo(1.25 * outgoing.exchangeRate!, 8);
  });

  it("conserva ids y grupo al editar una transferencia", () => {
    const original = buildTransactions(input({ type: "transfer", categoryId: undefined, accountId: "cop-a", destinationAccountId: "usd-a", amount: 100_000, destinationAmount: 25, exchangeRate: 4_000 }), accounts, "COP", context());
    const updated = buildUpdatedTransfer(original, input({ type: "transfer", categoryId: undefined, accountId: "cop-a", destinationAccountId: "usd-a", amount: 200_000, destinationAmount: 48.78, exchangeRate: 4_100 }), accounts, "COP", context());
    expect(updated.map((row) => row.id)).toEqual(original.map((row) => row.id));
    expect(updated.map((row) => row.transferGroupId)).toEqual(original.map((row) => row.transferGroupId));
    expectBalancedTransfer(updated);
  });

  it("mantiene el invariante con el mayor monto aceptado", () => {
    const rows = buildTransactions(input({ type: "transfer", categoryId: undefined, accountId: "cop-a", destinationAccountId: "usd-a", amount: MAX_FINANCE_AMOUNT, destinationAmount: 21_951_219_512.19, exchangeRate: 4_100 }), accounts, "COP", context());
    expectBalancedTransfer(rows);
  });

  it("mantiene el libro balanceado en una matriz de montos, tasas, monedas y comisiones", () => {
    const amounts = [0.01, 1, 19.99, 999.99999999, 1_000_000, 99_999_999_999.99];
    const rates = [3_000.00000001, 4_087.5, 4_999.99999999];
    const routes = [
      ["cop-a", "cop-b"],
      ["usd-a", "usd-b"],
      ["cop-a", "usd-a"],
      ["usd-a", "cop-a"],
    ] as const;

    for (const [accountId, destinationAccountId] of routes) {
      for (const amount of amounts) {
        for (const exchangeRate of rates) {
          const sourceIsUsd = accountId.startsWith("usd");
          const destinationIsUsd = destinationAccountId.startsWith("usd");
          const destinationAmount = sourceIsUsd === destinationIsUsd
            ? amount
            : sourceIsUsd
              ? amount * exchangeRate
              : amount / exchangeRate;
          const rows = buildTransactions(input({
            type: "transfer",
            categoryId: undefined,
            accountId,
            destinationAccountId,
            amount,
            destinationAmount,
            exchangeRate,
            feeAmount: Math.min(amount, 0.25),
          }), accounts, "COP", context());
          expectBalancedTransfer(rows);
          for (const row of rows) {
            expect(Number.isFinite(row.amount)).toBe(true);
            expect(Number.isFinite(row.baseAmount)).toBe(true);
            expect(Number.isFinite(row.exchangeRate)).toBe(true);
            expect(row.amount).toBeGreaterThan(0);
            expect(row.baseAmount).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("rechaza una cuenta con moneda no soportada incluso en datos locales antiguos", () => {
    const legacy = [...accounts, { ...accounts[0], id: "eur", currencyCode: "EUR" }];
    expect(() => buildTransactions(input({ accountId: "eur" }), legacy, "COP", context())).toThrow("COP o USD");
  });
});

describe("validación de escrituras multimoneda", () => {
  it("acepta una conversión completa", () => {
    expect(() => validateTransactionWrite(input({ type: "transfer", categoryId: undefined, destinationAccountId: "usd-a", destinationAmount: 24.39, exchangeRate: 4_100, feeAmount: 1_500 }))).not.toThrow();
  });

  it.each([
    ["monto recibido", { destinationAmount: 0 }],
    ["comisión", { feeAmount: -1 }],
    ["tasa de cambio", { exchangeRate: Number.NaN }],
    ["tasa de referencia", { referenceExchangeRate: 0 }],
  ] as const)("rechaza un valor inválido de %s", (_label, overrides) => {
    expect(() => validateTransactionWrite(input(overrides))).toThrow();
  });
});
