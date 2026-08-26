import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { stat, writeFile } from "node:fs/promises";
import { createStressFinanceState, STRESS_TRANSACTION_COUNT } from "../fixtures/stress-finance-state";
import { encryptedStressStateIsStored, seedStressState } from "./helpers/seed-stress-state";

type RouteMetric = {
  route: string;
  readyMs: number;
  domNodes: number;
  scrollWidth: number;
  clientWidth: number;
  moneyOutsideViewport: Array<{ text: string; left: number; right: number }>;
};

const stressState = createStressFinanceState();

function currentProjectIs(testInfo: TestInfo, ...names: string[]) {
  return names.includes(testInfo.project.name);
}

function isBrowserEngineNoise(message: string) {
  return message === 'Viewport argument key "interactive-widget" not recognized and ignored.'
    || (/\/_rsc=.+ due to access control checks\.$/.test(message) && message.includes("127.0.0.1:3210"));
}

async function waitForApp(page: Page) {
  const content = page.locator("main[data-app-content]");
  await expect(content).toBeVisible({ timeout: 30_000 });
  await expect(content).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Preparando tus finanzas" })).toHaveCount(0);
}

async function inspectRoute(page: Page, route: string): Promise<RouteMetric> {
  const started = performance.now();
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  const readyMs = Math.round(performance.now() - started);
  const layout = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const moneyOutsideViewport = [...document.querySelectorAll<HTMLElement>(".tabular-nums")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
      })
      .slice(0, 12)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: (element.textContent ?? "").trim().slice(0, 100), left: Math.round(rect.left), right: Math.round(rect.right) };
      });
    return {
      domNodes: document.querySelectorAll("*").length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      moneyOutsideViewport,
    };
  });
  expect(layout.scrollWidth, `${route} creó desplazamiento horizontal`).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.moneyOutsideViewport, `${route} sacó cifras fuera del viewport`).toEqual([]);
  return { route, readyMs, ...layout };
}

async function useCompleteHistory(page: Page) {
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await page.getByRole("button", { name: "Todo", exact: true }).click();
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByTitle("Todo tu historial")).toBeVisible();
}

test.describe("10.000 movimientos y cifras extremas", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/trm**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rate: 4_125, validFrom: "2026-08-26", validTo: "2026-08-26", source: "sfc_trm", provider: "Superintendencia Financiera de Colombia" }),
      });
    });
    await seedStressState(page, stressState);
  });

  test("las rutas críticas siguen siendo legibles, paginadas y contenidas", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });

    const metrics: RouteMetric[] = [];
    metrics.push(await inspectRoute(page, "/"));
    await expect(page.locator("[data-dashboard-transaction]")).toHaveCount(5);
    await expect(page.locator("[data-dashboard-balance]")).toContainText("$");
    await page.screenshot({ path: testInfo.outputPath("stress-dashboard.png"), animations: "disabled", fullPage: true });

    metrics.push(await inspectRoute(page, "/cuentas"));
    await expect(page.getByText("Patrimonio líquido estimado")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("stress-accounts.png"), animations: "disabled", fullPage: true });

    metrics.push(await inspectRoute(page, "/movimientos"));
    await useCompleteHistory(page);
    await expect(page.getByText("12 movimientos en esta página")).toBeVisible();
    const firstPageId = await page.getByRole("list", { name: "Movimientos" }).getByRole("listitem").first().getAttribute("data-transaction-id");
    await page.getByRole("button", { name: "Página siguiente" }).click();
    await expect(page.getByText("Página 2 · 12 movimientos")).toBeVisible();
    const secondPageId = await page.getByRole("list", { name: "Movimientos" }).getByRole("listitem").first().getAttribute("data-transaction-id");
    expect(secondPageId).not.toBe(firstPageId);
    const movementUrl = new URL(page.url());
    metrics.push(await inspectRoute(page, `${movementUrl.pathname}${movementUrl.search}`));
    await page.screenshot({ path: testInfo.outputPath("stress-movements.png"), animations: "disabled", fullPage: true });

    metrics.push(await inspectRoute(page, "/presupuestos?vista=simulador"));
    await expect(page.getByRole("tab", { name: /Simulador/ })).toHaveAttribute("aria-selected", "true");

    metrics.push(await inspectRoute(page, "/movimientos?vista=calendario"));
    await expect(page.getByLabel("Calendario financiero")).toBeVisible({ timeout: 30_000 });

    metrics.push(await inspectRoute(page, "/reportes?periodo=24m"));
    await expect(page.getByRole("heading", { name: "Flujo de caja" })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: testInfo.outputPath("stress-reports.png"), animations: "disabled", fullPage: true });

    const encrypted = await encryptedStressStateIsStored(page);
    expect(encrypted.legacyRemoved).toBe(true);
    expect(encrypted.encrypted).toBe(true);
    expect(encrypted.bytes).toBeGreaterThan(1_000_000);
    const productErrors = runtimeErrors.filter((message) => !isBrowserEngineNoise(message));
    expect(productErrors).toEqual([]);
    const metricsPath = testInfo.outputPath("stress-route-metrics.json");
    await writeFile(metricsPath, JSON.stringify({ transactions: STRESS_TRANSACTION_COUNT, project: testInfo.project.name, metrics, ignoredBrowserMessages: runtimeErrors.filter(isBrowserEngineNoise) }, null, 2));
    await testInfo.attach("stress-route-metrics", { path: metricsPath, contentType: "application/json" });
  });

  test("la accesibilidad esencial no retrocede con datos extremos", async ({ page }, testInfo) => {
    test.skip(!currentProjectIs(testInfo, "phone-320", "desktop-2k"), "La matriz accesible extrema usa los dos bordes de tamaño.");
    test.setTimeout(120_000);
    for (const route of ["/", "/movimientos", "/reportes?periodo=24m"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await waitForApp(page);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
      expect(serious, `${route}: ${serious.map((item) => `${item.id} (${item.nodes.length})`).join(", ")}`).toEqual([]);
    }
  });

  test("exporta los 10.000 movimientos a un Excel real", async ({ page }, testInfo) => {
    test.skip(!currentProjectIs(testInfo, "desktop-1080"), "La exportación pesada se mide una sola vez.");
    test.setTimeout(180_000);
    await page.goto("/movimientos", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await useCompleteHistory(page);
    const button = page.getByRole("button", { name: /Exportar (movimientos )?a Excel/ }).first();
    const started = performance.now();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), button.click()]);
    const path = await download.path();
    expect(download.suggestedFilename()).toMatch(/^Moneva - Movimientos - .+\.xlsx$/);
    expect(path).toBeTruthy();
    const file = await stat(path!);
    expect(file.size).toBeGreaterThan(500_000);
    const exportDurationMs = Math.round(performance.now() - started);
    const excel = await import("exceljs");
    const WorkbookConstructor = excel.Workbook ?? excel.default.Workbook;
    const workbook = new WorkbookConstructor();
    await workbook.xlsx.readFile(path!);
    const movementSheet = workbook.getWorksheet("Movimientos");
    let exportedRows = 0;
    movementSheet?.eachRow((row, rowNumber) => { if (rowNumber > 9 && row.getCell(20).value) exportedRows += 1; });
    expect(exportedRows).toBeGreaterThan(9_000);
    const metricsPath = testInfo.outputPath("stress-export-metric.json");
    await writeFile(metricsPath, JSON.stringify({ ledgerRows: STRESS_TRANSACTION_COUNT, exportedRows, exportDurationMs, bytes: file.size }, null, 2));
    await testInfo.attach("stress-export-metric", { path: metricsPath, contentType: "application/json" });
  });
});
