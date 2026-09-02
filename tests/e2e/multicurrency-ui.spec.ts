import { expect, test, type Locator, type Page } from "@playwright/test";
import { multicurrencyFinanceState } from "../fixtures/multicurrency-finance-state";
import { seedStressState } from "./helpers/seed-stress-state";

async function waitForApp(page: Page) {
  const content = page.locator("main[data-app-content]");
  await expect(content).toBeVisible({ timeout: 30_000 });
  await expect(content).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
}

async function chooseAdaptiveOption(page: Page, control: Locator, nativeValue: string, visibleLabel: string) {
  if (await control.evaluate((element) => element.tagName) === "SELECT") {
    await control.selectOption(nativeValue);
    return;
  }
  await control.click();
  await page.getByRole("option", { name: visibleLabel, exact: true }).click();
}

test.describe("contrato visual COP/USD", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-08-27T15:00:00Z"));
    await page.route("**/api/trm?**", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ rate: 4_100, validFrom: "2026-08-27", validTo: "2026-08-27", source: "sfc_trm", provider: "Superintendencia Financiera de Colombia" }),
    }));
    await seedStressState(page, multicurrencyFinanceState);
  });

  test("cuentas, historial, presupuestos, programados y reportes conservan monto nativo y COP contable", async ({ page }, testInfo) => {
    test.skip(!["phone-320", "desktop-1080"].includes(testInfo.project.name), "La matriz usa los extremos móvil y escritorio.");
    test.setTimeout(120_000);
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });

    await page.goto("/cuentas", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await page.getByRole("button", { name: "Mostrar cuentas de Bancolombia" }).click();
    const accountRow = page.getByRole("button", { name: /Editar cuenta Reserva USD/ });
    await expect(accountRow).toContainText("US$ 195,00");
    // The native balance is valued at the current mocked TRM (195 × 4.100).
    await expect(accountRow).toContainText("$ 799.500");

    await page.goto("/movimientos", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    const usdIncome = page.locator('[data-transaction-id="tx-usd-income"]');
    await expect(usdIncome).toContainText("US$ 25,00");
    await expect(usdIncome).toContainText("$ 102.500");

    await page.goto("/presupuestos?vista=presupuesto", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByText(/73\.100 previstos/)).toBeVisible();

    await page.goto("/movimientos?vista=programados", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByText("Gastos previstos este mes").locator("..")).toContainText("$ 73.100");
    const programmed = page.getByRole("listitem").filter({ hasText: "Suscripción USD" });
    await expect(programmed).toContainText("US$ 12,00");

    await page.goto("/reportes", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.getByRole("heading", { name: "Flujo por entidad y cuenta" })).toBeVisible({ timeout: 30_000 });
    const reportedAccount = page.getByText("Reserva USD", { exact: true }).locator("..").locator("..");
    await expect(reportedAccount).toContainText("US$ 195,00");
    // Reports preserve the immutable historical snapshots instead of revaluing at today's TRM.
    await expect(reportedAccount).toContainText("$ 789.500");

    expect(runtimeErrors.filter((message) => !message.includes('Viewport argument key "interactive-widget"'))).toEqual([]);
  });

  test("el formulario exige y explica la conversión para gasto y transferencia USD", async ({ page }, testInfo) => {
    test.skip(!["phone-320", "desktop-1080"].includes(testInfo.project.name), "La interacción se valida en un móvil y un escritorio.");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await page.locator('button[aria-label="Registrar movimiento"]:visible, button:has-text("Nuevo movimiento"):visible').first().click();

    const account = page.getByLabel("Cuenta", { exact: true });
    await chooseAdaptiveOption(page, account, "acc-global-usd", "Reserva USD · USD");
    await expect(page.getByRole("heading", { name: "Conversión a pesos" })).toBeVisible();
    await expect(page.getByLabel("Tasa aplicada")).toHaveValue("4.100");

    await page.getByRole("button", { name: "Transferencia", exact: true }).click();
    const destination = page.getByLabel("Hacia", { exact: true });
    await chooseAdaptiveOption(page, destination, "acc-bancolombia", "Bancolombia · COP");
    await expect(page.getByLabel("Cuenta recibe")).toBeVisible();
    await expect(page.getByText("COP por cada USD", { exact: true })).toBeVisible();

    const layout = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  });
});
