import { describe, expect, it } from "vitest";
import {
  REPORTING_CURRENCY_CODE,
  assertExchangeRate,
  assertSupportedAccountCurrency,
  convertNativeToReporting,
  nativeToReportingRate,
  recurringOccurrenceReportingAmount,
  recurringRuleReportingAmount,
  transactionReportingAmount,
} from "./currency";

describe("contrato COP/USD", () => {
  it("mantiene COP como moneda contable canónica", () => {
    expect(REPORTING_CURRENCY_CODE).toBe("COP");
    expect(nativeToReportingRate("COP", "COP", 4_100)).toBe(1);
    expect(convertNativeToReporting(250_000, "COP", "COP", 4_100)).toBe(250_000);
  });

  it("convierte USD a COP con la TRM capturada", () => {
    expect(nativeToReportingRate("USD", "COP", 4_100)).toBe(4_100);
    expect(convertNativeToReporting(25.5, "USD", "COP", 4_100)).toBe(104_550);
  });

  it("invierte correctamente la TRM si una utilidad defensiva reporta en USD", () => {
    expect(nativeToReportingRate("COP", "USD", 4_000)).toBe(0.00025);
    expect(convertNativeToReporting(4_000_000, "COP", "USD", 4_000)).toBe(1_000);
  });

  it("rechaza monedas, tasas y precisiones fuera del contrato", () => {
    expect(() => assertSupportedAccountCurrency("EUR")).toThrow("COP o USD");
    expect(() => nativeToReportingRate("USD", "COP")).toThrow("mayor que cero");
    expect(() => assertExchangeRate(0)).toThrow("mayor que cero");
    expect(() => assertExchangeRate(Number.POSITIVE_INFINITY)).toThrow("mayor que cero");
    expect(() => assertExchangeRate(4_100.123456789)).toThrow("ocho decimales");
  });

  it("convierte compromisos programados al snapshot contable", () => {
    expect(recurringOccurrenceReportingAmount({ amount: 30, exchangeRate: 4_125 })).toBe(123_750);
    expect(recurringOccurrenceReportingAmount({ amount: 123_750, exchangeRate: 1 })).toBe(123_750);
    expect(recurringRuleReportingAmount({ amount: 19.99, exchangeRate: 4_087.5 })).toBeCloseTo(81_709.125, 8);
  });

  it("prioriza el snapshot contable y migra filas locales antiguas con su tasa", () => {
    expect(transactionReportingAmount({ amount: 25, baseAmount: 102_500, exchangeRate: 4_000 })).toBe(102_500);
    expect(transactionReportingAmount({ amount: 25, exchangeRate: 4_100 })).toBe(102_500);
    expect(transactionReportingAmount({ amount: 25 })).toBe(25);
  });
});
