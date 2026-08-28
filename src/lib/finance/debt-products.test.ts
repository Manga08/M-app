import { describe, expect, it } from "vitest";
import {
  debtCalculationLabel,
  debtFrequencyLabel,
  debtNeedsRate,
  debtProductLiabilityKind,
  debtProductPreset,
  debtProductPresets,
} from "@/lib/finance/debt-products";
import { normalizeFinanceIcon } from "@/lib/finance/icon-catalog";

describe("debt product presets", () => {
  it("covers the guided Colombian debt families without making cards a duplicate target", () => {
    expect(debtProductPresets.map((item) => item.value)).toEqual([
      "person",
      "consumer",
      "vehicle",
      "mortgage_cop",
      "mortgage_uvr",
      "payroll",
      "education",
      "business",
      "bnpl",
      "other",
    ]);
    expect(debtProductPresets.some((item) => item.value === ("credit_card" as never))).toBe(false);
    expect(debtProductPresets.every((item) => normalizeFinanceIcon(item.icon) === item.icon)).toBe(true);
  });

  it("uses safe defaults and explains them in plain Spanish", () => {
    expect(debtProductPreset("mortgage_uvr")).toMatchObject({ indexName: "UVR", calculationMethod: "constant_payment" });
    expect(debtProductPreset("unknown").value).toBe("other");
    expect(debtCalculationLabel("constant_payment")).toBe("Cuota parecida cada periodo");
    expect(debtFrequencyLabel("biweekly")).toBe("Cada 14 días");
    expect(debtNeedsRate("zero_interest")).toBe(false);
    expect(debtNeedsRate("constant_payment")).toBe(true);
    expect(debtProductLiabilityKind("person")).toBe("personal_debt");
    expect(debtProductLiabilityKind("mortgage_uvr")).toBe("loan");
  });
});
