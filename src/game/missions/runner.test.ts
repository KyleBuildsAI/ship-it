import { describe, expect, it } from 'vitest';
import { git } from '../../engine/git/cli/testRun';
import { gitQueries } from '../../engine/git/queries';
import { testDeps } from '../../engine/git/testDeps';
import type { Workspace } from '../../engine/workspace';
import {
  checkBoss,
  checkStep,
  finishBriefing,
  finishQuestionRound,
  hintsAvailable,
  missedDrills,
  MissionRunError,
  requestHint,
  secondsRemaining,
  startBoss,
  startDrill,
  startRun,
  submitDrill,
  tick,
  xpEarned,
  type MissionRun,
} from './runner';
import { applySteps, createSandbox } from './sandbox';
import { sampleAct, sampleMission, secondMission } from './sample.test-mission';

const mission = sampleMission;

/** Runs git commands in order, like a player typing them into the terminal. */
function play(ws: Workspace, ...commands: string[][]): Workspace {
  for (const command of commands) git(ws, command);
  return ws;
}

const missionSandbox = () => createSandbox(mission.initialRepoState, testDeps());

/** The finished sim: repository created, app.ts committed, .env left alone. */
const simDone = () =>
  play(missionSandbox(), ['init'], ['add', 'app.ts'], ['commit', '-m', 'feat: add app']);

/** A run that has just reached the drills. */
function atDrills(): MissionRun {
  return checkStep(finishBriefing(startRun(mission)), mission, gitQueries(simDone()));
}

/** The correct answer for each sample drill, typed into that drill's own sandbox. */
const DRILL_ANSWERS: string[][][] = [
  [['init']],
  [['add', 'notes.md']],
  [['commit', '-m', 'feat: first']],
  [['restore', '--staged', '.env']],
  [['commit', '-am', 'fix: v2']],
];

function drillSandbox(index: number, solved: boolean): Workspace {
  const drill = mission.drills[index];
  if (drill === undefined) throw new Error(`The sample mission has no drill ${String(index)}.`);
  const ws = createSandbox(drill.setup, testDeps());
  return solved ? play(ws, ...(DRILL_ANSWERS[index] ?? [])) : ws;
}

/** Plays one drill from start to submit, taking `seconds` to answer. */
function playDrill(run: MissionRun, index: number, solved: boolean, seconds = 10): MissionRun {
  const started = startDrill(run, mission, index, 1_000);
  const q = gitQueries(drillSandbox(index, solved));
  return submitDrill(started, mission, q, 1_000 + seconds * 1000);
}

describe('a mission run, start to finish', () => {
  it('walks briefing, sim, drills, and the Question Round', () => {
    let run = startRun(mission);
    expect(run.phase).toBe('briefing');
    run = finishBriefing(run);
    expect(run.phase).toBe('sim');

    const ws = missionSandbox();
    const check = () => {
      run = checkStep(run, mission, gitQueries(ws));
    };

    // `git status` before `git init` changes nothing, but it still counts as a try.
    play(ws, ['status']);
    check();
    expect(run.stepIndex).toBe(0);

    play(ws, ['init']);
    check();
    expect(run.stepIndex).toBe(1);

    play(ws, ['add', 'app.ts']);
    check();
    expect(run.stepIndex).toBe(2);
    expect(xpEarned(run, mission)).toBe(10);

    play(ws, ['commit', '-m', 'feat: add app']);
    check();
    expect(run.phase).toBe('drills');
    expect(run.steps).toEqual([
      { stepId: 'init', attempts: 2, hintLevel: 0, completed: true },
      { stepId: 'stage-app', attempts: 1, hintLevel: 0, completed: true },
      { stepId: 'commit', attempts: 1, hintLevel: 0, completed: true },
    ]);

    for (const index of mission.drills.keys()) run = playDrill(run, index, true);
    expect(run.phase).toBe('question');
    expect(missedDrills(run)).toEqual([]);

    run = finishQuestionRound(
      run,
      mission,
      ['when-lost', 'done-means', 'how-many'],
      '  What does "fixed" look like?  ',
    );
    expect(run.phase).toBe('done');
    expect(run.questionRound).toMatchObject({
      score: 5,
      max: 6,
      picks: ['when-lost', 'done-means', 'how-many'],
      freeText: 'What does "fixed" look like?',
    });
    expect(xpEarned(run, mission)).toBe(10 + 20 + mission.xp);
  });

  it('accepts any path to the target state, finishing several steps at once', () => {
    const run = checkStep(finishBriefing(startRun(mission)), mission, gitQueries(simDone()));
    expect(run.phase).toBe('drills');
    expect(run.steps.map((step) => [step.attempts, step.completed])).toEqual([
      [1, true],
      [0, true],
      [0, true],
    ]);
  });

  it('stops at the first step whose check fails', () => {
    // Staging .env breaks the "stage-app" step, whatever else is right.
    const ws = play(missionSandbox(), ['init'], ['add', '.']);
    const run = checkStep(finishBriefing(startRun(mission)), mission, gitQueries(ws));
    expect(run.stepIndex).toBe(1);
    expect(run.phase).toBe('sim');
  });
});

describe('the hint ladder', () => {
  it('climbs one rung at a time and repeats the command at the top', () => {
    let run = finishBriefing(startRun(mission));
    const texts: string[] = [];
    for (let ask = 0; ask < 4; ask++) {
      const result = requestHint(run, mission);
      run = result.run;
      texts.push(`${String(result.hint?.level)}: ${String(result.hint?.text)}`);
    }
    const [question, concept, command] = mission.steps[0]?.hints ?? [];
    expect(texts).toEqual([
      `1: ${String(question)}`,
      `2: ${String(concept)}`,
      `3: ${String(command)}`,
      `3: ${String(command)}`,
    ]);
    expect(run.steps[0]?.hintLevel).toBe(3);
  });

  it('starts the next step back at the first rung', () => {
    let run = finishBriefing(startRun(mission));
    run = requestHint(run, mission).run;
    run = checkStep(run, mission, gitQueries(play(missionSandbox(), ['init'])));
    expect(requestHint(run, mission).hint).toEqual({
      level: 1,
      text: mission.steps[1]?.hints[0],
    });
  });

  it('is unavailable outside the sim, including during No-AI Drills', () => {
    const briefing = startRun(mission);
    expect(hintsAvailable(briefing)).toBe(false);
    expect(requestHint(briefing, mission)).toEqual({ run: briefing, hint: null });
    const drills = atDrills();
    expect(hintsAvailable(drills)).toBe(false);
    expect(requestHint(drills, mission)).toEqual({ run: drills, hint: null });
  });
});

describe('drills', () => {
  it('collects misses for the review queue, including right answers that were too slow', () => {
    let run = atDrills();
    run = playDrill(run, 0, false);
    run = playDrill(run, 1, true);
    // The commit drill has a 60 second limit; 61 seconds is overtime.
    run = playDrill(run, 2, true, 61);
    expect(run.drillResults).toEqual([
      { drillId: 'sample-init', passed: false, seconds: 10, overtime: false },
      { drillId: 'sample-stage-one', passed: true, seconds: 10, overtime: false },
      { drillId: 'sample-commit', passed: false, seconds: 61, overtime: true },
    ]);
    expect(missedDrills(run)).toEqual(['sample-init', 'sample-commit']);
    expect(run.phase).toBe('drills');
  });

  it('can be played in any order, and the round ends after the last one', () => {
    let run = atDrills();
    for (const index of [4, 2, 0, 3, 1]) run = playDrill(run, index, true);
    expect(run.phase).toBe('question');
    expect(run.drillResults.map((result) => result.drillId)).toEqual([
      'sample-clean',
      'sample-commit',
      'sample-init',
      'sample-unstage',
      'sample-stage-one',
    ]);
  });

  it('refuses drill moves that make no sense', () => {
    const run = atDrills();
    const running = startDrill(run, mission, 0, 0);
    expect(() => startDrill(running, mission, 1, 0)).toThrow('Another drill is still running.');
    expect(() => startDrill(run, mission, 99, 0)).toThrow('There is no drill 99.');
    expect(() => submitDrill(run, mission, gitQueries(simDone()), 0)).toThrow(
      'No drill is running.',
    );
    const played = playDrill(run, 0, true);
    expect(() => startDrill(played, mission, 0, 0)).toThrow(
      'Drill "sample-init" was already played in this run.',
    );
  });
});

describe('phase rules', () => {
  it('rejects transitions the current phase does not allow', () => {
    const briefing = startRun(mission);
    const q = gitQueries(missionSandbox());
    expect(() => checkStep(briefing, mission, q)).toThrow(MissionRunError);
    expect(() => checkStep(briefing, mission, q)).toThrow(
      "Can't check a step during the briefing phase.",
    );
    expect(() => finishBriefing(finishBriefing(briefing))).toThrow(MissionRunError);
    expect(() => startDrill(briefing, mission, 0, 0)).toThrow(MissionRunError);
    expect(() => finishQuestionRound(briefing, mission, [])).toThrow(MissionRunError);
  });

  it('refuses to mix up runs and missions', () => {
    const run = finishBriefing(startRun(mission));
    expect(() => checkStep(run, secondMission, gitQueries(missionSandbox()))).toThrow(
      'This run is for "sample-three-rooms", not "sample-reading-history".',
    );
    expect(() => xpEarned(run, secondMission)).toThrow(MissionRunError);
  });

  it('stores no free-text question when the player skipped it', () => {
    let run = atDrills();
    for (const index of mission.drills.keys()) run = playDrill(run, index, true);
    expect(finishQuestionRound(run, mission, ['rewrite']).questionRound?.freeText).toBeNull();
    expect(finishQuestionRound(run, mission, [], '   ').questionRound?.freeText).toBeNull();
  });

  it('earns no mission XP before the mission is done', () => {
    expect(xpEarned(startRun(mission), mission)).toBe(0);
    expect(xpEarned(atDrills(), mission)).toBe(30);
  });
});

describe('boss runs', () => {
  const act = sampleAct;
  const bossSandbox = () => createSandbox(act.boss.setup, testDeps());
  const secondsIn = (seconds: number) => seconds * 1000;

  it('counts down in whole seconds and never below zero', () => {
    const boss = startBoss(act, 0);
    expect(boss).toEqual({ bossId: 'sample-dirty-tree', startedAtMs: 0, firedTwists: [] });
    expect(secondsRemaining(boss, act, 0)).toBe(180);
    expect(secondsRemaining(boss, act, 500)).toBe(180);
    expect(secondsRemaining(boss, act, secondsIn(179.5))).toBe(1);
    expect(secondsRemaining(boss, act, secondsIn(500))).toBe(0);
  });

  it('fires each twist once, when its moment arrives', () => {
    let boss = startBoss(act, 0);
    const early = tick(boss, act, secondsIn(100));
    expect(early.due).toEqual([]);
    expect(early.boss).toBe(boss);

    const atOneMinute = tick(boss, act, secondsIn(120));
    expect(atOneMinute.due.map((twist) => twist.atSecondsRemaining)).toEqual([60]);
    boss = atOneMinute.boss;
    expect(tick(boss, act, secondsIn(121)).due).toEqual([]);
    expect(tick(boss, act, secondsIn(150)).due.map((twist) => twist.atSecondsRemaining)).toEqual([
      30,
    ]);
  });

  it('returns every overdue twist, earliest first, if ticks were missed', () => {
    const { due, boss } = tick(startBoss(act, 0), act, secondsIn(170));
    expect(due.map((twist) => twist.atSecondsRemaining)).toEqual([60, 30]);
    expect(boss.firedTwists).toEqual([0, 1]);

    const ws = bossSandbox();
    for (const twist of due) applySteps(ws, twist.apply);
    expect(gitQueries(ws).untrackedPaths()).toContain('NOTES.md');
  });

  it('is won by committing the right files before time runs out', () => {
    const boss = startBoss(act, 0);
    const ws = bossSandbox();
    expect(checkBoss(boss, act, gitQueries(ws), secondsIn(10))).toBe('running');
    play(ws, ['add', 'app.ts', 'src/logger.ts'], ['commit', '-m', 'feat: ship logger']);
    expect(checkBoss(boss, act, gitQueries(ws), secondsIn(90))).toBe('won');
  });

  it('is lost the moment a rule breaks, even with time left', () => {
    const boss = startBoss(act, 0);
    // `git add .` sweeps .env in too; dist/ is ignored, so it stays out.
    const ws = play(bossSandbox(), ['add', '.'], ['commit', '-m', 'feat: everything']);
    expect(checkBoss(boss, act, gitQueries(ws), secondsIn(30))).toBe('lost-rule');
    expect(checkBoss(boss, act, gitQueries(ws), secondsIn(999))).toBe('lost-rule');
  });

  it('is lost when the clock hits zero, because Dex deploys what was committed then', () => {
    const boss = startBoss(act, 0);
    const ws = bossSandbox();
    expect(checkBoss(boss, act, gitQueries(ws), secondsIn(180))).toBe('lost-time');
    play(ws, ['add', 'app.ts', 'src/logger.ts'], ['commit', '-m', 'feat: too late']);
    expect(checkBoss(boss, act, gitQueries(ws), secondsIn(181))).toBe('lost-time');
  });

  it('refuses a boss run from a different Act', () => {
    const otherBoss = { ...startBoss(act, 0), bossId: 'someone-else' };
    const q = gitQueries(bossSandbox());
    expect(() => tick(otherBoss, act, 0)).toThrow(MissionRunError);
    expect(() => checkBoss(otherBoss, act, q, 0)).toThrow(
      'This boss run is for "someone-else", not "sample-dirty-tree".',
    );
  });
});
