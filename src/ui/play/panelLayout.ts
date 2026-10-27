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

/**
 * Changes whenever the panel shows a new view, which then opens at the top. The menu and
 * every activity share one scroll box, so a view would otherwise open wherever the last
 * was scrolled: a boss fight opened from a scrolled Act menu hid its own title and clock.
 * A new Dex message counts, and so does a lesson's next card, since answering the last one
 * scrolled the panel down to its Next button.
 */
export function panelScrollKey(activity: Activity | null): string | undefined {
  if (activity?.kind === 'boss') return `boss:${String(activity.messages.length)}`;
  if (activity?.kind === 'lesson') {
    return `lesson:${activity.run.phase}:${String(activity.run.cardIndex)}`;
  }
  return activity?.kind;
}
