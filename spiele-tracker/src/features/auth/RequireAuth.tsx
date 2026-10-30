import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Layout } from '@/components/Layout';

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (user === undefined) {
    return (
      <Layout>
        <p className="text-slate-400">Einen Moment …</p>
      </Layout>
    );
  }

  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
