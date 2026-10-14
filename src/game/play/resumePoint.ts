import { saveWorkbench } from '../../engine/workbench';
import type { MissionRun } from '../missions/runner';
import { saveProgressNow } from '../progress';
import type { MissionResume } from '../save/schema';
import type { MissionActivity } from './playStore';
import { currentWorkspace } from './sandboxControl';
import { recordResume } from './saveRules';

/**
 * Where an attempt has got to, for the save (MissionProgress.resume). Taken when a step or
 * drill finishes, so a resumed sim starts exactly as its step began. The sandbox is kept
 * only for a sim step on Act 2's Workbench: drills load their own, and a laptop isn't kept.
 */
export function resumePoint(
  current: MissionActivity,
  run: MissionRun,
  xpEarned: number,
): MissionResume {
  const ws = currentWorkspace();
  return {
    stepIndex: run.stepIndex,
    workbench: run.phase === 'sim' && ws.machine === null ? saveWorkbench(ws) : null,
    drillResults: run.drillResults.map(({ drillId, passed, seconds, overtime }) => ({
      drillId,
      passed,
      seconds,
      overtime,
    })),
    xpEarned,
    stars: { ...current.stars },
    slips: [...current.slips],
  };
}

/** Saves where this attempt has got to, so leaving or reloading picks it up there. */
export function saveResume(current: MissionActivity, run: MissionRun, xpEarned: number): void {
  const resume = resumePoint(current, run, xpEarned);
  saveProgressNow((save) => recordResume(save, current.mission.id, resume));
}
