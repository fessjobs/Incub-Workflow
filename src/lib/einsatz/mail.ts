// Versand der Mitarbeiter-Links: per E-Mail (SMTP über nodemailer, wenn
// SMTP_URL gesetzt ist) und als fertig formatierter WhatsApp-Text zum
// Kopieren. Ohne SMTP-Konfiguration wird nichts gesendet, der Text steht
// trotzdem in der Dispo-Ansicht bereit.
import nodemailer from "nodemailer";
import { envBase, normalizeBase } from "./base-url";
import { berlinDateKey, berlinTime, formatKeyDE } from "./tz";

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL);
}

// Basis-URL der App. Auflösung und Prüfung auf öffentliche Erreichbarkeit
// liegen in base-url.ts (interne Adressen wie railway.internal taugen nicht
// für Links, die aufs Handy gehen).
export function appBaseUrl(fallback?: string | null): string {
  return envBase() ?? normalizeBase(fallback) ?? "";
}

export function employeeLinkUrl(token: string, base?: string | null): string {
  return `${appBaseUrl(base)}/e/${token}`;
}

export function crewLinkUrl(token: string, base?: string | null): string {
  return `${appBaseUrl(base)}/e/crew/${token}`;
}

// Öffentliche Adresse aus den Proxy-Headern des laufenden Aufrufs (Railway
// setzt x-forwarded-proto und x-forwarded-host). Nur in Server Components und
// Route Handlern verfügbar, deshalb als Fallback an appBaseUrl übergeben.
// Interne Hosts werden von normalizeBase verworfen.
export async function baseUrlFromRequest(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const proto = h.get("x-forwarded-proto") ?? "https";
    return normalizeBase(`${proto}://${host}`);
  } catch {
    return null;
  }
}

export type LinkMessageInput = {
  vorname: string;
  projekt: string;
  kunde: string;
  einsatzort: string;
  bezeichnung: string;
  planStart: Date;
  planEnde: Date;
  treffpunkt: string | null;
  token: string;
  erinnerung?: boolean;
};

export function whatsappText(i: LinkMessageInput, base?: string | null): string {
  const datum = formatKeyDE(berlinDateKey(i.planStart));
  const zeit = `${berlinTime(i.planStart)}–${berlinTime(i.planEnde)} Uhr`;
  if (i.erinnerung) {
    return [
      `Hallo ${i.vorname},`,
      `dein Stundennachweis für *${i.projekt}* (${i.bezeichnung}, ${datum}) fehlt noch.`,
      `Bitte Zeiten prüfen, Unterweisung bestätigen und unterschreiben:`,
      employeeLinkUrl(i.token, base),
      ``,
      `Danke – dein fess.jobs Team`,
    ].join("\n");
  }
  return [
    `Hallo ${i.vorname},`,
    `hier dein Einsatz bei *${i.kunde}* – ${i.projekt}:`,
    `📅 ${datum}, ${zeit}`,
    `📍 ${i.einsatzort}${i.treffpunkt ? ` (Treffpunkt: ${i.treffpunkt})` : ""}`,
    `🛠 ${i.bezeichnung}`,
    ``,
    `Nach der Schicht bitte hier deine Zeiten bestätigen und unterschreiben (kein Login nötig):`,
    employeeLinkUrl(i.token, base),
    ``,
    `Der Link ist 30 Tage gültig. Bei Fragen melde dich bei der Dispo.`,
    `Dein fess.jobs Team`,
  ].join("\n");
}

// Ein Link für alle: die Nachricht geht in die WhatsApp-Gruppe, jede Person
// öffnet ihn auf dem eigenen Handy und wählt sich in der Liste aus. Deshalb
// steht hier keine persönliche Anrede und kein einzelner Name.
export type GruppenNachrichtInput = {
  projekt: string;
  kunde: string;
  einsatzort: string;
  datumVon: Date;
  datumBis: Date;
  schichten: Array<{ bezeichnung: string; planStart: Date; planEnde: Date; treffpunkt: string | null }>;
  crewToken: string;
};

export function gruppenText(i: GruppenNachrichtInput, base?: string | null): string {
  const von = formatKeyDE(berlinDateKey(i.datumVon));
  const bis = formatKeyDE(berlinDateKey(i.datumBis));
  const zeilen = [
    `*${i.kunde} – ${i.projekt}*`,
    `📅 ${von}${von === bis ? "" : ` – ${bis}`}`,
    `📍 ${i.einsatzort}`,
  ];
  for (const s of i.schichten) {
    const tag = formatKeyDE(berlinDateKey(s.planStart));
    zeilen.push(`🛠 ${s.bezeichnung}: ${von === bis ? "" : `${tag}, `}${berlinTime(s.planStart)}–${berlinTime(s.planEnde)} Uhr${s.treffpunkt ? ` (Treffpunkt: ${s.treffpunkt})` : ""}`);
  }
  zeilen.push(
    ``,
    `Nach der Schicht bitte hier Zeiten bestätigen und unterschreiben – einfach den eigenen Namen antippen (kein Login nötig):`,
    crewLinkUrl(i.crewToken, base),
    ``,
    `Name falsch oder jemand fehlt? Lässt sich im Link direkt korrigieren.`,
    `Dein fess.jobs Team`
  );
  return zeilen.join("\n");
}

// wa.me öffnet WhatsApp mit vorbereitetem Text; die Gruppe wählt der Absender
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function mailSubject(i: LinkMessageInput): string {
  const datum = formatKeyDE(berlinDateKey(i.planStart));
  return i.erinnerung ? `Erinnerung: Stundennachweis ${i.projekt} (${datum})` : `Dein Einsatz: ${i.projekt} am ${datum}`;
}

export async function sendMail(to: string, subject: string, text: string): Promise<{ sent: boolean; error: string | null }> {
  if (!isMailConfigured()) return { sent: false, error: "SMTP_URL nicht gesetzt" };
  try {
    const transport = nodemailer.createTransport(process.env.SMTP_URL);
    await transport.sendMail({
      from: process.env.MAIL_FROM ?? "fess.jobs Dispo <dispo@fess.jobs>",
      to,
      subject,
      text,
    });
    return { sent: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "Unbekannter Fehler";
    console.error("Mailversand fehlgeschlagen:", message);
    return { sent: false, error: message };
  }
}
