import { expect, test } from "@playwright/test";

test("planning tools start with budget and preserve navigation context", async ({ page }) => {
  await page.goto("/presupuestos", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Presupuesto mensual" })).toBeVisible();
  await page.getByRole("link", { name: "Repartir por porcentajes" }).click();
  await expect(page).toHaveURL(/vista=distribucion/);
  await expect(page.getByRole("heading", { name: "Distribución opcional" })).toBeVisible();
  await page.getByRole("link", { name: "Probar en el simulador" }).click();
  await expect(page).toHaveURL(/vista=simulador/);
  await expect(page.getByRole("heading", { name: "Prueba un mes antes de tomar decisiones" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/vista=distribucion/);
  await page.goBack();
  await expect(page).toHaveURL(/\/presupuestos$/);
  await expect(page.getByRole("heading", { name: "Presupuesto mensual" })).toBeVisible();
});

test("back closes transient mobile surfaces before leaving the current page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cuentas", { waitUntil: "networkidle" });

  await page.locator('button[aria-label="Registrar movimiento"]:visible').click();
  await expect(page).toHaveURL(/\/cuentas\?overlay=movement$/);
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/cuentas$/);
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.locator('button[aria-label="Abrir más opciones"]:visible').click();
  await expect(page).toHaveURL(/\/cuentas\?overlay=more$/);
  await expect(page.getByRole("heading", { name: "Más de Moneva" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/cuentas$/);
  await expect(page.getByRole("heading", { name: "Más de Moneva" })).toBeHidden();
});

test("quick transaction keeps its URL until the visual exit completes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cuentas", { waitUntil: "networkidle" });

  await page.locator('button[aria-label="Registrar movimiento"]:visible').click();
  await expect(page).toHaveURL(/\/cuentas\?overlay=movement$/);
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByTestId("quick-transaction-close").click();
  expect(page.url()).toMatch(/\/cuentas\?overlay=movement$/);
  await expect(page).toHaveURL(/\/cuentas$/);
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
});

test("route indicators follow accounts on back and forward", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/movimientos", { waitUntil: "networkidle" });
  const movements = page.locator('a[href="/movimientos"]:visible');
  const accounts = page.locator('a[href="/cuentas"]:visible');
  await expect(movements).toHaveAttribute("aria-current", "page");
  await accounts.click();
  await expect(page).toHaveURL(/\/cuentas$/);
  await expect(accounts).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(/\/movimientos$/);
  await expect(movements).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(accounts).toHaveAttribute("aria-current", "page");
});
