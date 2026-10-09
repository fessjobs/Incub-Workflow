// Ampeln der Crew-Übersicht (Modul F). Alle Schwellen sind Parameter, die
// Werte kommen im echten Betrieb aus der Tabelle `settings`.
import { tagNummer } from "./zeit";

export type Ampel = "gruen" | "gelb" | "rot" | "grau";

// Auslastung: grün unter 80 %, gelb 80 bis 100 %, rot darüber
export function ampelAuslastung(ist: number, grenze: number | null): Ampel {
  if (grenze === null || grenze <= 0) return "grau";
  const quote = ist / grenze;
  if (quote > 1) return "rot";
  if (quote >= 0.8) return "gelb";
  return "gruen";
}

// Vertrag: abgelaufen rot, Ablauf in 30 Tagen gelb, unbefristet grün
export function ampelVertrag(gueltigBis: string | null, heute: string): Ampel {
  if (gueltigBis === null) return "gruen";
  if (gueltigBis < heute) return "rot";
  return tagNummer(gueltigBis) - tagNummer(heute) <= 30 ? "gelb" : "gruen";
}

// Kurzfristig Beschäftigte: Arbeitstage im Kalenderjahr gegen die 70-Tage-Grenze
export const TAGE_GRENZE_KURZFRISTIG = 70;

export function ampel70Tage(tage: number, grenze = TAGE_GRENZE_KURZFRISTIG): Ampel {
  return ampelAuslastung(tage, grenze);
}

// Minijob: Verdienst im Monat gegen die Grenze aus den Einstellungen
export function ampelMinijob(verdienst: number, grenze: number): Ampel {
  return ampelAuslastung(verdienst, grenze);
}

export function schlechtereAmpel(a: Ampel, b: Ampel): Ampel {
  const rang: Record<Ampel, number> = { grau: 0, gruen: 1, gelb: 2, rot: 3 };
  return rang[a] >= rang[b] ? a : b;
}

export function ampelText(a: Ampel): string {
  return { gruen: "in Ordnung", gelb: "knapp", rot: "überschritten", grau: "keine Grenze" }[a];
}
