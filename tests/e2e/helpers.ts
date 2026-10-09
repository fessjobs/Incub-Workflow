// Gemeinsame Handgriffe der E2E-Tests.
import { expect, type Locator, type Page } from "@playwright/test";

// Beim ersten Öffnen eines Mitarbeiter-Links steht die Kurzanleitung davor.
// In den Tests, die etwas anderes prüfen, wird sie weggeklickt – genau so,
// wie es eine Person auf dem Handy auch tut.
export async function tutorialWeg(page: Page): Promise<void> {
  // Die Anleitung erscheint erst, wenn das Client-JavaScript geladen hat –
  // direkt nach dem Öffnen ist sie noch nicht da. Deshalb kurz darauf warten,
  // sonst klickt der Test gegen das gerade aufgehende Fenster.
  const schliessen = page.getByTestId("tutorial-schliessen");
  if (await schliessen.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false)) {
    await schliessen.click();
  }
  await expect(page.getByTestId("tutorial")).toHaveCount(0);
}

// Nach dem Absenden verschwindet der „Unterschreiben"-Knopf sofort – auch
// dann, wenn die Einreichung mangels Netz nur zwischengespeichert wurde
// („wartet auf Netz"). Wer prüfen will, dass der Server sie angenommen hat,
// muss auf den Zähler schauen: der stammt aus der Antwort des Servers.
export async function unterschriftAngekommen(page: Page, unterschrieben: number, gesamt: number): Promise<void> {
  await expect(page.getByText(`${unterschrieben} von ${gesamt} unterschrieben`)).toBeVisible();
}

// Nach der eigenen Unterschrift bleibt der Knopf im Gruppenlink stehen und
// heißt „Zeiten ändern" – geändert werden darf, bis der Kunde zeichnet. Wer
// der Reihe nach unterschreiben lässt, greift deshalb gezielt die Person ab,
// die noch nicht unterschrieben hat.
export function naechsteUnterschrift(page: Page): Locator {
  return page.locator('[data-testid^="crew-sign-"]', { hasText: "Unterschreiben" }).first();
}
