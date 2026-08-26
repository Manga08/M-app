import { expect, test } from "@playwright/test";

test("plan tabs live in URL history and preserve their draft panels", async ({ page }) => {
  await page.goto("/presupuestos", { waitUntil: "networkidle" });

  const distribution = page.getByRole("tab", { name: /Distribución/ });
  const budget = page.getByRole("tab", { name: /Presupuesto/ });
  const simulator = page.getByRole("tab", { name: /Simulador/ });
  await expect(distribution).toHaveAttribute("aria-selected", "true");

  await distribution.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/presupuestos\?vista=presupuesto$/);
  await expect(budget).toHaveAttribute("aria-selected", "true");
  await expect(budget).toBeFocused();
  await expect(page.getByRole("heading", { name: "Presupuesto mensual" })).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/presupuestos\?vista=simulador$/);
  await expect(simulator).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Prueba un mes antes de tomar decisiones" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/presupuestos\?vista=presupuesto$/);
  await expect(budget).toHaveAttribute("aria-selected", "true");

  await page.goBack();
  await expect(page).toHaveURL(/\/presupuestos$/);
  await expect(distribution).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Distribución", exact: true })).toBeVisible();
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

test("route indicators follow the committed URL on back and forward", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/movimientos", { waitUntil: "networkidle" });

  const movements = page.locator('a[href="/movimientos"]:visible');
  const plan = page.locator('a[href="/presupuestos"]:visible');
  await expect(movements).toHaveAttribute("aria-current", "page");

  await plan.click();
  await expect(page).toHaveURL(/\/presupuestos$/);
  await expect(plan).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(/\/movimientos$/);
  await expect(movements).toHaveAttribute("aria-current", "page");

  await page.goForward();
  await expect(page).toHaveURL(/\/presupuestos$/);
  await expect(plan).toHaveAttribute("aria-current", "page");
});
