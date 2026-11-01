import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { LoginPage } from '@/features/auth/LoginPage';
import { AuthCallback } from '@/features/auth/AuthCallback';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { GameRoute } from '@/features/session/GameRoute';
import { HomePage } from '@/pages/HomePage';
import { PlayersPage } from '@/pages/PlayersPage';

export function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => init(), [init]);

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
        path="/spieler"
        element={
          <RequireAuth>
            <PlayersPage />
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
