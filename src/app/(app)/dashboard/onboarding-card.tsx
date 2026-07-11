"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "@/app/(app)/einstellungen/organisation/actions";
import { Wordmark } from "@/components/wordmark";

// Onboarding-Assistent beim ersten Start (Spec Abschnitt 11): führt durch die
// wichtigsten Schritte und zahlt aufs spätere Produkt ein.
const STEPS = [
  {
    title: "Firmen prüfen",
    text: "Rechtsträger-Namen und Anschriften ergänzen – sie erscheinen auf dem Beiblatt.",
    href: "/einstellungen/firmen",
    cta: "Zu den Firmen",
  },
  {
    title: "Kategorien prüfen",
    text: "Ausgabenkategorien anpassen, Bewirtungs- und Fahrzeug-Zusatzfelder festlegen.",
    href: "/einstellungen/kategorien",
    cta: "Zu den Kategorien",
  },
  {
    title: "Team anlegen",
    text: "Mitarbeiter einladen – sie sehen nur ihre eigenen Belege.",
    href: "/einstellungen/nutzer",
    cta: "Zu den Nutzern",
  },
  {
    title: "Auslesen aktivieren",
    text: "ANTHROPIC_API_KEY hinterlegen, damit Belege automatisch ausgelesen werden.",
    href: "/einstellungen/organisation",
    cta: "Einstellungen",
  },
];

export function OnboardingCard({ companiesCount }: { companiesCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    await completeOnboarding();
    router.refresh();
  }

  return (
    <section className="card overflow-hidden">
      <div className="bg-navy-900 px-6 py-5 text-white">
        <p className="eyebrow !text-navy-300">Willkommen</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          Ersteinrichtung von <Wordmark className="text-white" />
        </h2>
        <p className="mt-1 text-sm text-navy-200">
          {companiesCount} Firmen sind bereits vorbefüllt. In wenigen Schritten bist du startklar.
        </p>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <div key={i} className="rounded-lg border border-navy-100 p-4 dark:border-navy-800">
            <div className="flex items-center gap-2">
              <span className="section-number">{String(i + 1).padStart(2, "0")}</span>
              <p className="font-medium">{s.title}</p>
            </div>
            <p className="mt-1 text-sm text-navy-400">{s.text}</p>
            <Link href={s.href} className="mt-2 inline-block text-sm text-navy-600 underline underline-offset-2 dark:text-navy-200">
              {s.cta} →
            </Link>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-navy-100 px-6 py-4 dark:border-navy-800">
        <p className="text-xs text-navy-400">Du kannst alle Schritte später jederzeit ändern.</p>
        <button type="button" disabled={busy} className="btn-primary" onClick={finish}>
          {busy ? "…" : "Einrichtung abschließen"}
        </button>
      </div>
    </section>
  );
}
