import { endDrill } from '../../mentor/drillGuard';
import { explain } from '../missions/predicates';
import { applySteps } from '../missions/sandbox';
import { checkBoss, secondsRemaining, startBoss, tick } from '../missions/runner';
import { saveProgressNow } from '../progress';
import { getCatalog } from './catalog';
import { play, type BossActivity } from './playStore';
import { currentQueries, currentWorkspace, loadSandbox } from './sandboxControl';
import { completeBoss } from './saveRules';

/*
 * The Act boss (DESIGN.md section 11): a timed scenario with a twist. Dex deploys from a
 * clean checkout when the clock hits zero, so only committed work ships.
 */

function activity(): BossActivity | null {
  const current = play.get().activity;
  return current?.kind === 'boss' ? current : null;
}

function setActivity(next: BossActivity): void {
  const { boss } = getCatalog().act;
  const queries = currentQueries();
  play.update({
    activity: next,
    checklist: boss.objectives.flatMap((objective) => explain(objective, queries)),
  });
}

export function startBossFight(nowMs: number = Date.now()): void {
  const { act } = getCatalog();
  endDrill();
  loadSandbox(
    act.boss.setup,
    `${act.boss.title}: Dex deploys in ${formatClock(act.boss.timeLimitSeconds)}.`,
  );
  const boss = startBoss(act, nowMs);
  setActivity({
    kind: 'boss',
    boss,
    outcome: 'running',
    secondsLeft: act.boss.timeLimitSeconds,
    messages: [],
  });
}

/** 180 -> "3:00", for the boss clock. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`;
}

function settle(current: BossActivity, nowMs: number): void {
  const { act } = getCatalog();
  const outcome = checkBoss(current.boss, act, currentQueries(), nowMs);
  if (outcome === 'won' && current.outcome !== 'won') {
    saveProgressNow((save) => completeBoss(save, act, new Date(nowMs)));
  }
  setActivity({ ...current, outcome, secondsLeft: secondsRemaining(current.boss, act, nowMs) });
}

/** Called on a timer: fires due twists into the live sandbox and runs the clock down. */
export function bossTick(nowMs: number = Date.now()): void {
  const current = activity();
  if (current?.outcome !== 'running') return;
  const { act } = getCatalog();
  const { boss, due } = tick(current.boss, act, nowMs);
  for (const twist of due) applySteps(currentWorkspace(), twist.apply);
  const messages = [...current.messages, ...due.map((twist) => twist.message)];
  settle({ ...current, boss, messages }, nowMs);
}

/** After every command: a win or a broken rule ends the fight at once. */
export function bossSandboxChanged(nowMs: number = Date.now()): void {
  const current = activity();
  if (current?.outcome !== 'running') return;
  settle(current, nowMs);
}
