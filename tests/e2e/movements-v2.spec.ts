import { expect, test } from "@playwright/test";

type CalendarGesturePerformanceMetrics = {
  supportsLongTasks: boolean;
  trackingDurationMs: number;
  frameCount: number;
  frameGapsMs: number[];
  maxFrameGapMs: number;
  p95FrameGapMs: number;
  longTasks: Array<{ startTime: number; duration: number }>;
};

type CalendarGesturePerformanceProbe = {
  observer: PerformanceObserver | null;
  rafId: number;
  active: boolean;
  startTime: number;
  endTime: number;
  lastFrame: number | null;
  frameGaps: number[];
  entries: Array<{ startTime: number; duration: number }>;
  start: () => void;
  stop: () => void;
  snapshot: () => CalendarGesturePerformanceMetrics;
  dispose: () => void;
};

type CalendarReleaseFrame = {
  elapsedMs: number;
  slides: Array<{
    hidden: boolean;
    inert: boolean;
    x: number;
    width: number;
  }>;
};

type CalendarReleaseProbe = {
  releaseAt: number;
  rafId: number;
  frames: CalendarReleaseFrame[];
  dispose: () => void;
};

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

test("calendar keyboard focus follows the active panel across month boundaries", async ({ page }, testInfo) => {
  test.skip(!["desktop-chrome", "ipad-mini"].includes(testInfo.project.name), "Focus handoff is verified in Chromium and WebKit.");

  await page.goto("/movimientos?vista=calendario", { waitUntil: "domcontentloaded" });
  const viewport = page.locator("[data-calendar-swipe-surface]");
  await expect(viewport).toBeVisible({ timeout: 15_000 });

  const activeMonthDay = (date: string) => viewport.locator(
    `[data-calendar-period-slide]:not([aria-hidden="true"]):not([inert]) [data-calendar-mode="month"][data-calendar-date="${date}"]`,
  );
  const expectSafeFocus = async (date: string) => {
    await expect.poll(() => page.evaluate(() => {
      const focused = document.activeElement as HTMLElement | null;
      return {
        date: focused?.dataset.calendarDate ?? null,
        mode: focused?.dataset.calendarMode ?? null,
        hiddenAncestor: Boolean(focused?.closest("[inert], [aria-hidden='true']")),
        activePanel: Boolean(focused?.closest("[data-calendar-period-slide]:not([aria-hidden='true']):not([inert])")),
      };
    })).toEqual({ date, mode: "month", hiddenAncestor: false, activePanel: true });
  };

  await activeMonthDay("2026-08-31").focus();
  await page.keyboard.press("ArrowRight");
  await expectSafeFocus("2026-09-01");

  await page.keyboard.press("ArrowLeft");
  await expectSafeFocus("2026-08-31");

  await activeMonthDay("2026-08-17").focus();
  await page.keyboard.press("PageDown");
  await expectSafeFocus("2026-09-17");

  await page.keyboard.press("PageUp");
  await expectSafeFocus("2026-08-17");
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
  for (let step = 1; step <= 4; step += 1) {
    const x = Math.round(fromX + ((toX - fromX) * step) / 8);
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] });
  }
  await page.waitForTimeout(32);

  expect(await surface.getAttribute("data-calendar-period"), "The period must not change while the finger is still down").toBe(initialPeriod);
  const expectedMidpoint = Math.round((toX - fromX) / 2);
  const trackedOffset = await page.locator("[data-calendar-drag-layer]").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return matrix.m41;
  });
  expect(Math.abs(trackedOffset - expectedMidpoint), "The calendar surface should track the finger 1:1").toBeLessThanOrEqual(12);

  for (let step = 5; step <= 8; step += 1) {
    const x = Math.round(fromX + ((toX - fromX) * step) / 8);
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await expect.poll(() => surface.getAttribute("data-calendar-period")).not.toBe(initialPeriod);
  await expect.poll(() => page.locator("[data-calendar-drag-layer]").count()).toBe(1);

  const changedPeriod = await surface.getAttribute("data-calendar-period");
  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  if (surfaceBox) {
    const smallSwipeY = Math.round(surfaceBox.y + Math.min(surfaceBox.height / 2, 48));
    const smallSwipeStart = Math.round(surfaceBox.x + surfaceBox.width * 0.62);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: smallSwipeStart, y: smallSwipeY, radiusX: 4, radiusY: 4, force: 1 }] });
    await page.waitForTimeout(120);
    for (let step = 1; step <= 3; step += 1) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: smallSwipeStart - step * 10, y: smallSwipeY, radiusX: 4, radiusY: 4, force: 1 }] });
      await page.waitForTimeout(50);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(await surface.getAttribute("data-calendar-period"), "A short, slow drag should cancel instead of changing period").toBe(changedPeriod);
    await expect.poll(() => page.locator("[data-calendar-drag-layer]").evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      return transform === "none" ? 0 : Math.abs(new DOMMatrixReadOnly(transform).m41);
    })).toBeLessThanOrEqual(1);
  }

  const layout = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
});

test("mobile calendar keeps swipe navigation without spatial motion when reduced motion is requested", async ({ page }, testInfo) => {
  test.skip(!["phone-320", "pixel-7"].includes(testInfo.project.name), "Native touch injection is verified in Chromium phone layouts.");

  await page.emulateMedia({ reducedMotion: "reduce" });
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

  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: gesture.fromX, y: gesture.y, radiusX: 4, radiusY: 4, force: 1 }] });
  for (let step = 1; step <= 8; step += 1) {
    const x = Math.round(gesture.fromX + ((gesture.toX - gesture.fromX) * step) / 8);
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: gesture.y, radiusX: 4, radiusY: 4, force: 1 }] });
  }
  await page.waitForTimeout(32);

  const dragTransform = await page.locator("[data-calendar-drag-layer]").evaluate((element) => getComputedStyle(element).transform);
  expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(dragTransform);
  expect(await surface.getAttribute("data-calendar-period")).toBe(initialPeriod);

  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => surface.getAttribute("data-calendar-period")).not.toBe(initialPeriod);
});

test("mobile calendar hands drag position into release motion without a jump or overshoot", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7", "Native release-frame sampling uses Chromium touch injection on Pixel 7.");

  await page.goto("/movimientos?vista=calendario", { waitUntil: "domcontentloaded" });
  const viewport = page.locator("[data-calendar-swipe-surface]");
  const dragLayer = page.locator("[data-calendar-drag-layer]");
  await expect(viewport).toBeVisible({ timeout: 15_000 });
  await viewport.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const initialPeriod = await viewport.getAttribute("data-calendar-period");
  const gesture = await viewport.evaluate((element) => {
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

  await page.evaluate(() => {
    const key = "__monevaCalendarReleaseProbe";
    const target = window as unknown as Record<string, unknown>;
    const viewportElement = document.querySelector<HTMLElement>("[data-calendar-swipe-surface]");
    if (!viewportElement) throw new Error("Calendar viewport is unavailable for release sampling");
    const probe = { releaseAt: 0, rafId: 0, frames: [] } as unknown as CalendarReleaseProbe;
    const readSlides = () => Array.from(viewportElement.querySelectorAll<HTMLElement>("[data-calendar-period-slide]")).map((slide) => {
      const transform = getComputedStyle(slide).transform;
      return {
        hidden: slide.getAttribute("aria-hidden") === "true",
        inert: slide.hasAttribute("inert"),
        x: transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41,
        width: slide.getBoundingClientRect().width,
      };
    });
    const sample = (timestamp: number) => {
      const elapsedMs = timestamp - probe.releaseAt;
      probe.frames.push({ elapsedMs, slides: readSlides() });
      if (elapsedMs < 340) probe.rafId = requestAnimationFrame(sample);
    };
    const handleRelease = () => {
      probe.releaseAt = performance.now();
      probe.frames.push({ elapsedMs: 0, slides: readSlides() });
      probe.rafId = requestAnimationFrame(sample);
    };
    window.addEventListener("pointerup", handleRelease, { capture: true, once: true });
    probe.dispose = () => {
      cancelAnimationFrame(probe.rafId);
      window.removeEventListener("pointerup", handleRelease, { capture: true });
      delete target[key];
    };
    target[key] = probe;
  });

  const client = await page.context().newCDPSession(page);
  let frames: CalendarReleaseFrame[] = [];
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: gesture.fromX, y: gesture.y, radiusX: 4, radiusY: 4, force: 1 }],
    });
    for (let step = 1; step <= 8; step += 1) {
      const x = Math.round(gesture.fromX + ((gesture.toX - gesture.fromX) * step) / 8);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: gesture.y, radiusX: 4, radiusY: 4, force: 1 }],
      });
      await page.waitForTimeout(30);
    }

    const releaseOffset = await dragLayer.evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
    });
    expect(
      Math.abs(releaseOffset - (gesture.toX - gesture.fromX)),
      "The panel must still track the finger 1:1 immediately before release",
    ).toBeLessThanOrEqual(12);

    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => viewport.getAttribute("data-calendar-period")).not.toBe(initialPeriod);
    await page.waitForTimeout(360);
    await expect.poll(() => dragLayer.count()).toBe(1);
    frames = await page.evaluate(() => {
      const probe = (window as unknown as Record<string, unknown>)["__monevaCalendarReleaseProbe"] as CalendarReleaseProbe | undefined;
      if (!probe) throw new Error("Calendar release probe disappeared before its frames were read");
      return probe.frames;
    });
  } finally {
    await page.evaluate(() => {
      const probe = (window as unknown as Record<string, unknown>)["__monevaCalendarReleaseProbe"] as CalendarReleaseProbe | undefined;
      probe?.dispose();
    }).catch(() => undefined);
    await client.detach().catch(() => undefined);
  }

  await testInfo.attach("calendar-release-frames.json", {
    body: JSON.stringify({ project: testInfo.project.name, frames }, null, 2),
    contentType: "application/json",
  });
  const releaseFrame = frames[0];
  expect(releaseFrame?.slides, "The pointerup frame must capture the dragged panel").toHaveLength(1);
  const releaseX = releaseFrame.slides[0].x;
  const transitionFrames = frames.filter((frame) => frame.slides.length === 2);
  expect(transitionFrames.length, "The sampler must observe outgoing and incoming panels together").toBeGreaterThan(2);

  const firstTransition = transitionFrames[0];
  const firstOutgoing = firstTransition.slides.find((slide) => slide.hidden || slide.inert);
  expect(firstOutgoing, "The first transition frame must identify the outgoing inert panel").toBeDefined();
  if (!firstOutgoing) return;
  expect(
    Math.abs(firstOutgoing.x - releaseX),
    "The outgoing panel must continue from the finger instead of resetting or travelling twice",
  ).toBeLessThanOrEqual(24);

  for (const frame of transitionFrames) {
    const outgoing = frame.slides.find((slide) => slide.hidden || slide.inert);
    const incoming = frame.slides.find((slide) => !slide.hidden && !slide.inert);
    expect(outgoing, `Missing outgoing panel at ${frame.elapsedMs.toFixed(1)} ms`).toBeDefined();
    expect(incoming, `Missing incoming panel at ${frame.elapsedMs.toFixed(1)} ms`).toBeDefined();
    if (!outgoing || !incoming) continue;
    expect(
      Math.abs(incoming.x - (outgoing.x + outgoing.width)),
      `Panels must remain adjacent at ${frame.elapsedMs.toFixed(1)} ms`,
    ).toBeLessThanOrEqual(3);
    expect(outgoing.x, `Outgoing panel overshot its left boundary at ${frame.elapsedMs.toFixed(1)} ms`).toBeGreaterThanOrEqual(-outgoing.width - 1);
    expect(incoming.x, `Incoming panel overshot its resting point at ${frame.elapsedMs.toFixed(1)} ms`).toBeGreaterThanOrEqual(-1);
  }

  const settledFrame = frames.find((frame) => {
    if (frame.elapsedMs <= 0) return false;
    const incoming = frame.slides.find((slide) => !slide.hidden && !slide.inert);
    const outgoing = frame.slides.filter((slide) => slide.hidden || slide.inert);
    return Boolean(incoming)
      && Math.abs(incoming?.x ?? Number.POSITIVE_INFINITY) <= 1
      && outgoing.every((slide) => Math.abs(slide.x + slide.width) <= 1);
  });
  expect(settledFrame, "The gesture transition must reach its visual resting positions").toBeDefined();
  expect(settledFrame?.elapsedMs ?? Number.POSITIVE_INFINITY, "The released gesture must visually settle within 300 ms").toBeLessThanOrEqual(300);
});

test("mobile calendar tracks a warm swipe without long main-thread tasks under 4x CPU throttle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7", "The performance budget uses Chromium CDP and the Pixel 7 profile.");

  await page.goto("/movimientos?vista=calendario", { waitUntil: "domcontentloaded" });
  const surface = page.locator("[data-calendar-swipe-surface]");
  const dragLayer = page.locator("[data-calendar-drag-layer]");
  await expect(surface).toBeVisible({ timeout: 15_000 });
  await surface.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

  const client = await page.context().newCDPSession(page);
  const readGesture = () => surface.evaluate((element) => {
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
  const dispatchSwipe = async (gesture: NonNullable<Awaited<ReturnType<typeof readGesture>>>, stepDelayMs: number) => {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: gesture.fromX, y: gesture.y, radiusX: 4, radiusY: 4, force: 1 }],
    });
    for (let step = 1; step <= 10; step += 1) {
      const x = Math.round(gesture.fromX + ((gesture.toX - gesture.fromX) * step) / 10);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: gesture.y, radiusX: 4, radiusY: 4, force: 1 }],
      });
      if (stepDelayMs > 0) await page.waitForTimeout(stepDelayMs);
    }
  };

  let metrics: CalendarGesturePerformanceMetrics | null = null;
  try {
    // Warm React, Motion and the next calendar panel before collecting any timing data.
    const warmGesture = await readGesture();
    expect(warmGesture, "The warm-up swipe needs visible calendar controls").not.toBeNull();
    if (!warmGesture) return;
    const warmPeriod = await surface.getAttribute("data-calendar-period");
    await dispatchSwipe(warmGesture, 0);
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => surface.getAttribute("data-calendar-period")).not.toBe(warmPeriod);
    await expect.poll(() => dragLayer.count()).toBe(1);
    await expect.poll(() => dragLayer.first().evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      return transform === "none" ? 0 : Math.abs(new DOMMatrixReadOnly(transform).m41);
    })).toBeLessThanOrEqual(1);
    await page.waitForTimeout(450);

    const support = await page.evaluate(() => {
      const key = "__monevaCalendarGesturePerformance";
      const target = window as unknown as Record<string, unknown>;
      const supportsLongTasks = PerformanceObserver.supportedEntryTypes?.includes("longtask") ?? false;
      const probe = {
        observer: null,
        rafId: 0,
        active: false,
        startTime: 0,
        endTime: 0,
        lastFrame: null,
        frameGaps: [],
        entries: [],
      } as unknown as CalendarGesturePerformanceProbe;

      const collectEntries = (entries: PerformanceEntry[]) => {
        for (const entry of entries) probe.entries.push({ startTime: entry.startTime, duration: entry.duration });
      };
      if (supportsLongTasks) {
        probe.observer = new PerformanceObserver((list) => collectEntries(list.getEntries()));
        probe.observer.observe({ entryTypes: ["longtask"] });
      }

      const measureFrames = (timestamp: number) => {
        if (probe.active) {
          if (probe.lastFrame !== null) probe.frameGaps.push(timestamp - probe.lastFrame);
          probe.lastFrame = timestamp;
        }
        probe.rafId = requestAnimationFrame(measureFrames);
      };
      probe.rafId = requestAnimationFrame(measureFrames);
      probe.start = () => {
        probe.entries.length = 0;
        probe.frameGaps.length = 0;
        probe.startTime = performance.now();
        probe.endTime = 0;
        probe.lastFrame = null;
        probe.active = true;
      };
      probe.stop = () => {
        probe.endTime = performance.now();
        probe.active = false;
      };
      probe.snapshot = () => {
        if (probe.observer) collectEntries(probe.observer.takeRecords());
        const longTasks = probe.entries.filter((entry) => (
          entry.startTime < probe.endTime && entry.startTime + entry.duration > probe.startTime
        ));
        const sortedFrameGaps = [...probe.frameGaps].sort((a, b) => a - b);
        const p95Index = Math.max(0, Math.ceil(sortedFrameGaps.length * 0.95) - 1);
        return {
          supportsLongTasks,
          trackingDurationMs: probe.endTime - probe.startTime,
          frameCount: probe.frameGaps.length,
          frameGapsMs: probe.frameGaps,
          maxFrameGapMs: sortedFrameGaps.at(-1) ?? 0,
          p95FrameGapMs: sortedFrameGaps[p95Index] ?? 0,
          longTasks,
        };
      };
      probe.dispose = () => {
        probe.observer?.disconnect();
        cancelAnimationFrame(probe.rafId);
        delete target[key];
      };
      target[key] = probe;
      return { supportsLongTasks, supportsAnimationFrames: typeof requestAnimationFrame === "function" };
    });
    expect(
      support.supportsLongTasks || support.supportsAnimationFrames,
      "Neither the Long Tasks API nor the requestAnimationFrame fallback is available",
    ).toBe(true);

    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const measuredGesture = await readGesture();
    expect(measuredGesture, "The measured swipe needs visible calendar controls").not.toBeNull();
    if (!measuredGesture) return;
    const measuredPeriod = await surface.getAttribute("data-calendar-period");
    await page.evaluate(() => {
      const probe = (window as unknown as Record<string, unknown>)["__monevaCalendarGesturePerformance"] as CalendarGesturePerformanceProbe | undefined;
      if (!probe) throw new Error("Calendar gesture performance probe was not installed");
      probe.start();
    });

    await dispatchSwipe(measuredGesture, 16);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.evaluate(() => {
      const probe = (window as unknown as Record<string, unknown>)["__monevaCalendarGesturePerformance"] as CalendarGesturePerformanceProbe | undefined;
      if (!probe) throw new Error("Calendar gesture performance probe disappeared during tracking");
      probe.stop();
    });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => surface.getAttribute("data-calendar-period")).not.toBe(measuredPeriod);
    await page.waitForTimeout(80);
    metrics = await page.evaluate(() => {
      const probe = (window as unknown as Record<string, unknown>)["__monevaCalendarGesturePerformance"] as CalendarGesturePerformanceProbe | undefined;
      if (!probe) throw new Error("Calendar gesture performance probe disappeared before metrics were read");
      return probe.snapshot();
    });
  } finally {
    await client.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
    await page.evaluate(() => {
      const probe = (window as unknown as Record<string, unknown>)["__monevaCalendarGesturePerformance"] as CalendarGesturePerformanceProbe | undefined;
      probe?.dispose();
    }).catch(() => undefined);
    await client.detach().catch(() => undefined);
  }

  expect(metrics, "The gesture performance probe must return metrics").not.toBeNull();
  if (!metrics) return;
  await testInfo.attach("calendar-swipe-performance.json", {
    body: JSON.stringify({ project: testInfo.project.name, cpuThrottleRate: 4, ...metrics }, null, 2),
    contentType: "application/json",
  });
  expect(metrics.trackingDurationMs, "The sample must cover a sustained finger-tracking interval").toBeGreaterThan(120);
  expect(metrics.frameCount, "The rAF probe must observe enough frames to make the sample meaningful").toBeGreaterThanOrEqual(6);
  if (metrics.supportsLongTasks) {
    expect(metrics.longTasks, "Finger tracking must not produce a main-thread Long Task over 50 ms at 4x CPU throttle").toHaveLength(0);
  } else {
    expect(
      metrics.maxFrameGapMs,
      "Long Tasks API unavailable: the requestAnimationFrame fallback found a tracking gap over 50 ms",
    ).toBeLessThanOrEqual(50);
  }
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
