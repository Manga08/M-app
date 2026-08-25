import { describe, expect, it } from "vitest";
import { bankIconBySlug, bankIconCatalog } from "@/lib/finance/bank-icon-catalog";
import { financeIconCatalog, normalizeFinanceIcon, suggestFinanceIcon } from "@/lib/finance/icon-catalog";

describe("finance icon catalog", () => {
  it("recognizes curated brands without an external request", () => {
    expect(suggestFinanceIcon("Pago mensual Spotify")).toBe("brand:spotify");
    expect(suggestFinanceIcon("Pedido en Uber Eats")).toBe("brand:uber-eats");
    expect(normalizeFinanceIcon("brand:spotify")).toBe("brand:spotify");
    expect(financeIconCatalog.filter((icon) => icon.kind === "brand")).toHaveLength(153);
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

  it("recognizes the curated Colombian commerce set", () => {
    expect(suggestFinanceIcon("Almuerzo Mr Tenders")).toBe("brand:mr-tenders");
    expect(suggestFinanceIcon("Bubble tea en Mushu")).toBe("brand:mushu");
    expect(suggestFinanceIcon("Bebida T4 Colombia")).toBe("brand:t4-colombia");
    expect(suggestFinanceIcon("Mercado PriceSmart")).toBe("brand:pricesmart");
    expect(suggestFinanceIcon("Boletas Cine Colombia")).toBe("brand:cine-colombia");
    expect(suggestFinanceIcon("Helados Clemente")).toBe("brand:helados-clemente");
    expect(suggestFinanceIcon("Cena Rogelio's Red Tacos")).toBe("brand:rogelios-red-tacos");
    expect(suggestFinanceIcon("Pizza Little Caesars")).toBe("brand:little-caesars");
    expect(suggestFinanceIcon("Chef Burguer")).toBe("brand:chef-burger");
    expect(suggestFinanceIcon("Pedido Papa Jhons")).toBe("brand:papa-johns");
    expect(suggestFinanceIcon("Domino's Pizza")).toBe("brand:dominos-pizza");
    expect(suggestFinanceIcon("Aprrisa Pizza")).toBe("brand:aprissa-pizza");
    expect(suggestFinanceIcon("Supermercado Jumbo")).toBe("brand:jumbo-colombia");
    expect(suggestFinanceIcon("Almacenes Éxito")).toBe("brand:exito-colombia");
    expect(suggestFinanceIcon("Mercado Carulla")).toBe("brand:carulla");
    expect(suggestFinanceIcon("Compra en Alkosto")).toBe("brand:alkosto");
    expect(suggestFinanceIcon("Jugos Cosechas")).toBe("brand:cosechas");
    expect(suggestFinanceIcon("Pedido Paranice")).toBe("brand:paranice");
    expect(suggestFinanceIcon("Empanaditas Don Gil")).toBe("brand:don-gil");
    expect(suggestFinanceIcon("Mercado en D1")).toBe("brand:d1-colombia");
    expect(suggestFinanceIcon("Mercado Tiendas Ara")).toBe("brand:ara-colombia");
    expect(suggestFinanceIcon("Compra DollarCity")).toBe("brand:dollarcity");
    expect(suggestFinanceIcon("Ropa Decathlon")).toBe("brand:decathlon");
    expect(suggestFinanceIcon("Almuerzo BACU")).toBe("brand:bacu");
    expect(suggestFinanceIcon("Perfume O Boticário")).toBe("brand:o-boticario");
    expect(suggestFinanceIcon("Uki Fresh Food")).toBe("brand:uki-fresh-food");
    expect(suggestFinanceIcon("Compra Miniso")).toBe("brand:miniso");
  });

  it("keeps legacy generic icon identifiers compatible", () => {
    expect(normalizeFinanceIcon("piggy-bank")).toBe("piggy-bank");
    expect(normalizeFinanceIcon("lucide:home")).toBe("home");
    expect(normalizeFinanceIcon("subscription")).toBe("subscription");
    expect(normalizeFinanceIcon("medicine")).toBe("medicine");
    expect(normalizeFinanceIcon("apartment")).toBe("apartment");
    expect(normalizeFinanceIcon("shopping-cart")).toBe("shopping-cart");
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
    expect(suggestFinanceIcon("Cuenta Global 66")).toBe("bank:global66");
    expect(bankIconBySlug.get("nu-colombia")?.brandSlug).toBe("nubank");
    expect(bankIconBySlug.get("revolut-colombia")?.brandSlug).toBe("revolut");
    expect(bankIconBySlug.get("global66")?.brandSlug).toBe("global66");
    expect(financeIconCatalog.some((icon) => icon.value === "brand:global66")).toBe(false);
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
