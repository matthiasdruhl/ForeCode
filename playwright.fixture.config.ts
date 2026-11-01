import { fixtureOrigin } from "./tests/support/browser-origins";
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/fixture-e2e",
  outputDir: "test-results/booking-fixture",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: fixtureOrigin, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    env: { BOOKING_DEMO_ORIGIN: fixtureOrigin },
    command: `npm run start --workspace @forecode/booking-v1 -- --port ${new URL(fixtureOrigin).port}`,
    url: fixtureOrigin,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
