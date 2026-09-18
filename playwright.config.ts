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
    // Durchgehend localhost: Session-Cookies sind hostgebunden, ein Mix aus
    // 127.0.0.1 und localhost würde den Login zwischen Seitenaufrufen verlieren.
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    ...(chromium ? { launchOptions: { executablePath: chromium } } : {}),
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Der Standalone-Build enthält weder .next/static noch public – das
        // Dockerfile kopiert beides hinein, hier muss es genauso passieren,
        // sonst läuft die Oberfläche ohne Client-JavaScript.
        command:
          `rm -rf .next/standalone/.next/static .next/standalone/public && ` +
          `cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && ` +
          `PORT=${port} HOSTNAME=0.0.0.0 node .next/standalone/server.js`,
        url: `http://localhost:${port}/api/health`,
        reuseExistingServer: true,
        timeout: 120_000,
        // Bewusst OHNE APP_BASE_URL, dafür mit der Variable, die Railway selbst
        // setzt: der Test prüft, dass die Links auch ohne eigene Konfiguration
        // vollständig und öffentlich erreichbar sind (127.0.0.1 gilt als intern).
        env: { ...process.env, PORT: String(port), JOBS_WORKER: "off", APP_BASE_URL: "", RAILWAY_PUBLIC_DOMAIN: "incub-workflow-production.up.railway.app" },
      },
});
