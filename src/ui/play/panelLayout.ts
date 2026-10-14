import type { Activity } from '../../game/play/playStore';

/**
 * The play panel's classes. With the terminal open the panel normally shrinks to sit above
 * it, since the terminal is where the work happens. The Question Round never uses the
 * terminal, and squeezed into that space its ticket and candidates scroll in a tiny box,
 * so there it keeps its full height and is drawn over the idle terminal instead.
 */
export function panelClassName(terminalOpen: boolean, activity: Activity | null): string {
  if (!terminalOpen) return 'glass play-panel';
  const questionRound = activity?.kind === 'mission' && activity.run.phase === 'question';
  return questionRound
    ? 'glass play-panel play-panel--over-terminal'
    : 'glass play-panel play-panel--above-terminal';
}
