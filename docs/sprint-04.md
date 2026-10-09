# Sprint 4: Belege und Archiv (Entwurf)

Status: **Entwurf, nicht freigegeben** · Bereiche A und B · Flag `FEATURE_BELEGLINK` · Tabellen: `v2.receipt_links` (+ ggf. `v2.crew_receipts`)

## Ziel
Die Crew reicht Belege per Link ein; die Unterlagen je Auftrag und Person liegen an einem Ort.

## Voraussetzungen
Sprint 1 · Entscheidung: Belege in die bestehende Belegwelt (Empfehlung) oder eigene Tabelle · Aufbewahrungsfristen mit Steuerberater.

## User Stories
1. Als **Dispo** möchte ich je Auftrag einen Beleg-Link erzeugen und der Crew schicken.
2. Als **Crew** möchte ich ohne Anmeldung einen Beleg fotografieren, Betrag/Datum ergänzen und abschicken.
3. Als **Buchhaltung** möchte ich bei Abweichungen zwischen Eingabe und Beleg einen gelben Hinweis, aber keine Ablehnung.
4. Als **Buchhaltung** möchte ich je Auftrag alle Unterlagen als ZIP und eine Liste, was noch fehlt.

## Akzeptanzkriterien
- [ ] Token unerratbar, mit Ablauf und Rate-Limit (Mechanik des Einsatzmodul-Links wiederverwenden); Token im Klartext nie gespeichert (Hash).
- [ ] Dateien: JPG, PNG, WEBP, HEIC, PDF; Größenlimit; Virenscan-Entscheidung dokumentiert.
- [ ] Beiblatt je Belegart aus Vorlage mit Platzhaltern; Text bleibt bearbeitbar.
- [ ] Auslesen (Claude) über die bestehende Queue; Abweichungen bei Betrag, Datum, Händler gelb.
- [ ] `/admin/unterlagen`: Filter Typ/Person/Auftrag, Suche, Download; ZIP je Auftrag; Lücken-Check; SHA-256 wie `documents`.
- [ ] Bestehende Belegwelt, Erstattung und DATEV-Export laufen unverändert.

## Testfälle
Unit: Beiblatt-Text, Abweichungslogik, Dateiformat-Prüfung. E2E: Link erzeugen → Beleg einreichen →
Abweichung sichtbar → im Archiv; abgelaufener Link; zu viele Versuche.

## Aus dem Prototyp übernehmen
`logic/beleg.ts` (+ Tests), `pages/beleg.tsx` (Oberfläche), `pages/admin-unterlagen.tsx`.

## Risiken und offene Fragen
Identifikation nur über Personalnummer reicht evtl. nicht (Missbrauch). Personenbezogene Fotos:
Aufbewahrung und Löschung. Auslesen kostet Tokens – Limit je Link.
