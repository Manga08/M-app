import { expect, test } from "@playwright/test";
import { demoFinanceState } from "../../src/lib/finance/demo-data";
import { seedStressState } from "./helpers/seed-stress-state";

test("Programados distingue la fecha del movimiento de su registro al iniciar el mes", async ({ page }, testInfo) => {
  test.skip(
    !["phone-320", "phone-430", "tablet-small", "desktop-1080", "desktop-2k"].includes(testInfo.project.name),
    "El contrato se valida en teléfono pequeño/grande, tableta y escritorio 1080p/2K.",
  );

  await page.clock.setFixedTime(new Date("2026-09-02T15:00:00Z"));

  const state = structuredClone(demoFinanceState);
  const sourceRule = state.recurringRules.find((rule) => rule.id === "rule-spotify");
  const sourceOccurrence = state.recurringOccurrences.find((occurrence) => occurrence.id === "occ-spotify-aug");
  if (!sourceRule || !sourceOccurrence) throw new Error("La programación base de la prueba no está disponible.");

  state.recurringRules = [{
    ...sourceRule,
    id: "rule-month-start-day-24",
    description: "Servicio del día 24",
    merchant: "Servicio del día 24",
    amount: 33_000,
    startsOn: "2026-10-24",
    anchorDay: 24,
    postingPolicy: "month_start",
    nextRunOn: "2026-10-01",
  }];
  state.recurringOccurrences = [{
    ...sourceOccurrence,
    id: "occ-month-start-day-24",
    ruleId: "rule-month-start-day-24",
    description: "Servicio del día 24",
    merchant: "Servicio del día 24",
    amount: 33_000,
    scheduledOn: "2026-10-24",
    effectiveOn: "2026-10-01",
  }];

  await seedStressState(page, state);
  await page.goto("/movimientos?vista=programados", { waitUntil: "domcontentloaded" });
  const content = page.locator("main[data-app-content]");
  await expect(content).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });

  const list = page.getByRole("list", { name: "Programaciones" });
  const row = list.getByRole("listitem").filter({ hasText: "Servicio del día 24" });
  await expect(row).toContainText("día 24 de cada mes");
  await expect(row).toContainText("24 oct");
  await expect(row).toContainText("Moneva lo registra 1 oct");
  await expect(row).toContainText("Entretenimiento");
  await expect(row).toContainText("$ 33.000");

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);

  await page.screenshot({
    path: testInfo.outputPath("scheduled-month-start.png"),
    animations: "disabled",
    fullPage: true,
  });

  await row.getByRole("button", { name: "Opciones para Servicio del día 24" }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Ajusta lo que se repite" })).toBeVisible();
  await expect(page.getByLabel("Cuándo aparece en Moneva")).toContainText("Al iniciar el mes");
  await expect(page.getByText("Moneva lo crea el día 1, pero el movimiento conserva la fecha del día 24.")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Publicar automáticamente" })).toBeChecked();
});
