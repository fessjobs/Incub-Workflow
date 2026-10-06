// Versand der Mitarbeiter-Links: per E-Mail (SMTP über nodemailer, wenn
// SMTP_URL gesetzt ist) und als fertig formatierter WhatsApp-Text zum
// Kopieren. Ohne SMTP-Konfiguration wird nichts gesendet, der Text steht
// trotzdem in der Dispo-Ansicht bereit.
import nodemailer from "nodemailer";
import { envBase, normalizeBase } from "./base-url";
import { addDaysToKey, berlinDateKey, berlinTime, formatKeyDE, weekdayLangDE, weekdayOfKey } from "./tz";

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
  // Gesetzt, wenn der Link nur für diese eine Schicht gilt – dann steht das
  // auch in der Nachricht, damit in der Gruppe keine Verwirrung entsteht.
  nurSchicht?: boolean;
};

export function gruppenText(i: GruppenNachrichtInput, base?: string | null): string {
  const von = formatKeyDE(berlinDateKey(i.datumVon));
  const bis = formatKeyDE(berlinDateKey(i.datumBis));
  const zeilen = [
    `*${i.kunde} – ${i.projekt}${i.nurSchicht && i.schichten[0] ? ` · ${i.schichten[0].bezeichnung}` : ""}*`,
    `📅 ${von}${von === bis ? "" : ` – ${bis}`}`,
    `📍 ${i.einsatzort}`,
  ];
  for (const s of i.schichten) {
    const tag = formatKeyDE(berlinDateKey(s.planStart));
    zeilen.push(`🛠 ${s.bezeichnung}: ${von === bis ? "" : `${tag}, `}${berlinTime(s.planStart)}–${berlinTime(s.planEnde)} Uhr${s.treffpunkt ? ` (Treffpunkt: ${s.treffpunkt})` : ""}`);
  }
  zeilen.push(
    ``,
    i.nurSchicht
      ? `Nach der Schicht bitte hier Zeiten bestätigen und unterschreiben – der Link gilt nur für diese Schicht, einfach den eigenen Namen antippen (kein Login nötig):`
      : `Nach der Schicht bitte hier Zeiten bestätigen und unterschreiben – einfach den eigenen Namen antippen (kein Login nötig):`,
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

// ─── Aushang für die WhatsApp-Gruppe ────────────────────────────────────────
//
// Keine Nachricht an die eingeteilte Crew, sondern der Aufruf *davor*: Wer hat
// Zeit? Deshalb steht hier kein Link und kein Name, sondern nur, was man zum
// Zusagen wissen muss – und ein klarer Handlungsaufruf.

export type AushangInput = {
  projekt: string;
  artist: string | null;
  einsatzort: string;
  // Schichten in zeitlicher Reihenfolge; „offen" ist die noch gesuchte Anzahl
  schichten: Array<{ bezeichnung: string; taetigkeit: string; planStart: Date; planEnde: Date; treffpunkt: string | null; offen: number }>;
  // Bezugstag für „heute"/„morgen" (Testbarkeit); Standard: jetzt
  heute?: string;
};

// „Lanxess Arena, Köln" → Halle und Stadt getrennt; ohne Komma ist das letzte
// Wort die beste Vermutung für die Stadt („Porsche Arena Stuttgart").
export function ortTeile(einsatzort: string): { halle: string; stadt: string } {
  const teile = einsatzort.split(",").map((t) => t.trim()).filter(Boolean);
  if (teile.length > 1) return { halle: teile.slice(0, -1).join(", "), stadt: teile[teile.length - 1] };
  const woerter = einsatzort.trim().split(/\s+/);
  return { halle: einsatzort.trim(), stadt: woerter.length > 1 ? woerter[woerter.length - 1] : "" };
}

export function aushangText(i: AushangInput): string {
  const heute = i.heute ?? berlinDateKey(new Date());
  const morgen = addDaysToKey(heute, 1);
  const erste = i.schichten[0];
  const tag = erste ? berlinDateKey(erste.planStart) : heute;
  const istHeute = tag === heute;
  const istMorgen = tag === morgen;
  const wochentag = weekdayLangDE(weekdayOfKey(tag));
  const tagKurz = formatKeyDE(tag).slice(0, 6); // 06.10.
  const { halle, stadt } = ortTeile(i.einsatzort);
  const name = i.artist?.trim() || i.projekt;

  // Abends ist „heute Abend" die natürliche Ansprache
  const abends = erste ? Number(berlinTime(erste.planStart).slice(0, 2)) >= 16 : false;
  const wann = istHeute ? (abends ? "heute Abend" : "heute") : istMorgen ? "morgen" : `am ${tagKurz}`;

  const zeilen: string[] = [];
  zeilen.push(istHeute ? "🚨 KURZFRISTIGER EINSATZ HEUTE 🚨" : istMorgen ? "🚨 KURZFRISTIGER EINSATZ MORGEN 🚨" : `🚨 EINSATZ AM ${tagKurz} 🚨`);
  zeilen.push("");
  zeilen.push(`🎤 ${name}${stadt && stadt !== halle ? ` in ${stadt}` : ""}`);
  zeilen.push(`📅 ${istHeute ? "Heute, " : istMorgen ? "Morgen, " : ""}${wochentag} ${tagKurz}`);
  for (const s of i.schichten) {
    const mehrere = i.schichten.length > 1;
    zeilen.push(`⏰ Call${mehrere ? ` ${s.bezeichnung}` : ""}: ${berlinTime(s.planStart)} Uhr`);
  }
  zeilen.push(`📍 ${halle}`);
  const treffpunkte = [...new Set(i.schichten.map((s) => s.treffpunkt).filter((t): t is string => Boolean(t)))];
  if (treffpunkte.length > 0) zeilen.push(`🚪 Treffpunkt: ${treffpunkte.join(" / ")}`);

  // Gesucht wird, was noch frei ist – je Tätigkeit zusammengefasst
  const gesucht = new Map<string, number>();
  for (const s of i.schichten) {
    if (s.offen <= 0) continue;
    const art = s.taetigkeit?.trim() || s.bezeichnung;
    gesucht.set(art, (gesucht.get(art) ?? 0) + s.offen);
  }
  if (gesucht.size > 0) {
    zeilen.push(`👥 Gesucht: ${[...gesucht.entries()].map(([art, n]) => `${n}x ${art}`).join(", ")}`);
  }

  zeilen.push("");
  zeilen.push(`Wer ${wann} kann, bitte auf die Nachricht mit „👍🏻“ reagieren`);
  zeilen.push("und der Gruppe beitreten.");
  zeilen.push("");
  zeilen.push("Weitere Infos folgen");
  zeilen.push("");
  zeilen.push("Danke euch 💪");
  return zeilen.join("\n");
}
