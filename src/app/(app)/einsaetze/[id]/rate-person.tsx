"use client";

// Interne Beurteilung nach dem Einsatz: negativ / neutral / positiv, dazu
// optional eine Notiz. Nur im Backend sichtbar – die Person sieht in ihrem
// Link nichts davon, und auf keinem PDF steht etwas.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rateAction } from "../actions";

type Wert = "NEGATIV" | "NEUTRAL" | "POSITIV";

const KNOEPFE: Array<{ wert: Wert; zeichen: string; label: string; an: string }> = [
  { wert: "NEGATIV", zeichen: "−", label: "negativ", an: "border-red-400 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  { wert: "NEUTRAL", zeichen: "∘", label: "neutral", an: "border-navy-400 bg-navy-100 text-navy-700 dark:bg-navy-700 dark:text-navy-100" },
  { wert: "POSITIV", zeichen: "+", label: "positiv", an: "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
];

export function RatePerson({ shiftAssignmentId, wert, notiz, name }: { shiftAssignmentId: string; wert: Wert | null; notiz: string | null; name: string }) {
  const router = useRouter();
  const [aktuell, setAktuell] = useState<Wert | null>(wert);
  const [text, setText] = useState(notiz ?? "");
  const [notizOffen, setNotizOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  const speichern = (neu: Wert | null, notizText: string) =>
    starte(async () => {
      setFehler(null);
      const res = await rateAction(shiftAssignmentId, { wert: neu, notiz: notizText });
      if (!res.ok) {
        setAktuell(wert);
        return setFehler(res.error);
      }
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid={`rate-${shiftAssignmentId}`}>
      <span className="sr-only">Bewertung für {name}</span>
      {KNOEPFE.map((k) => {
        const an = aktuell === k.wert;
        return (
          <button
            key={k.wert}
            type="button"
            disabled={laeuft}
            aria-pressed={an}
            title={`${k.label} bewerten`}
            className={`h-7 w-7 rounded-md border text-sm font-semibold transition disabled:opacity-50 ${an ? k.an : "border-navy-200 text-navy-400 hover:border-navy-300 dark:border-navy-700"}`}
            data-testid={`rate-${k.wert.toLowerCase()}-${shiftAssignmentId}`}
            onClick={() => {
              // Nochmal auf dieselbe Stufe tippen nimmt die Bewertung zurück
              const neu = aktuell === k.wert ? null : k.wert;
              setAktuell(neu);
              speichern(neu, text);
            }}
          >
            {k.zeichen}
          </button>
        );
      })}
      <button
        type="button"
        className="ml-1 text-xs text-navy-400 underline hover:text-navy-600"
        onClick={() => setNotizOffen((v) => !v)}
        data-testid={`notiz-auf-${shiftAssignmentId}`}
      >
        {text ? "Notiz ändern" : "Notiz"}
      </button>
      {notizOffen ? (
        <div className="mt-1 flex w-full flex-wrap gap-2">
          <input
            className="input flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Kurze Notiz (nur intern)"
            maxLength={500}
            data-testid={`notiz-feld-${shiftAssignmentId}`}
          />
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={laeuft || aktuell === null}
            onClick={() => {
              speichern(aktuell, text);
              setNotizOffen(false);
            }}
            data-testid={`notiz-speichern-${shiftAssignmentId}`}
          >
            Speichern
          </button>
        </div>
      ) : text && !notizOffen ? (
        <span className="ml-1 w-full text-xs text-navy-400">„{text}“</span>
      ) : null}
      {aktuell === null && notizOffen ? <p className="w-full text-xs text-navy-400">Erst eine Bewertung wählen, dann lässt sich die Notiz speichern.</p> : null}
      {fehler ? (
        <p className="w-full text-xs text-red-600" role="alert">
          {fehler}
        </p>
      ) : null}
    </div>
  );
}
