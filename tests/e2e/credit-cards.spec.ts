import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("credit cards remain coherent from account hub to detail and purchase", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/cuentas?vista=tarjetas", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Tus tarjetas" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Visa terminada en 4242", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByText("Visa terminada en 4242", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Visa terminada en 4242" })).toBeVisible();
  await expect(page.getByText("Compra → corte → pago")).toBeVisible();
  await expect(page.getByText("Compras a cuotas")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Registrar compra" }).click();
  const purchaseDialog = page.getByRole("dialog", { name: "¿Qué pasó con tu dinero?" });
  await expect(purchaseDialog).toBeVisible();
  await expect(purchaseDialog.getByText("Cómo pagarás esta compra")).toBeVisible();
  await expectSelectedValue(purchaseDialog.getByRole("combobox", { name: "Número de cuotas" }), "1", "Una cuota");
  await expectNoHorizontalOverflow(page);
  expect(runtimeErrors).toEqual([]);
});

test("card creation and statement reconciliation expose accessible canonical forms", async ({ page }) => {
  await page.goto("/cuentas?vista=tarjetas", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Nueva tarjeta" }).click();
  const cardDialog = page.getByRole("dialog", { name: "Nueva tarjeta" });
  await expect(cardDialog).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");

  await page.goto("/cuentas/tarjetas/acc-visa", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Conciliar extracto" }).click();
  const statementDialog = page.getByRole("dialog", { name: "Conciliar extracto" });
  await expect(statementDialog).toBeVisible();
  await expect(statementDialog.getByLabel("Total a pagar")).toBeVisible();
  await expect(statementDialog.getByText(/no solicita ni almacena el archivo/i)).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === "string" ? element.className : "",
          parentClassName: typeof element.parentElement?.className === "string" ? element.parentElement.className : "",
          text: element.textContent?.trim().slice(0, 80),
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          width: Math.round(bounds.width),
        };
      })
      .filter((bounds) => bounds.left < -1 || bounds.right > document.documentElement.clientWidth + 1)
      .slice(0, 8),
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function expectSelectedValue(locator: import("@playwright/test").Locator, nativeValue: string, visibleValue: string) {
  await expect(locator).toBeVisible();
  const selection = await locator.evaluate((element) => element instanceof HTMLSelectElement ? element.value : element.textContent?.trim());
  expect(selection === nativeValue || selection === visibleValue, String(selection)).toBe(true);
}
