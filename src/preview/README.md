# Klick-Prototyp (Phase 2 des Ausbauplans)

**Nichts hier ist produktiv.** Alles unter `src/preview/` und `src/app/preview/`
ist der Klick-Prototyp aus `docs/ausbauplan.md`, Abschnitt 0. Anleitung zum
Ansehen: `docs/testversion.md`. Stand, Annahmen und Fragen: `docs/prototyp-status.md`.

- Eigene Oberfläche im fess.jobs-Design, ausschließlich Beispieldaten.
- Kein Datenbankzugriff, keine Migration, keine Änderung am Bestand.
- Zustand nur im Browser (`sessionStorage`), nach dem Schließen weg.
- Erreichbar nur mit `PREVIEW_ENABLED=1` **und** `PREVIEW_PASSWORD`; ohne
  Flag antwortet jede `/preview`-Adresse mit 404. `noindex`, Banner „Testversion“.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `logic/` | Reine Funktionen (Zeiten, Plausibilität, Stundentabelle, Scoring, Passung, Grenzen, XP, Unterweisung, Beleg, Export …). Mit Unit-Tests; **das ist der Teil, der später in die echte Umsetzung übernommen wird.** |
| `data/` | Beispieldaten (frei erfunden, deterministisch) und die Unterweisungstexte (Entwurf) |
| `state/` | Browser-Zustand (React-Kontext + `sessionStorage`) |
| `ui/` | Bausteine (`kit.tsx`), Rahmen (`shells.tsx`), Stylesheet `preview.css` (alles unter `.pv`) |
| `pages/` | Die Bildschirme; Routen in `pages/routes.tsx`. Dashboard: `admin-*.tsx`, Mitarbeiterlink: `crew-*.tsx`, Beleg-Link: `beleg.tsx` |
| `nav.tsx` / `nav.standalone.tsx` | Navigation in Next.js bzw. Hash-Navigation für die Einzeldatei |
| `app.tsx` | Einstieg (Zustand, Banner, Router) |

Die Next-Seiten liegen in `src/app/preview/` (Zugang, Passwort, `noindex`, Einstieg).

## Befehle

```bash
# ansehen (Dev-Server, Flag an)
PREVIEW_ENABLED=1 PREVIEW_PASSWORD=test AUTH_SECRET=irgendwas npm run dev   # → /preview

# Einzeldatei ohne Server
node scripts/preview-standalone.mjs        # → dist-preview/testversion.html

# Tests
npx vitest run tests/unit/preview-*.test.ts
npx playwright test tests/e2e/preview.spec.ts   # startet zusätzlich einen Server mit Flag (Port 3102)
```

Der Hauptserver der E2E-Tests hat das Flag **nicht**; ein Test prüft, dass `/preview` dort 404 liefert.
