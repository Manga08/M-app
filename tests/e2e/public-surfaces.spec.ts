import { expect, test } from "@playwright/test";

const publicRoutes = [
  { path: "/login", heading: "Tu dinero, claro desde el primer vistazo." },
  { path: "/acceso-denegado", heading: "Esta cuenta aún no puede entrar." },
  { path: "/offline", heading: "Tu información sigue en este dispositivo." },
];

for (const route of publicRoutes) {
  test(`${route.path} conserva la composición pública y no desborda`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expect(page.locator("[data-public-surface]")).toBeVisible();

    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      headingCount: document.querySelectorAll("h1").length,
    }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.headingCount).toBe(1);
    const actionableErrors = errors.filter((message) => !/Content Security Policy|script-src directive|Viewport argument key/i.test(message));
    expect(actionableErrors).toEqual([]);
  });
}

test("el acceso mantiene foco visible y un control táctil suficiente", async ({ page, browserName }) => {
  await page.goto("/login");
  const signIn = page.getByRole("button", { name: "Continuar con Google" });
  const box = await signIn.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);

  const isEnabled = await signIn.isEnabled();
  if (isEnabled && browserName !== "webkit") {
    await signIn.focus();
    await expect(signIn).toBeFocused();
  }
});
