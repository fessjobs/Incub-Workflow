"use client";
// Navigation des Prototyps unter /preview (Next.js). Adressen innerhalb des
// Prototyps sind relativ zu /preview: "/admin/stunden" → /preview/admin/stunden.
// Gewechselt wird mit der History-API – kein Serveraufruf pro Klick.
import { usePathname } from "next/navigation";
import { createContext, useContext, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

// Der Prototyp liegt unter /preview. Das echte neue System nutzt dieselben Seiten
// direkt unter / (/admin, /crew, /b/…): die Basis wird vom Einstieg gesetzt.
export const STANDALONE = false;

const BasisContext = createContext("/preview");
let aktuelleBasis = "/preview";

export function setzeBasis(b: string): void {
  aktuelleBasis = b;
}

export function BasisProvider({ basis, children }: { basis: string; children: ReactNode }) {
  setzeBasis(basis);
  return <BasisContext.Provider value={basis}>{children}</BasisContext.Provider>;
}

export function usePath(): string {
  const basis = useContext(BasisContext);
  const p = usePathname() ?? basis;
  const rel = basis !== "" && p.startsWith(basis) ? p.slice(basis.length) : p;
  return rel === "" ? "/" : rel;
}

export function vollerPfad(pfad: string, basis: string = aktuelleBasis): string {
  const v = basis + (pfad === "/" ? "" : pfad);
  return v === "" ? "/" : v;
}

export function gehe(pfad: string, ersetzen = false): void {
  const url = vollerPfad(pfad);
  if (ersetzen) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.scrollTo(0, 0);
}

export function Link({ href, children, onClick, ...rest }: { href: string; children?: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const basis = useContext(BasisContext);
  const klick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
    e.preventDefault();
    gehe(href);
  };
  return (
    <a {...rest} href={vollerPfad(href, basis)} onClick={klick}>
      {children}
    </a>
  );
}
