# Spiele-Tracker

Web-App zum Tracken von Spielen einer Freundesgruppe. Jedes Spiel ist ein
Plugin; erstes vollständig implementiertes Spiel wird ein Dart-Trainingsspiel
("Round the Clock auf Zeit").

Mobile first – das Ding wird auf dem Handy neben der Dartscheibe bedient.

## Loslegen

```bash
npm install
cp .env.example .env.local     # VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY eintragen
npm run dev
```

Supabase-Schema einspielen: siehe [`supabase/README.md`](./supabase/README.md).

## Skripte

| | |
| --- | --- |
| `npm run dev` | Dev-Server |
| `npm run build` | Produktions-Build |
| `npm run test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `supabase/test/run.sh` | Migrations- und RLS-Tests gegen lokales Postgres |

## Wo was liegt

Architektur, Datenmodell und offene Punkte: [`PROJECT.md`](./PROJECT.md).

Ein neues Spiel bauen: [`src/games/README.md`](./src/games/README.md).

## Stand

Block 1 (Setup, Schema, RLS, Auth) und Block 2 (Plugin-System mit
Demo-Spiel) sind fertig. Das Dart-Spiel folgt in Block 3.
