# Sprint 8: Disposition (Entwurf)

Status: **Entwurf, nicht freigegeben** · Bereich G · Flag `FEATURE_DISPO` · Tabellen: nutzt `v2.applications`; ggf. `v2.settings` (Passungs-Gewichte)

## Ziel
Bewerber und Schichten an einem Bildschirm zusammenbringen – mit Passung, Konflikt-Hinweisen und Briefing.

## Voraussetzungen
Sprint 5 und 7 · Format des Imports „Planung Regios“ geklärt (Spalten, Rhythmus, Schlüssel) · Passungs-Gewichte bestätigt · Versandweg (Superchat oder Kopieren).

## User Stories
1. Als **Dispo** möchte ich Aufträge aus „Planung Regios“ übernehmen und zusätzlich manuell anlegen.
2. Als **Dispo** möchte ich Bewerber nach Passung sortiert sehen, mit Gründen als Chips, und per Drag & Drop einplanen.
3. Als **Dispo** möchte ich bei Konflikten gewarnt werden und nur mit Begründung trotzdem einplanen.
4. Als **Dispo** möchte ich „Schicht automatisch füllen“ und die Vorschläge prüfen.
5. Als **Dispo** möchte ich Briefing, Beleg-Link und WhatsApp-Text zum Kopieren und eine Stundenzettel-Vorlage.
6. Als **Dispo** möchte ich einen Wochenplan mit Füllgrad.

## Akzeptanzkriterien
- [ ] Passung 0–100 aus Kategorie, Erfahrung, Fahrzeit, Unterweisung, Vertragsgrenze, XP (Gewichte in `settings`); Gründe sichtbar.
- [ ] Konflikte: doppelt gebucht, Ruhezeit unter 11 h, Vertrag läuft ab/fehlt, Unterweisung fehlt, Monatsgrenze, Überbesetzung; Begründung Pflicht und im Protokoll.
- [ ] Bestätigen erzeugt die Einteilung im **bestehenden** `shift_assignments`; keine zweite Besetzung.
- [ ] „Automatisch füllen“ schlägt nur Personen ohne Konflikt vor, Dispo bestätigt; nie ohne Prüfung.
- [ ] Fahrgemeinschafts-Vorschläge nach Wohnort und Auto.
- [ ] Briefing-Text mit Ablauf, Treffpunkt, Ansprechpartner, Dresscode, Beleg-Link; Stundenzettel-Vorlage mit allen Eingeplanten.
- [ ] Bestehende Einsatzseiten (`/einsaetze/…`) laufen unverändert; Dispo sieht weiterhin keine Beträge.

## Testfälle
Unit (übernehmbar): Passung, Konflikte, Auto-Füllen, Aushang-Text, Fahrgemeinschaften. E2E: Ziehen, Konflikt mit Begründung,
automatisch füllen, Briefing, Wochenplan.

## Aus dem Prototyp übernehmen
`logic/passung.ts`, `pages/dispo-aktionen.ts`, `pages/admin-dispo.tsx`, `pages/admin-briefing.tsx`.

## Risiken und offene Fragen
Import aus Google-Tabelle (Rechte, Doppelte, Änderungen nach dem Import). Welche Konflikte dürfen **nie** übergangen werden?
Fairness der Passung (Bevorzugung Kategorie A) – bewusst entscheiden. Superchat-API später.
