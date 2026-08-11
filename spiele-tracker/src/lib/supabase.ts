import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Ohne Konfiguration soll die App nicht mit einem kryptischen Netzwerkfehler
 * sterben, sondern klar sagen, was fehlt. Deshalb prüfen wir hier und zeigen
 * in App.tsx einen Hinweis, statt die Wurzel zu rendern.
 */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'anon-key-missing',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
