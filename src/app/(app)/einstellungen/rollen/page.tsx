import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Rollen" };

type Role = {
  badge: string;
  name: string;
  short: string;
  can: string[];
  cannot: string[];
  steps: string[];
};

const ROLES: Role[] = [
  {
    badge: "A",
    name: "Admin / Gesellschafter",
    short: "Sieht und verwaltet alles – und lädt von überall schnell Belege hoch.",
    can: [
      "Alle Belege aller Nutzer sehen, bearbeiten, für andere erfassen",
      "Schnell-Upload von überall: Beleg → Firma → Zahlungsart (z. B. eigene Amex) → bezahlt/offen",
      "Automatischer Zahlungs-Check: passt eine Kontobewegung zum Beleg?",
      "Accounts freischalten, Rollen und Passwörter verwalten",
      "Firmen, Kategorien, Firmenkarten und Organisation pflegen",
      "Kontoauszug-Abgleich über alle Konten",
    ],
    cannot: [],
    steps: [
      "Beleg unterwegs: „Schnell-Upload“ im Menü → Foto → Firma antippen → Zahlungsart wählen → bezahlt oder noch zu zahlen → fertig.",
      "Neue Registrierung? Unter Einstellungen → Nutzer den Account freischalten und die Rolle wählen.",
      "Monatsabschluss: Auswertungen → DATEV-Export an die Buchhaltung geben (oder die Buchhaltung zieht ihn selbst).",
    ],
  },
  {
    badge: "B",
    name: "Buchhaltung",
    short: "Zieht sich alle Belege sauber sortiert – direkt für DATEV.",
    can: [
      "Alle Belege aller Nutzer und Firmen einsehen (Belegliste, Auswertungen)",
      "DATEV-Export: Buchungsstapel-CSV (EXTF) pro Firma + Beleg-PDFs sortiert nach Firma / Monat / Zahlungsart",
      "Excel-Export gefilterter Ansichten, Steuerberater-Monats-ZIP",
      "Filter nach Firmenkarte (Amex), Mitarbeiter-Auslagen, Zeitraum",
    ],
    cannot: ["Keine Einstellungen, keine Nutzerverwaltung, ändert keine Belege"],
    steps: [
      "Anmelden → Belege: mit den Filtern (Firma, Monat, Zahlungsart, Karte) die gewünschte Sicht bauen.",
      "Auswertungen → „DATEV-Export“: Monat wählen → ZIP herunterladen → CSV in DATEV einspielen, PDFs sind im ZIP passend sortiert.",
      "Mitarbeiter-Auslagen liegen gesammelt im Ordner „Auslagen Mitarbeiter“ (Filter in der Belegliste).",
    ],
  },
  {
    badge: "M",
    name: "Mitglied",
    short: "Erfasst eigene Belege und gleicht die eigenen Kontoauszüge ab.",
    can: [
      "Eigene Belege erfassen (Foto/Scan, automatisches Auslesen), bearbeiten, PDFs ziehen",
      "Eigene private Kontoauszüge hochladen und abgleichen",
      "Pro Kontobewegung angeben, für welche Firma die Ausgabe war",
      "Eigene Auswertungen und Erstattungsstatus verfolgen",
    ],
    cannot: ["Sieht keine Belege anderer Nutzer, keine Einstellungen"],
    steps: [
      "Beleg erfassen: Belege → „+ Belege erfassen“ → Foto/Datei → Firma antippen → ablegen.",
      "Kontoauszug: Abgleich → Konto anlegen → CSV/PDF hochladen → offene Posten zuordnen.",
      "Erstattung: Sobald die Rückzahlung auf dem Auszug erscheint, wird die Auslage automatisch „erstattet“.",
    ],
  },
  {
    badge: "L",
    name: "Mitarbeiter-Link",
    short: "Kein Account nötig: Link öffnen, Passwort 123, Beleg senden.",
    can: [
      "Beleg fotografieren oder hochladen",
      "Name, Auftrag, Grund, Zahlungsart und Status (Geld erhalten / noch zu bekommen) angeben",
    ],
    cannot: ["Kein Zugriff auf die App – nur das Einreich-Formular"],
    steps: [
      "Link ans Team schicken: /mitarbeiter (z. B. per WhatsApp).",
      "Mitarbeiter: kurzes Erklär-Intro ansehen → Passwort 123 → Formular ausfüllen → senden.",
      "Die Belege landen automatisch im Ordner „Auslagen Mitarbeiter“ im Adminbereich – sortiert nach Datum und Name.",
    ],
  },
];

export default async function RolesPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Rollen &amp; Anleitung</h2>
        <p className="mt-1 text-sm text-navy-400">
          Wer darf was – und wie arbeitet jede Rolle Schritt für Schritt. Rollen weist du unter{" "}
          <Link href="/einstellungen/nutzer" className="underline underline-offset-2">
            Nutzer
          </Link>{" "}
          zu.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ROLES.map((r) => (
          <div key={r.name} className="card flex flex-col p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-sm font-bold text-white dark:bg-white dark:text-navy-900">
                {r.badge}
              </span>
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-navy-400">{r.short}</p>
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              {r.can.map((c) => (
                <p key={c} className="flex gap-2 text-sm">
                  <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">✓</span>
                  <span>{c}</span>
                </p>
              ))}
              {r.cannot.map((c) => (
                <p key={c} className="flex gap-2 text-sm text-navy-400">
                  <span className="mt-0.5">✕</span>
                  <span>{c}</span>
                </p>
              ))}
            </div>

            <div className="mt-4 border-t border-navy-100 pt-3 dark:border-navy-800">
              <p className="eyebrow !text-[10px]">So geht&apos;s</p>
              <ol className="mt-2 space-y-1.5 text-sm text-navy-500 dark:text-navy-300">
                {r.steps.map((s, i) => (
                  <li key={s} className="flex gap-2">
                    <span className="font-mono text-xs text-navy-400">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
