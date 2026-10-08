import { beginDrill, endDrill } from '../../mentor/drillGuard';
import type { Pace } from '../agent/pace';
import {
  answerFits,
  gradeJudgment,
  unansweredKey,
  type JudgmentAnswer,
  type JudgmentGrade,
} from '../missions/judgment';
import { explain, evaluate } from '../missions/predicates';
import { placementResult, scoreDrill } from '../missions/grading';
import { isJudgmentDrill, requirePlacement } from '../missions/schema';
import { localDay } from '../progression/days';
import { dailySet } from '../progression/reviewQueue';
import { progress, saveProgressNow } from '../progress';
import { allMissions, findDrill, getAct } from './catalog';
import { play, type SeriesActivity } from './playStore';
import { currentQueries, loadSandbox, scratchDeps } from './sandboxControl';
import { beginScene, endScene, frameScene } from './scenePlay';
import { recordDrill, recordPlacement, recordReview } from './saveRules';

/*
 * A series of timed drills with no hints and no Sage (DESIGN.md pillar 4): the Act's
 * placement test, or today's review set at the Standup Board.
 */

function activity(): SeriesActivity | null {
  const current = play.get().activity;
  return current?.kind === 'placement' || current?.kind === 'review' ? current : null;
}

function setActivity(next: SeriesActivity): void {
  const active = next.active === null ? undefined : next.drills[next.active.index];
  // A judgment drill's checklist would give its answer away, so it shows none.
  const hidden = active === undefined || isJudgmentDrill(active);
  play.update({
    activity: next,
    checklist: hidden ? [] : explain(active.success, currentQueries()),
  });
}

function begin(
  kind: SeriesActivity['kind'],
  act: number | null,
  drillIds: readonly string[],
): void {
  endDrill();
  endScene();
  setActivity({
    kind,
    act,
    drills: drillIds.map(findDrill),
    active: null,
    results: [],
    placement: null,
    scene: null,
  });
}

/** An Act's placement test: 85% or better tests out of the whole Act. */
export function startPlacement(act: number): void {
  begin('placement', act, requirePlacement(getAct(act).act).drillIds);
}

/** Today's Standup Board set: 5 to 10 review items, most overdue first. */
export function startReview(now: Date = new Date()): void {
  const save = progress.get().save;
  if (save === null) return;
  const known = new Set(allMissions().flatMap((mission) => mission.drills.map((d) => d.id)));
  const items = dailySet(save.reviewQueue, localDay(now)).filter((item) => known.has(item.drillId));
  begin(
    'review',
    null,
    items.map((item) => item.drillId),
  );
}

/** Today's review items that this build has content for. */
export function reviewItemsToday(now: Date = new Date()): number {
  const save = progress.get().save;
  if (save === null) return 0;
  return dailySet(save.reviewQueue, localDay(now)).filter((item) => item.dueOn <= localDay(now))
    .length;
}

/**
 * Loads the next drill and starts its clock. A judgment drill with a history plays its
 * scene first, and its clock starts when the scene ends (frameSeriesScene).
 */
export function startNextSeriesDrill(nowMs: number = Date.now()): void {
  const current = activity();
  if (current?.active !== null || current.scene !== null) return;
  const index = current.results.length;
  const drill = current.drills[index];
  if (drill === undefined) return;
  const label = current.kind === 'placement' ? 'Placement test' : 'Review';
  loadSandbox(
    drill.setup,
    `${label} ${String(index + 1)} of ${String(current.drills.length)}. No hints, no Sage.`,
  );
  beginDrill(`${current.kind}:${drill.id}`);
  if (isJudgmentDrill(drill) && beginScene(drill)) {
    setActivity({ ...current, scene: { index: 0 } });
    return;
  }
  setActivity({ ...current, active: { index, startedAtMs: nowMs } });
}

/** Plays the next drill's scene on by one drawn frame, and starts its clock when it ends. */
export function frameSeriesScene(elapsedMs: number, pace: Pace, nowMs: number): void {
  const current = activity();
  if (current?.scene == null) return;
  const index = current.results.length;
  const drill = current.drills[index];
  if (drill === undefined) return;
  const frame = frameScene(drill.id, elapsedMs, pace);
  if (frame === null) return;
  // The scene drove Otto's lines, so a listener may have changed the activity meanwhile.
  const latest = activity() ?? current;
  if (frame.done) setActivity({ ...latest, scene: null, active: { index, startedAtMs: nowMs } });
  else if (frame.index !== current.scene.index) {
    setActivity({ ...latest, scene: { index: frame.index } });
  }
}

/**
 * Scores the drill on the clock. `graded` is Kyle's answer to a judgment drill; without
 * one, a judgment drill was never answered (time ran out, or he gave up), so it's a miss.
 */
function finish(current: SeriesActivity, nowMs: number, graded: JudgmentGrade | null = null): void {
  if (current.active === null) return;
  const drill = current.drills[current.active.index];
  if (drill === undefined) return;
  const seconds = (nowMs - current.active.startedAtMs) / 1000;
  const passed = isJudgmentDrill(drill)
    ? (graded?.passed ?? false)
    : evaluate(drill.success, currentQueries());
  const score = scoreDrill(passed, seconds, drill.timeLimitSeconds);
  endDrill();
  const now = new Date(nowMs);
  saveProgressNow((save) =>
    current.kind === 'review'
      ? recordReview(save, drill, score, now)
      : recordDrill(save, drill, score, now),
  );
  // An unanswered judgment drill still names its right answer in the reveal.
  const keyId =
    graded?.keyId ?? (isJudgmentDrill(drill) ? unansweredKey(drill, scratchDeps()) : undefined);
  const results = [
    ...current.results,
    { drillId: drill.id, ...score, ...(keyId === undefined ? {} : { keyId }) },
  ];
  const done = results.length === current.drills.length;
  let placement = current.placement;
  if (done && current.kind === 'placement' && current.act !== null) {
    const { act, missions } = getAct(current.act);
    placement = placementResult(results, requirePlacement(act).passPercent);
    const result = placement;
    saveProgressNow((save) => recordPlacement(save, act, missions, result, now));
  }
  setActivity({ ...current, active: null, results, placement });
}

/** Passes the drill the moment its target state is reached. */
export function seriesSandboxChanged(nowMs: number = Date.now()): void {
  const current = activity();
  if (current?.active == null) return;
  const drill = current.drills[current.active.index];
  // A judgment drill is graded by Kyle's answer, never by the sandbox reaching a state.
  if (drill !== undefined && isJudgmentDrill(drill)) return;
  if (drill !== undefined && evaluate(drill.success, currentQueries())) finish(current, nowMs);
  else setActivity(current);
}

export function seriesTick(nowMs: number = Date.now()): void {
  const current = activity();
  if (current?.active == null) return;
  const drill = current.drills[current.active.index];
  if (drill === undefined) return;
  if (nowMs - current.active.startedAtMs >= drill.timeLimitSeconds * 1000) finish(current, nowMs);
}

/**
 * Kyle's answer to the judgment drill `drillId`, if it is the one on the clock, graded by
 * running the drill in a scratch copy (judgment.ts). A review records it with SM-2; a miss
 * stays in the queue. Like submitJudgment, a stale or misshapen answer does nothing.
 */
export function submitSeriesJudgment(
  drillId: string,
  answer: JudgmentAnswer,
  nowMs: number = Date.now(),
): void {
  const current = activity();
  if (current?.active == null) return;
  const drill = current.drills[current.active.index];
  if (drill === undefined || !isJudgmentDrill(drill) || drill.id !== drillId) return;
  if (!answerFits(drill, answer)) return;
  finish(current, nowMs, gradeJudgment(drill, answer, scratchDeps()));
}

/** "I'm done": grades the drill as it stands. */
export function submitSeriesDrill(nowMs: number = Date.now()): void {
  const current = activity();
  if (current !== null) finish(current, nowMs);
}
