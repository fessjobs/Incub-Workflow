// Ermittlung der öffentlichen Basis-Adresse für die Mitarbeiter-Links.
//
// Die Links gehen per WhatsApp aufs Handy und müssen deshalb von außen
// erreichbar sein. Interne Adressen (railway.internal, localhost, private
// IP-Bereiche, Container-Namen) sind es nicht und werden verworfen – sonst
// landet beim Mitarbeiter ein Link, der sich nicht öffnen lässt.
//
// Reihenfolge:
//   1. APP_BASE_URL (ausdrücklich gesetzt, gilt auch für den Mailversand)
//   2. RAILWAY_PUBLIC_DOMAIN (setzt Railway automatisch, sobald eine Domain
//      erzeugt wurde – damit funktioniert es dort ohne Konfiguration)
//   3. Adresse aus dem laufenden Aufruf (x-forwarded-host/host)
// Ungültige Kandidaten werden übersprungen, nicht übernommen.

const INTERNAL_HOST = /(^|\.)railway\.internal$|(^|\.)internal$|^localhost$|^127\.|^0\.0\.0\.0$|^\[?::1\]?$|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./i;

export function isPublicHost(host: string): boolean {
  const bare = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!bare) return false;
  if (INTERNAL_HOST.test(bare)) return false;
  // Ein Host ohne Punkt ist ein Container-/Servicename, keine öffentliche Domain
  return bare.includes(".");
}

// Normalisiert einen Kandidaten zu "https://host" oder verwirft ihn (null).
export function normalizeBase(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/\/+$/, "");
  if (!raw) return null;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    return null;
  }
  if (!isPublicHost(url.host)) return null;
  // Pfad/Query verwerfen – wir brauchen nur das Adressstammstück
  return `${url.protocol}//${url.host}`;
}

export function envBase(): string | null {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  for (const candidate of [process.env.APP_BASE_URL, process.env.NEXT_PUBLIC_APP_URL, railway]) {
    const normalized = normalizeBase(candidate);
    if (normalized) return normalized;
  }
  return null;
}

// Nur für die Anzeige im Dispo-UI: Ist eine brauchbare Adresse konfiguriert?
export function hasConfiguredBase(): boolean {
  return envBase() !== null;
}

// Wurde etwas gesetzt, das unbrauchbar ist? (z. B. die interne Railway-Adresse)
export function misconfiguredBase(): string | null {
  const set = process.env.APP_BASE_URL?.trim();
  if (set && !normalizeBase(set)) return set;
  return null;
}
