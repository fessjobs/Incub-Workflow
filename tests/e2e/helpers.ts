// Gemeinsame Handgriffe der E2E-Tests.
import { expect, type Page } from "@playwright/test";

// Beim ersten Öffnen eines Mitarbeiter-Links steht die Kurzanleitung davor.
// In den Tests, die etwas anderes prüfen, wird sie weggeklickt – genau so,
// wie es eine Person auf dem Handy auch tut.
export async function tutorialWeg(page: Page): Promise<void> {
  const schliessen = page.getByTestId("tutorial-schliessen");
  if (await schliessen.isVisible().catch(() => false)) {
    await schliessen.click();
    await expect(page.getByTestId("tutorial")).toHaveCount(0);
  }
}
