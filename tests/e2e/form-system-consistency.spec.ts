import { expect, test } from "@playwright/test";

test("financial editors share one responsive surface and identity control", async ({ page }) => {
  await page.goto("/cuentas", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nueva cuenta" }).click();

  const dialog = page.getByRole("dialog", { name: "Nueva cuenta" });
  const body = dialog.locator("[data-form-dialog-body]");
  const actions = dialog.locator("[data-form-dialog-actions]");
  await expect(dialog).toHaveAttribute("data-form-dialog", "compact");
  await expect(body).toBeVisible();
  await expect(actions).toBeVisible();
  await expect(dialog.getByLabel("Nombre e icono")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Usar color/ })).toHaveCount(8);
  await expect(dialog.getByLabel(/Elegir un color personalizado/)).toBeVisible();

  const dimensions = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('[data-form-dialog="compact"]')!;
    const editorBody = editor.querySelector<HTMLElement>("[data-form-dialog-body]")!;
    const rect = editor.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      bodyOverflowY: getComputedStyle(editorBody).overflowY,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(dimensions.documentOverflow).toBeLessThanOrEqual(1);
  expect(dimensions.bodyOverflowY).toBe("auto");
  if (dimensions.viewportWidth < 640) {
    expect(dimensions.x).toBeCloseTo(0, 0);
    expect(dimensions.y).toBeCloseTo(0, 0);
    expect(dimensions.width).toBeCloseTo(dimensions.viewportWidth, 0);
    expect(dimensions.height).toBeCloseTo(dimensions.viewportHeight, 0);
  } else {
    expect(dimensions.width).toBeLessThan(dimensions.viewportWidth);
    expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight * 0.95);
  }

  const iconTrigger = dialog.getByRole("button", { name: /Elegir icono\. Actual:/ });
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await iconTrigger.click();
    const picker = page.getByRole("dialog", { name: "Elige un icono" });
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Cerrar selector de iconos" }).click();
    await expect(picker).toBeHidden();
    await expect(dialog).toBeVisible();
  }

  const scrollState = await page.evaluate(() => ({
    bodyLock: document.body.getAttribute("data-scroll-locked"),
    parentPointerEvents: getComputedStyle(document.querySelector<HTMLElement>('[data-form-dialog="compact"]')!).pointerEvents,
  }));
  expect(scrollState).toEqual({ bodyLock: "1", parentPointerEvents: "auto" });

  await dialog.getByRole("button", { name: "Cerrar" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Mostrar cuentas de Bancolombia" }).click();
  await page.getByRole("button", { name: /Editar cuenta Bancolombia/ }).click();
  const editDialog = page.getByRole("dialog", { name: "Editar cuenta" });
  await expect(editDialog).toHaveAttribute("data-form-dialog", "compact");
  await expect(editDialog.getByLabel("Nombre e icono")).toBeVisible();
  await expect(editDialog.locator("[data-form-dialog-body]")).toBeVisible();
  await expect(editDialog.locator("[data-form-dialog-actions]")).toBeVisible();
});

test("movement color remains semantic while its icon stays personalizable", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('button[aria-label="Registrar movimiento"]:visible, button:has-text("Nuevo movimiento"):visible').first().click();

  const dialog = page.getByRole("dialog", { name: /¿Qué pasó con tu dinero?/ });
  const expense = dialog.getByRole("button", { name: "Gasto", exact: true });
  const income = dialog.getByRole("button", { name: "Ingreso", exact: true });
  const transfer = dialog.getByRole("button", { name: "Transferencia", exact: true });

  await expect(expense).toHaveClass(/text-destructive/);
  await income.click();
  await expect(income).toHaveClass(/text-positive/);
  await transfer.click();
  await expect(transfer).toHaveClass(/text-info/);
  await expect(dialog.getByLabel("Etiqueta (opcional)")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Elegir icono\. Actual:/ })).toBeVisible();
  await expect(dialog.getByText(/El color se asigna por tipo/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Usar color/ })).toHaveCount(0);
});
