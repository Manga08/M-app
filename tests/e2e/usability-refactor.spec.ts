import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { demoFinanceState } from "../../src/lib/finance/demo-data";
import { seedStressState } from "./helpers/seed-stress-state";
import { fillExpenseChoices } from "./helpers/movement-form";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-24T15:00:00Z"));
  await page.route("**/*.supabase.co/**", (route) => route.abort());
});

test("saldo previo, registro sencillo y categorías sin porcentajes", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = structuredClone(demoFinanceState);
  state.accounts = [{ id: "cash-test", name: "Mi efectivo", type: "cash", initialBalance: 10_000_000, currencyCode: "COP", color: "#34d399" }];
  state.transactions = [{ id: "expense-test", accountId: "cash-test", kind: "expense", amount: 200_000, nativeCurrencyCode: "COP", description: "Gasto de agosto", categoryId: state.categories.find((item) => item.kind === "expense")!.id, occurredOn: "2026-08-24", createdAt: "2026-08-24T14:00:00Z" }];
  state.groupAllocations = state.groupAllocations.map((item) => ({ ...item, includedInPlan: false, targetPercent: 0 }));
  state.budgets = []; state.monthlyBudgetPlans = []; state.recurringRules = []; state.recurringOccurrences = [];
  state.creditCards = []; state.financialTargets = []; state.financialTargetEntries = [];
  state.snapshot = undefined;
  await seedStressState(page, state);
  await page.goto("/");
  await expect(page.locator("[data-dashboard-balance]")).toContainText("9.800.000");
  await expect(page.getByText("Cierre estimado", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Diferencia del mes", { exact: true })).toBeVisible();
  await expect(page.getByText(/faltarían|El cierre proyectado es negativo/)).toHaveCount(0);
  const output = `C:/Users/mangu/.codex/visualizations/2026/10/22/moneva-usability/${info.project.name}`;
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: `${output}/inicio-arrastre.png`, fullPage: true });
  if (page.viewportSize()!.width < 1024) await expect(page.getByRole("navigation", { name: "Navegación móvil" }).getByRole("link", { name: "Cuentas", exact: true })).toBeVisible();

  await page.goto("/categorias");
  await expect(page.getByRole("heading", { name: "Categorías", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /Porcentaje para/ })).toHaveCount(0);
  await page.locator("#categories-tab-income").click();
  await expect(page.getByRole("heading", { name: "Tipos de ingreso", exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/categorias.png`, fullPage: true });

  await page.goto("/movimientos");
  await expect(page.getByRole("textbox", { name: "Buscar movimientos" })).toBeVisible();
  await page.getByRole("button", { name: "Este mes", exact: true }).click();
  await page.getByRole("link", { name: "Abrir detalles de Gasto de agosto" }).click();
  await expect(page.getByRole("heading", { name: "Detalle del movimiento" })).toBeVisible();
  await page.getByRole("button", { name: "Editar movimiento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ajusta los detalles" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${output}/editar.png`, fullPage: false });
  expect(errors).toEqual([]);
});

test("pantallas y herramientas conservan jerarquía, foco y dimensiones", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const output = `C:/Users/mangu/.codex/visualizations/2026/10/22/moneva-usability/${info.project.name}`;
  mkdirSync(output, { recursive: true });
  for (const [route, name] of [["/", "inicio"], ["/cuentas", "cuentas"], ["/categorias", "categorias-gastos"], ["/movimientos", "historial"], ["/movimientos?vista=programados", "programados"], ["/movimientos?vista=calendario", "calendario"], ["/presupuestos", "presupuesto"], ["/presupuestos?vista=distribucion", "distribucion"], ["/presupuestos?vista=simulador", "simulador"], ["/metas", "metas"], ["/reportes", "reportes"], ["/ajustes", "ajustes"], ["/login", "login"]]) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator("main").first()).toBeVisible();
    await page.waitForTimeout(350);
    const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(metrics.scroll, route).toBeLessThanOrEqual(metrics.client + 1);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
    // Full-page capture can make prefetched links visible; finish those requests before navigating.
    await page.waitForLoadState("networkidle");
  }
  await page.goto("/ajustes", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Gestionar conexiones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conexiones con asistentes" })).toHaveCount(0);
  await page.goto("/movimientos", { waitUntil: "networkidle" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) }))).toEqual([]);
  expect(errors).toEqual([]);
});

test("deuda simple sin cuota obligatoria y registro sin imágenes", async ({ page }) => {
  await page.goto("/metas?meta=nueva", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Deuda", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Nombre e icono" }).fill("Préstamo de prueba local");
  await expect(dialog.getByRole("button", { name: "Solo llevar el saldo" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("textbox", { name: "Saldo pendiente", exact: true }).fill("400000");
  await expect(dialog.getByText("Primera fecha de pago", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Crear deuda", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Préstamo de prueba local/ }).first()).toBeVisible();
  await page.goto("/movimientos?overlay=movement", { waitUntil: "networkidle" });
  const movement = page.getByRole("dialog");
  await expect(movement.getByRole("heading", { name: "¿Qué pasó con tu dinero?" })).toBeVisible();
  await expect(movement.locator('input[type="file"]')).toHaveCount(0);
  await expect(movement.getByRole("button", { name: "Programado", exact: true })).toHaveCount(0);
  await movement.getByRole("switch", { name: "Se repite", exact: true }).check();
  await expect(movement.getByText(/no realiza cobros ni pagos en tu banco/)).toBeVisible();
});

test("ordenar categorías conserva el reparto y desactivarlo conserva los límites", async ({ page }) => {
  await page.goto("/categorias", { waitUntil: "networkidle" });
  if (page.viewportSize()!.width < 640) {
    await page.getByRole("button", { name: "Opciones de Necesidades", exact: true }).click();
    await page.getByRole("menuitem", { name: "Bajar categoría", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Bajar Necesidades", exact: true }).click();
  }
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText(/Orden de categorías guardado/)).toBeVisible();
  await page.goto("/presupuestos?vista=distribucion", { waitUntil: "networkidle" });
  await expect(page.getByRole("textbox", { name: "Porcentaje para Necesidades", exact: true })).toHaveValue("50");
  await expect(page.getByRole("textbox", { name: "Porcentaje para Gustos", exact: true })).toHaveValue("30");
  await page.getByRole("button", { name: "Dejar de usar porcentajes", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restablecer porcentajes", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Porcentaje para Necesidades", exact: true })).toHaveValue("0");
  await page.goto("/presupuestos", { waitUntil: "networkidle" });
  await page.locator("details > summary").filter({ hasText: "Necesidades" }).click();
  await expect(page.getByRole("textbox", { name: "Presupuesto para Alimentación", exact: true })).toHaveValue("900.000");
});

test("un error de monto conserva el formulario y permite corregirlo", async ({ page }) => {
  await page.goto("/movimientos?overlay=movement", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  const amount = dialog.getByRole("textbox", { name: "Monto", exact: true });
  await amount.fill("0");
  await dialog.getByRole("button", { name: "Guardar gasto", exact: true }).first().click();
  await expect(dialog.getByRole("alert")).toContainText("Escribe un monto mayor que cero.");
  await expect(amount).toBeFocused();
  await expect(amount).toHaveAttribute("aria-describedby", "transaction-form-error");
  await amount.fill("12345");
  await fillExpenseChoices(page);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Guardar gasto", exact: true }).first().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("list", { name: "Movimientos", exact: true })).toContainText("12.345");
});
