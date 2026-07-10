# incub:workflow online stellen mit Railway

Diese Anleitung bringt incub:workflow in ~10 Minuten online – erreichbar über eine
echte URL, auch vom Handy von unterwegs. Kein Programmieren nötig, alles im Browser.

Railway baut die App aus diesem GitHub-Repo, richtet die Datenbank ein und lädt beim
ersten Start automatisch die Grunddaten (Admin-Konto, Firmen, Kategorien).

---

## Was du brauchst

| Tool | Wofür | Link |
|------|-------|------|
| GitHub-Konto | hostet den Code (hast du schon) | <https://github.com> |
| Railway-Konto | führt App + Datenbank aus | <https://railway.app> |
| Passwort-Generator | erzeugt das Sicherheits-Geheimnis | <https://generate-secret.vercel.app/32> |

Kosten: Railway hat ein kostenloses Startguthaben; danach ca. **5 $/Monat** (Hobby-Plan).

---

## Schritt 1 – Bei Railway anmelden

1. Öffne <https://railway.app>
2. Klick **Login** → **Login with GitHub** und bestätige den Zugriff.

## Schritt 2 – Projekt aus dem Repo erstellen

1. Klick **New Project**.
2. Wähle **Deploy from GitHub repo**.
3. Wenn Railway noch keinen Zugriff hat: **Configure GitHub App** → Repository
   `fessjobs/Incub-Workflow` freigeben.
4. Wähle das Repo **`fessjobs/Incub-Workflow`** aus.
5. Railway fragt nach dem Branch → wähle **`claude/incub-workflow-app-tyetbl`**.

Railway erkennt automatisch das `Dockerfile` und beginnt zu bauen. Der erste Build
dauert ein paar Minuten – das ist normal.

## Schritt 3 – Datenbank hinzufügen

1. Im Projekt oben rechts **New** (oder Rechtsklick auf die Fläche) → **Database** →
   **Add PostgreSQL**.
2. Es erscheint ein zweiter Baustein „Postgres“. Fertig – Railway kümmert sich um den Rest.

## Schritt 4 – Die drei Variablen setzen

Klick auf den **App-Baustein** (nicht Postgres) → Reiter **Variables** → **New Variable**
und lege diese drei an:

| Name | Wert |
|------|------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` ← genau so eintippen, das verbindet die Datenbank |
| `AUTH_SECRET` | eine lange Zufallszeichenkette – erzeuge sie auf <https://generate-secret.vercel.app/32> und füge sie ein |
| `COOKIE_SECURE` | `true` |

Optional kannst du zusätzlich setzen, um das Erst-Login zu ändern:
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.

Nach dem Speichern deployt Railway automatisch neu.

## Schritt 5 – Öffentliche Adresse erzeugen

1. App-Baustein → Reiter **Settings** → Bereich **Networking**.
2. Klick **Generate Domain**.
3. Du bekommst eine URL wie `incub-workflow-production.up.railway.app`.

Warte, bis der Status **grün / „Active“** ist (Healthcheck läuft auf `/api/health`).

## Schritt 6 – Einloggen

1. Öffne deine Railway-URL im Browser.
2. Login:
   - E-Mail: `admin@incub.live` (bzw. dein `ADMIN_EMAIL`)
   - Passwort: `incub2026!` (bzw. dein `ADMIN_PASSWORD`)
3. **Wichtig:** Passwort sofort ändern unter **Einstellungen → Nutzer → Bearbeiten**.

Fertig. 🎉 Team-Mitglieder legst du unter **Einstellungen → Nutzer** an; sie melden
sich über dieselbe URL an.

---

## Updates einspielen

Sobald am `claude/incub-workflow-app-tyetbl`-Branch etwas gepusht wird (z. B. Sprint 2),
deployt Railway die neue Version **automatisch**. Du musst nichts tun.

## Wenn etwas hakt

- **Build/Deploy rot:** App-Baustein → **Deployments** → oberstes öffnen → **View Logs**.
  Meist fehlt eine der drei Variablen aus Schritt 4.
- **Login schlägt fehl / man wird sofort ausgeloggt:** `AUTH_SECRET` fehlt oder ist zu
  kurz, und/oder `COOKIE_SECURE` steht nicht auf `true`.
- **„Can't reach database“:** `DATABASE_URL` ist nicht `${{Postgres.DATABASE_URL}}`.

## Datensicherung

Railway → Postgres-Baustein → **Backups**: automatische Backups aktivieren. Die
Beleg-Dateien (ab Sprint 2) sollten später auf einen dauerhaften Speicher (Volume /
S3) gelegt werden – dazu mehr, wenn Sprint 2 steht.
