# Spiele-Tracker

Web-App zum Tracken von Spielen einer Freundesgruppe. Jedes Spiel ist ein
Plugin; erstes vollständig implementiertes Spiel wird ein Dart-Trainingsspiel
("Round the Clock auf Zeit").

Mobile first – das Ding wird auf dem Handy neben der Dartscheibe bedient.

## Loslegen

```bash
npm install
npm run dev
```

Ohne `.env.local` startet die App im **Testmodus**: keine Anmeldung nötig,
alles bleibt im Browser. So lässt sie sich sofort ausprobieren.

Für den echten Betrieb mit Konten, Gruppen und geteilten Ranglisten:

```bash
cp .env.example .env.local     # VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY eintragen
```

Supabase-Schema einspielen: siehe [`supabase/README.md`](./supabase/README.md).

## Skripte

| | |
| --- | --- |
| `npm run dev` | Dev-Server |
| `npm run build` | Produktions-Build |
| `npm run build:artifact` | Build als einzelne veröffentlichbare Seite |
| `npm run test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `supabase/test/run.sh` | Migrations- und RLS-Tests gegen lokales Postgres |

## Wo was liegt

Architektur, Datenmodell und offene Punkte: [`PROJECT.md`](./PROJECT.md).

Ein neues Spiel bauen: [`src/games/README.md`](./src/games/README.md).

## Stand

**Vier Spiele sind spielbar**, alle auf demselben Dart-Fundament:

| Spiel | Besonderheit |
| --- | --- |
| **501** | Double Out, Bust-Logik, Average, Checkout-Hinweise |
| **Cricket** | 20–15 und Bull, mit Cutthroat-Variante |
| **Shanghai** | Runde für Runde, Sofortsieg bei Single + Double + Triple |
| **Round the Clock** | 1–20 auf Zeit, mit Ziehphase |

Dazu Spielerprofile (Name, Foto oder Emoji, Farbe, Charakter) und
Auszeichnungen als Regeltabelle.

Als Nächstes: Logbuch und Ranglisten. Fahrplan in [`PROJECT.md`](./PROJECT.md).
