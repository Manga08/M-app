import { describe, expect, it } from "vitest";
import { bankIconBySlug, bankIconCatalog } from "@/lib/finance/bank-icon-catalog";
import { financeIconCatalog, normalizeFinanceIcon, suggestFinanceIcon } from "@/lib/finance/icon-catalog";

describe("finance icon catalog", () => {
  it("recognizes curated brands without an external request", () => {
    expect(suggestFinanceIcon("Pago mensual Spotify")).toBe("brand:spotify");
    expect(suggestFinanceIcon("Pedido en Uber Eats")).toBe("brand:uber-eats");
    expect(normalizeFinanceIcon("brand:spotify")).toBe("brand:spotify");
    expect(financeIconCatalog.filter((icon) => icon.kind === "brand")).toHaveLength(123);
  });

  it("recognizes bundled AI brands and Colombian commerce", () => {
    expect(suggestFinanceIcon("Suscripción de ChatGPT Plus")).toBe("brand:chatgpt-openai");
    expect(suggestFinanceIcon("Claude Code")).toBe("brand:claude-code");
    expect(suggestFinanceIcon("OpenCode")).toBe("brand:opencode");
    expect(suggestFinanceIcon("Domicilio Rappi")).toBe("brand:rappi");
    expect(suggestFinanceIcon("Compra Mercado Libre")).toBe("brand:mercado-libre");
    expect(suggestFinanceIcon("Vuelo Avianca")).toBe("brand:avianca");
    expect(suggestFinanceIcon("Espacio Google")).toBe("brand:google");
    expect(suggestFinanceIcon("Plan hogar Movistar")).toBe("brand:movistar");
    expect(suggestFinanceIcon("Billetera MOVii")).toBe("bank:movii");
    expect(suggestFinanceIcon("Compra Amazon USA")).toBe("brand:amazon");
    expect(normalizeFinanceIcon("brand:frisby")).toBe("brand:frisby");
  });

  it("keeps legacy generic icon identifiers compatible", () => {
    expect(normalizeFinanceIcon("piggy-bank")).toBe("piggy-bank");
    expect(normalizeFinanceIcon("lucide:home")).toBe("home");
    expect(normalizeFinanceIcon("subscription")).toBe("subscription");
    expect(normalizeFinanceIcon("medicine")).toBe("medicine");
    expect(financeIconCatalog.filter((icon) => icon.kind === "generic").length).toBeGreaterThanOrEqual(75);
  });

  it("recognizes Colombian banks and wallets locally", () => {
    expect(suggestFinanceIcon("Cuenta de ahorros Bancolombia")).toBe("bank:bancolombia");
    expect(suggestFinanceIcon("Billetera Nequi")).toBe("bank:nequi");
    expect(normalizeFinanceIcon("bank:davivienda")).toBe("bank:davivienda");
    expect(financeIconCatalog.filter((icon) => icon.kind === "bank").length).toBeGreaterThanOrEqual(35);
  });

  it("reuses exact local brand glyphs when they exist for a bank", () => {
    expect(suggestFinanceIcon("Cuenta Nu Colombia")).toBe("bank:nu-colombia");
    expect(suggestFinanceIcon("Cuenta Revolut")).toBe("bank:revolut-colombia");
    expect(bankIconBySlug.get("nu-colombia")?.brandSlug).toBe("nubank");
    expect(bankIconBySlug.get("revolut-colombia")?.brandSlug).toBe("revolut");
  });

  it("uses recognizable local marks for priority Colombian accounts", () => {
    expect(bankIconBySlug.get("bancolombia")?.localMark).toBe("bancolombia");
    expect(bankIconBySlug.get("bbva-colombia")?.localMark).toBe("bbva");
    expect(bankIconBySlug.get("nequi")?.localMark).toBe("nequi");
    expect(bankIconBySlug.get("rappipay")?.localMark).toBe("rappipay");
    expect(suggestFinanceIcon("Cuenta RappiCuenta")).toBe("bank:rappipay");
  });

  it("keeps a local typographic fallback for banks without a bundled mark", () => {
    const fallbacks = bankIconCatalog.filter((bank) => !bank.brandSlug && !bank.localMark);
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(fallbacks.every((bank) => bank.short.length > 0)).toBe(true);
  });

  it("rejects URLs and unknown icon identifiers", () => {
    expect(normalizeFinanceIcon("https://example.com/tracker.svg")).toBe("tag");
    expect(normalizeFinanceIcon("brand:unknown-service")).toBe("tag");
    expect(normalizeFinanceIcon("bank:unknown-bank")).toBe("tag");
  });
});
