import { expect, type Locator, type Page } from "@playwright/test";

export async function chooseMovementOption(page: Page, control: Locator, value: string, label: string) {
  if (await control.evaluate((element) => element.tagName === "SELECT")) await control.selectOption(value);
  else { await control.click(); await page.getByRole("option", { name: label, exact: true }).click(); }
}

export async function fillExpenseChoices(page: Page) {
  const dialog = page.getByRole("dialog");
  await chooseMovementOption(page, dialog.getByLabel("Cuenta", { exact: true }), "acc-cash", "Efectivo · COP");
  await chooseMovementOption(page, dialog.getByLabel("Categoría", { exact: true }), "needs", "Necesidades");
  await expect(dialog.getByLabel("Subcategoría", { exact: true })).toBeEnabled();
  await chooseMovementOption(page, dialog.getByLabel("Subcategoría", { exact: true }), "cat-food", "Alimentación");
  await dialog.getByRole("button", { name: "Usar hoy", exact: true }).click();
}
