import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { currentMonthStart, localIsoDate } from "../../src/lib/finance/calculations";
import { demoFinanceState } from "../../src/lib/finance/demo-data";
import type { FinanceState } from "../../src/lib/finance/types";
import { seedStressState } from "./helpers/seed-stress-state";

const currentMonth = currentMonthStart(new Date(), "America/Bogota");
const today = localIsoDate(new Date(), "America/Bogota");
const scenarios = ["new", "quiet", "spending", "distribution", "commitment", "budget", "budget-near", "budget-full", "mixed"] as const;
type DashboardScenario = typeof scenarios[number];

test.describe("Inicio adaptativo", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!["phone-320", "tablet-small", "desktop-1080"].includes(testInfo.project.name), "La composición se valida en móvil, tablet y escritorio.");
  });

  for (const scenario of scenarios) {
    test(`${scenario} conserva una jerarquía útil y sin ruido`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().includes('Viewport argument key "interactive-widget"')) errors.push(message.text());
      });
      await page.route("**/api/trm?**", (route) => route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ rate: 4_100, validFrom: today, validTo: today, source: "sfc_trm", provider: "Superintendencia Financiera de Colombia" }),
      }));
      await seedStressState(page, financeStateFor(scenario));
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForApp(page);

      const dashboard = page.locator("[data-dashboard]");
      await expect(dashboard).toHaveAttribute("data-dashboard-state", scenario === "new" ? "new" : scenario === "quiet" || scenario === "commitment" ? "quiet" : "active");
      await expect(page.getByRole("heading", { name: "Tu mes, de un vistazo." })).toBeVisible();
      await expect(page.getByText("Todo en orden por ahora")).toHaveCount(0);

      if (scenario === "new") {
        await expect(page.getByRole("heading", { name: "Tu foto financiera empieza aquí" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Configurar cuentas y saldos" })).toBeVisible();
        await expect(page.locator("[data-dashboard-balance]")).toHaveCount(0);
        await expect(page.getByText("Presupuesto por categoría")).toHaveCount(0);
        const firstStep = page.locator("[data-dashboard-start]");
        const box = await firstStep.boundingBox();
        expect(box?.y).toBeLessThan(page.viewportSize()?.height ?? 720);
      }

      if (scenario === "quiet") {
        await expect(page.getByText(/todavía no tiene actividad/i)).toBeVisible();
        await expect(page.getByRole("heading", { name: /Aún no hay flujo real en/i })).toBeVisible();
        await expect(page.locator("[data-dashboard-balance]")).toContainText("$");
        await expect(page.getByText("Ingresado", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Última actividad" })).toBeVisible();
      }

      if (!["new", "quiet", "commitment"].includes(scenario)) {
        await expect(page.getByText("Ingresado", { exact: true })).toBeVisible();
        await expect(page.getByText("Balance del mes", { exact: true })).toBeVisible();
        await expect(page.locator("[data-dashboard-pulse]")).toBeVisible();
        await expect(page.locator("[data-dashboard-budget]")).toBeVisible();
        await expect(page.locator("[data-dashboard-targets]")).toBeVisible();
        await expect(page.locator("[data-dashboard-transaction]")).toHaveCount(scenario === "spending" ? 2 : 5);
      }

      if (scenario === "spending") {
        await expect(dashboard).toHaveAttribute("data-dashboard-plan-mode", "spending");
        await expect(page.getByRole("heading", { name: "Gasto por categoría" })).toBeVisible();
        await expect(page.getByText(/sin configurar porcentajes ni presupuestos/i)).toBeVisible();
        await expect(page.getByText("Presupuesto por categoría")).toHaveCount(0);
        await expect(page.locator("[data-dashboard-budget-overview]")).toHaveCount(0);
      }

      if (scenario === "distribution") {
        await expect(dashboard).toHaveAttribute("data-dashboard-plan-mode", "distribution");
        await expect(page.getByRole("heading", { name: "Distribución y gasto real" })).toBeVisible();
        await expect(page.getByText(/sin convertirlo en un presupuesto/i)).toBeVisible();
        await expect(page.locator("[data-dashboard-budget-overview]")).toHaveCount(0);
      }

      if (scenario === "commitment") {
        await expect(dashboard).toHaveAttribute("data-dashboard-plan-mode", "none");
        await expect(page.getByRole("heading", { name: "Próximos movimientos" })).toBeVisible();
        await expect(page.getByText("Spotify", { exact: true })).toBeVisible();
        await expect(page.locator("[data-dashboard-budget]")).toHaveCount(0);
        await expect(page.locator("[data-dashboard-budget-overview]")).toHaveCount(0);
        await expect(page.getByText(/superó el límite/i)).toHaveCount(0);
      }

      if (["budget", "budget-near", "budget-full", "mixed"].includes(scenario)) {
        await expect(dashboard).toHaveAttribute("data-dashboard-plan-mode", "budget");
        await expect(page.getByRole("heading", { name: "Presupuesto por categoría" })).toBeVisible();
        const budgetOverview = page.locator("[data-dashboard-budget-overview]");
        await expect(budgetOverview).toBeVisible();
        await expect(page.getByRole("progressbar", { name: "Uso total del presupuesto mensual" })).toBeVisible();
        await expect(budgetOverview.getByText(/de .* usados/i)).toBeVisible();
        await expect(budgetOverview).toHaveAttribute("data-budget-state", scenario === "mixed" ? "over" : scenario === "budget-near" ? "near" : scenario === "budget-full" ? "limit" : "available");
      }

      if (scenario === "budget-near") await expect(page.getByText("disponible · cerca del límite")).toBeVisible();
      if (scenario === "budget-full") await expect(page.getByText("límite alcanzado")).toBeVisible();
      if (scenario === "mixed") await expect(page.getByText("por encima del presupuesto")).toBeVisible();

      if (scenario === "mixed") {
        await expect(page.locator("[data-dashboard-balance]")).toContainText("≈");
        await expect(page.getByText(/US\$/).first()).toBeVisible();
      }

      const layout = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
      const sections = await page.locator("[data-dashboard] > section").evaluateAll((items) => items.map((item) => { const rect = item.getBoundingClientRect(); return { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY }; }));
      for (let index = 1; index < sections.length; index += 1) expect(sections[index].top).toBeGreaterThanOrEqual(sections[index - 1].bottom - 1);
      const accessibility = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
      expect(accessibility.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);
      expect(errors).toEqual([]);

      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await page.screenshot({ path: testInfo.outputPath(`inicio-${scenario}-viewport.png`), fullPage: false, animations: "disabled", caret: "hide" });
      await page.screenshot({ path: testInfo.outputPath(`inicio-${scenario}.png`), fullPage: true, animations: "disabled", caret: "hide" });
    });
  }

  test("preserva contraste y jerarquía en oscuro Crimson", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "tablet-small", "El tema de alto carácter se valida en los dos extremos de tamaño.");
    const state = activeState();
    state.profile = { ...state.profile!, themeMode: "dark", colorTheme: "crimson" };
    await seedStressState(page, state);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("[data-dashboard-budget]")).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(accessibility.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: testInfo.outputPath("inicio-budget-dark-crimson.png"), fullPage: true, animations: "disabled", caret: "hide" });
  });
});

async function waitForApp(page: Page) {
  const content = page.locator("main[data-app-content]");
  await expect(content).toBeVisible({ timeout: 30_000 });
  await expect(content).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
}

function financeStateFor(scenario: DashboardScenario): FinanceState {
  if (scenario === "spending") return spendingState();
  if (scenario === "distribution") return distributionState();
  if (scenario === "commitment") return commitmentState();
  if (scenario === "budget-near") return budgetUsageState(90);
  if (scenario === "budget-full") return budgetUsageState(100);
  if (scenario === "budget") return activeState();
  if (scenario === "mixed") return mixedCurrencyState();
  const state = structuredClone(demoFinanceState);
  state.profile = { ...state.profile!, displayName: scenario === "new" ? "Valeria" : "Camila" };
  state.accountEntities = [];
  state.accounts = scenario === "new"
    ? [{ id: "cash", name: "Efectivo", type: "cash", initialBalance: 0, color: "#34d399", icon: "banknote", currencyCode: "COP" }]
    : [{ id: "savings", name: "Ahorros", type: "savings", initialBalance: 2_800_000, color: "#5b6ef5", icon: "piggy-bank", currencyCode: "COP" }];
  state.transactions = scenario === "new" ? [] : [{
    id: "previous-income",
    kind: "income",
    amount: 600_000,
    accountId: "savings",
    categoryId: "cat-other-income",
    description: "Ingreso anterior",
    merchant: "Cliente",
    occurredOn: previousMonthDate(),
    createdAt: `${previousMonthDate()}T14:00:00Z`,
    syncStatus: "synced",
  }];
  state.recurringRules = [];
  state.recurringOccurrences = [];
  state.financialTargets = [];
  state.financialTargetEntries = [];
  state.financialTargetDebts = [];
  state.budgets = [];
  state.monthlyBudgetPlans = [];
  state.budgetMonthsLoaded = [];
  state.snapshot = undefined;
  return state;
}

function spendingState() {
  const state = activeState();
  state.transactions = state.transactions.slice(0, 2);
  state.budgets = [];
  state.monthlyBudgetPlans = [];
  state.budgetMonthsLoaded = [];
  state.recurringRules = [];
  state.recurringOccurrences = [];
  state.groupAllocations = state.groupAllocations.map((group) => ({ ...group, includedInPlan: false, targetPercent: 0 }));
  return state;
}

function commitmentState() {
  const state = structuredClone(demoFinanceState);
  state.profile = { ...state.profile!, displayName: "Lucía" };
  state.transactions = [];
  state.budgets = [];
  state.monthlyBudgetPlans = [];
  state.budgetMonthsLoaded = [];
  state.groupAllocations = state.groupAllocations.map((group) => ({ ...group, includedInPlan: false, targetPercent: 0 }));
  state.financialTargets = [];
  state.financialTargetEntries = [];
  state.financialTargetDebts = [];
  state.recurringRules = state.recurringRules.filter((rule) => rule.id === "rule-spotify");
  state.recurringOccurrences = state.recurringOccurrences
    .filter((occurrence) => occurrence.ruleId === "rule-spotify")
    .map((occurrence) => ({ ...occurrence, scheduledOn: today, effectiveOn: today, status: "planned" as const }));
  state.snapshot = undefined;
  return state;
}

function distributionState() {
  const state = activeState();
  state.budgets = [];
  state.monthlyBudgetPlans = [];
  state.budgetMonthsLoaded = [];
  state.recurringRules = [];
  state.recurringOccurrences = [];
  return state;
}

function mixedCurrencyState() {
  const state = activeState();
  state.accountEntities.push({ id: "entity-global66", name: "Global66", color: "#7c3aed", icon: "bank:global66", sortOrder: 2, version: 1 });
  state.accounts.push({ id: "acc-usd", name: "Bóveda USD", type: "savings", initialBalance: 2_500_000, color: "#7c3aed", icon: "bank:global66", currencyCode: "USD", openingExchangeRate: 4_100, openingBalanceDate: today, entityId: "entity-global66" });
  state.transactions.push({ id: "tx-usd", kind: "expense", amount: 1_250, nativeCurrencyCode: "USD", baseAmount: 5_125_000, baseCurrencyCode: "COP", exchangeRate: 4_100, exchangeRateDate: today, exchangeRateSource: "provider", accountId: "acc-usd", categoryId: "cat-investments", description: "Compra internacional", merchant: "Apple", occurredOn: today, createdAt: `${today}T22:00:00Z`, syncStatus: "synced" });
  return state;
}

function budgetUsageState(percent: number) {
  const state = activeState();
  const currentExpense = state.transactions
    .filter((transaction) => transaction.kind === "expense")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const targetExpense = 4_700_000 * percent / 100;
  state.transactions.push({
    id: `tx-budget-${percent}`,
    kind: "expense",
    amount: targetExpense - currentExpense,
    accountId: "acc-bancolombia",
    categoryId: "cat-health",
    description: `Ajuste de prueba al ${percent}%`,
    merchant: "Prueba de presupuesto",
    occurredOn: today,
    createdAt: `${today}T23:00:00Z`,
    syncStatus: "synced",
  });
  return state;
}

function activeState(): FinanceState {
  const state = structuredClone(demoFinanceState);
  const monthKey = currentMonth.slice(0, 7);
  state.profile = { ...state.profile!, displayName: "Andrés" };
  state.transactions = state.transactions.map((transaction, index) => {
    const day = String(Math.min(20, index + 2)).padStart(2, "0");
    const date = `${monthKey}-${day}`;
    return { ...transaction, occurredOn: date, createdAt: `${date}T${String(10 + index).padStart(2, "0")}:00:00Z` };
  });
  state.budgets = state.budgets.map((budget) => ({ ...budget, month: currentMonth }));
  state.monthlyBudgetPlans = state.monthlyBudgetPlans.map((plan) => ({ ...plan, month: currentMonth }));
  state.budgetMonthsLoaded = [currentMonth];
  state.recurringOccurrences = state.recurringOccurrences.map((occurrence, index) => ({
    ...occurrence,
    scheduledOn: index === 0 ? today : nextMonthDate(),
    effectiveOn: index === 0 ? today : nextMonthDate(),
    status: "planned",
  }));
  state.snapshot = undefined;
  return state;
}

function previousMonthDate() {
  const [year, month] = currentMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

function nextMonthDate() {
  const [year, month] = currentMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}
