import { expect, test, type Locator, type Page } from "@playwright/test";

const contractProjects = new Set(["desktop-chrome", "pixel-7", "iphone-15-pro"]);

test("canonical motion tokens drive press feedback and route tabs", async ({ page }, testInfo) => {
  test.skip(!contractProjects.has(testInfo.project.name), "Motion behavior is sampled once per primary interaction model.");

  await page.goto("/presupuestos", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: /Distribución/ })).toBeVisible({ timeout: 15_000 });

  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      press: style.getPropertyValue("--motion-duration-press").trim(),
      menu: style.getPropertyValue("--motion-duration-menu").trim(),
      overlay: style.getPropertyValue("--motion-duration-overlay").trim(),
      spatial: style.getPropertyValue("--motion-duration-spatial").trim(),
      pressScale: style.getPropertyValue("--motion-press-scale").trim(),
    };
  });
  expect({
    press: cssTimeMs(tokens.press),
    menu: cssTimeMs(tokens.menu),
    overlay: cssTimeMs(tokens.overlay),
    spatial: cssTimeMs(tokens.spatial),
    pressScale: Number.parseFloat(tokens.pressScale),
  }).toEqual({ press: 100, menu: 160, overlay: 200, spatial: 240, pressScale: 0.98 });

  const budget = page.getByRole("tab", { name: /Presupuesto/ });
  if (testInfo.project.name === "desktop-chrome") await expectPressFeedback(page, budget);

  const indicator = page.locator("[data-route-tab-indicator]");
  const distribution = page.getByRole("tab", { name: /Distribución/ });
  await expectIndicatorAligned(indicator, distribution);
  await budget.click();
  await expect(page).toHaveURL(/vista=presupuesto/);
  await expect(budget).toHaveAttribute("aria-selected", "true");
  await expectIndicatorAligned(indicator, budget);

  const simulator = page.getByRole("tab", { name: /Simulador/ });
  await simulator.click();
  await distribution.click();
  await simulator.click();
  await expect(simulator).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/vista=simulador/);
  await expect(page.getByRole("heading", { name: "Prueba un mes antes de tomar decisiones" })).toBeVisible();

  const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});

test("the quick movement remains mounted for its real exit lifecycle", async ({ page }, testInfo) => {
  test.skip(!contractProjects.has(testInfo.project.name), "Dialog lifecycle is sampled in Chromium desktop and touch layouts.");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Tu mes, de un vistazo." })).toBeVisible({ timeout: 15_000 });

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await page.getByRole("button", { name: /Nuevo movimiento|Registrar movimiento/ }).first().click();
    await expect(page).toHaveURL(/overlay=movement/);
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toHaveAttribute("data-state", "open");
    const exitDuration = maximumCssTimeMs(await dialog.evaluate((element) => getComputedStyle(element).animationDuration));
    expect(exitDuration).toBeGreaterThanOrEqual(190);
    expect(exitDuration).toBeLessThanOrEqual(210);

    await page.getByTestId("quick-transaction-close").click();
    await expect(dialog).toHaveAttribute("data-state", "closed");
    await expect(dialog).toHaveCount(0);
    await expect(page).not.toHaveURL(/overlay=movement/);
  }
});

test("reduced motion removes spatial travel without removing function", async ({ page }, testInfo) => {
  test.skip(!contractProjects.has(testInfo.project.name), "Reduced motion is sampled once per primary interaction model.");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/presupuestos", { waitUntil: "domcontentloaded" });
  const budget = page.getByRole("tab", { name: /Presupuesto/ });
  await budget.click();
  await expect(budget).toHaveAttribute("aria-selected", "true");

  const panelMotion = await page.locator("[data-route-view-panel]:visible").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      translateY: style.transform === "none" ? 0 : new DOMMatrixReadOnly(style.transform).m42,
      transitionProperty: style.transitionProperty,
    };
  });
  expect(Math.abs(panelMotion.translateY)).toBeLessThan(0.001);
  expect(panelMotion.transitionProperty).not.toContain("transform");

  await page.getByRole("button", { name: /Nuevo movimiento|Registrar movimiento/ }).first().click();
  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();
  const reducedSurface = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    const seconds = style.animationDuration.split(",").map((value) => Number.parseFloat(value) * (value.includes("ms") ? 0.001 : 1));
    return {
      maximumDuration: Math.max(0, ...seconds),
      enterScale: style.getPropertyValue("--tw-enter-scale").trim(),
      enterY: style.getPropertyValue("--tw-enter-translate-y").trim(),
    };
  });
  expect(reducedSurface.maximumDuration).toBeLessThanOrEqual(0.101);
  expect(["", "1"]).toContain(reducedSurface.enterScale);
  expect(["", "0", "0px"]).toContain(reducedSurface.enterY);

  await page.getByTestId("quick-transaction-close").click();
  await expect(dialog).toHaveCount(0);
});

async function expectPressFeedback(page: Page, target: Locator) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(80);
  const scale = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    if (style.scale && style.scale !== "none") return Number.parseFloat(style.scale);
    const transform = style.transform;
    if (transform === "none") return 1;
    return new DOMMatrixReadOnly(transform).a;
  });
  await page.mouse.move(0, 0);
  await page.mouse.up();
  expect(scale).toBeLessThan(0.999);
  expect(scale).toBeGreaterThanOrEqual(0.97);
}

async function expectIndicatorAligned(indicator: Locator, activeTab: Locator) {
  await expect.poll(async () => {
    const [indicatorBox, activeTabBox] = await Promise.all([indicator.boundingBox(), activeTab.boundingBox()]);
    if (!indicatorBox || !activeTabBox) return Number.POSITIVE_INFINITY;
    const indicatorCenter = indicatorBox.x + indicatorBox.width / 2;
    const activeTabCenter = activeTabBox.x + activeTabBox.width / 2;
    return Math.abs(indicatorCenter - activeTabCenter);
  }, { message: "The route indicator should settle under the selected tab" }).toBeLessThanOrEqual(1);
}

function cssTimeMs(value: string) {
  const numeric = Number.parseFloat(value);
  return value.trim().endsWith("ms") ? numeric : numeric * 1000;
}

function maximumCssTimeMs(value: string) {
  return Math.max(0, ...value.split(",").map((part) => cssTimeMs(part.trim())));
}
