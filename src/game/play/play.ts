import { endDrill } from '../../mentor/drillGuard';
import { missionSandboxChanged, missionTick } from './missionPlay';
import { play } from './playStore';
import { watchSandbox } from './sandboxControl';

/** Routes a sandbox change to whatever is being played. */
function sandboxChanged(): void {
  const kind = play.get().activity?.kind;
  if (kind === 'mission') missionSandboxChanged();
}

/** Drives drill clocks. The UI calls it a few times a second. */
export function tickPlay(nowMs: number = Date.now()): void {
  const kind = play.get().activity?.kind;
  if (kind === 'mission') missionTick(nowMs);
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
