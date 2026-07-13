import { requireUser } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";

export default async function AbgleichLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">04 / Abgleich</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Kontoauszug-Abgleich</h1>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-navy-100 pb-3 dark:border-navy-800">
        <NavLink href="/abgleich" compact>Übersicht</NavLink>
        <span className="text-navy-200 dark:text-navy-700">·</span>
        <NavLink href="/abgleich/konten" compact>Konten</NavLink>
        <span className="text-navy-200 dark:text-navy-700">·</span>
        <NavLink href="/abgleich/regeln" compact>Merkregeln</NavLink>
      </nav>
      {children}
    </div>
  );
}
