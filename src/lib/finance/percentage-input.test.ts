import { describe, expect, it } from "vitest";
import { sanitizePercentageInput } from "@/lib/finance/percentage-input";

describe("percentage input", () => {
  it("preserves dot decimals instead of multiplying the rate", () => {
    expect(sanitizePercentageInput("22.5")).toBe("22.5");
    expect(sanitizePercentageInput("22,5")).toBe("22.5");
  });

  it("removes labels and keeps only the last decimal separator", () => {
    expect(sanitizePercentageInput("E.A. 18,75 %")).toBe("18.75");
    expect(sanitizePercentageInput("1.234,56")).toBe("1234.56");
  });
});
