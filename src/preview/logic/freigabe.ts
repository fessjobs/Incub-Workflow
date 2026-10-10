// Freigabe: Erst wenn das Team bestätigt hat, sieht eine Person die Aufträge und
// kann sich bewerben. Die Bestätigung kommt nach dem Fragebogen und den Grund-Schulungen.
import type { Crew } from "./types";
import { fehlendeModule, type SchulungRegeln } from "./unterweisung";

export type FreigabeAnzeige = "freigegeben" | "offen" | "wartet" | "abgelehnt";

// Aus dem Datensatz abgeleitet (nur die Entscheidung des Teams wird gespeichert):
// - abgelehnt:   auch bei gesperrten und ausgeschiedenen Personen
// - freigegeben: ein Mitglied des Teams hat bestätigt
// - abgelehnt:   ein Mitglied des Teams hat bewusst nicht freigegeben
// - wartet:      Fragebogen abgeschickt und alle Voraussetzungs-Schulungen gültig, Team muss prüfen
// - offen:       die Person ist noch nicht so weit
export function freigabeStand(c: Pick<Crew, "freigabe" | "profile" | "unterweisungen"> & { status?: Crew["status"] }, regeln: SchulungRegeln, heute: string): FreigabeAnzeige {
  // Gesperrte und ausgeschiedene Personen sehen keine Aufträge, auch wenn sie früher freigegeben waren
  if (c.status === "gesperrt" || c.status === "ausgeschieden") return "abgelehnt";
  if (c.freigabe?.status === "bestaetigt") return "freigegeben";
  if (c.freigabe?.status === "abgelehnt") return "abgelehnt";
  if (c.profile === null) return "offen";
  return fehlendeModule(regeln.freigabeModule, c.unterweisungen, heute).length === 0 ? "wartet" : "offen";
}

export function freigabeText(st: FreigabeAnzeige): string {
  return { freigegeben: "freigegeben", offen: "noch nicht fertig", wartet: "wartet auf Bestätigung", abgelehnt: "nicht freigegeben" }[st];
}
