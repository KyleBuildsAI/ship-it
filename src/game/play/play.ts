import { endDrill } from '../../mentor/drillGuard';
import type { Pace } from '../agent/pace';
import { frameAgent } from './agentPlay';
import { bossSandboxChanged, bossTick } from './bossPlay';
import { lessonTick } from './lessonPlay';
import { frameMissionScene, missionSandboxChanged, missionTick } from './missionPlay';
import { play } from './playStore';
import { endScene } from './scenePlay';
import { watchSandbox } from './sandboxControl';
import { frameSeriesScene, seriesSandboxChanged, seriesTick } from './seriesPlay';

/** Routes a sandbox change to whatever is being played. */
function sandboxChanged(): void {
  const kind = play.get().activity?.kind;
  if (kind === 'mission') missionSandboxChanged();
  else if (kind === 'placement' || kind === 'review') seriesSandboxChanged();
  else if (kind === 'boss') bossSandboxChanged();
}

/** Drives drill clocks, boss twists and a final lesson's clock. The UI calls it often. */
export function tickPlay(nowMs: number = Date.now()): void {
  const kind = play.get().activity?.kind;
  if (kind === 'mission') missionTick(nowMs);
  else if (kind === 'placement' || kind === 'review') seriesTick(nowMs);
  else if (kind === 'boss') bossTick(nowMs);
  else if (kind === 'lesson') lessonTick(nowMs);
}

/**
 * Moves Otto on by one drawn frame: a directed step, or a judgment drill's scene. The UI
 * calls it from its frame loop with the time since the last frame, never from tickPlay:
 * at 4 ticks a second his typing would come in bursts. The UI also chooses the pace
 * (pace.ts choosePace), since it knows the browser's settings. `nowMs` is when a scene
 * that ends in this frame starts its drill's clock.
 */
export function framePlay(elapsedMs: number, pace: Pace, nowMs: number = Date.now()): void {
  const kind = play.get().activity?.kind;
  if (kind === 'mission') {
    frameAgent(elapsedMs, pace);
    frameMissionScene(elapsedMs, pace, nowMs);
  } else if (kind === 'placement' || kind === 'review') {
    frameSeriesScene(elapsedMs, pace, nowMs);
  }
}

/** Leaves whatever is being played. The sandbox stays as it is, for free play. */
export function leavePlay(): void {
  endDrill();
  endScene();
  play.update({ activity: null, checklist: [] });
}

/** Starts grading sandbox changes. Called once at startup; returns a stop function. */
export function startPlay(): () => void {
  return watchSandbox(sandboxChanged);
}
