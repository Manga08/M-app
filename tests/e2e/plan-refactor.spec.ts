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
  await expect(page.getByRole("heading", { name: "Prueba un mes antes de tomar decisiones" })).toBeVisible();
  await expect(page.getByText("Define el dinero")).toBeVisible();
  await expect(page.getByText("Reparte el 100%", { exact: true })).toBeVisible();
  await expect(page.getByText("Prueba tus gastos")).toBeVisible();
  await page.getByRole("button", { name: "Añadir categoría principal" }).click();
  await expect(page.getByLabel("Nombre de la categoría principal simulada").last()).toHaveValue("Nueva categoría");
  await expect(page.getByRole("button", { name: /Guardar|Aplicar al plan real/i })).toHaveCount(0);
  await expect(page.getByText(/no escribe nada en Supabase/i)).toBeVisible();
});

test("the simulator explains every editable amount on narrow screens", async ({ page }, testInfo) => {
  test.skip(!["phone-320", "phone-430", "iphone-15-pro", "pixel-7"].includes(testInfo.project.name), "Visible field labels are a narrow-layout requirement.");
  await page.goto("/presupuestos?vista=simulador", { waitUntil: "networkidle" });
  await expect(page.locator("[data-plan-simulator]")).toBeVisible();
  const firstScenarioRow = page.getByRole("group", { name: /Simular Alimentación/ });
  await expect(firstScenarioRow.locator("label").filter({ hasText: /^Presupuesto máximo$/ })).toBeVisible();
  await expect(firstScenarioRow.locator("label").filter({ hasText: /^Gasto que quieres probar$/ })).toBeVisible();
  await expect(firstScenarioRow.getByText("Resultado", { exact: true })).toBeVisible();

  const firstBudget = page.getByLabel(/Presupuesto máximo simulado de/).first();
  const firstSpend = page.getByLabel(/Gasto hipotético de/).first();
  await firstBudget.fill("500000");
  await firstSpend.fill("125000");
  await expect(firstBudget).toHaveValue("500.000");
  await expect(firstSpend).toHaveValue("125.000");
  await expect(page.getByText(/Quedan \$\s?375\.000/).first()).toBeVisible();

  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});

test("the simulator constrains automation until the distribution is complete", async ({ page }) => {
  await page.goto("/presupuestos?vista=simulador", { waitUntil: "networkidle" });
  const tastes = page.getByRole("article", { name: "Gustos" });
  await tastes.getByRole("switch").click();
  await expect(page.getByText("Faltan 30 puntos para completar el 100%", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear presupuestos" })).toBeDisabled();

  await page.getByRole("button", { name: "Repartir 100% por igual" }).click();
  await expect(page.getByText("4 categorías completan el plan", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Porcentaje simulado para Necesidades")).toHaveValue("25");
  await expect(page.getByLabel("Porcentaje simulado para Gustos")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Crear presupuestos" })).toBeEnabled();

  await page.getByRole("button", { name: "Crear presupuestos" }).click();
  await expect(page.locator('[data-plan-simulator] > p[aria-live="polite"]')).toContainText("Los presupuestos se calcularon");

  await page.getByLabel("Porcentaje simulado para Necesidades").fill("50");
  await expect(page.getByText("Sobran 25 puntos; reduce la distribución", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear presupuestos" })).toBeDisabled();
});

test("simulator controls stay inside their sections and away from the live result", async ({ page }, testInfo) => {
  test.skip(!["desktop-chrome", "desktop-wide", "desktop-1080", "desktop-2k"].includes(testInfo.project.name), "Desktop collision regression.");
  await page.goto("/presupuestos?vista=simulador", { waitUntil: "networkidle" });

  const collisions = await page.locator("[data-plan-simulator]").evaluate((root) => {
    const result = root.querySelector<HTMLElement>('aside[aria-label="Resultado del escenario"]');
    if (!result) return ["missing-live-result"];
    const resultRect = result.getBoundingClientRect();
    const issues: string[] = [];
    const visible = (element: HTMLElement) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };

    root.querySelectorAll<HTMLElement>("button, input").forEach((control) => {
      if (!visible(control)) return;
      const label = control.getAttribute("aria-label") || control.textContent?.trim() || control.tagName;
      if (control.scrollWidth > control.clientWidth + 1) issues.push(`clipped:${label}`);
      if (result.contains(control)) return;
      const rect = control.getBoundingClientRect();
      const overlapsResult = rect.left < resultRect.right && rect.right > resultRect.left && rect.top < resultRect.bottom && rect.bottom > resultRect.top;
      if (overlapsResult) issues.push(`overlaps-result:${label}`);

      const category = control.closest<HTMLElement>("article");
      if (category) {
        const categoryRect = category.getBoundingClientRect();
        if (rect.left < categoryRect.left - 1 || rect.right > categoryRect.right + 1) issues.push(`outside-category:${label}`);
      }
    });
    return issues;
  });

  expect(collisions).toEqual([]);
});
