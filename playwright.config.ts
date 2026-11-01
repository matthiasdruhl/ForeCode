import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/forecode",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command:
        "node --import ./tests/support/no-provider-network.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
      env: {
        META_CALLS_ENABLED: "true",
        META_MODEL_API_KEY: "synthetic-browser-key-never-real",
        META_API_BASE_URL: "https://api.meta.ai/v1",
        META_SPENDING_APPROVED: "true",
        META_APPROVED_PAYLOAD_SHA256: "",
        META_APPROVED_CALL_LIMIT: "1",
        META_MODEL: "muse-spark-1.3-contributor",
        FORECODE_RESEARCH_MODE: "local-single-operator",
        FORECODE_RESEARCH_PROCESSES: "1",
        FORECODE_ORIGIN: "http://127.0.0.1:3100",
      },
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command:
        "node --import ./tests/support/no-provider-network.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3102",
      env: {
        META_CALLS_ENABLED: "false",
        META_SPENDING_APPROVED: "false",
        META_MODEL_API_KEY: "synthetic-disabled-key",
        META_API_BASE_URL: "https://api.meta.ai/v1",
        META_MODEL: "muse-spark-1.3-contributor",
        FORECODE_RESEARCH_MODE: "local-single-operator",
        FORECODE_RESEARCH_PROCESSES: "1",
        FORECODE_ORIGIN: "http://127.0.0.1:3102",
      },
      url: "http://127.0.0.1:3102",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
