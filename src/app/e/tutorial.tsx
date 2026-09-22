"use client";

// Kurzanleitung beim ersten Öffnen des Links. Die meisten Leute bekommen den
// Link in der WhatsApp-Gruppe und haben die App noch nie gesehen – deshalb
// einmal in fünf Zeilen, was zu tun ist. Danach nur noch über das
// Fragezeichen im Kopf erreichbar.
import { useCallback, useEffect, useRef, useState } from "react";

// Version im Schlüssel: ändert sich der Text, wird die Anleitung einmal
// wieder gezeigt.
const SPEICHER_KEY = "fess.einsatz.tutorial.v1";

function schonGesehen(): boolean {
  try {
    return window.localStorage.getItem(SPEICHER_KEY) === "1";
  } catch {
    // Privater Modus oder blockierte Speicherung: dann eben jedes Mal
    return false;
  }
}

function merken(): void {
  try {
    window.localStorage.setItem(SPEICHER_KEY, "1");
  } catch {
    // nicht schlimm – die Anleitung erscheint dann erneut
  }
}

type Schritt = { titel: string; text: string };

const SCHRITTE_GRUPPE: Schritt[] = [
  { titel: "Eigenen Namen antippen", text: "In der Liste stehen alle, die eingeteilt sind. Tippe auf deinen Namen – nicht auf den von jemand anderem." },
  { titel: "Zeiten prüfen", text: "Beginn, Ende und Pause sind vorbelegt. Hast du länger oder kürzer gearbeitet, ändere die Felder." },
  { titel: "Fahrtkosten – nur wenn du gefahren bist", text: "Privat-PKW oder Firmenfahrzeug auswählen, dann Start, Ziel und Kilometer eintragen." },
  { titel: "Spesen – nur wenn vorher besprochen", text: "Haken setzen, wenn die Dispo dir Spesen zugesagt hat. Sonst leer lassen." },
  { titel: "Unterweisung bestätigen und unterschreiben", text: "Haken setzen, mit dem Finger unterschreiben, absenden. Danach ist dein Eintrag gesperrt." },
];

const SCHRITTE_EINZEL: Schritt[] = SCHRITTE_GRUPPE.slice(1);

export function Tutorial({ variante }: { variante: "einzel" | "gruppe" }) {
  const [offen, setOffen] = useState(false);
  const schliessen = useRef<HTMLButtonElement>(null);
  const schritte = variante === "gruppe" ? SCHRITTE_GRUPPE : SCHRITTE_EINZEL;

  useEffect(() => {
    if (!schonGesehen()) setOffen(true);
  }, []);

  const zu = useCallback(() => {
    setOffen(false);
    merken();
  }, []);

  useEffect(() => {
    if (!offen) return;
    schliessen.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") zu();
    };
    window.addEventListener("keydown", onKey);
    // Hintergrund nicht mitscrollen lassen
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = vorher;
    };
  }, [offen, zu]);

  if (!offen) {
    return (
      <button type="button" className="ez-hilfe" onClick={() => setOffen(true)} aria-label="Kurzanleitung anzeigen" data-testid="tutorial-oeffnen">
        ?
      </button>
    );
  }

  return (
    <div className="ez-modal-hg" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) zu(); }}>
      <div className="ez-modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-titel" data-testid="tutorial">
        <h2 className="ez-h1" id="tutorial-titel" style={{ fontSize: "1.3rem" }}>
          So geht&apos;s – in einer Minute
        </h2>

        <div className="ez-warnung" data-testid="tutorial-unterweisung">
          <strong>Vor dem Einsatz:</strong> Lies die Sicherheitsunterweisung. Du findest sie weiter unten im Formular zum Aufklappen – bitte
          <em> vor </em>
          Arbeitsbeginn lesen, nicht erst beim Unterschreiben.
        </div>

        <ol className="ez-schritte">
          {schritte.map((s, i) => (
            <li key={s.titel}>
              <span className="ez-schritt-nr">{i + 1}</span>
              <span>
                <strong>{s.titel}</strong>
                <br />
                {s.text}
              </span>
            </li>
          ))}
        </ol>

        <p className="ez-muted" style={{ fontSize: "0.85rem" }}>
          Kein Login, kein Passwort. Stimmt etwas nicht – falscher Name, jemand fehlt, Zeiten passen nicht –, melde dich bei der Dispo.
        </p>

        <button ref={schliessen} type="button" className="ez-btn" onClick={zu} data-testid="tutorial-schliessen">
          Verstanden, los geht&apos;s
        </button>
        <p className="ez-muted" style={{ marginTop: "0.6rem", fontSize: "0.8rem", textAlign: "center" }}>
          Du kannst das jederzeit über das <strong>?</strong> oben rechts noch einmal lesen.
        </p>
      </div>
    </div>
  );
}
