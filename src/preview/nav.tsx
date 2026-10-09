"use client";
// Navigation des Prototyps unter /preview (Next.js). Adressen innerhalb des
// Prototyps sind relativ zu /preview: "/admin/stunden" → /preview/admin/stunden.
// Gewechselt wird mit der History-API – kein Serveraufruf pro Klick.
import { usePathname } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

export const BASIS = "/preview";
export const STANDALONE = false;

export function usePath(): string {
  const p = usePathname() ?? BASIS;
  const rel = p.startsWith(BASIS) ? p.slice(BASIS.length) : p;
  return rel === "" ? "/" : rel;
}

export function vollerPfad(pfad: string): string {
  return BASIS + (pfad === "/" ? "" : pfad);
}

export function gehe(pfad: string, ersetzen = false): void {
  const url = vollerPfad(pfad);
  if (ersetzen) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.scrollTo(0, 0);
}

export function Link({ href, children, onClick, ...rest }: { href: string; children?: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const klick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
    e.preventDefault();
    gehe(href);
  };
  return (
    <a {...rest} href={vollerPfad(href)} onClick={klick}>
      {children}
    </a>
  );
}
