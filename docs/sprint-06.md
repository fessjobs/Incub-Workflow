# Sprint 6: Profil und Fragebogen (Entwurf)

Status: **Entwurf, nicht freigegeben** · Bereich D (und Crew-Zugang) · Flag `FEATURE_FRAGEBOGEN` · Tabellen: `v2.crew_profiles`, `v2.profile_answers`, `v2.crew_login_codes`, `v2.crew_sessions`

## Ziel
Neue Leute füllen am Handy einen Fragebogen aus; das Team sieht Score, Kategorie, Wohnort und nächsten Pool.

## Voraussetzungen
Sprint 5 (Profil/Verträge) · Entscheidung Crew-Konten vs. Token-Links · Superchat-Zugang für WhatsApp-Code (bis dahin Code zum Kopieren) · Geocoding-Dienst gewählt (Kosten, DSGVO) · Fragen und Situationsfragen von Maik durchgesehen.

## User Stories
1. Als **Bewerber** möchte ich per WhatsApp-Code anmelden, ohne Passwort.
2. Als **Bewerber** möchte ich den Fragebogen unterbrechen und später weitermachen, auf Deutsch oder Englisch.
3. Als **Dispo** möchte ich Score je Block, Kategorie A/B/C und Fahrzeit zu den Pools sehen.
4. Als **Admin** möchte ich Gewichte und Schwellen selbst einstellen und sofort die Verteilung sehen.
5. Als **Bewerber** möchte ich meine Daten herunterladen und löschen lassen.

## Akzeptanzkriterien
- [ ] 33 Fragen in 6 Etappen + 4 Situationsfragen; jede Antwort wird sofort gespeichert; PWA mit Gerätespeicher.
- [ ] **AGG:** keine Fragen zu Alter (nur „volljährig“), Herkunft, Religion, Gesundheit, Schwangerschaft – automatischer Test auf Wortliste bleibt Pflicht.
- [ ] Score: Erfahrung 40 / Mobilität 20 / Qualifikation 20 / Situation 20; geprüfte Nachweise voll, angegebene halb; A ab 70, B ab 45 (aus `settings`).
- [ ] Crew sieht **nie** Kategorie oder Score, nur Level und XP.
- [ ] PLZ wird einmal geocodiert; Fahrzeit zu Stuttgart, Mannheim, Frankfurt, Idar-Oberstein, NRW gespeichert; nächster Pool zugeordnet.
- [ ] Einwilligung (Version, Zeitpunkt) wird gespeichert; Löschung und Auskunft funktionieren; Löschhinweis nach 6 Monaten (offen 17).
- [ ] Login-Code: 6 Stellen, 10 Minuten, begrenzte Versuche, Rate-Limit je Nummer und IP.

## Testfälle
Unit (übernehmbar): Scoring, Antworten → Profil, Pflichtfragen, PLZ-/Handy-Prüfung, AGG-Wortliste. E2E: Anmelden, Zwischenspeichern,
Absenden, Score im Dashboard, Löschen.

## Aus dem Prototyp übernehmen
`logic/fragen.ts`, `profil.ts`, `scoring.ts`, `geo.ts`(Struktur), `pages/crew-fragebogen.tsx`, `pages/crew-start.tsx`.

## Risiken und offene Fragen
Geocoding-Dienst und Datenschutz. Missbrauch des Codes (SIM-Swap). Gewichtung der Situationsfragen ist Annahme.
Sprache EN: Übersetzungen prüfen lassen. Offen 12: wer verschickt den Link (Merle).
