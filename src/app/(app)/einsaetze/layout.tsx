import { requireModuleUser, canDispo, canReview, canManageRules, canSeeMoney } from "@/lib/einsatz/access";
import { NavLink } from "@/components/nav-link";

// Unternavigation des Einsatzmoduls
export default async function EinsaetzeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireModuleUser();
  const links = [
    { href: "/einsaetze", label: "Einsätze" },
    ...(canReview(user) ? [{ href: "/einsaetze/freigabe", label: "Freigabe" }] : []),
    // Abrechnung und Projekte zeigen Zahlen – nur für Admin und Buchhaltung
    ...(canSeeMoney(user) ? [{ href: "/einsaetze/abrechnung", label: "Abrechnung" }, { href: "/einsaetze/projekte", label: "Projekte" }] : []),
    ...(canDispo(user) ? [{ href: "/einsaetze/kunden", label: "Kunden" }, { href: "/einsaetze/personal", label: "Personal" }] : []),
    ...(canManageRules(user) ? [{ href: "/einsaetze/lohnarten", label: "Lohnarten" }] : []),
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {links.map((l) => (
          <NavLink key={l.href} href={l.href} compact>
            {l.label}
          </NavLink>
        ))}
      </div>
      {children}
    </div>
  );
}
