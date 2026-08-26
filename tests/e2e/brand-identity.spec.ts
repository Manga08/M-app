import { expect, test } from "@playwright/test";
import brandSymbol from "../../config/brand-symbol.json";
import { PWA_ASSET_VERSION } from "../../src/lib/pwa-theme";

test("uses one canonical Moneva symbol on public and private surfaces", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1080", "The geometry is invariant; one browser verifies every surface.");

  for (const route of ["/", "/login", "/offline", "/ruta-que-no-existe"]) {
    await page.goto(route);
    const marks = page.locator(`[data-moneva-brand-symbol="v${brandSymbol.version}"]`);
    await expect(marks.first(), `${route} should expose the canonical mark`).toBeVisible();

    const geometries = await marks.evaluateAll((nodes) => nodes.map((node) => ({
      viewBox: node.getAttribute("viewBox"),
      paths: Array.from(node.querySelectorAll("path"), (path) => path.getAttribute("d")),
    })));
    expect(geometries.every((geometry) => geometry.viewBox === brandSymbol.inlineViewBox)).toBe(true);
    expect(geometries.every((geometry) => geometry.paths.join("|") === `${brandSymbol.leftPath}|${brandSymbol.rightPath}`)).toBe(true);
  }
});

test("publishes the same geometry for favicon and installable PWA assets", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1080", "Asset bytes do not depend on viewport.");

  const svgResponse = await request.get(`/pwa/moneva/icon.svg?v=${PWA_ASSET_VERSION}`);
  const svg = await svgResponse.text();
  expect(svgResponse.ok()).toBe(true);
  expect(svg).toContain(`d="${brandSymbol.leftPath}"`);
  expect(svg).toContain(`d="${brandSymbol.rightPath}"`);

  const favicon = await request.get("/favicon.ico");
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()["content-type"]).toContain("image/x-icon");
  expect((await favicon.body()).byteLength).toBeGreaterThan(500);
});
