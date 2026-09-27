/** What a key press does to the suggested-command chip. */
export type ChipKeyAction = 'run' | 'dismiss' | null;

/**
 * The chip's keyboard shortcuts: Enter runs the command (or types it, when it needs the
 * player's words first) and Escape dismisses it. Both only count while the world has the
 * keyboard (`onWorld`), so Enter in the terminal still runs the terminal's line.
 */
export function chipKeyAction(key: {
  key: string;
  repeat: boolean;
  onWorld: boolean;
}): ChipKeyAction {
  if (!key.onWorld) return null;
  if (key.key === 'Escape') return 'dismiss';
  if (key.key === 'Enter' && !key.repeat) return 'run';
  return null;
}
