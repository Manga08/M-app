import { expect, test } from "@playwright/test";

test("the three plan surfaces stay usable without horizontal overflow", async ({ page }, testInfo) => {
  await page.goto("/presupuestos", { waitUntil: "networkidle" });
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await expect(page.getByRole("tab", { name: /Distribución/ })).toHaveAttribute("aria-selected", "true");

  for (const name of ["Distribución", "Presupuesto", "Simulador"]) {
    const tab = page.getByRole("tab", { name: new RegExp(name) });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(widths.scroll, `${name} should not widen the document`).toBeLessThanOrEqual(widths.client + 1);
  }

  await page.screenshot({ path: testInfo.outputPath("plan-simulator.png"), animations: "disabled", fullPage: false });
});

test("budget automation remains a draft until one atomic save", async ({ page }, testInfo) => {
  await page.goto("/presupuestos?vista=presupuesto", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Presupuesto mensual" })).toBeVisible();
  const income = page.getByLabel("Ingreso esperado");
  await income.fill("3000000");
  await expect(income).toHaveValue("3.000.000");
  await page.getByRole("button", { name: /Asignación automática/ }).click();
  await page.getByRole("menuitem", { name: /Repartir por igual/ }).click();
  await expect(page.getByText("Presupuesto sin guardar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar plan" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("plan-budget-draft.png"), animations: "disabled", fullPage: false });
});

test("the simulator edits memory only and never exposes a persistence action", async ({ page }) => {
  await page.goto("/presupuestos?vista=simulador", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Simulador" })).toBeVisible();
  await page.getByRole("button", { name: "Categoría principal" }).click();
  await expect(page.getByLabel("Nombre de la categoría principal simulada").last()).toHaveValue("Nueva categoría");
  await expect(page.getByRole("button", { name: /Guardar|Aplicar al plan real/i })).toHaveCount(0);
  await expect(page.getByText(/no se envía ninguna escritura/i)).toBeVisible();
});
