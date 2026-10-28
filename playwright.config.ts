import { defineConfig, devices } from "@playwright/test";

const CHROMIUM_ARGS = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--force-color-profile=srgb",
  "--disable-lcd-text",
  "--font-render-hinting=none",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--enable-precise-memory-info",
  "--js-flags=--expose-gc"
];

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: {
    timeout: 9_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.32,
      animations: "disabled",
      caret: "hide"
    }
  },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}-{platform}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "dark",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 12_000
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        launchOptions: { args: CHROMIUM_ARGS }
      }
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1280, height: 800 }
      }
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 800 }
      }
    },
    {
      name: "iphone-13",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
        browserName: "chromium",
        launchOptions: { args: CHROMIUM_ARGS }
      }
    },
    {
      name: "pixel-7",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 412, height: 915 },
        browserName: "chromium",
        launchOptions: { args: CHROMIUM_ARGS }
      }
    }
  ]
});
