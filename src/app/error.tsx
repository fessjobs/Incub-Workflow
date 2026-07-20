"use client";

// Freundliche Fehlerseite statt "Application error": tritt z. B. während
// eines Deploys oder bei kurzzeitigen Datenbank-Aussetzern auf.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-5xl">⚠️</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Kurzer Aussetzer</h1>
        <p className="mt-2 text-sm text-navy-400">
          Die Seite konnte gerade nicht geladen werden – das passiert z.&nbsp;B. während eines
          Updates der App oder bei einem kurzen Datenbank-Schluckauf. Deine Daten sind sicher.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-xl bg-navy-900 px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-navy-900"
        >
          Neu laden
        </button>
        <p className="mt-4 text-xs text-navy-400">
          Klappt es nach 1–2 Minuten immer noch nicht, bitte die Logs in Railway prüfen
          {error.digest ? ` (Fehlercode ${error.digest})` : ""}.
        </p>
      </div>
    </div>
  );
}
