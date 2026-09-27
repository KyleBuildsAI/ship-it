import { endDrill } from '../../mentor/drillGuard';
import { bossSandboxChanged, bossTick } from './bossPlay';
import { missionSandboxChanged, missionTick } from './missionPlay';
import { play } from './playStore';
import { watchSandbox } from './sandboxControl';
import { seriesSandboxChanged, seriesTick } from './seriesPlay';

/** Routes a sandbox change to whatever is being played. */
function sandboxChanged(): void {
  const kind = play.get().activity?.kind;
  if (kind === 'mission') missionSandboxChanged();
  else if (kind === 'placement' || kind === 'review') seriesSandboxChanged();
  else if (kind === 'boss') bossSandboxChanged();
}

/** Drives drill clocks and boss twists. The UI calls it a few times a second. */
export function tickPlay(nowMs: number = Date.now()): void {
  const kind = play.get().activity?.kind;
  if (kind === 'mission') missionTick(nowMs);
  else if (kind === 'placement' || kind === 'review') seriesTick(nowMs);
  else if (kind === 'boss') bossTick(nowMs);
}

/** Leaves whatever is being played. The sandbox stays as it is, for free play. */
export function leavePlay(): void {
  endDrill();
  play.update({ activity: null, checklist: [] });
}

/** Starts grading sandbox changes. Called once at startup; returns a stop function. */
export function startPlay(): () => void {
  return watchSandbox(sandboxChanged);
}
