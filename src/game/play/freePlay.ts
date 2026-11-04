import type { FixtureStep } from '../../engine/fixtures';
import { closeActMenu, openTerminal } from '../hud';
import { zoneForAct } from '../world/zones';
import { travelTo } from '../worldState';
import { leavePlay } from './play';
import { loadSandbox } from './sandboxControl';

/**
 * Free play: a sandbox with nothing to grade, to try things in. It leaves whatever was
 * being played first, so no mission grades what's typed here, then puts the terminal in
 * front with the cursor in it. It takes the player to `act`'s island, as a mission does,
 * so what's typed shows there too: the laptop's terraces light up on Act 1's.
 */
export function startFreePlay(act: number, steps: readonly FixtureStep[], notice: string): void {
  leavePlay();
  loadSandbox(steps, notice);
  closeActMenu();
  openTerminal();
  travelTo(zoneForAct(act));
}
