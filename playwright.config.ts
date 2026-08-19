import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? "http://127.0.0.1:3210";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "line",
  outputDir: ".codex-temp/playwright/results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm dev --hostname 127.0.0.1 --port 3210",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        },
      },
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "desktop-wide",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 2193, height: 1193 },
      },
    },
    {
      name: "desktop-2k",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 2560, height: 1440 },
      },
    },
    {
      name: "phone-320",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 320, height: 720 },
        deviceScaleFactor: 2,
      },
    },
    {
      name: "iphone-15-pro",
      use: { ...devices["iPhone 15 Pro"] },
    },
    {
      name: "pixel-7",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "ipad-mini",
      use: { ...devices["iPad Mini"] },
    },
  ],
});
