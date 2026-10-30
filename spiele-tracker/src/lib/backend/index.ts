import { supabaseConfigured } from '@/lib/supabase';
import { localBackend } from './localBackend';
import { supabaseBackend } from './supabaseBackend';
import type { Backend } from './types';

/**
 * Welches Backend läuft?
 *
 * Ohne Supabase-Zugangsdaten startet die App im Testmodus und speichert alles
 * im Browser. Das ist kein Notbehelf, sondern Absicht: so lässt sich die App
 * neben der Dartscheibe ausprobieren, bevor irgendein Server existiert.
 *
 * Mit `?test=1` in der Adresse lässt sich der Testmodus auch dann erzwingen,
 * wenn Zugangsdaten vorhanden sind — praktisch, um etwas auszuprobieren, ohne
 * echte Sessions in die Statistik zu schreiben.
 */
function forcedByUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  if (search.get('test') === '1') return true;
  // Bei HashRouter landen Parameter manchmal hinter der Raute.
  const hash = window.location.hash;
  return hash.includes('test=1');
}

export const testMode = !supabaseConfigured || forcedByUrl();

export const backend: Backend = testMode ? localBackend : supabaseBackend;

export * from './types';
export { clearLocalData } from './localBackend';
