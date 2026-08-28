import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const auditProjects = new Set(["desktop-chrome", "phone-320"]);
const principalRoutes = [
  "/",
  "/movimientos",
  "/movimientos?vista=programados",
  "/movimientos?vista=calendario",
  "/presupuestos",
  "/presupuestos?vista=presupuesto",
  "/presupuestos?vista=simulador",
  "/metas",
  "/cuentas",
  "/cuentas?vista=tarjetas",
  "/cuentas/tarjetas/acc-visa",
  "/reportes",
  "/ajustes",
  "/perfil",
];
const publicRoutes = ["/login", "/acceso-denegado", "/offline"];

function compactViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 5).map((node) => ({
      target: node.target.join(" "),
      html: node.html,
      summary: node.failureSummary,
    })),
  }));
}

async function audit(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return compactViolations(result.violations);
}

test("principal finance surfaces meet WCAG 2.2 AA", async ({ page }, testInfo) => {
  test.skip(!auditProjects.has(testInfo.project.name), "Axe runs once per interaction model, not once per duplicate viewport.");
  test.setTimeout(180_000);

  for (const route of principalRoutes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should load before its accessibility audit`).toBeLessThan(400);
    await expect(page.locator("main#main-content")).toBeVisible({ timeout: 15_000 });

    expect(await audit(page), `${route} has automated WCAG violations on ${testInfo.project.name}`).toEqual([]);
  }
});

test("public surfaces meet WCAG 2.2 AA", async ({ page }, testInfo) => {
  test.skip(!auditProjects.has(testInfo.project.name), "Axe runs once per interaction model, not once per duplicate viewport.");

  for (const route of publicRoutes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should load before its accessibility audit`).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    expect(await audit(page), `${route} has automated WCAG violations on ${testInfo.project.name}`).toEqual([]);
  }
});

test("principal dialogs and filter sheets meet WCAG 2.2 AA", async ({ page }, testInfo) => {
  test.skip(!auditProjects.has(testInfo.project.name), "Overlays are audited on desktop and the narrowest phone.");
  test.setTimeout(120_000);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Tu mes, de un vistazo." })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.dispatchEvent(new Event("moneva:quick-add")));
  await expect(page.getByRole("dialog", { name: "¿Qué pasó con tu dinero?" })).toBeVisible();
  expect(await audit(page), `Quick movement dialog has automated WCAG violations on ${testInfo.project.name}`).toEqual([]);

  await page.goto("/reportes", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(page.getByRole("heading", { name: "Configurar reporte" })).toBeVisible();
  expect(await audit(page), `Report filters have automated WCAG violations on ${testInfo.project.name}`).toEqual([]);

  await page.goto("/ajustes", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Personalizado/ }).click();
  await expect(page.getByRole("dialog", { name: "Tu color Moneva" })).toBeVisible();
  expect(await audit(page), `Custom theme dialog has automated WCAG violations on ${testInfo.project.name}`).toEqual([]);

  await page.goto("/metas", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Nueva meta" }).click();
  const targetDialog = page.getByRole("dialog", { name: "¿Qué quieres hacer posible?" });
  await expect(targetDialog).toBeVisible();
  expect(await audit(page), `Target form has automated WCAG violations on ${testInfo.project.name}`).toEqual([]);

  await targetDialog.getByRole("button", { name: /Elegir icono/ }).click();
  await expect(page.getByRole("dialog", { name: "Elige un icono" })).toBeVisible();
  expect(await audit(page), `Nested icon picker has automated WCAG violations on ${testInfo.project.name}`).toEqual([]);
});

test("the dark simulator keeps semantic alerts accessible", async ({ page }, testInfo) => {
  test.skip(!auditProjects.has(testInfo.project.name), "Dark-mode contrast is covered on desktop and the narrowest phone.");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/presupuestos?vista=simulador", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Prueba un mes antes de tomar decisiones" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("html")).toHaveClass(/dark/);

  expect(await audit(page), `Dark simulator has automated WCAG violations on ${testInfo.project.name}`).toEqual([]);
});
