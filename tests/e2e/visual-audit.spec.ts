import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/movimientos",
  "/movimientos?vista=programados",
  "/movimientos?vista=calendario",
  "/presupuestos",
  "/presupuestos?vista=presupuesto",
  "/presupuestos?vista=simulador",
  "/metas",
  "/cuentas",
  "/reportes",
  "/ajustes",
  "/perfil",
];

function isIgnorableBrowserMessage(text: string) {
  return text.includes('Viewport argument key "interactive-widget"')
    || (text.includes("_rsc=") && text.includes("due to access control checks"));
}

test("all principal surfaces stay inside the visual viewport", async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isIgnorableBrowserMessage(error.message)) runtimeErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!isIgnorableBrowserMessage(text)) runtimeErrors.push(text);
  });

  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should load`).toBeLessThan(400);
    await expect(page.locator("main#main-content")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => page.locator("body").innerText()).not.toBe("");

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      mainRight: document.querySelector("main")?.getBoundingClientRect().right ?? 0,
      innerWidth: window.innerWidth,
    }));
    expect(layout.scrollWidth, `${route} overflows on ${testInfo.project.name}`).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.mainRight, `${route} escapes the viewport on ${testInfo.project.name}`).toBeLessThanOrEqual(layout.innerWidth + 1);
  }

  expect(runtimeErrors, `runtime errors on ${testInfo.project.name}`).toEqual([]);
});

test("mobile sheets close with browser Back before leaving their page", async ({ page }, testInfo) => {
  test.skip(!["phone-320", "phone-430"].includes(testInfo.project.name), "History gesture is covered on phone layouts.");

  await page.goto("/reportes", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(page.getByRole("heading", { name: "Configurar reporte" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Configurar reporte" })).toBeHidden();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/reportes");

  await page.goto("/movimientos", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Movimientos" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(page.getByRole("heading", { name: "Filtrar movimientos" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Filtrar movimientos" })).toBeHidden();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/movimientos");
});

test("quick movement dialog fits and keeps its controls aligned", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Tu mes, de un vistazo." })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.dispatchEvent(new Event("moneva:quick-add")));
  const dialog = page.getByRole("dialog", { name: /Qué pasó con tu dinero|Configúralo una vez/ });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    return Boolean(box && viewport
      && box.x >= -1
      && box.y >= -1
      && box.x + box.width <= viewport.width + 1
      && box.y + box.height <= viewport.height + 1);
  }, { message: "the dialog should settle fully inside the viewport after its entrance animation" }).toBe(true);

  const accountPicker = dialog.getByLabel("Cuenta");
  const accountState = await accountPicker.evaluate((element) => ({
    tagName: element.tagName,
    text: element.textContent?.trim() ?? "",
    value: element instanceof HTMLSelectElement ? element.value : "",
  }));
  if (accountState.tagName === "SELECT") {
    expect(accountState.value || accountState.text).not.toBe("");
  } else {
    expect(accountState.text).not.toBe("");
  }

  const geometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const controls = Array.from(element.querySelectorAll<HTMLElement>('[data-slot="form-control"]'))
      .filter((control) => control.getBoundingClientRect().height > 0)
      .map((control) => control.getBoundingClientRect());
    return {
      dialog: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      controls: controls.map((control) => ({ left: control.left, right: control.right, height: control.height })),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  expect(geometry.dialog.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.dialog.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
  expect(geometry.dialog.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.dialog.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
  for (const control of geometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(geometry.dialog.left - 1);
    expect(control.right).toBeLessThanOrEqual(geometry.dialog.right + 1);
    expect(control.height).toBeGreaterThanOrEqual(48);
  }
});
