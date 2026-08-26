import { expect, test } from "@playwright/test";
import { PWA_ASSET_VERSION } from "../../src/lib/pwa-theme";

test("sincroniza paleta, favicon, manifest y color del navegador", async ({ page }) => {
  await page.goto("/ajustes");
  await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();

  await page.getByRole("button", { name: /Crimson Rojo profundo/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "crimson");
  await expect(page.locator('link[rel="manifest"]').first()).toHaveAttribute("href", new RegExp(`/pwa/crimson/manifest-(dark|light)\\.webmanifest\\?v=${PWA_ASSET_VERSION}`));
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", `/pwa/crimson/icon.svg?v=${PWA_ASSET_VERSION}`);
  await expect(page.locator('link[rel="apple-touch-icon"]').first()).toHaveAttribute("href", `/pwa/crimson/apple-touch-icon.png?v=${PWA_ASSET_VERSION}`);
  await expect.poll(async () => page.locator('link[rel="icon"]').evaluateAll((nodes, version) => nodes.every((node) => node.getAttribute("href") === `/pwa/crimson/icon.svg?v=${version}`), PWA_ASSET_VERSION)).toBe(true);
  await expect.poll(async () => page.locator('link[rel="manifest"]').evaluateAll((nodes, version) => nodes.every((node) => new RegExp(`/pwa/crimson/manifest-(dark|light)\\.webmanifest\\?v=${version}`).test(node.getAttribute("href") ?? "")), PWA_ASSET_VERSION)).toBe(true);

  await page.getByRole("button", { name: "Claro", exact: true }).click();
  await expect(page.locator('link[rel="manifest"]').first()).toHaveAttribute("href", `/pwa/crimson/manifest-light.webmanifest?v=${PWA_ASSET_VERSION}`);
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
