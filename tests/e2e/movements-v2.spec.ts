import { expect, test } from "@playwright/test";

test("movements keeps history, schedules and calendar coherent", async ({ page }, testInfo) => {
  await page.goto("/movimientos", { waitUntil: "networkidle" });

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await expect(page.getByRole("tab", { name: /Historial/ })).toHaveAttribute("aria-selected", "true");

  const scheduled = page.getByRole("tab", { name: /Programados/ });
  await scheduled.click();
  await expect(page).toHaveURL(/\/movimientos\?vista=programados$/);
  await expect(scheduled).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Lo que se repite, una sola vez" })).toBeVisible();

  await page.getByRole("button", { name: "Nueva programación" }).click();
  await page.getByRole("button", { name: "Programado", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Configúralo una vez" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Frecuencia y automatización" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Publicar automáticamente" })).toBeChecked();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("quick-transaction-close").click();
  await expect(page).toHaveURL(/\/movimientos\?vista=programados$/);
  await expect(page.getByRole("heading", { name: "Configúralo una vez" })).toBeHidden();

  const calendar = page.getByRole("tab", { name: /Calendario/ });
  await calendar.click();
  await expect(page).toHaveURL(/\/movimientos\?vista=calendario$/);
  await expect(calendar).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Tu mes, en contexto" })).toBeVisible();
  await expect(page.locator("[data-financial-calendar]")).toBeVisible();
  await expect(page.getByRole("button", { name: /Hoy,|Sin actividad|de ingresos|de gastos/ }).first()).toBeVisible();

  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll, "Movimientos should never widen the document").toBeLessThanOrEqual(widths.client + 1);

  await page.screenshot({
    path: testInfo.outputPath("movements-calendar.png"),
    animations: "disabled",
    fullPage: false,
  });
});

test("movement tabs support keyboard navigation and browser history", async ({ page }) => {
  await page.goto("/movimientos", { waitUntil: "networkidle" });
  const history = page.getByRole("tab", { name: /Historial/ });
  await history.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Programados/ })).toBeFocused();
  await expect(page).toHaveURL(/\/movimientos\?vista=programados$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/movimientos$/);
  await expect(history).toHaveAttribute("aria-selected", "true");
});

test("financial calendar connects a day with its movements and quick add", async ({ page }) => {
  await page.goto("/movimientos?vista=calendario", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-financial-calendar]")).toBeVisible({ timeout: 15_000 });

  const augustSeventeenth = page.getByRole("button", { name: /lunes, 17 de agosto de 2026/i }).first();
  if (!await augustSeventeenth.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Semana anterior" }).click();
  }
  await augustSeventeenth.click();
  await expect(augustSeventeenth).toHaveAttribute("aria-pressed", "true");

  const ledger = page.getByRole("complementary", { name: /Detalle del lunes, 17 de agosto de 2026/i });
  await expect(ledger).toContainText("2 movimientos en el día");
  await expect(ledger.getByRole("button", { name: /Abrir Mercado Central/i })).toBeVisible();

  await ledger.getByRole("button", { name: /Abrir Mercado Central/i }).click();
  const editHeading = page.getByRole("heading", { name: "Ajusta los detalles" });
  await expect(editHeading).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(editHeading).toBeHidden();

  await ledger.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "¿Qué pasó con tu dinero?" })).toBeVisible();
  const dateControl = page.locator("#transaction-date");
  await expect(dateControl).toBeVisible();
  const dateValue = await dateControl.evaluate((element) => element instanceof HTMLInputElement ? element.value : element.textContent?.trim());
  expect(["2026-08-17", "17 de agosto de 2026"]).toContain(dateValue);
});

test("mobile calendar changes period with a horizontal swipe", async ({ page }, testInfo) => {
  test.skip(!["phone-320", "pixel-7"].includes(testInfo.project.name), "Native touch injection is verified in Chromium phone layouts.");

  await page.goto("/movimientos?vista=calendario", { waitUntil: "domcontentloaded" });
  const surface = page.locator("[data-calendar-swipe-surface]");
  await expect(surface).toBeVisible({ timeout: 15_000 });
  await surface.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const initialPeriod = await surface.getAttribute("data-calendar-period");
  const gesture = await surface.evaluate((element) => {
    const buttons = Array.from(element.querySelectorAll("button")).filter((button) => button.getBoundingClientRect().height > 0);
    const first = buttons.at(0)?.getBoundingClientRect();
    const last = buttons.at(-1)?.getBoundingClientRect();
    if (!first || !last) return null;
    return {
      y: Math.round(last.top + last.height / 2),
      fromX: Math.round(last.left + last.width / 2),
      toX: Math.round(first.left + first.width / 2),
    };
  });
  expect(gesture).not.toBeNull();
  if (!gesture) return;
  const { y, fromX, toX } = gesture;
  const startsOnSurface = await page.evaluate(({ x, y: pointY }) => Boolean(document.elementFromPoint(x, pointY)?.closest("[data-calendar-swipe-surface]")), { x: fromX, y });
  expect(startsOnSurface).toBe(true);
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fromX, y, radiusX: 4, radiusY: 4, force: 1 }] });
  for (let step = 1; step <= 8; step += 1) {
    const x = Math.round(fromX + ((toX - fromX) * step) / 8);
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await expect.poll(() => surface.getAttribute("data-calendar-period")).not.toBe(initialPeriod);
  const layout = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
});

test("movement history has one sticky control layer on mobile", async ({ page }, testInfo) => {
  test.skip(!["phone-320", "phone-430", "iphone-15-pro", "pixel-7"].includes(testInfo.project.name), "Sticky hierarchy is a phone layout concern.");

  await page.goto("/movimientos", { waitUntil: "domcontentloaded" });
  const tabs = page.locator("[data-movement-tabs]");
  const filters = page.locator("[data-movement-filters]");
  await expect(tabs).toBeVisible({ timeout: 15_000 });
  await expect(filters).toBeVisible();

  const positions = await page.evaluate(() => ({
    tabs: getComputedStyle(document.querySelector<HTMLElement>("[data-movement-tabs]")!).position,
    filters: getComputedStyle(document.querySelector<HTMLElement>("[data-movement-filters]")!).position,
  }));
  expect(positions.tabs).toBe("static");
  expect(positions.filters).toBe("sticky");

  await filters.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, 120));
  const filterBox = await filters.boundingBox();
  const tabBox = await tabs.boundingBox();
  expect(filterBox).not.toBeNull();
  if (filterBox && tabBox) expect(tabBox.y + tabBox.height).toBeLessThanOrEqual(filterBox.y + 1);
});
