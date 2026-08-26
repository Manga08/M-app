import { expect, test, type Locator, type Page } from "@playwright/test";

test("money fields and compound icon inputs stay aligned", async ({ page }, testInfo) => {
  await page.goto("/cuentas", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Cuentas", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tipos de ingreso" })).toBeVisible();

  await page.getByRole("button", { name: "Nueva cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Nueva cuenta" })).toBeVisible();
  const accountName = page.locator("#account-name");
  await accountName.fill("Davivienda");
  const accountIcon = page.getByRole("button", { name: /Elegir icono\. Actual:/ }).last();
  const accountField = accountName.locator("xpath=..");
  const [fieldBox, iconBox] = await Promise.all([accountField.boundingBox(), accountIcon.boundingBox()]);
  expect(fieldBox?.height).toBeGreaterThanOrEqual(51.75);
  expect(fieldBox?.height).toBeLessThanOrEqual(52.25);
  expect(iconBox?.width).toBeGreaterThanOrEqual(51.75);
  expect(iconBox?.width).toBeLessThanOrEqual(52.25);
  expect(iconBox?.height).toBeCloseTo((fieldBox?.height ?? 2) - 2, 1);

  const initialBalance = page.getByRole("textbox", { name: "Saldo inicial", exact: true });
  await initialBalance.fill("1000000");
  await expect(initialBalance).toHaveValue("1.000.000");
  await page.screenshot({ path: testInfo.outputPath("new-account.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Cerrar" }).last().click();

  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('button[aria-label="Registrar movimiento"]:visible, button:has-text("Nuevo movimiento"):visible').first().click();
  const amount = page.getByLabel("Monto");
  await amount.fill("1000000");
  await expect(amount).toHaveValue("1.000.000");
  await page.getByRole("button", { name: "Ingreso", exact: true }).click();
  await expect(page.getByLabel("Tipo de ingreso")).toBeVisible();

  const merchant = page.getByLabel("Comercio (opcional)");
  const merchantIcon = page.getByRole("button", { name: /Elegir icono\. Actual:/ }).last();
  const merchantField = merchant.locator("xpath=..");
  const [merchantFieldBox, merchantIconBox] = await Promise.all([merchantField.boundingBox(), merchantIcon.boundingBox()]);
  expect(merchantFieldBox?.height).toBeGreaterThanOrEqual(51.75);
  expect(merchantFieldBox?.height).toBeLessThanOrEqual(52.25);
  expect(merchantIconBox?.width).toBeGreaterThanOrEqual(51.75);
  expect(merchantIconBox?.width).toBeLessThanOrEqual(52.25);
  expect(merchantIconBox?.height).toBeCloseTo((merchantFieldBox?.height ?? 2) - 2, 1);
  await page.screenshot({ path: testInfo.outputPath("new-income.png"), animations: "disabled" });
});

test("an opening USD balance contributes to patrimonio without becoming income", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-320", "One deterministic mobile flow covers the local fallback without duplicating remote data.");
  await page.route("**/api/trm?**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ rate: 4_000, validFrom: "2026-08-26", validTo: "2026-08-26", source: "sfc_trm", provider: "Superintendencia Financiera de Colombia" }),
  }));
  await page.goto("/cuentas", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nueva cuenta" }).click();
  await page.getByRole("combobox", { name: "Moneda" }).selectOption("USD");
  await page.locator("#account-name").fill("Reserva USD");
  await page.getByRole("textbox", { name: "Saldo inicial", exact: true }).fill("80");
  await expect(page.getByText(/Equivale a ≈/)).toContainText("320.000");
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page.getByText("Reserva USD", { exact: true })).toBeVisible();
  const text = (await page.locator("main").innerText()).replaceAll("\u00a0", " ");
  expect(text).toContain("US$ 80,00");
  expect(text).toContain("≈ $ 320.000");
  expect(text).not.toContain("Ingresado\n$ 320.000");
});

test("adjusting to 100 percent shares it equally across every included group", async ({ page }) => {
  await page.goto("/presupuestos", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Tu distribución del 100%" })).toBeVisible();

  const switches = page.getByRole("switch");
  const lastSwitch = switches.last();
  const percentageInputs = page.getByLabel(/Porcentaje para/);
  const lastPercentage = percentageInputs.last();

  if (await lastSwitch.isChecked()) await lastSwitch.click();
  await lastSwitch.click();
  await expect(lastSwitch).toBeChecked();
  await expect(lastPercentage).toHaveValue("0");

  const adjust = page.getByRole("button", { name: "Repartir por igual" });
  await expect(adjust).toBeEnabled();
  await adjust.click();
  const includedPercentages = await percentageInputs.evaluateAll((inputs) => inputs
    .filter((input) => !(input as HTMLInputElement).disabled)
    .map((input) => Number((input as HTMLInputElement).value)));
  expect(includedPercentages.reduce((sum, percent) => sum + percent, 0)).toBe(100);
  expect(Math.max(...includedPercentages) - Math.min(...includedPercentages)).toBeLessThanOrEqual(1);
  await expect(adjust).toBeDisabled();
  await expect(page.getByText("La distribución está completa")).toBeVisible();
  const progress = page.getByRole("progressbar", { name: "Porcentaje total asignado al plan" });
  await expect(progress).toHaveAttribute("aria-valuenow", "100");
  await expect(progress).toHaveAttribute("aria-valuetext", "100% asignado");
  const indicator = progress.locator('[data-slot="progress-indicator"]');
  const [trackBox, indicatorBox] = await Promise.all([progress.boundingBox(), indicator.boundingBox()]);
  expect(indicatorBox?.y).toBeCloseTo(trackBox?.y ?? 0, 1);
  expect(indicatorBox?.height).toBeCloseTo(trackBox?.height ?? 0, 1);
  expect(indicatorBox?.width).toBeGreaterThanOrEqual((trackBox?.width ?? 1) * 0.99);
});

test("expense categories filter their subcategories", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('button[aria-label="Registrar movimiento"]:visible, button:has-text("Nuevo movimiento"):visible').first().click();

  const group = page.getByLabel("Categoría", { exact: true });
  const subcategory = page.getByLabel("Subcategoría", { exact: true });
  await expectAdaptiveSelection(group, "needs", "Necesidades");
  await expectAdaptiveSelection(subcategory, "cat-food", "Alimentación");

  await chooseAdaptiveOption(page, group, "wants", "Gustos");
  await expectAdaptiveSelection(subcategory, "cat-fun", "Entretenimiento");
  expect(await adaptiveOptionLabels(page, subcategory)).toEqual(["Entretenimiento", "Comidas fuera"]);
});

test("desktop account pickers keep every grouped account visible and selectable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "The regression lived in the custom desktop picker; mobile keeps the native select.");

  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('button[aria-label="Registrar movimiento"]:visible, button:has-text("Nuevo movimiento"):visible').first().click();
  const transactionAccount = page.getByLabel("Cuenta", { exact: true });
  await transactionAccount.click();
  await expect(page.getByRole("group", { name: "Bancolombia" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Bancolombia · COP", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Nequi · COP", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "Nequi · COP", exact: true }).click();
  await expect(transactionAccount).toContainText("Nequi · COP");
  await page.getByTestId("quick-transaction-close").click();

  await page.goto("/movimientos", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Filtros/ }).click();
  const filterAccount = page.getByLabel("Cuenta", { exact: true });
  await filterAccount.click();
  await expect(page.getByRole("option", { name: "Visa terminada en 4242 · COP", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/metas", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Nueva meta|Crear meta/ }).first().click();
  const linkedAccount = page.getByLabel("Cuenta vinculada (opcional)");
  await linkedAccount.click();
  await expect(page.getByRole("option", { name: "Efectivo · COP", exact: true })).toBeVisible();
});

async function expectAdaptiveSelection(control: Locator, nativeValue: string, visibleLabel: string) {
  const tagName = await control.evaluate((element) => element.tagName);
  if (tagName === "SELECT") await expect(control).toHaveValue(nativeValue);
  else await expect(control).toContainText(visibleLabel);
}

async function chooseAdaptiveOption(page: Page, control: Locator, nativeValue: string, visibleLabel: string) {
  const tagName = await control.evaluate((element) => element.tagName);
  if (tagName === "SELECT") await control.selectOption(nativeValue);
  else {
    await control.click();
    await page.getByRole("option", { name: visibleLabel, exact: true }).click();
  }
}

async function adaptiveOptionLabels(page: Page, control: Locator) {
  const tagName = await control.evaluate((element) => element.tagName);
  if (tagName === "SELECT") return control.locator("option:not([value=''])").allTextContents();
  await control.click();
  const labels = await page.getByRole("option").allTextContents();
  await page.keyboard.press("Escape");
  return labels;
}

test("report chart details stack on mobile without widening the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reportes", { waitUntil: "networkidle" });
  await page.getByText("Ver datos exactos del gráfico", { exact: true }).click();

  const dimensions = await page.evaluate(() => {
    const details = document.querySelector<HTMLDetailsElement>("details[open]");
    return {
      pageClientWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      detailsClientWidth: details?.clientWidth ?? 0,
      detailsScrollWidth: details?.scrollWidth ?? 0,
    };
  });
  expect(dimensions.pageScrollWidth).toBe(dimensions.pageClientWidth);
  expect(dimensions.detailsScrollWidth).toBeLessThanOrEqual(dimensions.detailsClientWidth + 1);
  await expect(page.locator("details[open] dl").first()).toBeVisible();
});
