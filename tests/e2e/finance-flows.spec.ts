import { expect, test } from "@playwright/test";

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
  expect(fieldBox?.height).toBeCloseTo(52, 1);
  expect(iconBox?.width).toBeCloseTo(52, 1);
  expect(iconBox?.height).toBeCloseTo((fieldBox?.height ?? 2) - 2, 1);

  const initialBalance = page.getByLabel("Saldo inicial");
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
  expect(merchantFieldBox?.height).toBeCloseTo(52, 1);
  expect(merchantIconBox?.width).toBeCloseTo(52, 1);
  expect(merchantIconBox?.height).toBeCloseTo((merchantFieldBox?.height ?? 2) - 2, 1);
  await page.screenshot({ path: testInfo.outputPath("new-income.png"), animations: "disabled" });
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

  const adjust = page.getByRole("button", { name: "Ajustar a 100%" });
  await expect(adjust).toBeEnabled();
  await adjust.click();
  const includedPercentages = await percentageInputs.evaluateAll((inputs) => inputs
    .filter((input) => !(input as HTMLInputElement).disabled)
    .map((input) => Number((input as HTMLInputElement).value)));
  expect(includedPercentages.reduce((sum, percent) => sum + percent, 0)).toBe(100);
  expect(Math.max(...includedPercentages) - Math.min(...includedPercentages)).toBeLessThanOrEqual(1);
  await expect(adjust).toBeDisabled();
  await expect(page.getByText("La distribución está completa")).toBeVisible();
});
