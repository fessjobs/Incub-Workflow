import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Layout } from '@/components/Layout';

/**
 * Landepunkt für Magic Link und Google. Der Supabase-Client tauscht den Code
 * aus der URL selbst gegen eine Session ein (detectSessionInUrl), wir warten
 * hier nur, bis der Store das mitbekommen hat.
 */
export function AuthCallback() {
  const session = useAuthStore((s) => s.session);
  const navigate = useNavigate();

  useEffect(() => {
    if (session === undefined) return;
    navigate(session ? '/' : '/login', { replace: true });
  }, [session, navigate]);

  return (
    <Layout>
      <p className="text-slate-400">Anmeldung wird abgeschlossen …</p>
    </Layout>
  );
}
