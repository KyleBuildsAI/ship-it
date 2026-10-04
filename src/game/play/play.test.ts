import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INSTANT_PACE, NORMAL_PACE, type Reveal } from '../agent/pace';
import { onTerminalFeed } from '../agent/terminalFeed';
import { evaluate, type Predicate } from '../missions/predicates';
import {
  directedMission,
  earlySampleAct,
  otherSampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import { ActSchema, ContentError, type Mission } from '../missions/schema';
import { flushProgress, progress, startProgress, type ProgressStorage } from '../progress';
import { XP_AWARDS } from '../progression/xp';
import { sandbox } from '../sandbox';
import { createDefaultSave } from '../save/schema';
import { bossTick, bossSandboxChanged, startBossFight } from './bossPlay';
import { setCatalog } from './catalog';
import { startFieldMission } from './fieldPlay';
import {
  askForHint,
  endBriefing,
  missionSandboxChanged,
  missionTick,
  startMission,
  startNextDrill,
  submitQuestionRound,
} from './missionPlay';
import { checkClaim, directFix, nextStep, pickCard } from './agentPlay';
import { framePlay, leavePlay } from './play';
import { currentQueries } from './sandboxControl';
import { play, type BossActivity, type MissionActivity, type SeriesActivity } from './playStore';
import {
  seriesSandboxChanged,
  seriesTick,
  startNextSeriesDrill,
  startPlacement,
  startReview,
} from './seriesPlay';

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

/** A catalog with one early Act 1 holding these directed missions. */
function directedCatalog(...missions: Mission[]): void {
  const act = ActSchema.parse({
    act: 1,
    title: 'Directed Sample',
    earlyAccess: true,
    missionIds: missions.map((entry) => entry.id),
  });
  setCatalog({ acts: [{ act, missions }] });
}

/** Moves Otto on until he waits for Kyle, one instant frame at a time. */
function ottoWaits(): void {
  framePlay(16, INSTANT_PACE);
}

/** The sample's directed step, played the strong way: pick, run, confirm, next. */
function directTheSampleStep(): void {
  pickCard('full-path');
  ottoWaits();
  checkClaim('api');
  nextStep();
}

describe('judgment drills', () => {
  beforeEach(() => {
    directedCatalog(directedMission);
  });

  it('wait for an answer: no checklist, no pass by the sandbox, and a timeout is a miss', () => {
    const first = directedMission.drills[0];
    startMission(directedMission.id);
    endBriefing();
    directTheSampleStep();
    expect(mission().run.phase).toBe('drills');

    startNextDrill(T0);
    expect(play.get().checklist).toEqual([]);
    // Changing the sandbox leaves the drill running: only an answer or the clock ends it.
    run('cd C:\\Users\\kyle\\quillwork\\api');
    missionSandboxChanged(T0 + 1_000);
    expect(mission().run.activeDrill).not.toBeNull();
    missionTick(T0 + 40_000);
    expect(mission().lastDrill).toMatchObject({ drillId: first?.id, passed: false });
    expect(progress.get().save?.reviewQueue.map((item) => item.drillId)).toEqual([first?.id]);

    // The miss comes back at the Standup Board, where it waits for an answer too.
    startReview(NOW);
    startNextSeriesDrill(T0 + 50_000);
    expect(play.get().checklist).toEqual([]);
    run('cd ..');
    seriesSandboxChanged(T0 + 51_000);
    expect(series().active).not.toBeNull();
    seriesTick(T0 + 90_000);
    expect(series().results).toEqual([
      { drillId: first?.id, passed: false, seconds: 40, overtime: false },
    ]);
  });
});

describe('an early-access Act', () => {
  const early = earlySampleAct();

  beforeEach(() => {
    setCatalog({
      acts: [early, { act: sampleAct, missions: [sampleMission, secondMission, thirdMission] }],
    });
  });

  it('has no placement test, boss, or Field Mission to start, and play is left alone', () => {
    expect(() => {
      startPlacement(1);
    }).toThrow(ContentError);
    expect(() => {
      startBossFight(1, T0);
    }).toThrow(ContentError);
    expect(() => {
      startFieldMission(1);
    }).toThrow(ContentError);
    expect(play.get().activity).toBeNull();
  });

  it('plays its missions, and finishing them leaves the Act in progress', () => {
    for (const entry of early.missions) {
      startMission(entry.id);
      endBriefing();
      run('git init', 'git add app.ts', 'git commit -m "feat: add app"');
      missionSandboxChanged(T0);
      for (let index = 0; index < entry.drills.length; index++) {
        startNextDrill(T0 + index * 200_000);
        missionTick(T0 + index * 200_000 + 999_000);
      }
      submitQuestionRound(['when-lost'], '', T0 + 2_000_000);
      expect(progress.get().save?.missions[entry.id]?.status).toBe('completed');
    }
    expect(progress.get().save?.acts['1']?.completedAt ?? null).toBeNull();
  });
});

/** Whether a predicate holds on the live sandbox right now. */
const holds = (predicate: Predicate) => evaluate(predicate, currentQueries());
const API = 'Users/kyle/quillwork/api';
const inTheApi: Predicate = { kind: 'currentDirectory', path: API };

/** Where Otto is in the step: the stage name, as the panels will read it. */
const stage = () => mission().agent?.stage.at;

/** Everything the terminal is sent while `body` runs, as plain text. */
function terminalText(body: () => void): string {
  const shown: string[] = [];
  const stop = onTerminalFeed((reveals) => shown.push(...reveals.map(revealText)));
  try {
    body();
  } finally {
    stop();
  }
  return shown.join('');
}

function revealText(reveal: Reveal): string {
  if (reveal.kind === 'keys') return reveal.text;
  const { beat } = reveal;
  if (beat.kind === 'prompt') return beat.text;
  if (beat.kind === 'output') return beat.lines.map((entry) => entry.text).join('\n');
  return beat.kind === 'enter' || beat.kind === 'cancel' ? '\n' : '';
}

describe('directing Otto through a step', () => {
  beforeEach(() => {
    directedCatalog(directedMission);
    startMission(directedMission.id);
    endBriefing();
  });

  it('runs the strong card, checks the claim by state, and moves on to the drills', () => {
    expect(stage()).toBe('direct');
    expect(play.get().checklist).toEqual([]);

    pickCard('full-path');
    const typed = terminalText(ottoWaits);
    expect(typed).toContain('cd C:\\Users\\kyle\\quillwork\\api');
    expect(typed).toContain('Get-Location');
    expect(stage()).toBe('check');
    expect(holds(inTheApi)).toBe(true);
    // The checklist would answer the check, so it waits for the result.
    expect(play.get().checklist).toEqual([]);

    checkClaim('api');
    expect(mission().agent?.stage).toMatchObject({ at: 'result', verdict: 'confirmed' });
    expect(play.get().checklist.map((row) => row.passed)).toEqual([true, true]);

    nextStep();
    expect(mission().run.phase).toBe('drills');
    expect(mission().agent).toBeNull();
    const stepXp = directedMission.steps.reduce((total, step) => total + step.xp, 0);
    expect(progress.get().save?.profile.xp).toBe(stepXp);
  });

  it("catches Otto's slip, directs a fix, and never advances on typed lines", () => {
    // Typing into the sandbox doesn't finish a directed step: only the check does.
    run('cd C:\\Users\\kyle\\quillwork\\api', 'cd ~');
    missionSandboxChanged(T0);
    expect(mission().run.stepIndex).toBe(0);

    pickCard('guess');
    ottoWaits();
    checkClaim('home');
    expect(mission().agent?.stage).toMatchObject({ verdict: 'caught', passed: false });
    // A step that didn't pass shows its red rows.
    expect(play.get().checklist.map((row) => row.passed)).toEqual([false, true]);
    nextStep();
    expect(mission().run.stepIndex).toBe(0);

    directFix();
    pickCard('fix-full-path');
    ottoWaits();
    checkClaim('api');
    expect(mission().agent?.stage).toMatchObject({ verdict: 'confirmed', passed: true });
    expect(mission().agent?.tried).toEqual(['guess', 'fix-full-path']);
  });

  it('types at a readable pace, and runs a line only once it has been typed', () => {
    pickCard('full-path');
    framePlay(16, NORMAL_PACE);
    framePlay(300, NORMAL_PACE);
    // Otto is still thinking and typing the cd, so the terminal stands at home.
    expect(holds(inTheApi)).toBe(false);
    let frames = 2;
    while (stage() === 'running' && frames < 1000) {
      framePlay(16, NORMAL_PACE);
      frames++;
    }
    expect(stage()).toBe('check');
    expect(holds(inTheApi)).toBe(true);
    // About two seconds of typing, thinking and settling, at 60 frames a second.
    expect(frames).toBeGreaterThan(60);
  });
});
