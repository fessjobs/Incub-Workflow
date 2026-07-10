#!/bin/sh
set -e

echo "→ Datenbank-Migrationen anwenden …"
npx prisma migrate deploy

echo "→ Seed (idempotent: legt nur Fehlendes an) …"
npx prisma db seed || echo "Seed fehlgeschlagen – App startet trotzdem."

echo "→ incubWorkflow starten …"
exec node server.js
