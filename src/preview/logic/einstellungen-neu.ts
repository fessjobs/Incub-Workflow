// Einstellungen des neuen Systems (Kleidung, Nachrichten, Schnittstelle) und ihre Standardwerte.
// Bewusst ohne "use client", damit Server und Oberfläche dieselben Werte nutzen.

// Arbeitskleidung, die gegen Pfand ausgegeben wird (Auswahl im Fragebogen)
export interface KleidungArtikel {
  id: string;
  label: string;
  // Welche Größe wird dafür gebraucht?
  groessen: "shirt" | "hose" | "schuh" | "keine";
  // Pfand in Euro; leer = beim Ausgeben eintragen
  pfandEur: number | null;
}

export interface KleidungEinst {
  aktiv: boolean;
  pfandHinweis: string;
  artikel: KleidungArtikel[];
}

export interface NachrichtVorlage {
  id: string;
  name: string;
  text: string;
}

// Vorbereitete Verbindung zum bisherigen System. Bleibt AUS: ohne die Umgebungsvariable
// NEU_SCHNITTSTELLE=an auf dem Server fließt nichts, egal was hier steht.
export interface SchnittstelleEinst {
  aktiv: boolean;
  auftraegeAnAltesSystem: boolean;
  stundenVomAltenSystem: boolean;
  pdfQuelle: { art: "keine" | "verzeichnis" | "s3" | "http"; pfad: string };
  notiz: string;
}

export function standardKleidung(): KleidungEinst {
  return {
    aktiv: true,
    pfandHinweis: "Arbeitskleidung bekommst du von FESS gegen Pfand. Das Pfand bekommst du bei Rückgabe zurück. Die Einzelheiten (Höhe, Ausgabe, Rückgabe) klärt das Team mit dir.",
    artikel: [
      { id: "tshirt", label: "T-Shirt", groessen: "shirt", pfandEur: null },
      { id: "hoodie", label: "Hoodie / Pullover", groessen: "shirt", pfandEur: null },
      { id: "jacke", label: "Softshell-Jacke", groessen: "shirt", pfandEur: null },
      { id: "hose", label: "Arbeitshose", groessen: "hose", pfandEur: null },
      { id: "schuhe", label: "Sicherheitsschuhe S3", groessen: "schuh", pfandEur: null },
      { id: "weste", label: "Warnweste", groessen: "keine", pfandEur: null },
      { id: "handschuhe", label: "Arbeitshandschuhe", groessen: "keine", pfandEur: null },
    ],
  };
}

export const EINLADUNG_TEXT = "Hallo {vorname}, hier ist dein persönlicher Link zum Crew-Fragebogen von fess.jobs: {link} – dauert ca. 8 Minuten, du kannst jederzeit unterbrechen und später weitermachen.";

export function standardNachrichten(): NachrichtVorlage[] {
  return [
    { id: "erinnerung", name: "Erinnerung Fragebogen", text: "Hallo {vorname}, kurze Erinnerung: Dein Fragebogen bei fess.jobs ist noch nicht fertig. Hier geht es weiter: {link} – du kannst genau dort weitermachen, wo du aufgehört hast." },
    { id: "freigabe", name: "Aufträge freigeschaltet", text: "Hallo {vorname}, du bist jetzt freigeschaltet! Unter deinem persönlichen Link siehst du die aktuellen Aufträge und kannst dich bewerben: {link}" },
    { id: "schulung", name: "Schulung offen", text: "Hallo {vorname}, bevor wir dich einplanen können, fehlt noch deine Sicherheitsunterweisung (ca. 3 Minuten pro Modul). Hier geht es lang: {link}" },
  ];
}

export function standardSchnittstelle(): SchnittstelleEinst {
  return { aktiv: false, auftraegeAnAltesSystem: false, stundenVomAltenSystem: false, pdfQuelle: { art: "keine", pfad: "" }, notiz: "" };
}


// Gespeicherte Kleidungs-Einstellung (evtl. unvollständig) in eine gültige Form bringen
export function bereinigeKleidung(roh: unknown): KleidungEinst {
  const std = standardKleidung();
  if (!roh || typeof roh !== "object") return std;
  const r = roh as Partial<KleidungEinst>;
  const artikel = Array.isArray(r.artikel)
    ? r.artikel
        .filter((x): x is KleidungArtikel => !!x && typeof x.id === "string" && x.id !== "" && typeof x.label === "string")
        .map((x) => ({ id: x.id.slice(0, 40), label: x.label.slice(0, 80), groessen: (["shirt", "hose", "schuh", "keine"] as const).includes(x.groessen) ? x.groessen : ("keine" as const), pfandEur: typeof x.pfandEur === "number" && x.pfandEur >= 0 ? x.pfandEur : null }))
        .slice(0, 40)
    : std.artikel;
  return { aktiv: r.aktiv !== false, pfandHinweis: typeof r.pfandHinweis === "string" ? r.pfandHinweis.slice(0, 1000) : std.pfandHinweis, artikel };
}
