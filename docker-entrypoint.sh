#!/bin/sh
set -e

# Klare Warnung, falls das Session-Geheimnis fehlt oder noch der Default ist –
# ohne gültiges AUTH_SECRET schlägt der Login fehl.
case "${AUTH_SECRET:-}" in
  "" )
    echo "‼️  AUTH_SECRET ist nicht gesetzt. Bitte in Railway/Render eine lange" >&2
    echo "   Zufallszeichenkette als Variable AUTH_SECRET hinterlegen." >&2
    ;;
esac

echo "→ Datenbank-Migrationen anwenden …"
npx prisma migrate deploy

echo "→ Seed (idempotent: legt nur Fehlendes an) …"
npx prisma db seed || echo "Seed fehlgeschlagen – App startet trotzdem."

echo "→ incubWorkflow starten …"
exec node server.js
