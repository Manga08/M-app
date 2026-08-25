import { expect, test } from "@playwright/test";

test("the main page renders without responsive overflow", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const ignoredConsoleErrors = [
    'Viewport argument key "interactive-widget" not recognized and ignored.',
  ];

  page.on("console", (message) => {
    if (message.type() === "error" && !ignoredConsoleErrors.includes(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status(), "The root route should load successfully").toBeLessThan(400);

  const bodyText = (await page.locator("body").innerText()).trim();
  expect(bodyText, "The page should render meaningful content").not.toBe("");
  await expect(page.getByRole("heading", { name: "Tu mes, de un vistazo." })).toBeVisible({ timeout: 15_000 });

  const viewport = page.viewportSize();
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
  }));

  expect(metrics.innerWidth).toBe(viewport?.width);
  expect(metrics.innerHeight).toBe(viewport?.height);
  expect(
    metrics.scrollWidth,
    `The document overflows horizontally: ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);

  const firstControl = page
    .locator(
      'button:not([disabled]):visible, a[href]:not([href="#main-content"]):visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible',
    )
    .first();

  if ((await firstControl.count()) > 0) {
    if (metrics.coarsePointer) {
      await expect(firstControl).toBeVisible();
      const touchTarget = await firstControl.boundingBox();
      expect(touchTarget?.width, "Touch targets should be at least 24 CSS px wide").toBeGreaterThanOrEqual(
        24,
      );
      expect(
        touchTarget?.height,
        "Touch targets should be at least 24 CSS px tall",
      ).toBeGreaterThanOrEqual(24);
    } else {
      await firstControl.focus();
      await expect(firstControl).toBeFocused();
    }
  }

  const screenshotPath = testInfo.outputPath("viewport.png");
  await page.screenshot({
    path: screenshotPath,
    animations: "disabled",
    caret: "hide",
    fullPage: false,
  });
  await testInfo.attach("viewport", {
    path: screenshotPath,
    contentType: "image/png",
  });
  await testInfo.attach("device-metrics", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });

  expect(pageErrors, "The page should not throw uncaught runtime errors").toEqual([]);
  expect(consoleErrors, "The browser console should not contain errors").toEqual([]);
});

test("the dashboard keeps a deliberate composition at every breakpoint", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const dashboard = page.locator("[data-dashboard]");
  const main = page.locator("[data-app-content]");
  const hero = page.locator("[data-dashboard-hero]");
  const balance = page.locator("[data-dashboard-balance]");
  const income = hero.getByText("Ingresado", { exact: true }).locator("..").locator("p").nth(1);
  const budget = page.locator("[data-dashboard-budget]");
  const pulse = page.locator("[data-dashboard-pulse]");
  const targetArea = page.locator("[data-dashboard-targets]");
  const targetItems = targetArea.locator("[data-dashboard-target]");

  await expect(dashboard).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Tu mes, de un vistazo." })).toBeVisible();
  await expect(balance).toBeVisible();
  await expect(budget).toBeVisible();
  await expect(pulse).toBeVisible();
  await expect(targetArea).toBeVisible();

  const viewport = page.viewportSize();
  const boxes = {
    main: await main.boundingBox(),
    dashboard: await dashboard.boundingBox(),
    hero: await hero.boundingBox(),
    balance: await balance.boundingBox(),
    income: await income.boundingBox(),
    budget: await budget.boundingBox(),
    pulse: await pulse.boundingBox(),
  };

  for (const [name, box] of Object.entries(boxes)) {
    expect(box, `${name} should participate in the rendered composition`).not.toBeNull();
  }

  const mainBox = boxes.main!;
  const dashboardBox = boxes.dashboard!;
  expect(mainBox.width, "The app canvas should stop stretching on wide screens").toBeLessThanOrEqual(1537);
  expect(dashboardBox.width, "The dashboard should stay inside the app canvas").toBeLessThanOrEqual(mainBox.width);
  expect(dashboardBox.x, "The dashboard should not escape the app canvas on the left").toBeGreaterThanOrEqual(mainBox.x);
  expect(dashboardBox.x + dashboardBox.width, "The dashboard should not escape the app canvas on the right").toBeLessThanOrEqual(mainBox.x + mainBox.width + 1);

  const typeScale = await page.evaluate(() => {
    const focal = document.querySelector<HTMLElement>("[data-dashboard-balance]");
    const secondary = Array.from(document.querySelectorAll<HTMLElement>("[data-dashboard-hero] p"))
      .find((element) => element.previousElementSibling?.textContent === "Ingresado");
    return {
      focal: focal ? Number.parseFloat(getComputedStyle(focal).fontSize) : 0,
      secondary: secondary ? Number.parseFloat(getComputedStyle(secondary).fontSize) : 0,
    };
  });
  expect(typeScale.focal, "The available balance must remain the visual focal point").toBeGreaterThan(typeScale.secondary * 1.35);

  if (viewport && viewport.width >= 2000) {
    const sidebarWidth = 236;
    const leftGutter = mainBox.x - sidebarWidth;
    const rightGutter = viewport.width - (mainBox.x + mainBox.width);
    expect(Math.abs(leftGutter - rightGutter), "The capped canvas should be centered inside the desktop workspace").toBeLessThanOrEqual(2);
  }

  if (viewport && viewport.width >= 1280) {
    expect(Math.abs(boxes.budget!.y - boxes.pulse!.y), "Budget and pulse should form one balanced desktop row").toBeLessThanOrEqual(2);
    expect(boxes.pulse!.x, "The supporting pulse should sit to the right of the budget").toBeGreaterThan(boxes.budget!.x + boxes.budget!.width - 1);
  } else {
    expect(boxes.pulse!.y, "The supporting pulse should follow the budget on compact screens").toBeGreaterThan(boxes.budget!.y + boxes.budget!.height - 1);
  }

  if (await targetItems.count()) {
    const targetAreaBox = await targetArea.boundingBox();
    const firstTargetBox = await targetItems.first().boundingBox();
    const firstProgressBox = await targetItems.first().locator('[role="progressbar"]').boundingBox();
    expect(targetAreaBox).not.toBeNull();
    expect(firstTargetBox).not.toBeNull();
    expect(firstProgressBox).not.toBeNull();
    expect(firstTargetBox!.x).toBeGreaterThanOrEqual(targetAreaBox!.x - 1);
    expect(firstTargetBox!.x + firstTargetBox!.width).toBeLessThanOrEqual(targetAreaBox!.x + targetAreaBox!.width + 1);
    expect(firstProgressBox!.width, "Target progress should use the available row width instead of a fixed desktop cap").toBeGreaterThan(firstTargetBox!.width * 0.35);
  }

  if (viewport && viewport.width <= 390) {
    expect(boxes.hero!.width, "The mobile hero must fit the visual viewport").toBeLessThanOrEqual(viewport.width);
    expect(boxes.budget!.y, "Useful budget content should begin inside the first mobile viewport").toBeLessThan(viewport.height * 0.9);
  }
});
