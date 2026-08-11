import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { supabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { LoginPage } from '@/features/auth/LoginPage';
import { AuthCallback } from '@/features/auth/AuthCallback';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { GameRoute } from '@/features/session/GameRoute';
import { HomePage } from '@/pages/HomePage';
import { Layout } from '@/components/Layout';

export function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => init(), [init]);

  if (!supabaseConfigured) {
    return <MissingConfig />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/spielen/:gameId"
        element={
          <RequireAuth>
            <GameRoute />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function MissingConfig() {
  return (
    <Layout title="Supabase fehlt">
      <p className="text-slate-400">
        Lege eine <code className="text-slate-200">.env.local</code> nach dem Vorbild von{' '}
        <code className="text-slate-200">.env.example</code> an und trage{' '}
        <code className="text-slate-200">VITE_SUPABASE_URL</code> sowie{' '}
        <code className="text-slate-200">VITE_SUPABASE_ANON_KEY</code> ein. Danach den Dev-Server
        neu starten.
      </p>
    </Layout>
  );
}
