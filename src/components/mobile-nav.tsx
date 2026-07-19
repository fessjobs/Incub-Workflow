"use client";

// Mobiles Menü: Top-Bar mit Wordmark + Burger, aufklappbares Vollbild-Panel
// mit großen Navigationspunkten (statt der gequetschten Inline-Links).
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = { href: string; label: string; number: string };

export function MobileNav({
  nav,
  userName,
  roleLabel,
  logout,
}: {
  nav: NavItem[];
  userName: string;
  roleLabel: string;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Menü bei Navigation schließen + Scroll sperren solange offen
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const current = nav.find(
    (n) => pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href))
  );

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-navy-100 bg-white dark:border-navy-800 dark:bg-navy-900 md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Wordmark />
          {current && !open && (
            <span className="truncate rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-medium text-navy-500 dark:bg-navy-800 dark:text-navy-300">
              {current.label}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label={open ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-navy-200 text-navy-700 dark:border-navy-700 dark:text-navy-200"
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <div className="fixed inset-x-0 top-[57px] bottom-0 z-30 flex flex-col overflow-y-auto bg-white dark:bg-navy-900">
          <nav className="flex-1 space-y-1 px-4 py-4">
            {nav.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium transition ${
                    active
                      ? "bg-navy-900 text-white dark:bg-white dark:text-navy-900"
                      : "text-navy-700 hover:bg-navy-50 dark:text-navy-200 dark:hover:bg-navy-800"
                  }`}
                >
                  <span className={`font-mono text-xs ${active ? "opacity-70" : "text-navy-300 dark:text-navy-600"}`}>
                    {item.number}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-navy-100 px-5 py-4 dark:border-navy-800">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="truncate text-xs text-navy-400">{roleLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <form action={logout}>
                  <button
                    type="submit"
                    className="rounded-lg border border-navy-200 px-3 py-2 text-sm text-navy-500 dark:border-navy-700 dark:text-navy-300"
                  >
                    Abmelden
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
