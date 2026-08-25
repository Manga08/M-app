import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

async function openImmediateMovement(page: Page) {
  // The quick action is represented in the URL so browser Back can close it.
  // Opening that state directly keeps the test independent from App Router's
  // client-navigation completion signal, which differs across browser engines.
  await page.goto("/?overlay=movement", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("dialog", { name: "¿Qué pasó con tu dinero?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rellenar desde una imagen" })).toBeVisible();
}

async function expectAdaptiveSelection(control: ReturnType<Page["getByLabel"]>, nativeValue: string, visibleLabel: string) {
  const tagName = await control.evaluate((element) => element.tagName);
  if (tagName === "SELECT") await expect(control).toHaveValue(nativeValue);
  else await expect(control).toContainText(visibleLabel);
}

test("image capture stays usable and contained at every configured breakpoint", async ({ page }) => {
  await openImmediateMovement(page);

  const camera = page.getByRole("button", { name: "Cámara", exact: true });
  const gallery = page.getByRole("button", { name: "Galería", exact: true });
  await expect(camera).toBeVisible();
  await expect(gallery).toBeVisible();
  await expect(page.getByText("Nada se sube ni se guarda automáticamente.")).toBeVisible();
  await expect(page.getByRole("note", { name: "Función de lectura de imágenes en beta" })).toContainText("Confirma monto, fecha, cuenta y categoría");

  const geometry = await page.evaluate(() => {
    const capture = document.querySelector<HTMLElement>('[aria-labelledby="local-image-capture-title"]');
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const buttonSizes = Array.from(capture?.querySelectorAll("button") ?? []).map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    return {
      pageClientWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      dialogClientWidth: dialog?.clientWidth ?? 0,
      dialogScrollWidth: dialog?.scrollWidth ?? 0,
      captureClientWidth: capture?.clientWidth ?? 0,
      captureScrollWidth: capture?.scrollWidth ?? 0,
      buttonSizes,
    };
  });

  expect(geometry.pageScrollWidth).toBeLessThanOrEqual(geometry.pageClientWidth + 1);
  expect(geometry.dialogScrollWidth).toBeLessThanOrEqual(geometry.dialogClientWidth + 1);
  expect(geometry.captureScrollWidth).toBeLessThanOrEqual(geometry.captureClientWidth + 1);
  expect(geometry.buttonSizes.length).toBeGreaterThanOrEqual(2);
  for (const size of geometry.buttonSizes) {
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
});

test("a disguised non-image is rejected without changing the form", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "The signature rejection only needs one browser run.");
  await openImmediateMovement(page);

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Galería", exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "captura-falsa.png",
    mimeType: "image/png",
    buffer: Buffer.from("esto no es una imagen"),
  });

  await expect(page.getByRole("heading", { name: "No pudimos leerla" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("no es una imagen JPG, PNG o WebP válida");
  await expect(page.getByLabel("Monto")).toHaveValue("");
  await expect(page.getByLabel("Comercio (opcional)")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Guardar gasto" })).toBeVisible();

  const preview = page.getByAltText("Vista previa de captura-falsa.png");
  await expect(preview).toHaveCount(0);
});

test("local OCR creates a reviewable draft and never saves it automatically", async ({ page }, testInfo) => {
  test.skip(
    !["desktop-chrome", "iphone-15-pro"].includes(testInfo.project.name),
    "The real OCR run covers one Chromium desktop and one WebKit phone.",
  );
  test.setTimeout(90_000);
  await openImmediateMovement(page);

  const receipt = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
      <rect width="1200" height="800" fill="white"/>
      <g fill="black" font-family="Arial, sans-serif" font-size="64">
        <text x="80" y="130">BANCOLOMBIA</text>
        <text x="80" y="250">COMPRA APROBADA</text>
        <text x="80" y="370">PAGASTE $ 23.900 EN SPOTIFY</text>
        <text x="80" y="490">TARJETA TERMINADA EN 4521</text>
        <text x="80" y="610">FECHA 20/08/2026</text>
      </g>
    </svg>
  `)).png().toBuffer();

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Galería", exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "recibo-sintetico.png", mimeType: "image/png", buffer: receipt });

  await expect(page.getByRole("heading", { name: "Datos listos para revisar" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByLabel("Monto")).toHaveValue("23.900");
  await expect(page.getByLabel("Comercio (opcional)")).toHaveValue("Spotify");
  await expectAdaptiveSelection(page.getByLabel("Categoría", { exact: true }), "wants", "Gustos");
  await expectAdaptiveSelection(page.getByLabel("Subcategoría", { exact: true }), "cat-fun", "Entretenimiento");
  await expect(page.getByRole("button", { name: "Guardar gasto" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "¿Qué pasó con tu dinero?" })).toBeVisible();

  await page.getByTestId("quick-transaction-close").click();
  await expect(page.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeVisible();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "¿Qué pasó con tu dinero?" })).toBeHidden();

  await openImmediateMovement(page);
  await expect(page.getByLabel("Monto")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Rellenar desde una imagen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Datos listos para revisar" })).toHaveCount(0);
});
