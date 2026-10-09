// Navigation der eigenständigen Datei (ein HTML, ohne Server): Adresse im
// Hash, z. B. #/admin/stunden. Wird beim Bündeln anstelle von nav.tsx genutzt.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

export const BASIS = "";
export const STANDALONE = true;

function abonnieren(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function lesen(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h === "" ? "/" : h;
}

export function usePath(): string {
  return useSyncExternalStore(abonnieren, lesen, () => "/");
}

export function vollerPfad(pfad: string): string {
  return "#" + pfad;
}

export function gehe(pfad: string, ersetzen = false): void {
  if (ersetzen) window.location.replace("#" + pfad);
  else window.location.hash = pfad;
  window.scrollTo(0, 0);
}

export function Link({ href, children, onClick, ...rest }: { href: string; children?: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const klick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    window.scrollTo(0, 0);
  };
  return (
    <a {...rest} href={"#" + href} onClick={klick}>
      {children}
    </a>
  );
}
