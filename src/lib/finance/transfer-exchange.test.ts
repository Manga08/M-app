import { describe, expect, it } from "vitest";
import type { Transaction } from "./types";
import { exactPostingExchangeRate, normalizeTransferPostings, transferPostingFx } from "./transfer-exchange";

const databaseBaseAmount = (amount: number, exchangeRate: number) => Math.round(amount * exchangeRate * 1e8) / 1e8;

describe("transferPostingFx", () => {
  it("keeps COP -> USD postings equal after the USD amount is rounded to cents", () => {
    const result = transferPostingFx({
      sourceAmount: 100_000,
      destinationAmount: 24.39,
      sourceCurrency: "COP",
      destinationCurrency: "USD",
      reportingCurrency: "COP",
      quotedRate: 4_100,
    });

    expect(result.source).toEqual({ baseAmount: 100_000, exchangeRate: 1 });
    expect(result.destination.exchangeRate).toBeCloseTo(100_000 / 24.39, 10);
    expect(databaseBaseAmount(100_000, result.source.exchangeRate))
      .toBe(databaseBaseAmount(24.39, result.destination.exchangeRate));
  });

  it("uses the actual COP amount received as the shared value for USD -> COP", () => {
    const result = transferPostingFx({
      sourceAmount: 24.39,
      destinationAmount: 99_950,
      sourceCurrency: "USD",
      destinationCurrency: "COP",
      reportingCurrency: "COP",
      quotedRate: 4_100,
    });

    expect(result.destination).toEqual({ baseAmount: 99_950, exchangeRate: 1 });
    expect(result.source.exchangeRate).toBeCloseTo(99_950 / 24.39, 10);
    expect(databaseBaseAmount(24.39, result.source.exchangeRate))
      .toBe(databaseBaseAmount(99_950, result.destination.exchangeRate));
  });

  it("keeps same-currency COP transfers exact", () => {
    expect(transferPostingFx({ sourceAmount: 1_234_567.89, destinationAmount: 1_234_567.89, sourceCurrency: "COP", destinationCurrency: "COP", reportingCurrency: "COP" }))
      .toEqual({ source: { baseAmount: 1_234_567.89, exchangeRate: 1 }, destination: { baseAmount: 1_234_567.89, exchangeRate: 1 } });
  });

  it("values same-currency USD transfers with their fixed historical quote", () => {
    const result = transferPostingFx({ sourceAmount: 35.25, destinationAmount: 35.25, sourceCurrency: "USD", destinationCurrency: "USD", reportingCurrency: "COP", quotedRate: 4_087.5 });
    expect(result.source).toEqual({ baseAmount: 144_084.375, exchangeRate: 4_087.5 });
    expect(result.destination).toEqual(result.source);
  });
});

describe("normalizeTransferPostings", () => {
  it("repairs a legacy queued COP -> USD transfer before retrying it", () => {
    const rows: Transaction[] = [
      { id: "out", kind: "transfer_out", amount: 100_000, accountId: "cop", transferGroupId: "group", description: "Cambio", occurredOn: "2026-08-26", createdAt: "2026-08-26T00:00:00Z", nativeCurrencyCode: "COP", baseCurrencyCode: "COP", baseAmount: 100_000, exchangeRate: 1 },
      { id: "in", kind: "transfer_in", amount: 24.39, accountId: "usd", transferGroupId: "group", description: "Cambio", occurredOn: "2026-08-26", createdAt: "2026-08-26T00:00:00Z", nativeCurrencyCode: "USD", baseCurrencyCode: "COP", baseAmount: 99_999, exchangeRate: 4_100 },
    ];

    const [outgoing, incoming] = normalizeTransferPostings(rows);
    expect(outgoing).not.toBe(rows[0]);
    expect(outgoing.baseAmount).toBe(100_000);
    expect(incoming.baseAmount).toBe(100_000);
    expect(databaseBaseAmount(outgoing.amount, outgoing.exchangeRate!))
      .toBe(databaseBaseAmount(incoming.amount, incoming.exchangeRate!));
  });

  it("repairs a legacy queued USD -> COP transfer before retrying it", () => {
    const rows: Transaction[] = [
      { id: "out", kind: "transfer_out", amount: 24.39, accountId: "usd", transferGroupId: "reverse", description: "Cambio", occurredOn: "2026-08-26", createdAt: "2026-08-26T00:00:00Z", nativeCurrencyCode: "USD", baseCurrencyCode: "COP", baseAmount: 100_000, exchangeRate: 4_100 },
      { id: "in", kind: "transfer_in", amount: 99_950, accountId: "cop", transferGroupId: "reverse", description: "Cambio", occurredOn: "2026-08-26", createdAt: "2026-08-26T00:00:00Z", nativeCurrencyCode: "COP", baseCurrencyCode: "COP", baseAmount: 99_950, exchangeRate: 1 },
    ];
    const [outgoing, incoming] = normalizeTransferPostings(rows);
    expect(outgoing.baseAmount).toBe(99_950);
    expect(incoming.baseAmount).toBe(99_950);
    expect(databaseBaseAmount(outgoing.amount, outgoing.exchangeRate!))
      .toBe(databaseBaseAmount(incoming.amount, incoming.exchangeRate!));
  });
});

describe("exactPostingExchangeRate", () => {
  it("keeps enough decimal precision for PostgreSQL at very large balances", () => {
    const rate = exactPostingExchangeRate(90_000_000_000_000, 21_951_219_512.19);
    expect(rate).toMatch(/^4100\.0000000009/);
    expect(rate.length).toBeGreaterThan(30);
  });
});
