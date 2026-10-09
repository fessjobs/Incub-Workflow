# Sprint 5: Crew-Übersicht (Entwurf)

Status: **Entwurf, nicht freigegeben** · Bereich F · Flag `FEATURE_CREW` · Tabellen: `v2.contracts`, `v2.xp_events`, `v2.rating_details`, `v2.crew_profiles` (nur Stamm)

## Ziel
Auf einen Blick sehen, wer wie ausgelastet ist, wessen Vertrag ausläuft und wer in eine Grenze läuft.

## Voraussetzungen
Sprint 1 · Verträge aus DocuSign bereitgestellt (Format) · Minijob-Grenze und Level-Schwellen bestätigt.

## User Stories
1. Als **Dispo** möchte ich Ampeln für Auslastung, Vertrag, 70 Tage und Minijob, damit ich niemanden über die Grenze einplane.
2. Als **Admin** möchte ich Verträge je Person mit Art, Wochenstunden, Monatsgrenze und Gültigkeit pflegen.
3. Als **Dispo** möchte ich nach jedem Einsatz bewerten (pünktlich, Einsatz, Teamwork je 1–5), damit Level und Passung stimmen.
4. Als **Admin** möchte ich jeden Montag eine Mail „Wer läuft in die Grenze“.

## Akzeptanzkriterien
- [ ] Ampel Auslastung: grün unter 80 %, gelb 80–100 %, rot darüber – gegen die **Vertragsgrenze**.
- [ ] Ampel Vertrag: 30 Tage vor Ablauf gelb, abgelaufen rot, unbefristet grün.
- [ ] Kurzfristig Beschäftigte: Arbeitstage im Kalenderjahr gegen 70.
- [ ] Minijob: Verdienst gegen den Wert aus `settings` (nie fest im Code).
- [ ] Verträge überlappen nicht (Datenbank-Sperre); die Stundentabelle meldet „kein gültiger Vertrag“.
- [ ] XP und Level aus `xp_events`, Werte aus `settings`; Crew sieht nur Level und XP.
- [ ] Beträge (Verdienst) nur für Admin/Buchhaltung.
- [ ] Bestehende Personalseiten (`/einsaetze/personal`) laufen unverändert.

## Testfälle
Unit (übernehmbar): `grenzen.ts`, `xp.ts`, Vertragsauflösung am Datum, Verdienst je Zeile. E2E: Ampelfarben je
Vertragsart, Filter, Detailseite, Bewertung abgeben.

## Aus dem Prototyp übernehmen
`logic/grenzen.ts`, `xp.ts`, `scoring.ts`(Leistung), `pages/admin-crew.tsx`, `pages/helfer.ts`.

## Risiken und offene Fragen
Vorhandene Bewertung ist **eine** Stufe (positiv/neutral/negativ) – Mapping auf drei Achsen klären, damit
alte Bewertungen nicht verfallen. Wer pflegt Verträge (nur Anzeige oder Anlage)? Minijob-Grenze jährlich prüfen.
