import { requireAdmin } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">03 / Einstellungen</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Einstellungen</h1>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-navy-100 pb-3 dark:border-navy-800">
        <NavLink href="/einstellungen/firmen" compact>
          Firmen
        </NavLink>
        <span className="text-navy-200 dark:text-navy-700">·</span>
        <NavLink href="/einstellungen/kategorien" compact>
          Kategorien
        </NavLink>
        <span className="text-navy-200 dark:text-navy-700">·</span>
        <NavLink href="/einstellungen/nutzer" compact>
          Accounts
        </NavLink>
        <span className="text-navy-200 dark:text-navy-700">·</span>
        <NavLink href="/einstellungen/rollen" compact>
          Rollen
        </NavLink>
        <span className="text-navy-200 dark:text-navy-700">·</span>
        <NavLink href="/einstellungen/karten" compact>
          Firmenkarten
        </NavLink>
        <span className="text-navy-200 dark:text-navy-700">·</span>
        <NavLink href="/einstellungen/organisation" compact>
          Organisation
        </NavLink>
        <span className="text-navy-200 dark:text-navy-700">·</span>
        <NavLink href="/einstellungen/speicher" compact>
          Speicher
        </NavLink>
      </nav>
      {children}
    </div>
  );
}
