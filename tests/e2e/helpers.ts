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

// Nach dem Absenden verschwindet der „Unterschreiben"-Knopf sofort – auch
// dann, wenn die Einreichung mangels Netz nur zwischengespeichert wurde
// („wartet auf Netz"). Wer prüfen will, dass der Server sie angenommen hat,
// muss auf den Zähler schauen: der stammt aus der Antwort des Servers.
export async function unterschriftAngekommen(page: Page, unterschrieben: number, gesamt: number): Promise<void> {
  await expect(page.getByText(`${unterschrieben} von ${gesamt} unterschrieben`)).toBeVisible();
}
