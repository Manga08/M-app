import { expect, test } from "@playwright/test";

test("sincroniza paleta, favicon, manifest y color del navegador", async ({ page }) => {
  await page.goto("/ajustes");
  await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();

  await page.getByRole("button", { name: /Crimson Rojo profundo/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "crimson");
  await expect(page.locator('link[rel="manifest"]').first()).toHaveAttribute("href", /\/pwa\/crimson\/manifest-(dark|light)\.webmanifest\?v=1/);
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", "/pwa/crimson/icon.svg?v=1");
  await expect(page.locator('link[rel="apple-touch-icon"]').first()).toHaveAttribute("href", "/pwa/crimson/apple-touch-icon.png?v=1");
  await expect.poll(async () => page.locator('link[rel="icon"]').evaluateAll((nodes) => nodes.every((node) => node.getAttribute("href") === "/pwa/crimson/icon.svg?v=1"))).toBe(true);
  await expect.poll(async () => page.locator('link[rel="manifest"]').evaluateAll((nodes) => nodes.every((node) => /\/pwa\/crimson\/manifest-(dark|light)\.webmanifest\?v=1/.test(node.getAttribute("href") ?? "")))).toBe(true);

  await page.getByRole("button", { name: "Claro" }).click();
  await expect(page.locator('link[rel="manifest"]').first()).toHaveAttribute("href", "/pwa/crimson/manifest-light.webmanifest?v=1");
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#f7f5ef");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "crimson");
  await expect(page.getByRole("button", { name: /Crimson Rojo profundo/ })).toHaveAttribute("aria-pressed", "true");
});

test("publica assets instalables para cada paleta", async ({ request }) => {
  for (const theme of ["moneva", "crimson", "ocean", "violet", "amber"]) {
    for (const asset of ["icon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "maskable-512.png", "manifest-light.webmanifest", "manifest-dark.webmanifest"]) {
      const response = await request.get(`/pwa/${theme}/${asset}`);
      expect(response.ok(), `${theme}/${asset}`).toBe(true);
    }
  }
});
