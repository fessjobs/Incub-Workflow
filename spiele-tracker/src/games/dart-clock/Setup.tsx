import type { GameSetupProps } from '../types';
import type { DartClockConfig } from './config';

export function DartClockSetup({
  config,
  onConfigChange,
  onStart,
  starting,
}: GameSetupProps<DartClockConfig>) {
  return (
    <div className="space-y-6">
      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">Zeitlimit je Spieler</span>
        <input
          type="range"
          min={30}
          max={300}
          step={10}
          value={config.timeLimitSec}
          onChange={(e) => onConfigChange({ ...config, timeLimitSec: Number(e.target.value) })}
          className="w-full accent-accent"
        />
        <span className="mt-1 block text-2xl font-semibold tabular-nums">
          {config.timeLimitSec} s
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">Pfeile pro Runde</span>
        <input
          type="range"
          min={1}
          max={12}
          value={config.arrowsPerRound}
          onChange={(e) => onConfigChange({ ...config, arrowsPerRound: Number(e.target.value) })}
          className="w-full accent-accent"
        />
        <span className="mt-1 block text-2xl font-semibold tabular-nums">
          {config.arrowsPerRound}
        </span>
      </label>

      <button
        type="button"
        onClick={onStart}
        disabled={starting}
        className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-surface disabled:opacity-50"
      >
        {starting ? 'Session wird angelegt …' : 'Los'}
      </button>

      <p className="text-sm text-slate-500">
        Die Zielzahl kennt die App selbst — du tippst nur, was du getroffen hast.
        Jedes Feld zählt, egal ob Single, Double oder Triple.
      </p>
    </div>
  );
}
