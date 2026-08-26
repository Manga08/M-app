import { expect, test, type Page } from "@playwright/test";

const publicRoutes = ["/login", "/acceso-denegado", "/offline"] as const;
const motionFeatureSignature = "domAnimation";

test("Motion feature chunks stay private to the authenticated app", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "The production bundle boundary only needs one browser engine.");

  for (const route of publicRoutes) {
    const page = await browser.newPage();
    const motionChunks = await requestedChunksContaining(page, route, motionFeatureSignature);
    expect(new URL(page.url()).pathname).toBe(route);
    expect(motionChunks, `${route} requested a Motion feature chunk`).toEqual([]);
    await page.close();
  }

  const privatePage = await browser.newPage();
  const privateMotionChunks = await requestedChunksContaining(privatePage, "/", motionFeatureSignature);
  expect(new URL(privatePage.url()).pathname).toBe("/");
  expect(privateMotionChunks, "The authenticated app did not request its Motion feature chunk").not.toEqual([]);
  await privatePage.close();
});

async function requestedChunksContaining(page: Page, route: string, signature: string) {
  const matches = new Set<string>();
  const inspections: Promise<void>[] = [];

  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/_next/static/chunks/") || !url.pathname.endsWith(".js")) return;
    inspections.push(response.text().then((body) => {
      if (body.includes(signature)) matches.add(url.pathname);
    }).catch(() => undefined));
  });

  await page.goto(route, { waitUntil: "networkidle" });
  await Promise.all(inspections);
  return [...matches].sort();
}
