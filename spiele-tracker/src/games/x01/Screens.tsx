import type { GameSetupProps, GameResultProps } from '../types';
import type { X01Config } from './config';

export function X01Setup({ config, onConfigChange, onStart, starting }: GameSetupProps<X01Config>) {
  return (
    <div className="space-y-6">
      <div>
        <span className="mb-2 block text-sm text-slate-400">Startpunktzahl</span>
        <div className="grid grid-cols-3 gap-2">
          {[301, 501, 701].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onConfigChange({ ...config, startScore: n })}
              aria-pressed={config.startScore === n}
              className={[
                'rounded-xl border py-3 text-lg font-semibold tabular-nums',
                config.startScore === n
                  ? 'border-accent bg-accent-muted text-slate-100'
                  : 'border-surface-border text-slate-400',
              ].join(' ')}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-xl bg-surface-raised p-4">
        <span>
          <span className="block font-semibold">Double Out</span>
          <span className="block text-sm text-slate-400">
            Das Spiel muss mit einem Doppel oder Bullseye beendet werden.
          </span>
        </span>
        <input
          type="checkbox"
          checked={config.doubleOut}
          onChange={(e) => onConfigChange({ ...config, doubleOut: e.target.checked })}
          className="h-6 w-6 shrink-0 accent-accent"
        />
      </label>

      <button
        type="button"
        onClick={onStart}
        disabled={starting}
        className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-surface disabled:opacity-50"
      >
        {starting ? 'Session wird angelegt …' : 'Los'}
      </button>
    </div>
  );
}

export function X01Result({ stats }: GameResultProps<X01Config>) {
  const turnScores = (stats.detail.turnScores as number[] | undefined) ?? [];
  const max = Math.max(60, ...turnScores);

  return (
    <div className="space-y-6">
      <p className="text-xl font-semibold">{stats.headline}</p>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Average (3 Darts)" value={stats.metrics.average3.toFixed(1)} />
        <Tile label="Beste Aufnahme" value={String(stats.metrics.bestTurn)} />
        <Tile label="Pfeile" value={String(stats.metrics.dartsThrown)} />
        <Tile label="Busts" value={String(stats.metrics.busts)} />
      </div>

      {turnScores.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">Aufnahmen</h2>
          <ul className="space-y-1">
            {turnScores.map((score, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-6 text-right text-xs text-slate-500">{i + 1}</span>
                <span className="h-5 flex-1 rounded bg-surface-raised">
                  <span
                    className="block h-full rounded"
                    style={{
                      width: `${(score / max) * 100}%`,
                      background: score === 0 ? '#E11D48' : '#0891B2',
                    }}
                  />
                </span>
                <span className="w-10 text-right text-sm tabular-nums">{score}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-600">Rote Balken sind Busts.</p>
        </section>
      )}

      {stats.insights.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-400">
          {stats.insights.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-raised p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
