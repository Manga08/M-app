import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-24T12:00:00Z") });
});

async function choosePeriod(page: Page, label: "6 meses" | "1 año") {
  const quickPeriodGroup = page.getByRole("group", { name: "Periodo rápido" });
  if (await quickPeriodGroup.isVisible()) {
    await quickPeriodGroup.getByRole("button", { name: label, exact: true }).click();
    return;
  }

  const periodToolbar = page.getByRole("region", { name: "Periodo y filtros del reporte" });
  await periodToolbar.getByRole("button", { name: /^(Este mes|6 meses|1 año|2 años)$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await dialog.getByRole("button", { name: "Aplicar filtros" }).scrollIntoViewIfNeeded();
  await dialog.getByRole("button", { name: "Aplicar filtros" }).click();
}

test("reportes v2 conserva filtros, composición y navegación", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/reportes", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ingresos y gastos a lo largo del periodo" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "En qué gastaste" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cómo quedaron tus cuentas" })).toBeVisible();

  const widths = await page.evaluate(() => {
    const client = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")].map((element) => { const rect = element.getBoundingClientRect(); return { tag: element.tagName, className: String(element.className).slice(0, 140), left: rect.left, right: rect.right, width: rect.width }; }).filter((item) => item.left < -1 || item.right > client + 1).sort((a, b) => b.width - a.width).slice(0, 8);
    return { client, scroll: document.documentElement.scrollWidth, offenders };
  });
  expect(widths.scroll, JSON.stringify(widths.offenders, null, 2)).toBeLessThanOrEqual(widths.client + 1);

  await choosePeriod(page, "6 meses");
  await expect(page).toHaveURL(/periodo=6m/);
  await choosePeriod(page, "1 año");
  await expect(page).toHaveURL(/periodo=12m/);
  await page.goBack({ waitUntil: "commit" });
  const restoredPeriod = page.getByRole("button", { name: "6 meses" });
  await expect(restoredPeriod).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 640) await expect(restoredPeriod).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(700);
  const dataScreenshot = testInfo.outputPath("reports-data.png");
  await page.screenshot({ path: dataScreenshot, fullPage: true, animations: "disabled", caret: "hide" });
  await testInfo.attach("reports-with-data", { path: dataScreenshot, contentType: "image/png" });

  await page.getByRole("button", { name: /Filtros/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configurar reporte" })).toBeVisible();
  const applyButton = page.getByRole("button", { name: "Aplicar filtros" });
  await applyButton.scrollIntoViewIfNeeded();
  await applyButton.click();
  await page.getByLabel("Buscar movimientos", { exact: true }).fill("café");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).not.toHaveURL(/buscar=/);
  await expect(page.getByRole("button", { name: "Quitar filtro Búsqueda: café" })).toBeVisible();
  const screenshot = testInfo.outputPath("reports-full.png");
  await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled", caret: "hide" });
  await testInfo.attach("reports-full", { path: screenshot, contentType: "image/png" });
  expect(errors).toEqual([]);
});

test("el Excel usa los filtros y se descarga como xlsx", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/reportes?periodo=month", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Ingresos y gastos a lo largo del periodo" })).toBeVisible({ timeout: 15_000 });
  const button = page.getByRole("button", { name: "Exportar a Excel", exact: true }).last();
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toMatch(/^Moneva - Reporte - .+\.xlsx$/);
});

test("Plan mantiene las tres herramientas legibles y sin desbordes", async ({ page }, testInfo) => {
  await page.goto("/presupuestos", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Presupuesto", exact: true })).toBeVisible();
  const tools = page.getByRole("navigation", { name: "Herramientas de planificación" });
  await expect(tools.getByRole("link", { name: "Repartir por porcentajes" })).toBeVisible();
  await expect(tools.getByRole("link", { name: "Presupuesto mensual" })).toHaveAttribute("aria-current", "page");
  await expect(tools.getByRole("link", { name: "Probar en el simulador" })).toBeVisible();
  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  const screenshot = testInfo.outputPath("plan-full.png");
  await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled", caret: "hide" });
  await testInfo.attach("plan-full", { path: screenshot, contentType: "image/png" });
});
