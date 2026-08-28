import { describe, expect, it } from "vitest";
import { minimumPaymentRemaining, paymentExchangeRates, paymentFundingAmount } from "@/components/liability-payment-dialogs";

describe("liability payment currency pairing", () => {
  it("keeps same-currency postings equal", () => {
    expect(paymentFundingAmount(125_000, "COP", "COP", 0)).toBe(125_000);
    expect(paymentFundingAmount(123.45, "USD", "USD", 4_000)).toBe(123.45);
  });

  it("derives exact COP funding for a USD liability", () => {
    const liabilityAmount = 100.25;
    const rate = 4_000;
    const fundingAmount = paymentFundingAmount(liabilityAmount, "USD", "COP", rate);
    expect(fundingAmount).toBe(401_000);
    expect(fundingAmount).toBe(liabilityAmount * rate);
  });

  it("derives USD funding to the cent for a COP liability", () => {
    const liabilityAmount = 401_000;
    const rate = 4_000;
    const fundingAmount = paymentFundingAmount(liabilityAmount, "COP", "USD", rate);
    expect(fundingAmount).toBe(100.25);
    expect(fundingAmount * rate).toBe(liabilityAmount);
  });

  it("refuses to derive a conversion without a positive rate", () => {
    expect(paymentFundingAmount(50, "USD", "COP", 0)).toBe(0);
    expect(paymentFundingAmount(50, "USD", "COP", Number.NaN)).toBe(0);
  });

  it("absorbs currency rounding into the exact effective posting rate", () => {
    const liabilityAmount = 400_001;
    const fundingAmount = paymentFundingAmount(liabilityAmount, "COP", "USD", 4_003.25);
    const rates = paymentExchangeRates(liabilityAmount, "COP", fundingAmount, "USD", 4_003.25);
    expect(fundingAmount).toBe(99.92);
    expect(fundingAmount * rates.fundingExchangeRate).toBeCloseTo(liabilityAmount, 8);
    expect(liabilityAmount * rates.liabilityExchangeRate).toBe(liabilityAmount);
  });

  it("offers only the unpaid part of the minimum", () => {
    expect(minimumPaymentRemaining(120_000, 35_000)).toBe(85_000);
    expect(minimumPaymentRemaining(120_000, 120_000)).toBe(0);
    expect(minimumPaymentRemaining(120_000, 150_000)).toBe(0);
  });
});
