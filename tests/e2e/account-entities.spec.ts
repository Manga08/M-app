import { expect, test } from "@playwright/test";

test("las entidades agrupan cuentas sin mezclar saldos ni romper el editor", async ({ page }) => {
  await page.goto("/cuentas", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Directorio de cuentas" })).toBeVisible();

  const initialLayout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(initialLayout.scrollWidth).toBeLessThanOrEqual(initialLayout.clientWidth + 1);

  const disclosure = page.getByRole("button", { name: "Mostrar cuentas de Bancolombia" });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.click();
  await expect(page.getByRole("button", { name: /Editar cuenta Bancolombia/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ocultar cuentas de Bancolombia" })).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "Nueva entidad" }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva entidad" });
  await expect(dialog).toHaveAttribute("data-form-dialog", "compact");
  await dialog.locator("#account-entity-name").fill("Global66");

  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, x: rect.x, y: rect.y, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  if (geometry.viewportWidth < 640) {
    expect(geometry.x).toBeCloseTo(0, 0);
    expect(geometry.y).toBeCloseTo(0, 0);
    expect(geometry.width).toBeCloseTo(geometry.viewportWidth, 0);
    expect(geometry.height).toBeCloseTo(geometry.viewportHeight, 0);
  } else {
    expect(geometry.width).toBeLessThan(geometry.viewportWidth);
    expect(geometry.height).toBeLessThanOrEqual(geometry.viewportHeight * 0.95);
  }

  await dialog.getByRole("button", { name: "Crear entidad" }).click();
  await expect(page.getByRole("button", { name: "Ocultar cuentas de Global66" })).toBeVisible();
  await expect(page.getByText("Sin cuentas todavía")).toBeVisible();

  await page.getByRole("button", { name: "Nueva cuenta" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Nueva cuenta" });
  const entitySelect = accountDialog.getByRole("combobox", { name: /Entidad/ });
  if (await entitySelect.evaluate((element) => element.tagName) === "SELECT") {
    await expect(entitySelect.locator("option", { hasText: "Global66" })).toHaveCount(1);
    await entitySelect.selectOption({ label: "Global66" });
    await expect(entitySelect).not.toHaveValue("");
  } else {
    await entitySelect.click();
    await page.getByRole("option", { name: "Global66", exact: true }).click();
    await expect(entitySelect).toContainText("Global66");
  }

  await accountDialog.locator("#account-name").fill("Cuenta temporal");
  await accountDialog.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(accountDialog).toBeHidden();

  await page.getByRole("button", { name: "Editar cuenta Cuenta temporal de Global66" }).click();
  const editDialog = page.getByRole("dialog", { name: "Editar cuenta" });
  await editDialog.getByRole("button", { name: "Archivar cuenta" }).click();
  const archiveDialog = page.getByRole("alertdialog", { name: "¿Archivar “Cuenta temporal”?" });
  await expect(archiveDialog).toContainText("seguirán visibles en el historial");
  await expect(archiveDialog.getByRole("button", { name: "Archivar cuenta" })).toBeEnabled();
  await archiveDialog.getByRole("button", { name: "Archivar cuenta" }).click();

  await expect(editDialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Editar cuenta Cuenta temporal de Global66" })).toHaveCount(0);
});
