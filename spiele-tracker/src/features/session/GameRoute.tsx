import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getGame } from '@/games';
import type { AppendableEvent, StatsResult } from '@/games/types';
import { useSessionStore } from './sessionStore';
import { useAuthStore } from '@/store/authStore';
import { useElapsed } from './useElapsed';
import { TagPicker } from './TagPicker';
import { Layout } from '@/components/Layout';

/**
 * Treibt jedes Spiel durch Setup → Live → Auswertung.
 *
 * Diese Datei enthält bewusst keinerlei Spielwissen. Sie kennt nur das
 * GameDefinition-Interface. Wenn hier jemals eine Zeile mit "dart" steht,
 * ist etwas an der falschen Stelle gelandet.
 */
export function GameRoute() {
  const { gameId = '' } = useParams();
  const game = getGame(gameId);

  const playerId = useAuthStore((s) => s.user?.id ?? null);
  const phase = useSessionStore((s) => s.phase);
  const events = useSessionStore((s) => s.events);
  const pendingCount = useSessionStore((s) => s.pendingCount);
  const storeError = useSessionStore((s) => s.error);
  const start = useSessionStore((s) => s.start);
  const append = useSessionStore((s) => s.append);
  const correct = useSessionStore((s) => s.correct);
  const finish = useSessionStore((s) => s.finish);
  const reset = useSessionStore((s) => s.reset);

  const [config, setConfig] = useState<unknown>(game?.defaultConfig);
  const [tags, setTags] = useState<string[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);

  const elapsedMs = useElapsed(phase === 'running');

  // Beim Verlassen der Route eine noch offene Session nicht liegen lassen.
  useEffect(() => reset, [reset]);

  const stats: StatsResult | null = useMemo(() => {
    if (!game || phase !== 'finished') return null;
    return game.computeStats(events, config);
  }, [game, phase, events, config]);

  const handleStart = useCallback(async () => {
    if (!game || !playerId) return;
    const parsed = game.configSchema.safeParse(config);
    if (!parsed.success) {
      setConfigError(parsed.error.issues.map((i) => i.message).join(', '));
      return;
    }
    setConfigError(null);
    await start({ gameId: game.id, config: parsed.data, playerId, tags });
  }, [game, playerId, config, tags, start]);

  const handleFinish = useCallback(() => {
    if (!game) return;
    // Die Statistik wird aus dem Log gerechnet, nicht mitgeführt.
    void finish(game.computeStats(useSessionStore.getState().events, config));
  }, [game, finish, config]);

  const handleAppend = useCallback((event: AppendableEvent) => append(event), [append]);
  const handleCorrect = useCallback(
    (targetId: number | undefined, patch: AppendableEvent) => correct(targetId, patch),
    [correct],
  );

  if (!game) {
    return (
      <Layout title="Unbekanntes Spiel">
        <p className="text-slate-400">
          Für „{gameId}“ ist kein Spiel registriert.{' '}
          <Link to="/" className="text-accent underline">
            Zurück zur Übersicht
          </Link>
        </p>
      </Layout>
    );
  }

  const { SetupComponent, PlayComponent, ResultComponent } = game;

  if (phase === 'running' || phase === 'finishing') {
    // Live-Screen ohne Layout-Rahmen: alles ohne Scrollen bedienbar.
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-3 safe-bottom">
        {pendingCount > 0 && (
          <p className="mb-1 text-right text-xs text-slate-600">{pendingCount} ausstehend</p>
        )}
        <PlayComponent
          config={config}
          events={events}
          append={handleAppend}
          correct={handleCorrect}
          elapsedMs={elapsedMs}
          finish={handleFinish}
          playerId={playerId}
        />
      </div>
    );
  }

  if (phase === 'finished' && stats) {
    return (
      <Layout title="Auswertung">
        <ResultComponent config={config} events={events} stats={stats} />
        <div className="mt-8 space-y-3">
          <p className="text-sm text-slate-500">
            {events.length} Events aufgezeichnet · {game.xpFormula(stats)} XP
          </p>
          <button
            type="button"
            onClick={() => {
              reset();
              setConfig(game.defaultConfig);
            }}
            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-surface"
          >
            Nochmal
          </button>
          <Link
            to="/"
            className="block w-full rounded-xl border border-surface-border px-6 py-4 text-center text-lg font-semibold"
          >
            Zur Übersicht
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={game.name}>
      <p className="mb-6 text-slate-400">{game.description}</p>

      <SetupComponent
        config={config}
        onConfigChange={setConfig}
        onStart={() => void handleStart()}
        starting={phase === 'starting'}
      />

      <div className="mt-8">
        <TagPicker value={tags} onChange={setTags} />
      </div>

      {configError && <p className="mt-4 text-sm text-bad">{configError}</p>}
      {storeError && <p className="mt-4 text-sm text-bad">{storeError}</p>}
    </Layout>
  );
}
