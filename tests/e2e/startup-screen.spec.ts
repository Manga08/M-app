import { expect, test } from "@playwright/test";
import brandSymbol from "../../config/brand-symbol.json";
import { PWA_THEME_STORAGE_KEY } from "../../src/lib/pwa-theme";

test("the startup screen keeps the saved identity before hydration", async ({ page }, testInfo) => {
  test.skip(!["phone-320", "desktop-1080"].includes(testInfo.project.name), "The startup state is visually covered at its smallest and largest primary compositions.");

  await page.addInitScript((themeStorageKey) => {
    localStorage.setItem(themeStorageKey, "crimson");
    localStorage.setItem("theme", "dark");
  }, PWA_THEME_STORAGE_KEY);

  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue();
  });

  await page.goto("/", { waitUntil: "commit" });
  const startup = page.locator("[data-app-startup-screen]");
  await expect(startup).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "crimson");
  await expect(page.getByRole("heading", { name: "Preparando tu espacio" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveAttribute("aria-busy", "true");
  const mark = startup.locator(`[data-moneva-brand-symbol="v${brandSymbol.version}"]`);
  await expect(mark).toHaveAttribute("viewBox", brandSymbol.inlineViewBox);
  await expect(mark.locator("path").first()).toHaveAttribute("d", brandSymbol.leftPath);

  const layout = await startup.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
  expect(layout.width).toBe(layout.viewportWidth);
  expect(layout.height).toBeGreaterThanOrEqual(layout.viewportHeight);
  expect(layout.horizontalOverflow).toBe(false);

  await page.screenshot({ path: testInfo.outputPath("startup-screen.png"), animations: "disabled" });
});
