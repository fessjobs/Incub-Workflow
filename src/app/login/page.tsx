import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = { title: "Anmelden" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen">
      {/* Marken-Panel im Stil der Gruppen-Website */}
      <div className="hidden w-1/2 flex-col justify-between bg-navy-900 p-12 text-white lg:flex">
        <Wordmark className="text-xl" />
        <div>
          <p className="eyebrow !text-navy-300">01 / Auslagen &amp; Belege</p>
          <h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Belege. Erledigt.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-navy-200">
            Belege fotografieren, automatisch auslesen, prüfungstaugliches
            Beiblatt generieren – sauber abgelegt für die gesamte
            Unternehmensgruppe.
          </p>
        </div>
        <p className="text-xs text-navy-400">
          incub:live – Die Unternehmensgruppe für spezialisiertes Personal
        </p>
      </div>

      {/* Formular */}
      <div className="flex w-full items-center justify-center bg-surface-muted p-6 dark:bg-navy-950 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark className="text-2xl" />
            <p className="mt-1 text-sm text-navy-400">Belege. Erledigt.</p>
          </div>
          <p className="eyebrow">Anmeldung</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Willkommen zurück</h2>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </div>
    </main>
  );
}
