import { expect, test } from "@playwright/test";

test("metas y deudas completa el recorrido principal sin perder contexto", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const ignoredConsoleErrors = ['Viewport argument key "interactive-widget" not recognized and ignored.'];

  page.on("console", (message) => {
    if (message.type() === "error" && !ignoredConsoleErrors.includes(message.text())) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/metas", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Metas y deudas" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Abrir Fondo de emergencia/ })).toBeVisible();

  const routeMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(routeMetrics.scrollWidth, `La ruta /metas desborda: ${JSON.stringify(routeMetrics)}`).toBeLessThanOrEqual(routeMetrics.clientWidth + 1);

  await page.getByRole("button", { name: "Nueva meta" }).click();
  const createDialog = page.getByRole("dialog", { name: "Nueva meta o deuda" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByRole("textbox", { name: "Nombre" }).fill("Viaje a Japón");
  await createDialog.getByRole("textbox", { name: "Monto objetivo" }).fill("3000000");
  await createDialog.getByRole("textbox", { name: "Avance inicial" }).fill("500000");
  await createDialog.getByRole("button", { name: "Crear recorrido" }).click();

  const targetRow = page.getByRole("button", { name: /Viaje a Japón/ });
  await expect(targetRow).toContainText("17%");
  expect(consoleErrors, "Crear una meta no debe producir errores de React").toEqual([]);
  await targetRow.click();

  const detailDialog = page.getByRole("dialog", { name: "Viaje a Japón" });
  await expect(detailDialog).toBeVisible();
  await detailDialog.getByRole("textbox", { name: "Monto del avance" }).fill("250000");
  await detailDialog.getByRole("textbox", { name: "Nota del avance" }).fill("Aporte de validación");
  await detailDialog.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(detailDialog.getByRole("progressbar", { name: "Avance de Viaje a Japón" })).toHaveAttribute("aria-valuenow", "750000");
  await expect(detailDialog).toContainText("Aporte de validación");
  expect(consoleErrors, "Registrar un aporte no debe producir errores de React").toEqual([]);

  await detailDialog.getByRole("button", { name: "Programar" }).click();
  const movementDialog = page.getByRole("dialog", { name: /Configúralo una vez|¿Qué pasó con tu dinero?/ });
  await expect(movementDialog).toBeVisible();
  await expect(movementDialog.getByRole("button", { name: "Programado" })).toHaveAttribute("aria-pressed", "true");
  await expect(movementDialog.getByRole("button", { name: "Transferencia" })).toHaveAttribute("aria-pressed", "true");
  await expect(movementDialog.getByRole("combobox", { name: "Meta o deuda (opcional)" })).toContainText("Viaje a Japón");
  await expect(movementDialog.getByRole("combobox", { name: "Efecto en el avance" })).toContainText("Sumar avance");

  const dialogMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
  }));
  expect(dialogMetrics.dialogCount, "Programar no debe apilar dos diálogos").toBe(1);
  expect(dialogMetrics.scrollWidth, `El formulario programado desborda: ${JSON.stringify(dialogMetrics)}`).toBeLessThanOrEqual(dialogMetrics.clientWidth + 1);

  const screenshotPath = testInfo.outputPath("metas-programacion.png");
  await page.screenshot({ path: screenshotPath, animations: "disabled", caret: "hide", fullPage: false });
  await testInfo.attach("metas-programacion", { path: screenshotPath, contentType: "image/png" });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
