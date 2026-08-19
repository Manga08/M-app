import { expect, test } from "@playwright/test";

test("the icon picker keeps focus, tabs, selection and scroll connected", async ({ page }, testInfo) => {
  await page.goto("/cuentas", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nueva cuenta" }).click();
  await page.getByRole("button", { name: /Elegir icono\. Actual:/ }).last().click();

  const dialog = page.getByRole("dialog", { name: "Elige un icono" });
  const search = dialog.getByRole("textbox", { name: "Buscar icono o marca" });
  await expect(dialog).toBeVisible();
  await expect(search).toBeFocused();

  const bankTab = dialog.getByRole("tab", { name: "Bancos CO" });
  const brandTab = dialog.getByRole("tab", { name: "Marcas" });
  await expect(bankTab).toHaveAttribute("aria-selected", "true");

  const panelId = await bankTab.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  const panel = dialog.locator(`[id="${panelId}"]`);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("aria-labelledby", await bankTab.getAttribute("id") ?? "");
  expect(await panel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  await bankTab.focus();
  await bankTab.press("ArrowRight");
  await expect(brandTab).toBeFocused();
  await expect(brandTab).toHaveAttribute("aria-selected", "true");
  await brandTab.press("ArrowLeft");
  await expect(bankTab).toHaveAttribute("aria-selected", "true");

  await search.fill("BBVA");
  const option = dialog.locator('button[aria-pressed="false"]').first();
  await expect(option).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("icon-picker.png"), animations: "disabled" });
  await option.click();
  await expect(dialog).toBeHidden();
});
