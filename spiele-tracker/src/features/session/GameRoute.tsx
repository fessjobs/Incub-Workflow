import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getGame } from '@/games';
import type { AppendableEvent, SessionPlayer, StatsResult } from '@/games/types';
import { useSessionStore } from './sessionStore';
import { useAuthStore } from '@/store/authStore';
import { useElapsed } from './useElapsed';
import { TagPicker } from './TagPicker';
import { PlayerPicker } from './PlayerPicker';
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

  const meId = useAuthStore((s) => s.user?.id ?? null);
  const myProfile = useAuthStore((s) => s.profile);
  const phase = useSessionStore((s) => s.phase);
  const events = useSessionStore((s) => s.events);
  const sessionPlayers = useSessionStore((s) => s.players);
  const activePlayerId = useSessionStore((s) => s.activePlayerId);
  const pendingCount = useSessionStore((s) => s.pendingCount);
  const storeError = useSessionStore((s) => s.error);
  const start = useSessionStore((s) => s.start);
  const append = useSessionStore((s) => s.append);
  const correct = useSessionStore((s) => s.correct);
  const setActivePlayer = useSessionStore((s) => s.setActivePlayer);
  const finish = useSessionStore((s) => s.finish);
  const reset = useSessionStore((s) => s.reset);

  const [config, setConfig] = useState<unknown>(game?.defaultConfig);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [shownPlayerId, setShownPlayerId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const elapsedMs = useElapsed(phase === 'running');

  // Beim Verlassen der Route eine noch offene Session nicht liegen lassen.
  useEffect(() => reset, [reset]);

  // Wer das Gerät in der Hand hat, spielt im Zweifel mit. Gilt auch für
  // Einzelspieler-Spiele, bei denen gar keine Auswahl angezeigt wird.
  useEffect(() => {
    if (!myProfile) return;
    setPlayers((current) =>
      current.length > 0
        ? current
        : [
            {
              id: myProfile.id,
              displayName: myProfile.displayName,
              avatarUrl: myProfile.avatarUrl,
            },
          ],
    );
  }, [myProfile]);

  /** Ein Ergebnis je Spieler – auch bei Einzelsessions. */
  const statsByPlayer: Record<string, StatsResult> = useMemo(() => {
    if (!game || phase !== 'finished') return {};
    const out: Record<string, StatsResult> = {};
    for (const player of sessionPlayers) {
      out[player.id] = game.computeStats(events, config, {
        playerId: player.id,
        players: sessionPlayers,
      });
    }
    return out;
  }, [game, phase, events, config, sessionPlayers]);

  const handleStart = useCallback(async () => {
    if (!game || !meId) return;

    const parsed = game.configSchema.safeParse(config);
    if (!parsed.success) {
      setSetupError(parsed.error.issues.map((i) => i.message).join(', '));
      return;
    }
    if (players.length < game.minPlayers) {
      setSetupError(
        `${game.name} braucht mindestens ${game.minPlayers} ${
          game.minPlayers === 1 ? 'Spieler' : 'Spieler'
        }.`,
      );
      return;
    }

    setSetupError(null);
    setShownPlayerId(players[0]?.id ?? null);
    await start({
      gameId: game.id,
      config: parsed.data,
      players,
      createdBy: meId,
      tags,
    });
  }, [game, meId, config, players, tags, start]);

  const handleFinish = useCallback(() => {
    if (!game) return;
    // Die Statistik wird aus dem Log gerechnet, nicht mitgeführt.
    const state = useSessionStore.getState();
    const out: Record<string, StatsResult> = {};
    for (const player of state.players) {
      out[player.id] = game.computeStats(state.events, config, {
        playerId: player.id,
        players: state.players,
      });
    }
    void finish(out);
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
          players={sessionPlayers}
          activePlayerId={activePlayerId}
          setActivePlayer={setActivePlayer}
        />
      </div>
    );
  }

  if (phase === 'finished') {
    const shown = shownPlayerId ?? sessionPlayers[0]?.id ?? null;
    const stats = shown ? statsByPlayer[shown] : undefined;

    return (
      <Layout title="Auswertung">
        {sessionPlayers.length > 1 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {sessionPlayers.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => setShownPlayerId(player.id)}
                aria-pressed={player.id === shown}
                className={[
                  'rounded-xl border px-3 py-2 text-sm',
                  player.id === shown
                    ? 'border-accent bg-accent-muted text-slate-100'
                    : 'border-surface-border text-slate-400',
                ].join(' ')}
              >
                {player.displayName}
              </button>
            ))}
          </div>
        )}

        {stats && (
          <>
            <ResultComponent
              config={config}
              events={events}
              stats={stats}
              allStats={statsByPlayer}
              players={sessionPlayers}
            />
            <p className="mt-8 text-sm text-slate-500">
              {events.length} Events aufgezeichnet · {game.xpFormula(stats)} XP
            </p>
          </>
        )}

        <div className="mt-4 space-y-3">
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

      <div className="mt-8 space-y-8">
        <PlayerPicker
          selected={players}
          onChange={setPlayers}
          min={game.minPlayers}
          max={game.maxPlayers}
          meId={meId}
        />
        <TagPicker value={tags} onChange={setTags} />
      </div>

      {setupError && <p className="mt-4 text-sm text-bad">{setupError}</p>}
      {storeError && <p className="mt-4 text-sm text-bad">{storeError}</p>}
    </Layout>
  );
}
