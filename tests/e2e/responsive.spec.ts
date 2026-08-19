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
      'button:not([disabled]):visible, a[href]:visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible',
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
