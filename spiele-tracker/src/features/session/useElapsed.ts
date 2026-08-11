import { useEffect, useRef, useState } from 'react';

/**
 * Tickt die verstrichene Zeit, solange `active` gilt.
 *
 * Bewusst über requestAnimationFrame statt setInterval: ein Countdown, der
 * aus 2,5 Metern gelesen wird, darf nicht springen. performance.now() als
 * Basis, damit eine Systemzeitkorrektur die Uhr nicht verschiebt.
 */
export function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      return;
    }

    startRef.current = performance.now();
    let frame = 0;

    const tick = () => {
      if (startRef.current !== null) {
        setElapsed(performance.now() - startRef.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [active]);

  return elapsed;
}
