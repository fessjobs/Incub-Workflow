// Versand der Mitarbeiter-Links: per E-Mail (SMTP über nodemailer, wenn
// SMTP_URL gesetzt ist) und als fertig formatierter WhatsApp-Text zum
// Kopieren. Ohne SMTP-Konfiguration wird nichts gesendet, der Text steht
// trotzdem in der Dispo-Ansicht bereit.
import nodemailer from "nodemailer";
import { berlinDateKey, berlinTime, formatKeyDE } from "./tz";

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL);
}

export function appBaseUrl(): string {
  const raw = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  return raw.replace(/\/+$/, "");
}

export function employeeLinkUrl(token: string): string {
  return `${appBaseUrl()}/e/${token}`;
}

export function crewLinkUrl(token: string): string {
  return `${appBaseUrl()}/e/crew/${token}`;
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

export function whatsappText(i: LinkMessageInput): string {
  const datum = formatKeyDE(berlinDateKey(i.planStart));
  const zeit = `${berlinTime(i.planStart)}–${berlinTime(i.planEnde)} Uhr`;
  if (i.erinnerung) {
    return [
      `Hallo ${i.vorname},`,
      `dein Stundennachweis für *${i.projekt}* (${i.bezeichnung}, ${datum}) fehlt noch.`,
      `Bitte Zeiten prüfen, Unterweisung bestätigen und unterschreiben:`,
      employeeLinkUrl(i.token),
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
    employeeLinkUrl(i.token),
    ``,
    `Der Link ist 30 Tage gültig. Bei Fragen melde dich bei der Dispo.`,
    `Dein fess.jobs Team`,
  ].join("\n");
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
