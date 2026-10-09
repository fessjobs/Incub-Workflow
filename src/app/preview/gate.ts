// Zugang zur Testversion: nur mit PREVIEW_ENABLED=1 und gesetztem
// PREVIEW_PASSWORD. Fehlt eines davon, gibt es die Adresse nicht (404) bzw.
// keinen Zugang – im Zweifel zu.
import { createHash } from "crypto";

export const PREVIEW_COOKIE = "pv_access";

export function previewAktiv(): boolean {
  return process.env.PREVIEW_ENABLED === "1";
}

// Der Cookie-Wert hängt am Passwort und am Geheimnis der App: ändert sich eines,
// verfallen alle freigeschalteten Browser.
export function zugangsToken(): string | null {
  const pw = process.env.PREVIEW_PASSWORD;
  if (!pw) return null;
  return createHash("sha256").update(`${pw}:${process.env.AUTH_SECRET ?? ""}`).digest("hex");
}
