import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a chain seeded by the local scenario (see e2e/README.md).
 * Set E2E_BASE_URL to reuse an already running dev server.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
/** e.g. E2E_CHANNEL=chrome to use the installed Google Chrome instead of downloading Playwright browsers */
const channel = process.env.E2E_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm build && pnpm start", url: baseURL, reuseExistingServer: true, timeout: 300_000 },
});
