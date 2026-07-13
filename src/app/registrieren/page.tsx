import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { RegisterForm } from "./register-form";
import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = { title: "Konto erstellen" };

// Pro Anfrage rendern: liest die Organisation aus der DB. Beim Docker-Build
// (Railway) gibt es keine Datenbank – statisches Vorrendern würde den Build
// abbrechen.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const org = await db.organization.findFirst();
  const allowed = org?.allowSelfRegistration ?? false;

  return (
    <main className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-navy-900 p-12 text-white lg:flex">
        <Wordmark className="text-xl" />
        <div>
          <p className="eyebrow !text-navy-300">Konto erstellen</p>
          <h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight tracking-tight">
            In einer Minute startklar
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-navy-200">
            Lege dein Konto an und erfasse sofort deine ersten Belege. Als Mitglied siehst du nur
            deine eigenen Belege und Auswertungen.
          </p>
        </div>
        <p className="text-xs text-navy-400">
          incub:live – Die Unternehmensgruppe für spezialisiertes Personal
        </p>
      </div>

      <div className="flex w-full items-center justify-center bg-surface-muted p-6 dark:bg-navy-950 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark className="text-2xl" />
          </div>
          <p className="eyebrow">Registrierung</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Konto erstellen</h2>

          <div className="mt-6">
            {allowed ? (
              <RegisterForm />
            ) : (
              <div className="card p-6 text-sm text-navy-500 dark:text-navy-300">
                Die Selbst-Registrierung ist derzeit deaktiviert. Bitte wende dich an deinen Admin,
                um einen Zugang zu erhalten.
              </div>
            )}
          </div>

          <p className="mt-4 text-center text-sm text-navy-400">
            Schon ein Konto?{" "}
            <Link href="/login" className="text-navy-700 underline underline-offset-2 dark:text-navy-200">
              Anmelden
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
