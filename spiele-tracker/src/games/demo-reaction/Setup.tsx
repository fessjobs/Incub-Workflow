import type { GameSetupProps } from '../types';
import type { ReactionConfig } from './config';

export function ReactionSetup({
  config,
  onConfigChange,
  onStart,
  starting,
}: GameSetupProps<ReactionConfig>) {
  return (
    <div className="space-y-6">
      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">Durchgänge</span>
        <input
          type="range"
          min={3}
          max={20}
          value={config.rounds}
          onChange={(e) => onConfigChange({ ...config, rounds: Number(e.target.value) })}
          className="w-full accent-accent"
        />
        <span className="mt-1 block text-2xl font-semibold tabular-nums">{config.rounds}</span>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">
          Maximale Wartezeit vor dem Signal
        </span>
        <input
          type="range"
          min={config.minDelayMs}
          max={10000}
          step={100}
          value={config.maxDelayMs}
          onChange={(e) => onConfigChange({ ...config, maxDelayMs: Number(e.target.value) })}
          className="w-full accent-accent"
        />
        <span className="mt-1 block text-2xl font-semibold tabular-nums">
          {(config.maxDelayMs / 1000).toFixed(1)} s
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
    </div>
  );
}
