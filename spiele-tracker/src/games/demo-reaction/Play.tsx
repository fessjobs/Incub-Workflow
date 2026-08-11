import { useCallback, useEffect, useRef, useState } from 'react';
import type { GamePlayProps } from '../types';
import type { ReactionConfig } from './config';

type Phase = 'waiting' | 'ready' | 'done';

/**
 * Demo-Spiel. Der Sinn ist nicht das Spiel, sondern der Nachweis, dass die
 * Hülle alles Nötige liefert: append(), elapsedMs, finish() – und dass die
 * Auswertung danach allein aus den geschriebenen Events entsteht.
 */
export function ReactionPlay({ config, events, append, finish }: GamePlayProps<ReactionConfig>) {
  const [phase, setPhase] = useState<Phase>('waiting');
  const timeoutRef = useRef<number | undefined>(undefined);

  const signals = events.filter((e) => e.type === 'signal').length;
  const taps = events.filter((e) => e.type === 'tap').length;
  const round = Math.min(taps + 1, config.rounds);
  const finished = taps >= config.rounds;

  const scheduleSignal = useCallback(() => {
    const delay =
      config.minDelayMs + Math.random() * Math.max(0, config.maxDelayMs - config.minDelayMs);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setPhase('ready');
      append({ type: 'signal', source: 'system' });
    }, delay);
  }, [append, config.maxDelayMs, config.minDelayMs]);

  useEffect(() => {
    if (finished) {
      setPhase('done');
      window.clearTimeout(timeoutRef.current);
      return;
    }
    if (phase === 'waiting' && signals === taps) {
      scheduleSignal();
    }
    return () => window.clearTimeout(timeoutRef.current);
  }, [finished, phase, scheduleSignal, signals, taps]);

  function handleTap() {
    if (phase === 'ready') {
      append({ type: 'tap', source: 'tap' });
      setPhase('waiting');
    } else if (phase === 'waiting') {
      // Fehlstart: auch das gehört ins Log, sonst fehlt es später in der Statistik.
      append({ type: 'early', source: 'tap' });
      window.clearTimeout(timeoutRef.current);
      setPhase('waiting');
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          Durchgang {round} / {config.rounds}
        </span>
        <span>{events.filter((e) => e.type === 'early').length} Fehlstarts</span>
      </div>

      <button
        type="button"
        onClick={handleTap}
        disabled={finished}
        className={[
          'mt-4 flex flex-1 items-center justify-center rounded-3xl text-3xl font-bold transition-colors',
          phase === 'ready' ? 'bg-good text-surface' : 'bg-surface-raised text-slate-400',
          finished ? 'opacity-60' : '',
        ].join(' ')}
      >
        {finished ? 'Fertig' : phase === 'ready' ? 'JETZT' : 'Warten …'}
      </button>

      <button
        type="button"
        onClick={finish}
        className="mt-4 w-full rounded-xl border border-surface-border px-6 py-4 text-lg font-semibold"
      >
        {finished ? 'Zur Auswertung' : 'Abbrechen und auswerten'}
      </button>
    </div>
  );
}
