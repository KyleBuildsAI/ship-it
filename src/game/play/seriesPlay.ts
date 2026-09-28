import { beginDrill, endDrill } from '../../mentor/drillGuard';
import { explain, evaluate } from '../missions/predicates';
import { placementResult, scoreDrill } from '../missions/grading';
import { requirePlacement } from '../missions/schema';
import { localDay } from '../progression/days';
import { dailySet } from '../progression/reviewQueue';
import { progress, saveProgressNow } from '../progress';
import { allMissions, findDrill, getAct } from './catalog';
import { play, type SeriesActivity } from './playStore';
import { currentQueries, loadSandbox } from './sandboxControl';
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
  play.update({
    activity: next,
    checklist: active === undefined ? [] : explain(active.success, currentQueries()),
  });
}

function begin(
  kind: SeriesActivity['kind'],
  act: number | null,
  drillIds: readonly string[],
): void {
  endDrill();
  setActivity({
    kind,
    act,
    drills: drillIds.map(findDrill),
    active: null,
    results: [],
    placement: null,
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

export function startNextSeriesDrill(nowMs: number = Date.now()): void {
  const current = activity();
  if (current?.active !== null) return;
  const index = current.results.length;
  const drill = current.drills[index];
  if (drill === undefined) return;
  const label = current.kind === 'placement' ? 'Placement test' : 'Review';
  loadSandbox(
    drill.setup,
    `${label} ${String(index + 1)} of ${String(current.drills.length)}. No hints, no Sage.`,
  );
  beginDrill(`${current.kind}:${drill.id}`);
  setActivity({ ...current, active: { index, startedAtMs: nowMs } });
}

function finish(current: SeriesActivity, nowMs: number): void {
  if (current.active === null) return;
  const drill = current.drills[current.active.index];
  if (drill === undefined) return;
  const seconds = (nowMs - current.active.startedAtMs) / 1000;
  const score = scoreDrill(
    evaluate(drill.success, currentQueries()),
    seconds,
    drill.timeLimitSeconds,
  );
  endDrill();
  const now = new Date(nowMs);
  saveProgressNow((save) =>
    current.kind === 'review'
      ? recordReview(save, drill, score, now)
      : recordDrill(save, drill, score, now),
  );
  const results = [...current.results, { drillId: drill.id, ...score }];
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

/** "I'm done": grades the drill as it stands. */
export function submitSeriesDrill(nowMs: number = Date.now()): void {
  const current = activity();
  if (current !== null) finish(current, nowMs);
}
