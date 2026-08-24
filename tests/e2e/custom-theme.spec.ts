import { expect, test } from "@playwright/test";

test("a custom color previews, cancels, persists and updates the PWA identity", async ({ page, request }) => {
  await page.goto("/ajustes", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible({ timeout: 15_000 });

  const trigger = page.getByRole("button", { name: /Personalizado/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Tu color Moneva" });
  await expect(dialog).toBeVisible();

  const hex = dialog.getByLabel("Código HEX");
  await hex.fill("#E11D48");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "custom");
  await expect(page.locator("html")).toHaveAttribute("data-custom-color", "#E11D48");
  await expect(page.locator('link[rel="icon"][href*="/pwa/custom/icon.svg?color=E11D48"]').first()).toBeAttached();

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "moneva");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByLabel("Código HEX").fill("#0F766E");
  await dialog.getByRole("button", { name: "Aplicar color" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-pressed", "true");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("html")).toHaveAttribute("data-palette", "custom");
  await expect(page.locator("html")).toHaveAttribute("data-custom-color", "#0F766E");
  await expect(page.locator('link[rel="manifest"][href*="color=0F766E"]').first()).toBeAttached();

  const metrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    triggerSize: (() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("Personalizado"));
      const rect = button?.getBoundingClientRect();
      return rect ? { width: rect.width, height: rect.height } : null;
    })(),
  }));
  expect(metrics.overflow).toBe(false);
  expect(metrics.triggerSize?.height).toBeGreaterThanOrEqual(44);

  const [iconResponse, manifestResponse] = await Promise.all([
    request.get("/pwa/custom/icon.png?size=192&color=0F766E&v=2"),
    request.get("/pwa/custom/manifest.webmanifest?dark=1&color=0F766E&v=2"),
  ]);
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toContain("image/png");
  expect(manifestResponse.ok()).toBe(true);
  expect((await manifestResponse.json()).icons).toHaveLength(3);
});
