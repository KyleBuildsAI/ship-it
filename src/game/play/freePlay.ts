import type { FixtureStep } from '../../engine/fixtures';
import { closeActMenu, openTerminal } from '../hud';
import { leavePlay } from './play';
import { loadSandbox } from './sandboxControl';

/**
 * Free play: a sandbox with nothing to grade, to try things in. It leaves whatever was
 * being played first, so no mission grades what's typed here, then puts the terminal in
 * front with the cursor in it.
 */
export function startFreePlay(steps: readonly FixtureStep[], notice: string): void {
  leavePlay();
  loadSandbox(steps, notice);
  closeActMenu();
  openTerminal();
}
