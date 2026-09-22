// Erfahrung und Bewertungsbilanz als kompakte Anzeige. Nur im Backend –
// nichts davon erscheint im Mitarbeiter-Link, auf einem PDF oder im Export.
import type { Bilanz, Erfahrung } from "@/lib/einsatz/service/personal";
import { bilanzUrteil, stufe } from "@/lib/einsatz/service/personal";

const URTEIL_STIL: Record<string, string> = {
  positiv: "badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  gemischt: "badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  negativ: "badge bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  offen: "badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300",
};

export const WERT_LABEL: Record<string, string> = { POSITIV: "positiv", NEUTRAL: "neutral", NEGATIV: "negativ" };

export function BilanzBadge({ bilanz, testId }: { bilanz: Bilanz; testId?: string }) {
  const urteil = bilanzUrteil(bilanz);
  const gesamt = bilanz.positiv + bilanz.neutral + bilanz.negativ;
  return (
    <span className={URTEIL_STIL[urteil]} title={`${bilanz.positiv} positiv · ${bilanz.neutral} neutral · ${bilanz.negativ} negativ`} data-testid={testId}>
      {gesamt === 0 ? "noch nicht bewertet" : `+${bilanz.positiv} / ∘${bilanz.neutral} / −${bilanz.negativ}`}
    </span>
  );
}

// Schichten, Stunden, Stufe – die Zahl steht daneben, die Stufe ist nur die
// schnelle Einordnung.
export function ErfahrungZeile({ e, maxTaetigkeiten = 3 }: { e: Erfahrung; maxTaetigkeiten?: number }) {
  const oben = e.taetigkeiten.slice(0, maxTaetigkeiten);
  return (
    <>
      <span className="badge-accent">
        {e.schichten} {e.schichten === 1 ? "Schicht" : "Schichten"} · {stufe(e.schichten)}
      </span>{" "}
      {oben.length > 0 ? (
        <span className="text-xs text-navy-400">
          {oben.map((t) => `${t.taetigkeit} ${t.schichten}×`).join(" · ")}
          {e.taetigkeiten.length > oben.length ? ` · +${e.taetigkeiten.length - oben.length} weitere` : ""}
        </span>
      ) : null}
    </>
  );
}

// Kurzform für enge Stellen (Namenszuordnung beim Anlegen)
export function erfahrungKurz(e: { schichten: number; taetigkeiten: Array<{ taetigkeit: string; schichten: number }>; bilanz: Bilanz }, taetigkeit?: string): string {
  const teile: string[] = [];
  if (taetigkeit) {
    // Schreibweise aus dem Bestand nehmen, nicht die der aktuellen Schicht –
    // "hands" und "Hands" sind dieselbe Tätigkeit, angezeigt wird die gepflegte
    const passend = e.taetigkeiten.find((t) => t.taetigkeit.toLowerCase() === taetigkeit.trim().toLowerCase());
    teile.push(passend ? `${passend.taetigkeit} ${passend.schichten}×` : `${taetigkeit.trim()} 0×`);
  }
  teile.push(`${e.schichten} Schichten`);
  const urteil = bilanzUrteil(e.bilanz);
  if (urteil === "negativ") teile.push("überwiegend negativ bewertet");
  else if (urteil === "positiv" && e.bilanz.positiv > 0) teile.push(`${e.bilanz.positiv}× positiv`);
  return teile.join(" · ");
}
