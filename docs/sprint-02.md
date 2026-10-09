# Sprint 2: Stundentabelle (Entwurf)

Status: **Entwurf, nicht freigegeben** · Bereich E · Flag `FEATURE_STUNDENTABELLE` · Tabellen: `v2.time_entry_pauses` (bearbeitet sonst `time_entries`)

## Ziel
Eine Excel-artige Tabelle `/admin/stunden`, in der Dispo und Buchhaltung die **bestehenden**
Zeiteinträge prüfen, korrigieren und freigeben – mit Plausibilitätsprüfung und lückenlosem Protokoll.

## Voraussetzungen
Sprint 1 · Entscheidung „Stundentabelle bearbeitet `time_entries`“ · Klärung Bonus/Abzug je Zeile oder Person · Rolle Dispo sieht keine Beträge (bleibt).

## User Stories
1. Als **Dispo** möchte ich Start, Pause, Ende direkt in der Zelle ändern und sofort die Gesamtzeit sehen.
2. Als **Dispo** möchte ich Zeilen aus Excel oder Google Sheets einfügen, damit ich Papierzettel nicht einzeln tippe.
3. Als **Dispo** möchte ich sofort sehen, was nicht stimmt (über 10 h, Ruhezeit, Pause, Doppeleinsatz, Vertrag, Monatsgrenze).
4. Als **Buchhaltung** möchte ich filtern, gruppieren und eine Summenzeile haben.
5. Als **Buchhaltung** möchte ich, dass exportierte Zeilen gesperrt sind und Änderungen eine Begründung brauchen.
6. Als **Dispo** möchte ich den Original-Zettel neben der Zeile sehen.

## Akzeptanzkriterien
- [ ] 18 Spalten wie `docs/ausbauplan.md` Abschnitt 8; Gesamtzeit berechnet und gesperrt; Schicht über Mitternacht erkannt.
- [ ] Mehrere Pausen je Zeile (Tabelle zeigt die erste, Detail alle).
- [ ] Tab/Enter/Pfeile wie in Excel; Einfügen eines 18-Spalten-Blocks füllt korrekt; Fehler in Zellen brechen nicht alles ab und werden gemeldet.
- [ ] Status offen → geprüft → freigegeben → exportiert mit Farbe; Freigabe mit Fehlern nicht möglich; inhaltliche Änderung einer freigegebenen Zeile setzt auf „geprüft“ zurück.
- [ ] Jede Änderung steht mit alt/neu/Person/Zeit im `audit_log`; exportierte Zeilen nur mit Begründung (mindestens 5 Zeichen).
- [ ] 1.200 Zeilen bleiben flüssig (Virtualisierung, weniger als 80 Zeilen im DOM).
- [ ] Bestehende Stundennachweise, Unterschriften und Freigaben bleiben gültig; **nichts wird überschrieben**, was der Kunde schon unterschrieben hat.
- [ ] Beträge sieht nur Admin/Buchhaltung (wie heute).

## Testfälle
Unit (aus dem Prototyp übernehmbar, 100+): Zeit- und Pausenrechnung, Mitternacht, Plausibilitätsregeln,
Einfügen/Parser, Datums- und Zahlenformate. E2E: bearbeiten, ungültige Zeit, Einfügen, Status,
Massenbearbeitung, Begründungspflicht, Protokoll, Filter „nur Fehler“.

## Aus dem Prototyp übernehmen
`logic/zeit.ts`, `logic/stunden.ts`, `logic/stundentabelle.ts`, `pages/stunden-aktionen.ts`, Teile von `pages/admin-stunden.tsx`.
Grid: TanStack Table oder AG Grid Community (Plan) – Prototyp nutzt eine eigene, einfache Virtualisierung.

## Risiken und offene Fragen
Zeilenbegriff: eine Zeile = ein `time_entries`-Eintrag je Person und Schicht? Korrekturversionen
(`korrigiertVonId`) vs. Überschreiben – Bestehende Logik **nicht** brechen. Monatssperre (`month_locks`)
muss in der Tabelle sichtbar sein. Kundenfreigabe (Punkt 16) ist Phase 2.
