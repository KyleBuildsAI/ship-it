import { useEffect, useState } from 'react';
import { tickPlay } from '../../game/play/play';

/**
 * While `running`, drives drill clocks and boss twists four times a second and returns
 * the current time, so countdowns re-render. Stopped clocks cost nothing.
 */
export function useClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      tickPlay(time);
      setNow(time);
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [running]);
  return now;
}
