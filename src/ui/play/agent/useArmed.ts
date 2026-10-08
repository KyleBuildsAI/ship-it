import { useEffect, useState } from 'react';

/**
 * How long a decision card ignores clicks after it appears. At the instant pace one frame
 * can run Otto from one gate to the next, and two gates can put Allow in the same spot, so
 * the second click of a double-click would approve a card Kyle never read.
 */
export const ARM_MS = 300;

/**
 * False until the card has been on screen for ARM_MS. The parent keys each card by the
 * decision it is for, so a new gate mounts afresh and starts unarmed.
 */
export function useArmed(delayMs: number = ARM_MS): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setArmed(true);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [delayMs]);
  return armed;
}
