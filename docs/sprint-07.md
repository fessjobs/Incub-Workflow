# Sprint 7: Job-Board und Unterweisung (Entwurf)

Status: **Entwurf, nicht freigegeben** · Bereich C · Flag `FEATURE_JOBBOARD`, `FEATURE_UNTERWEISUNG` · Tabellen: `v2.job_postings`, `v2.applications`, `v2.application_shifts`, `v2.trainings`, `v2.training_acks`

## Ziel
Registrierte Crew sieht Jobs, bewirbt sich in einer Minute und macht die Pflicht-Unterweisung am Handy.

## Voraussetzungen
Sprint 6 · **Unterweisungstexte von einer Fachkraft für Arbeitssicherheit freigegeben** (Entscheidung 9) – ohne Freigabe bleibt das Flag aus · Pflichtmodul-Zuordnung bestätigt.

## User Stories
1. Als **Crew** möchte ich Jobs mit Datum, Ort, Fahrzeit und Tätigkeit sehen und mich auf Schichten bewerben.
2. Als **Crew** möchte ich angeben, wie ich anreise und ob ich schon einen Vertrag bei FESS habe.
3. Als **Crew** möchte ich Unterweisungen in Karten lesen, ein Quiz machen und einen Nachweis bekommen.
4. Als **Dispo** möchte ich, dass sich nur bewirbt, wer gültig unterwiesen ist.
5. Als **Admin** möchte ich Texte versionieren und eine neue Version „zum Neubestätigen“ ausrollen.

## Akzeptanzkriterien
- [ ] Job-Board nur nach Anmeldung (Entscheidung 6); Treffpunkt und Ansprechpartner erst nach Bestätigung.
- [ ] Bewerbung in vier Schritten: Schichten, Anreise/Vertrag, Unterweisung (Gate), Absenden; Bewerbung nur einmal je Job.
- [ ] 8 Module DE/EN; Quiz ab 80 %; bei falscher Antwort erscheint die passende Karte erneut; Wiederholung möglich.
- [ ] Gültigkeit 12 Monate, Erinnerung 14 Tage vorher; Nachweis-PDF mit Version, Datum, Quiz-Ergebnis und Hinweis „ersetzt nicht die Unterweisung vor Ort / beim Stapler Fahrausweis und schriftliche Beauftragung“.
- [ ] Nachweis wird als unveränderliches Dokument abgelegt (SHA-256) und taucht im Archiv auf.
- [ ] Texte mit Status ENTWURF/FREIGEGEBEN; nur freigegebene werden der Crew gezeigt.
- [ ] Die bestehende Unterweisung im Einsatzmodul (`/e/…`, PDF) bleibt unverändert.

## Testfälle
Unit (übernehmbar): Gültigkeit, Pflichtmodule, Quiz-Schwelle, Mischen. E2E: kompletter Weg bis Status „eingegangen“;
Gate sperrt ohne Unterweisung; Quiz fehlschlagen → Wiederholung; EN-Umschaltung.

## Aus dem Prototyp übernehmen
`logic/unterweisung.ts`, `data/trainings.ts` (Inhalte als Entwurf), `pages/crew-jobs.tsx`, `pages/crew-unterweisung.tsx`, `pages/admin-unterweisungen.tsx`.

## Risiken und offene Fragen
**Haftung:** Inhalte nie ohne Freigabe produktiv. Stapler/Höhe brauchen Nachweise außerhalb dieser App.
Ausschreibung aus Planung Regios vs. manuell – wer veröffentlicht? Barrierefreiheit der Quiz-Oberfläche.
