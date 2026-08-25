import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

test("reviews and imports a 2026 planner with an explicit balance reconciliation", async ({ page }, testInfo) => {
  test.skip(!["desktop-chrome", "phone-320"].includes(testInfo.project.name), "The focused import flow runs on one desktop and the smallest phone; the global matrix covers the remaining viewports.");

  const workbook = new ExcelJS.Workbook();
  const month = workbook.addWorksheet("Ago");
  month.getCell(3, 30).value = "Categoría";
  month.getCell(3, 32).value = "Monto";
  month.getCell(3, 34).value = "Fecha";
  month.getCell(3, 36).value = "Concepto";
  month.getCell(4, 30).value = "Mercado";
  month.getCell(4, 33).value = 120_001;
  month.getCell(4, 34).value = new Date("2026-08-02T00:00:00Z");
  month.getCell(4, 36).value = "Importación de prueba - Éxito";
  month.getCell(15, 2).value = "Concepto";
  month.getCell(15, 5).value = "Actual";
  month.getCell(16, 2).value = "Sueldo";
  month.getCell(16, 6).value = 900_001;
  month.getCell(17, 2).value = "Total";
  month.getCell(21, 4).value = "Disponible para gastar";
  month.getCell(23, 5).value = 780_000;
  const filePath = testInfo.outputPath("planificador-2026.xlsx");
  await workbook.xlsx.writeFile(filePath);

  await page.goto("/ajustes", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Importar mis datos" }).click();
  await expect(page.getByRole("heading", { name: "Importar mis datos" })).toBeVisible();
  await expect(page.getByText("Solo aceptamos estos tres formatos de plantilla.")).toBeVisible();
  await page.getByLabel("Seleccionar planificador de Excel").setInputFiles(filePath);

  await expect(page.getByRole("heading", { name: "Plantilla 2026 reconocida" })).toBeVisible();
  await expect(page.getByText("Saldo del Excel")).toBeVisible();
  await expect(page.getByText("$ 780.000", { exact: true }).first()).toBeVisible();
  const accountControl = page.getByLabel("Cuenta de destino");
  if (await accountControl.evaluate((element) => element.tagName) === "SELECT") await expect(accountControl).toHaveValue("__create_account__");
  else await expect(accountControl).toContainText("Crear una cuenta nueva (recomendado)");
  await expect(page.getByLabel("Conciliar con el saldo final (recomendado)")).toBeChecked();
  await expect(page.getByLabel("Nombre de la cuenta nueva")).toHaveValue("Planificador 2026");
  await expect(page.getByText("Saldo resultante")).toBeVisible();

  const dialog = page.getByRole("dialog");
  const box = await dialog.boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((await page.evaluate(() => window.innerWidth)) + 1);
  await page.screenshot({ path: testInfo.outputPath("import-review.png"), animations: "disabled" });

  await page.getByRole("button", { name: "Importar 2 movimientos" }).click();
  await expect(page.getByRole("heading", { name: "Importación terminada" })).toBeVisible();
  await expect(page.getByText(/conciliamos el saldo en/)).toBeVisible();
  await page.getByRole("button", { name: "Listo" }).click();

  await page.goto("/cuentas", { waitUntil: "networkidle" });
  await expect(page.getByText("Planificador 2026", { exact: true })).toBeVisible();
});
