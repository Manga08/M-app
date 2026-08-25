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

  await search.fill("ChatGPT");
  const chatGpt = dialog.getByRole("button", { name: "Usar ChatGPT · OpenAI" });
  await expect(chatGpt).toBeVisible();
  await expect(chatGpt.locator("use")).toHaveAttribute("href", /^\/brand-icons\.svg\?v=[a-f0-9]{12}#brand-chatgpt-openai$/);
  await page.screenshot({ path: testInfo.outputPath("chatgpt-icon.png"), animations: "disabled" });

  await search.fill("Rappi");
  const rappi = dialog.getByRole("button", { name: "Usar Rappi" });
  await expect(rappi).toBeVisible();
  await expect(rappi.locator("use")).toHaveAttribute("href", /^\/brand-icons\.svg\?v=[a-f0-9]{12}#brand-rappi$/);
  await page.screenshot({ path: testInfo.outputPath("brand-icons.png"), animations: "disabled" });

  await search.fill("Cine");
  await expect(dialog.getByRole("button", { name: "Usar Cinemark" }).locator("use")).toHaveAttribute("href", /^\/brand-icons\.svg\?v=[a-f0-9]{12}#brand-cinemark$/);
  await expect(dialog.getByRole("button", { name: "Usar Cine Colombia" }).locator("use")).toHaveAttribute("href", /^\/brand-icons\.svg\?v=[a-f0-9]{12}#brand-cine-colombia$/);

  const newBrands = ["Alkosto", "Cosechas", "Paranice", "Don Gil", "Tiendas D1", "Tiendas Ara", "DollarCity", "Decathlon", "BACU", "O Boticário", "UKI Fresh Food", "Miniso"];
  for (const brand of newBrands) {
    await search.fill(brand);
    await expect(dialog.getByRole("button", { name: `Usar ${brand}` })).toBeVisible();
  }

  await search.fill("Global66");
  await expect(dialog.getByRole("button", { name: "Usar Global66" })).toHaveCount(0);

  await search.fill("");
  await brandTab.press("ArrowLeft");
  await expect(bankTab).toHaveAttribute("aria-selected", "true");

  await search.fill("Global66");
  const global66 = dialog.getByRole("button", { name: "Usar Global66" });
  await expect(global66).toBeVisible();
  await expect(global66.locator("use")).toHaveAttribute("href", /^\/brand-icons\.svg\?v=[a-f0-9]{12}#brand-global66$/);

  await search.fill("BBVA");
  const option = dialog.locator('button[aria-pressed="false"]').first();
  await expect(option).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("icon-picker.png"), animations: "disabled" });
  await option.click();
  await expect(dialog).toBeHidden();
});
