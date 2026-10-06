"use client";

// Der Aufruf *vor* dem Einsatz: eine fertige Nachricht für die
// WhatsApp-Gruppe, mit der die Dispo Leute sucht. Bewusst bearbeitbar –
// kurzfristig ändert sich oft noch etwas, und niemand soll deswegen den Text
// neu tippen müssen.
import { useState } from "react";

export function Aushang({ text }: { text: string }) {
  const [inhalt, setInhalt] = useState(text);
  const [kopiert, setKopiert] = useState(false);
  const geaendert = inhalt !== text;
  // wa.me öffnet WhatsApp mit vorbereitetem Text; die Gruppe wählt der Absender.
  // Bewusst hier statt aus mail.ts – das Modul zieht den Mailversand mit.
  const teilen = `https://wa.me/?text=${encodeURIComponent(inhalt)}`;

  return (
    <div className="card p-5" data-testid="aushang">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Aushang für die WhatsApp-Gruppe</p>
        {geaendert ? <span className="text-xs text-navy-400">bearbeitet</span> : null}
      </div>
      <p className="mt-1 text-sm text-navy-500">
        Sucht Leute für diesen Einsatz. Aus den Einsatzdaten erzeugt – vor dem Kopieren beliebig anpassen.
      </p>
      <textarea
        className="input mt-3 min-h-[19rem] font-mono text-xs leading-relaxed"
        value={inhalt}
        onChange={(e) => setInhalt(e.target.value)}
        spellCheck={false}
        aria-label="Nachricht für die WhatsApp-Gruppe"
        data-testid="aushang-text"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-accent text-xs"
          data-testid="aushang-kopieren"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(inhalt);
              setKopiert(true);
              setTimeout(() => setKopiert(false), 1500);
            } catch {
              window.prompt("Kopieren:", inhalt);
            }
          }}
        >
          {kopiert ? "Kopiert ✓" : "Nachricht kopieren"}
        </button>
        <a href={teilen} target="_blank" rel="noreferrer" className="btn-secondary text-xs" data-testid="aushang-teilen">
          In WhatsApp öffnen
        </a>
        {geaendert ? (
          <button type="button" className="text-xs text-navy-400 hover:underline" onClick={() => setInhalt(text)} data-testid="aushang-zuruecksetzen">
            Zurücksetzen
          </button>
        ) : null}
      </div>
    </div>
  );
}
