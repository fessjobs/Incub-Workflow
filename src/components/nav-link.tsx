"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  number,
  compact = false,
  children,
}: {
  href: string;
  number?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  if (compact) {
    return (
      <Link
        href={href}
        className={active ? "font-semibold text-navy-900 dark:text-white" : "text-navy-400"}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-navy-900 font-medium text-white dark:bg-white dark:text-navy-900"
          : "text-navy-500 hover:bg-navy-50 dark:text-navy-300 dark:hover:bg-navy-800"
      }`}
    >
      {number && (
        <span
          className={`section-number ${active ? "!text-navy-300 dark:!text-navy-500" : ""}`}
        >
          {number}
        </span>
      )}
      {children}
    </Link>
  );
}
