import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  otherSampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import { flushProgress, progress, startProgress, type ProgressStorage } from '../progress';
import { XP_AWARDS } from '../progression/xp';
import { sandbox } from '../sandbox';
import { createDefaultSave } from '../save/schema';
import { bossTick, bossSandboxChanged, startBossFight } from './bossPlay';
import { setCatalog } from './catalog';
import {
  askForHint,
  endBriefing,
  missionSandboxChanged,
  missionTick,
  startMission,
  startNextDrill,
  submitQuestionRound,
} from './missionPlay';
import { leavePlay } from './play';
import { play, type BossActivity, type MissionActivity, type SeriesActivity } from './playStore';
import { seriesSandboxChanged, startNextSeriesDrill, startPlacement } from './seriesPlay';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const T0 = NOW.getTime();

function run(...commands: string[]): void {
  for (const command of commands) sandbox.get().shell.run(command);
}

function mission(): MissionActivity {
  const current = play.get().activity;
  if (current?.kind !== 'mission') throw new Error('no mission is being played');
  return current;
}

function series(): SeriesActivity {
  const current = play.get().activity;
  if (current?.kind !== 'placement' && current?.kind !== 'review') throw new Error('no series');
  return current;
}

function boss(): BossActivity {
  const current = play.get().activity;
  if (current?.kind !== 'boss') throw new Error('no boss fight');
  return current;
}

beforeEach(async () => {
  setCatalog({
    acts: [{ act: sampleAct, missions: [sampleMission, secondMission, thirdMission] }],
  });
  const storage: ProgressStorage = {
    load: () => Promise.resolve(createDefaultSave(NOW)),
    write: () => Promise.resolve(),
  };
  await startProgress(storage, NOW);
});

afterEach(async () => {
  leavePlay();
  await flushProgress();
});

describe('playing a mission', () => {
  it('walks the sim by state, then drills, then the Question Round', async () => {
    startMission(sampleMission.id);
    expect(mission().run.phase).toBe('briefing');
    endBriefing();
    expect(play.get().checklist[0]?.passed).toBe(false);

    // The ladder works offline: the first rung is the mission's own question hint.
    await askForHint();
    expect(mission().hint).toMatchObject({ level: 1, fromSage: false });

    run('git init');
    missionSandboxChanged(T0);
    expect(mission().run.stepIndex).toBe(1);
    expect(mission().hint).toBeNull();

    // Committing straight away satisfies "staged" and "commit" at once.
    run('git add app.ts', 'git commit -m "feat: add app"');
    missionSandboxChanged(T0);
    expect(mission().run.phase).toBe('drills');
    const stepXp = sampleMission.steps.reduce((total, step) => total + step.xp, 0);
    expect(progress.get().save?.profile.xp).toBe(stepXp);

    // Drill 1 passes on reaching the state; drill 2 runs out of time.
    startNextDrill(T0);
    run('git init');
    missionSandboxChanged(T0 + 5_000);
    expect(mission().lastDrill).toMatchObject({ passed: true });
    startNextDrill(T0 + 6_000);
    missionTick(T0 + 6_000 + 91_000);
    expect(mission().lastDrill).toMatchObject({ passed: false, overtime: true });
    expect(progress.get().save?.reviewQueue.map((item) => item.drillId)).toContain(
      sampleMission.drills[1]?.id,
    );

    for (let index = 2; index < sampleMission.drills.length; index++) {
      startNextDrill(T0 + index * 200_000);
      missionTick(T0 + index * 200_000 + 999_000);
    }
    expect(mission().run.phase).toBe('question');

    submitQuestionRound(['when-lost', 'done-means', 'how-many'], '', T0 + 2_000_000);
    const done = mission();
    expect(done.run.phase).toBe('done');
    expect(done.questionScore?.score).toBe(5);
    expect(done.freeTextGrade).toBeNull();
    expect(progress.get().save?.missions[sampleMission.id]).toMatchObject({
      status: 'completed',
      bestDrillScore: 20,
    });
  });

  it('shows Sage as unavailable for a free-text question when offline', async () => {
    startMission(sampleMission.id);
    endBriefing();
    run('git init', 'git add app.ts', 'git commit -m "feat: add app"');
    missionSandboxChanged(T0);
    for (let index = 0; index < sampleMission.drills.length; index++) {
      startNextDrill(T0 + index * 200_000);
      missionTick(T0 + index * 200_000 + 999_000);
    }
    submitQuestionRound(['when-lost'], 'When is work lost?', T0 + 2_000_000);
    expect(mission().freeTextGrade).toEqual({ state: 'grading' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mission().freeTextGrade?.state).toBe('unavailable');
  });
});

describe('late Sage replies', () => {
  it('never land on a replay of the same mission', async () => {
    startMission(sampleMission.id);
    endBriefing();
    const pending = askForHint();
    // Leave and replay before the reply arrives: same mission, same step, new attempt.
    leavePlay();
    startMission(sampleMission.id);
    endBriefing();
    await pending;
    expect(mission().hint).toBeNull();
    expect(mission().hintLoading).toBe(false);
  });
});

/** Plays the whole placement test in progress, solving every drill by reaching its state. */
function passPlacement(): void {
  const total = series().drills.length;
  for (let index = 0; index < total; index++) {
    startNextSeriesDrill(T0 + index * 1000);
    const drill = series().drills[index];
    if (drill?.id.endsWith('init')) run('git init');
    else if (drill?.id.endsWith('stage-one')) run('git add notes.md');
    else if (drill?.id.endsWith('commit')) run('git commit -m "feat: a"');
    else if (drill?.id.endsWith('unstage')) run('git restore --staged .env');
    else run('git commit -am "fix: v2"');
    seriesSandboxChanged(T0 + index * 1000 + 500);
  }
}

describe('the placement test', () => {
  it('tests out of the act at 85% or better', () => {
    startPlacement(sampleAct.act);
    passPlacement();
    expect(series().placement).toEqual({ percent: 100, testedOut: true });
    expect(progress.get().save?.acts['2']?.completedAt).toEqual(expect.any(String));
  });
});

describe('the boss', () => {
  it('fires twists on the clock and wins by state', () => {
    startBossFight(sampleAct.act, T0);
    bossTick(T0 + 121_000);
    expect(boss().messages).toHaveLength(1);
    run('git add app.ts src/logger.ts', 'git commit -m "fix: ship logger"');
    bossSandboxChanged(T0 + 125_000);
    expect(boss().outcome).toBe('won');
    expect(progress.get().save?.profile.xp).toBe(XP_AWARDS.boss);
  });

  it('loses at once when a rule breaks', () => {
    startBossFight(sampleAct.act, T0);
    run('git add .env', 'git commit -m "chore: oops"');
    bossSandboxChanged(T0 + 1_000);
    expect(boss().outcome).toBe('lost-rule');
  });

  it('loses when the clock runs out', () => {
    startBossFight(sampleAct.act, T0);
    bossTick(T0 + 181_000);
    expect(boss().outcome).toBe('lost-time');
    expect(boss().secondsLeft).toBe(0);
  });
});

describe('two Acts in one catalog', () => {
  beforeEach(() => {
    setCatalog({
      acts: [
        { act: sampleAct, missions: [sampleMission, secondMission, thirdMission] },
        otherSampleAct(),
      ],
    });
  });

  it("runs each Act's own placement test and records it on that Act", () => {
    startPlacement(3);
    expect(series().act).toBe(3);
    expect(series().drills.every((drill) => drill.id.startsWith('other-'))).toBe(true);

    passPlacement();

    expect(progress.get().save?.acts['3']?.placement).toMatchObject({
      attempts: 1,
      testedOut: true,
    });
    expect(progress.get().save?.acts['3']?.completedAt).toEqual(expect.any(String));
    expect(progress.get().save?.acts['2']).toBeUndefined();
  });

  it("fights each Act's own boss", () => {
    startBossFight(3, T0);
    expect(boss().act).toBe(3);
    bossTick(T0 + 121_000);
    run('git add app.ts src/logger.ts', 'git commit -m "fix: ship logger"');
    bossSandboxChanged(T0 + 125_000);
    expect(boss().outcome).toBe('won');
    expect(progress.get().save?.acts['3']?.bossCompletedAt).toBeTruthy();
    expect(progress.get().save?.acts['2']).toBeUndefined();
  });
});
