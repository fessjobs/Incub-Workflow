import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

/**
 * Rahmen für alle Screens außerhalb des Live-Spiels. Der Live-Screen läuft
 * bewusst ohne diesen Rahmen – dort zählt jeder Pixel.
 */
export function Layout({ children, title }: { children: ReactNode; title?: string }) {
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Spiele-Tracker
        </Link>
        {profile && (
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="max-w-[10rem] truncate">{profile.display_name}</span>
            <button type="button" onClick={() => void signOut()} className="underline">
              Abmelden
            </button>
          </div>
        )}
      </header>

      {title && <h1 className="mb-4 text-2xl font-bold tracking-tight">{title}</h1>}

      <main className="safe-bottom flex-1 pb-8">{children}</main>
    </div>
  );
}
