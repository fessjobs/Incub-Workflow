import { useEffect, useState } from 'react';
import { backend } from '@/lib/backend';
import {
  BUILT_IN_ACHIEVEMENTS,
  evaluateAchievements,
  type AchievementDef,
} from './evaluate';
import type { SessionPlayer, StatsResult } from '@/games/types';

/**
 * Prüft nach einer Session, welche Auszeichnungen dazugekommen sind, und
 * zeigt sie an.
 *
 * Läuft einmal je Session. Bereits freigeschaltete werden übersprungen,
 * sonst feiert die App bei jedem Spiel dasselbe.
 */
export function AchievementBanner({
  gameId,
  players,
  statsByPlayer,
}: {
  gameId: string;
  players: SessionPlayer[];
  statsByPlayer: Record<string, StatsResult>;
}) {
  const [unlocked, setUnlocked] = useState<Array<{ player: SessionPlayer; def: AchievementDef }>>(
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const found: Array<{ player: SessionPlayer; def: AchievementDef }> = [];

      for (const player of players) {
        const stats = statsByPlayer[player.id];
        if (!stats) continue;
        try {
          const [already, career] = await Promise.all([
            backend.achievements.unlocked(player.id),
            backend.sessions.careerFor(player.id),
          ]);
          const fresh = evaluateAchievements(BUILT_IN_ACHIEVEMENTS, {
            gameId,
            session: stats,
            career: { ...career, best: {}, totals: {} },
            already: new Set(already),
          });
          if (fresh.length > 0) {
            await backend.achievements.record(
              player.id,
              fresh.map((a) => a.id),
            );
            for (const def of fresh) found.push({ player, def });
          }
        } catch {
          // Auszeichnungen sind Zugabe – ein Fehler hier darf die
          // Auswertung nicht kaputt machen.
        }
      }

      if (!cancelled) setUnlocked(found);
    }

    void run();
    return () => {
      cancelled = true;
    };
    // Bewusst nur einmal je Session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (unlocked.length === 0) return null;

  return (
    <section className="rounded-2xl border border-warn/40 bg-warn/5 p-4">
      <h2 className="mb-3 text-base font-semibold text-warn">
        {unlocked.length === 1 ? 'Neue Auszeichnung' : `${unlocked.length} neue Auszeichnungen`}
      </h2>
      <ul className="space-y-3">
        {unlocked.map(({ player, def }) => (
          <li key={`${player.id}-${def.id}`} className="flex items-start gap-3">
            <span className="text-2xl leading-none" aria-hidden>
              {def.icon}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{def.name}</span>
              <span className="block text-sm text-slate-400">{def.description}</span>
              <span className="block text-xs text-slate-500">
                {player.displayName} · +{def.xpReward} XP
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
