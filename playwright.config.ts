import { defineConfig } from "@playwright/test";

process.loadEnvFile?.(".env.local");

export default defineConfig({
  testDir: "e2e",
  timeout: 5 * 60_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: "e2e/artifacts/results",
});
