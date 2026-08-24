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
  await augustSeventeenth.click();
  await expect(augustSeventeenth).toHaveAttribute("aria-pressed", "true");

  const ledger = page.getByRole("complementary", { name: /Detalle del lunes, 17 de agosto de 2026/i });
  await expect(ledger).toContainText("2 movimientos en el día");
  await expect(ledger.getByRole("button", { name: /Abrir Mercado Central/i })).toBeVisible();

  await ledger.getByRole("button", { name: /Abrir Mercado Central/i }).click();
  await expect(page.getByRole("heading", { name: "Ajusta los detalles" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();

  await ledger.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "¿Qué pasó con tu dinero?" })).toBeVisible();
  const dateControl = page.locator("#transaction-date");
  await expect(dateControl).toBeVisible();
  const dateValue = await dateControl.evaluate((element) => element instanceof HTMLInputElement ? element.value : element.textContent?.trim());
  expect(["2026-08-17", "17 de agosto de 2026"]).toContain(dateValue);
});
