import { existsSync } from "fs";
import { defineConfig, devices } from "@playwright/test";

// E2E des Einsatzmoduls: Token-Link → Unterschrift → PDF → Export.
// Erwartet eine erreichbare Datenbank (DATABASE_URL) mit Seed. Der Server
// wird aus dem Production-Build gestartet (npm run build vorher).
const port = Number(process.env.E2E_PORT ?? 3100);
// Vorinstalliertes Chromium nutzen (z. B. Claude-Code-Web), sonst Playwright-Download
const chromium = process.env.PW_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    ...(chromium ? { launchOptions: { executablePath: chromium } } : {}),
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `PORT=${port} HOSTNAME=127.0.0.1 node .next/standalone/server.js`,
        url: `http://127.0.0.1:${port}/api/health`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: { ...process.env, PORT: String(port), JOBS_WORKER: "off", APP_BASE_URL: `http://127.0.0.1:${port}` },
      },
});
