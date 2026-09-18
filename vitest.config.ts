import { defineConfig } from "vitest/config";
import path from "path";

// Unit- und Integrationstests des Einsatzmoduls (E2E läuft über Playwright,
// siehe playwright.config.ts).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
  },
});
