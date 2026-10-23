import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoFinanceState } from "../../src/lib/finance/demo-data";
import type { FinanceState, Transaction } from "../../src/lib/finance/types";
import { seedStressState } from "./helpers/seed-stress-state";

function stateFor(scenario: "empty" | "basic" | "partial" | "many" | "distribution") {
  const state = structuredClone(demoFinanceState);
  for (const key of Object.keys(state) as Array<keyof FinanceState>) {
    if (Array.isArray(state[key]) && !["accounts", "categories", "groupAllocations"].includes(key)) (state as unknown as Record<string, unknown>)[key] = [];
  }
  state.liabilityOverview = { ...state.liabilityOverview, items: [], totalReportingDebt: 0 };
  state.accounts = [{ ...state.accounts[0], name: "Cuenta del día a día", initialBalance: scenario === "empty" ? 0 : 5_000_000, openingBalanceDate: "2026-01-01", currencyCode: "COP" }];
  state.groupAllocations = state.groupAllocations.map((item) => ({ ...item, includedInPlan: scenario === "distribution", targetPercent: scenario === "distribution" ? item.targetPercent : 0 }));
  const expenses = state.categories.filter((item) => item.kind === "expense" && item.group === "needs");
  const income = state.categories.find((item) => item.kind === "income")!;
  const movement = (id: string, amount: number, categoryId: string, kind: Transaction["kind"] = "expense"): Transaction => ({ id, kind, amount, accountId: state.accounts[0].id, categoryId, description: `Registro ${id}`, occurredOn: "2026-08-20", createdAt: "2026-08-20T12:00:00Z" });
  if (scenario !== "empty") state.transactions = [movement("income", 1_000_000, income.id, "income"), movement("food", scenario === "partial" ? 100_000 : 200_000, expenses[0].id)];
  if (scenario === "partial") { state.transactions.push(movement("unbudgeted", 300_000, expenses[1].id)); state.budgets.push({ id: "limit", month: "2026-08-01", categoryId: expenses[0].id, amount: 100_000 }); }
  if (scenario === "many") state.transactions = Array.from({ length: 145 }, (_, index) => movement(`expense-${String(index).padStart(4, "0")}`, 1_000_000_000_000, expenses[0].id));
  return state;
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-24T12:00:00Z") });
  await page.route("**/*.supabase.co/**", (route) => route.abort());
});

for (const scenario of ["empty", "basic", "partial", "distribution"] as const) test(`Reportes claro y opcional: ${scenario}`, async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await seedStressState(page, stateFor(scenario));
  await page.goto("/reportes");
  await expect(page.getByRole("region", { name: "Resumen del periodo" })).toBeVisible();
  await expect(page.getByText("Diferencia del periodo", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cómo quedaron tus cuentas" })).toBeVisible();
  await expect(page.getByText("Presupuesto disponible", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Metas y deudas actuales" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath(`reports-${scenario}-initial.png`), fullPage: false, animations: "disabled" });
  if (scenario === "empty") {
    await expect(page.getByRole("heading", { name: "Todavía no hay movimientos en estas fechas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "En qué gastaste" })).toHaveCount(0);
  } else {
    await expect(page.getByRole("heading", { name: "En qué gastaste" })).toBeVisible();
    await page.getByText("Cómo se calculan estas cifras", { exact: true }).click();
    await expect(page.getByText(/El saldo que ya tenías pertenece/)).toBeVisible();
  }
  if (scenario === "partial") {
    await expect(page.getByRole("heading", { name: "Cómo vas frente a tus presupuestos" })).toBeVisible();
    await expect(page.getByLabel(/Necesidades: consumo del presupuesto/)).toHaveAttribute("aria-valuetext", "100% del límite, solo gasto presupuestado");
    await expect(page.getByText("400%", { exact: true })).toHaveCount(0);
  } else await expect(page.getByRole("heading", { name: "Cómo vas frente a tus presupuestos" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  const screenshot = testInfo.outputPath(`reports-${scenario}.png`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
  await testInfo.attach(scenario, { path: screenshot, contentType: "image/png" });
  expect(errors).toEqual([]);
});

test("búsqueda visible privada, detalle y Atrás conservan contexto", async ({ page }) => {
  await seedStressState(page, stateFor("basic")); await page.goto("/reportes");
  await expect(page.getByText("Diferencia del periodo", { exact: true })).toBeVisible();
  await page.getByLabel("Buscar movimientos", { exact: true }).fill("food");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Quitar filtro Búsqueda: food" })).toBeVisible();
  await expect(page).not.toHaveURL(/food|buscar=/);
  await expect(page.locator("#report-movements")).toContainText("1 movimientos");
  await page.locator("#report-movements").getByRole("link").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Buscar movimientos", { exact: true })).toHaveValue("food");
  await page.getByRole("button", { name: "Quitar filtro Búsqueda: food" }).click();
  await expect(page.locator("#report-movements")).toContainText("2 movimientos");
});

test("la evidencia pagina más allá de los primeros cien registros", async ({ page }, testInfo) => {
  test.skip(!["phone-320", "desktop-1080"].includes(testInfo.project.name));
  await seedStressState(page, stateFor("many")); await page.goto("/reportes");
  const section = page.locator("#report-movements");
  await expect(section).toContainText("145 movimientos");
  for (let next = 2; next <= 10; next++) await section.getByRole("button", { name: `Ir a la página ${next} de movimientos del reporte`, exact: true }).click();
  await expect(section).toContainText("página 10 de 13");
  await expect(section.getByRole("link")).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("reporte accesible en ambos temas sin obligar a planificar", async ({ page }, testInfo) => {
  test.skip(!["phone-320", "phone-430", "desktop-1080"].includes(testInfo.project.name));
  await seedStressState(page, stateFor("basic")); await page.goto("/reportes");
  await expect(page.getByRole("heading", { name: "En qué gastaste" })).toBeVisible();
  for (const mode of ["light", "dark"]) {
    await page.evaluate((theme) => { document.documentElement.classList.remove("light", "dark"); document.documentElement.classList.add(theme); }, mode);
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  }
});

test("Crimson oscuro conserva filtros, foco y movimiento reducido", async ({ page }, testInfo) => {
  test.skip(!["phone-430", "desktop-1080"].includes(testInfo.project.name));
  const state = stateFor("partial");
  state.profile!.themeMode = "dark"; state.profile!.colorTheme = "crimson";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedStressState(page, state); await page.goto("/reportes");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Cómo vas frente a tus presupuestos" })).toBeVisible();
  await page.getByRole("button", { name: /Filtros/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Filtros/ })).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  const path = testInfo.outputPath("reports-crimson-initial.png");
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
  await testInfo.attach("Crimson oscuro", { path, contentType: "image/png" });
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("el reporte exporta sus 10.000 movimientos, no solo la página visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1080");
  test.setTimeout(180_000);
  const state = stateFor("many"), template = state.transactions[0];
  state.transactions = Array.from({ length: 10_000 }, (_, index) => ({ ...template, id: `large-${String(index).padStart(5, "0")}`, amount: 100_000_000 }));
  await seedStressState(page, state); await page.goto("/reportes");
  await expect(page.locator("#report-movements")).toContainText("10000 movimientos");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar a Excel", exact: true }).last().click()]);
  const excel = await import("exceljs"); const workbook = new (excel.Workbook ?? excel.default.Workbook)();
  await workbook.xlsx.readFile((await download.path())!);
  const movements = workbook.getWorksheet("Movimientos")!;
  const headers = movements.getRow(9).values as Array<unknown>;
  const idColumn = headers.indexOf("Id del movimiento");
  let count = 0;
  movements.eachRow((row, index) => { if (index > 9 && row.getCell(idColumn).value) count++; });
  expect(count).toBe(10_000);
  expect(workbook.getWorksheet("Resumen")!.getCell("B9").value).toBe(1_000_000_000_000);
  expect(workbook.getWorksheet("Categorías")!.getRow(9).values).not.toContain("Presupuesto");
});
