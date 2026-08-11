import { Link } from 'react-router-dom';
import { listGames } from '@/games';
import { Layout } from '@/components/Layout';

export function HomePage() {
  const games = listGames();

  return (
    <Layout title="Was wird gespielt?">
      <ul className="space-y-3">
        {games.map((game) => (
          <li key={game.id}>
            <Link
              to={`/spielen/${game.id}`}
              className="flex items-center gap-4 rounded-2xl bg-surface-raised p-4 active:bg-surface-overlay"
            >
              <span className="text-3xl" aria-hidden>
                {game.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{game.name}</span>
                <span className="block truncate text-sm text-slate-400">{game.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {games.length === 0 && (
        <p className="text-slate-400">Noch kein Spiel registriert.</p>
      )}

      <p className="mt-8 text-sm text-slate-600">
        Logbuch, Ranglisten, Profil und Shop folgen in den nächsten Blöcken.
      </p>
    </Layout>
  );
}
