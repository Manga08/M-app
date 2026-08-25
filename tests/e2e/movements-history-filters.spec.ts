import { expect, test } from "@playwright/test";

test("a recent movement opens its exact editable detail from the dashboard", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const movement = page.locator("[data-dashboard-transaction]").first();
  await expect(movement).toBeVisible({ timeout: 20_000 });
  const transactionId = await movement.getAttribute("data-transaction-id");
  expect(transactionId).toBeTruthy();

  await movement.click();
  await expect(page).toHaveURL(new RegExp(`/movimientos\\?overlay=movement&transaction=${transactionId}$`), { timeout: 15_000 });
  await expect(page.getByText("Editar movimiento", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Ajusta los detalles" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar cambios" }).first()).toBeVisible();
});

test("history can expand from the current month to precise global filters", async ({ page }, testInfo) => {
  await page.goto("/movimientos", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Historial completo" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(page.getByRole("heading", { name: "Filtrar movimientos" })).toBeVisible();
  await page.getByRole("button", { name: "Todo", exact: true }).click();
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByTitle("Todo tu historial")).toBeVisible();

  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(page.getByRole("combobox", { name: "Cuenta", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Categoría o tipo de ingreso", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Rango", exact: true }).click();
  await expect(page.getByLabel("Desde")).toBeVisible();
  await expect(page.getByLabel("Hasta")).toBeVisible();

  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll, "El historial no debe crear desplazamiento horizontal").toBeLessThanOrEqual(dimensions.client + 1);

  await page.screenshot({ path: testInfo.outputPath("movement-history-filters.png"), animations: "disabled", fullPage: false });
});
