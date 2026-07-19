import { requireUser } from "@/lib/auth";
import { Wordmark } from "@/components/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLink } from "@/components/nav-link";
import { MobileNav } from "@/components/mobile-nav";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  const nav = [
    { href: "/dashboard", label: "Dashboard", number: "01" },
    { href: "/belege", label: "Belege", number: "02" },
    { href: "/schnell", label: "Schnell-Upload", number: "03" },
    { href: "/auswertungen", label: "Auswertungen", number: "04" },
    { href: "/abgleich", label: "Abgleich", number: "05" },
    ...(isAdmin
      ? [
          { href: "/setcards", label: "Setcards", number: "06" },
          { href: "/einstellungen", label: "Einstellungen", number: "07" },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-navy-100 bg-white dark:border-navy-800 dark:bg-navy-900 md:flex">
        <div className="border-b border-navy-100 px-6 py-5 dark:border-navy-800">
          <Wordmark className="text-lg" />
          <p className="mt-0.5 text-[11px] text-navy-400">Belege. Erledigt.</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} number={item.number}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-navy-100 px-4 py-4 dark:border-navy-800">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-navy-400">
                {user.role === "ADMIN" ? "Admin" : user.role === "BUCHHALTUNG" ? "Buchhaltung" : "Mitglied"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-lg border border-navy-200 p-2 text-navy-500 transition hover:bg-navy-50 dark:border-navy-700 dark:text-navy-300 dark:hover:bg-navy-800"
                  title="Abmelden"
                  aria-label="Abmelden"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 17l5-5-5-5M21 12H9" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile: Top-Bar mit Burger-Menü */}
      <MobileNav
        nav={nav}
        userName={user.name}
        roleLabel={user.role === "ADMIN" ? "Admin" : user.role === "BUCHHALTUNG" ? "Buchhaltung" : "Mitglied"}
        logout={logout}
      />

      <main className="w-full px-4 pb-12 pt-20 md:pl-60 md:pt-0">
        <div className="mx-auto max-w-6xl px-0 py-8 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}
