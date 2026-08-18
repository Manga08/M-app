import { describe, expect, it } from "vitest";
import { financeIconCatalog, normalizeFinanceIcon, suggestFinanceIcon } from "@/lib/finance/icon-catalog";

describe("finance icon catalog", () => {
  it("recognizes curated brands without an external request", () => {
    expect(suggestFinanceIcon("Pago mensual Spotify")).toBe("brand:spotify");
    expect(suggestFinanceIcon("Pedido en Uber Eats")).toBe("brand:uber-eats");
    expect(normalizeFinanceIcon("brand:spotify")).toBe("brand:spotify");
    expect(financeIconCatalog.filter((icon) => icon.kind === "brand")).toHaveLength(90);
  });

  it("keeps legacy generic icon identifiers compatible", () => {
    expect(normalizeFinanceIcon("piggy-bank")).toBe("piggy-bank");
    expect(normalizeFinanceIcon("lucide:home")).toBe("home");
  });

  it("rejects URLs and unknown icon identifiers", () => {
    expect(normalizeFinanceIcon("https://example.com/tracker.svg")).toBe("tag");
    expect(normalizeFinanceIcon("brand:unknown-service")).toBe("tag");
  });
});
