# Monatsstundenzettel (Klick-Prototyp)

> **Umgesetzt im bisherigen Einsatzmodul** (Tab *Einsätze → Monatszettel*, Ablage unter *Dokumente*): siehe `docs/einsatzmodul.md`, Abschnitt 7e2. Dieser Text beschreibt den Klick-Prototyp in der Testversion, der die Abläufe vorab zeigt. Im echten Modul laufen die Stunden **nicht** ins neue System, sondern wie alle anderen durch das Einsatzmodul.

Stand: 02.11.2026 · **Nur Klick-Prototyp in der Testversion** – nichts davon ist im echten System, nichts wird gespeichert,
verschickt oder in die Datenbank geschrieben. Das bisherige System (Einsätze, Stunden, Belege, Dokumente) ist nicht berührt.

## Wofür

Für Personen, die laufend für **einen Kunden** arbeiten (ohne Auftrag je Einsatz): ein **Zettel pro Person und Monat**. Die
Person trägt am Handy ein, an welchen Tagen sie gearbeitet hat (mit Zeiten, Fahrten, Sonderabsprachen und – freiwillig –
was gemacht wurde) und unterschreibt am Monatsende. Danach unterschreibt der Kunde. Jede Person hat ihren **eigenen Link**;
im Dashboard wählst du den Kunden und verschickst die Monatslinks.

## Durchklicken

Testversion öffnen → Dashboard → **Monatszettel** (Abrechnung). Alternativ `testversion.html` (Einzeldatei) → `#/admin/monatszettel`.

1. **Dashboard:** Kunde und Monat wählen, Personen ankreuzen, „Monatslinks erstellen“. Je Person: Nachricht kopieren oder per
   WhatsApp öffnen (markiert den Link als versendet). Im Beispiel gibt es schon drei Personen in drei Zuständen.
2. **Als Person öffnen** (`/m/<Link>`, am Handy): Kalender, auf einen Tag tippen, Beginn/Ende/Pause, Tätigkeit, Fahrten (Start,
   Ziel, km, privater PKW), Spesen, Sonderabsprache, „Was wurde gemacht?“ (freiwillig), Notiz. „Wie letzter Eintrag“ spart
   Tipparbeit; mehrere Einträge pro Tag sind möglich; Tage in der Zukunft sind gesperrt. Am Ende: Haken, Unterschrift,
   „Unterschreiben und an den Kunden weitergeben“. Bis der Kunde unterschrieben hat, lässt sich der Zettel wieder öffnen.
3. **Kundenlink öffnen** (`/k/<Link>`): alle Personen des Monats auf einer Seite, jeder Zettel aufklappbar. Mit Name, Funktion
   und **einer Unterschrift** bestätigt der Kunde alle Zettel, die die Person schon unterschrieben hat. Stimmt etwas nicht:
   **„Zurückgeben mit Hinweis“** – die Person sieht den Hinweis, korrigiert und unterschreibt neu.
4. **Details / PDF:** das Blatt „Monatsstundenzettel“ mit beiden Unterschriften („Als PDF speichern“ = Druckdialog).
5. **In die Stundentabelle übernehmen** (erst nach beiden Unterschriften): je Eintrag eine Zeile (Status „offen“, Quelle „App“,
   Auftrag „Monatszettel <Monat>“, Verweis auf den Zettel), mit Eintrag im Änderungsprotokoll.

## Annahmen des Prototyps (die fünf Rückfragen)

Im Prototyp erscheinen gelbe Markierungen „⚑ offen · Frage 1–5“. Angenommen ist jeweils meine Empfehlung:

| # | Frage | Annahme im Prototyp |
| --- | --- | --- |
| 1 | Wohin fließen die Stunden? | Ins **neue System** (Stundentabelle). Nichts im bisherigen Einsatzmodul, kein Austausch mit dem alten System. |
| 2 | Welche Felder pro Tag? | Beginn, Ende, Pause (Pflicht: Beginn und Ende); freiwillig: Tätigkeit, Fahrten mit km und privatem PKW, Spesen, Sonderabsprache, „Was wurde gemacht?“, Notiz. Mehrere Einträge pro Tag; änderbar bis zur Unterschrift. |
| 3 | Unterschriften am Monatsende | Erst die Person, dann der Kunde über einen **eigenen Link**; der Kunde sieht alle Personen eines Monats und unterschreibt **einmal für alle**; Rückgabe pro Person mit Hinweis. |
| 4 | Auswahl und Versand | Kunde wählen, Personen aus der Crew-Liste ankreuzen; **ein Link je Person, Kunde und Monat**; Nachricht zum Kopieren/WhatsApp-Link (keine automatische WhatsApp-Schnittstelle); du löst den Versand selbst aus, das Dashboard erinnert, wenn der Monat vorbei ist und Zettel offen sind. |
| 5 | Ergebnis und Prüfung | PDF „Monatsstundenzettel“ pro Person mit beiden Unterschriften; Zeilen in der Stundentabelle (Status „offen“) zur Prüfung und Freigabe wie bisher. **Nur Zeiten, keine Zuschläge/Lohnbeträge** im Zettel. |

## Noch nicht gebaut (käme erst nach deiner Entscheidung)

- Echte Links (Token in `v2_access`), Speicherung in der Datenbank, PDF-Erzeugung auf dem Server, Ablage im Dokumentenbereich und
  in der Monats-Sicherung, Prüfung der Unterschriften auf dem Server, öffentliche Pfade `/m/…` und `/k/…` (ohne Anmeldung, wie
  `/b/…`), Rate-Limit und Sperre abgelaufener Links.
- Zuschläge (Nacht/Sonntag/Feiertag) – nur falls gewünscht.

## Technik

- Reine Rechenlogik: `src/preview/logic/monatszettel.ts` (Kalender, Summen, Prüfungen, Stand, Nachricht, Übernahme) mit Unit-Tests
  (`tests/unit/monatszettel.test.ts`).
- Zustand nur im Browser (`sessionStorage`, getrennt vom übrigen Prototyp): `src/preview/state/monatszettel-store.ts`.
- Seiten: `admin-monatszettel.tsx` (Dashboard, Detail/PDF), `monat-person.tsx` (`/m/:token`), `monat-kunde.tsx` (`/k/:token`),
  `monat-teile.tsx` (gemeinsame Bausteine). Browser-Test: `tests/e2e/preview.spec.ts` („Testversion: Monatszettel“).
- Im echten System (`/admin`) ist der Menüpunkt ausgeblendet; die Seiten zeigen dort nur einen Hinweis.
