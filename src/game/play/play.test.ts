import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INSTANT_PACE, NORMAL_PACE, type Reveal } from '../agent/pace';
import { onTerminalFeed } from '../agent/terminalFeed';
import { evaluate, type Predicate } from '../missions/predicates';
import {
  directedMission,
  earlySampleAct,
  notesMission,
  otherSampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import { ActSchema, ContentError, MissionSchema, type Mission } from '../missions/schema';
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
  submitJudgment,
  submitQuestionRound,
} from './missionPlay';
import {
  checkClaim,
  decide,
  directFix,
  nextStep,
  ottoRun,
  pickCard,
  pickInstead,
  predict,
  predictionGhost,
  repeatCard,
  rewind,
  runLook,
  stopOtto,
  trueCheckOptions,
} from './agentPlay';
import { framePlay, leavePlay } from './play';
import { currentQueries } from './sandboxControl';
import { questionXp } from './saveRules';
import { play, type BossActivity, type MissionActivity, type SeriesActivity } from './playStore';
import {
  seriesSandboxChanged,
  seriesTick,
  startNextSeriesDrill,
  startPlacement,
  startReview,
  submitSeriesJudgment,
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
    // A timeout still names the right answer, so the reveal teaches what was right.
    expect(mission().lastDrill).toMatchObject({
      drillId: first?.id,
      passed: false,
      keyId: 'error',
    });
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
      { drillId: first?.id, passed: false, seconds: 40, overtime: false, keyId: 'error' },
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
const apiIntact: Predicate = { kind: 'driveFile', path: `${API}/package.json` };
const homeNotes: Predicate = { kind: 'driveFolder', path: 'Users/kyle/notes' };
const apiNotes: Predicate = { kind: 'driveFolder', path: `${API}/notes` };

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

/** Finishes the mission after its sim: every drill times out, then the Question Round. */
function finishAfterTheSim(entry: Mission): void {
  for (let index = 0; index < entry.drills.length; index++) {
    startNextDrill(T0 + index * 200_000);
    // A judgment drill's scene plays before its clock starts.
    framePlay(16, INSTANT_PACE, T0 + index * 200_000);
    missionTick(T0 + index * 200_000 + 999_000);
  }
  submitQuestionRound(['when-lost'], '', T0 + 2_000_000);
}

describe('directing Otto through a step', () => {
  beforeEach(() => {
    directedCatalog(directedMission);
    startMission(directedMission.id);
    endBriefing();
  });

  it('runs the strong card, checks the claim by state, and pays the stars once', () => {
    expect(stage()).toBe('direct');
    expect(play.get().checklist).toEqual([]);

    pickCard('full-path');
    const typed = terminalText(ottoWaits);
    expect(typed).toContain('cd C:\\Users\\kyle\\quillwork\\api');
    expect(typed).toContain('Get-Location');
    expect(stage()).toBe('check');
    expect(holds(inTheApi)).toBe(true);
    expect(ottoRun.get().rows).toEqual([
      { text: 'cd C:\\Users\\kyle\\quillwork\\api', typed: true, answer: false, status: 'ok' },
      { text: 'Get-Location', typed: true, answer: false, status: 'ok' },
    ]);
    // The checklist would answer the check, so it waits for the result.
    expect(play.get().checklist).toEqual([]);

    const look = terminalText(() => {
      runLook('where');
      ottoWaits();
    });
    expect(look).toContain('Get-Location');
    expect(stage()).toBe('check');
    // Kyle's look is his own line, not Otto's, so the run log leaves it out.
    expect(ottoRun.get().rows).toHaveLength(2);

    checkClaim('api');
    expect(mission().agent?.stage).toMatchObject({ at: 'result', verdict: 'confirmed' });
    expect(play.get().checklist.map((row) => row.passed)).toEqual([true, true]);
    expect(mission().stars).toEqual({
      'stand-in-the-api': { plan: true, safety: true, check: true },
    });

    nextStep();
    expect(mission().run.phase).toBe('drills');
    expect(mission().agent).toBeNull();
    const stepXp = directedMission.steps.reduce((total, step) => total + step.xp, 0);
    expect(progress.get().save?.profile.xp).toBe(stepXp);

    finishAfterTheSim(directedMission);
    const firstFinish = progress.get().save?.profile.xp ?? 0;
    const fromQuestions = questionXp(mission().questionScore?.perPick ?? []);
    // 3 stars at 2 XP each, on top of the mission's own XP.
    expect(firstFinish).toBe(stepXp + directedMission.xp + fromQuestions + 6);
    expect(mission().xpEarned).toBe(firstFinish);

    startMission(directedMission.id);
    endBriefing();
    directTheSampleStep();
    finishAfterTheSim(directedMission);
    expect(progress.get().save?.profile.xp).toBe(firstFinish);
  });

  it("catches Otto's slip, directs a fix, and never advances on typed lines", () => {
    // Typing into the sandbox doesn't finish a directed step: only the check does.
    run('cd C:\\Users\\kyle\\quillwork\\api', 'cd ~');
    missionSandboxChanged(T0);
    expect(mission().run.stepIndex).toBe(0);

    // Double clicks on "Say it back" and "Pick instead" are ignored, not thrown.
    repeatCard('guess');
    repeatCard('guess');
    expect(stage()).toBe('echo');
    pickInstead();
    pickInstead();
    expect(stage()).toBe('direct');
    pickCard('guess');
    ottoWaits();
    checkClaim('home');
    expect(mission().agent?.stage).toMatchObject({ verdict: 'caught', passed: false });
    // The weak card's slip reached the check, and Kyle saw it.
    expect(mission().slips).toEqual([
      { stepId: 'stand-in-the-api', planId: 'guess', slip: 'overclaim', caught: true },
    ]);
    expect(trueCheckOptions(mission())).toEqual(['home']);
    // A step that didn't pass shows its red rows, and earns no stars yet.
    expect(play.get().checklist.map((row) => row.passed)).toEqual([false, true]);
    expect(mission().stars).toEqual({});
    nextStep();
    expect(mission().run.stepIndex).toBe(0);

    directFix();
    pickCard('fix-full-path');
    ottoWaits();
    checkClaim('api');
    expect(mission().stars['stand-in-the-api']).toEqual({ plan: false, safety: true, check: true });
    // The fix had no slip, so the count stays at the one Kyle caught.
    expect(mission().slips).toHaveLength(1);
  });

  it('counts a slip Kyle missed, and names the answer he should have picked', () => {
    pickCard('guess');
    ottoWaits();
    checkClaim('api');
    expect(mission().agent?.stage).toMatchObject({ verdict: 'missed', passed: false });
    expect(mission().slips).toEqual([
      { stepId: 'stand-in-the-api', planId: 'guess', slip: 'overclaim', caught: false },
    ]);
    expect(trueCheckOptions(mission())).toEqual(['home']);
  });

  it('counts one slip once, however often Kyle rewinds and replays its card', () => {
    const replay = (answer: string): void => {
      pickCard('guess');
      ottoWaits();
      checkClaim(answer);
    };
    replay('api');
    rewind();
    replay('api');
    rewind();
    // The latest try is the one that counts: a rewind undid the earlier ones.
    replay('home');
    expect(mission().slips).toEqual([
      { stepId: 'stand-in-the-api', planId: 'guess', slip: 'overclaim', caught: true },
    ]);
  });

  it('ignores a button pressed when the stage does not allow it', () => {
    // A double click on a card, then "Direct a fix" on a step that passed.
    // Before the result there is no answer to show.
    expect(trueCheckOptions(mission())).toEqual([]);
    pickCard('full-path');
    expect(() => {
      pickCard('full-path');
    }).not.toThrow();
    ottoWaits();
    checkClaim('api');
    expect(directFix).not.toThrow();
    expect(mission().agent?.stage).toMatchObject({ at: 'result', passed: true });
    expect(mission().agent?.tried).toEqual(['full-path']);
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

  it('marks the Plan star lost when the hint names the card', async () => {
    await askForHint();
    await askForHint();
    await askForHint();
    expect(mission().agent?.hintRung3).toBe(true);
    directTheSampleStep();
    expect(mission().stars['stand-in-the-api']?.plan).toBe(false);
  });

  it('stops between lines, and Otto waits for new directions', () => {
    pickCard('full-path');
    framePlay(16, NORMAL_PACE);
    stopOtto();
    ottoWaits();
    expect(mission().agent?.stage).toEqual({ at: 'direct', round: 'fix' });
    expect(ottoRun.get().last).toEqual({ kind: 'stopped' });
    // The cd was already on its way, so it finished; Get-Location never ran.
    expect(holds(inTheApi)).toBe(true);
    expect(currentQueries().transcript?.printed('Get-Location')).toBe(false);
  });

  it('rewinds the laptop to the start of the step, at the cost of the Plan star', () => {
    pickCard('full-path');
    ottoWaits();
    expect(holds(inTheApi)).toBe(true);
    rewind();
    expect(holds(inTheApi)).toBe(false);
    expect(mission().agent).toMatchObject({ stage: { at: 'direct', round: 'start' } });
    expect(ottoRun.get()).toEqual({ rows: [], last: null });
    directTheSampleStep();
    expect(mission().stars['stand-in-the-api']?.plan).toBe(false);
  });

  it('ignores Rewind on a step that passed, and before a card is picked', () => {
    // Before a card nothing has run: the laptop is not swapped, and the Plan star is safe.
    const laptop = sandbox.get();
    rewind();
    expect(sandbox.get()).toBe(laptop);
    expect(mission().agent?.rewound).toBe(false);

    pickCard('full-path');
    ottoWaits();
    checkClaim('api');
    expect(rewind).not.toThrow();
    expect(mission().agent?.stage).toMatchObject({ at: 'result', passed: true });
    expect(holds(inTheApi)).toBe(true);
  });
});

describe('gates and predictions in play', () => {
  beforeEach(() => {
    directedCatalog(notesMission);
    startMission(notesMission.id);
    endBriefing();
  });

  /** The weak card, its prediction, Kyle's catch, and a fix round. */
  function weakCardCaught(): void {
    pickCard('bare-name');
    ottoWaits();
    expect(stage()).toBe('predict');
    // The line waits at the prompt: nothing has run yet.
    expect(holds(homeNotes)).toBe(false);
    predict('home');
    ottoWaits();
    expect(holds(homeNotes)).toBe(true);
    checkClaim('home');
    directFix();
    expect(ottoRun.get().last).toEqual({ kind: 'fixing' });
  }

  it('shows the ghost of a predicted line for 1.5 s before it runs', () => {
    pickCard('bare-name');
    ottoWaits();
    predict('home');
    framePlay(16, NORMAL_PACE);
    // The ghost is up and the line hasn't run: Kyle sees what will happen first.
    expect(holds(homeNotes)).toBe(false);
    expect(predictionGhost()).not.toEqual([]);
    framePlay(1400, NORMAL_PACE);
    expect(holds(homeNotes)).toBe(false);
    framePlay(100, NORMAL_PACE);
    expect(holds(homeNotes)).toBe(true);
    expect(predictionGhost()).toEqual([]);
  });

  it('grades a prediction on what the line does', () => {
    weakCardCaught();
    expect(mission().agent?.predicts).toEqual([true]);
  });

  it("denies Otto's Yes to All on the whole API: he refuses, then runs plan B", () => {
    weakCardCaught();
    pickCard('start-over');
    ottoWaits();
    expect(mission().agent?.stage).toMatchObject({
      at: 'gate',
      gate: { kind: 'confirm', harmful: true },
    });
    decide(false);
    expect(ottoRun.get().last).toEqual({
      kind: 'denied',
      harmful: true,
      line: 'Good stop. That was the whole project.',
    });
    ottoWaits();
    // Otto's line asked, and he answered No to All for Kyle before plan B.
    expect(ottoRun.get().rows.slice(-2)).toEqual([
      {
        text: 'Remove-Item C:\\Users\\kyle\\quillwork\\api',
        typed: true,
        answer: false,
        status: 'asked',
      },
      { text: 'L', typed: true, answer: true, status: 'ok' },
    ]);
    // Plan B deletes the stray notes at home: a delete, so it pauses too, but it's safe.
    expect(mission().agent?.stage).toMatchObject({ at: 'gate', gate: { harmful: false } });
    decide(true);
    ottoWaits();
    expect(stage()).toBe('check');
    expect([holds(apiIntact), holds(apiNotes), holds(homeNotes)]).toEqual([true, true, false]);
    checkClaim('api');
    expect(mission().agent?.gates).toEqual([true, true]);
    expect(mission().agent?.stage).toMatchObject({ verdict: 'confirmed', passed: true });
    // Denying the harmful line caught the start-over card's slip, though the step passed.
    expect(mission().slips).toEqual([
      { stepId: 'notes-in-the-api', planId: 'bare-name', slip: 'wrong-place', caught: true },
      { stepId: 'notes-in-the-api', planId: 'start-over', slip: 'too-broad', caught: true },
    ]);
  });

  it('asks again when Kyle denies a safe line, and runs it once allowed', () => {
    weakCardCaught();
    pickCard('tidy-and-redo');
    ottoWaits();
    expect(mission().agent?.stage).toMatchObject({ at: 'gate', again: false });
    decide(false);
    expect(mission().agent?.stage).toMatchObject({ at: 'gate', again: true });
    decide(true);
    ottoWaits();
    expect(stage()).toBe('check');
    expect(holds(homeNotes)).toBe(false);
    expect(mission().agent?.gates).toEqual([false, true]);
  });

  it('lets Kyle allow the harm, then rewind to the step as it began', () => {
    weakCardCaught();
    pickCard('start-over');
    ottoWaits();
    decide(true);
    ottoWaits();
    expect(holds(apiIntact)).toBe(false);
    checkClaim('api');
    expect(mission().agent?.stage).toMatchObject({ passed: false, guardBroken: true });

    rewind();
    // The step began after its `before`, with the API whole and no notes anywhere.
    expect([holds(apiIntact), holds(homeNotes), holds(apiNotes)]).toEqual([true, false, false]);
    expect(stage()).toBe('direct');
  });

  it('ends a denied line unrun, and waits for directions when there is no plan B', () => {
    weakCardCaught();
    pickCard('tidy-and-redo');
    ottoWaits();
    const shown = terminalText(() => {
      decide(false);
      decide(false);
      ottoWaits();
    });
    expect(shown).toBe('\n');
    expect(mission().agent?.stage).toEqual({ at: 'direct', round: 'fix' });
    expect(ottoRun.get().last).toEqual({ kind: 'denied', harmful: false, line: null });
    expect(ottoRun.get().rows.at(-1)).toEqual({
      text: 'Remove-Item C:\\Users\\kyle\\notes',
      typed: true,
      answer: false,
      status: 'denied',
    });
    expect(holds(homeNotes)).toBe(true);
  });

  it("logs actions that type nothing by what they did, and a denied write's row", () => {
    const tabs = [{ do: 'newTerminal' }, { do: 'useTerminal', tab: 1 }] as const;
    directedCatalog(withStrongScript('sample-notes-tools', [...tabs, PACKAGE_WRITE]));
    startMission('sample-notes-tools');
    endBriefing();
    pickCard('full-path');
    ottoWaits();
    // Replacing package.json is a change, so the write pauses with its own words.
    expect(mission().agent?.stage).toMatchObject({ at: 'gate', gate: { harmful: false } });
    expect(ottoRun.get().last).toEqual({ kind: 'said', text: PACKAGE_WRITE.say });
    decide(false);
    decide(false);
    expect(stage()).toBe('direct');
    expect(ottoRun.get().rows).toEqual([
      { text: 'Opened a new terminal', typed: false, answer: false, status: 'ok' },
      { text: 'Switched to terminal 1', typed: false, answer: false, status: 'ok' },
      {
        text: 'Wrote C:\\Users\\kyle\\quillwork\\api\\package.json',
        typed: false,
        answer: false,
        status: 'denied',
      },
    ]);
  });

  it("drops an action's words once Otto moves on to one that has none", () => {
    const said = { do: 'run', line: 'Get-Location', say: 'Checking where I am.' } as const;
    directedCatalog(withStrongScript('sample-notes-say', [said, { do: 'run', line: NOTES_LINE }]));
    startMission('sample-notes-say');
    endBriefing();
    pickCard('full-path');
    ottoWaits();
    expect(stage()).toBe('check');
    expect(ottoRun.get().last).toBeNull();
  });
});

const NOTES_LINE = 'mkdir C:\\Users\\kyle\\quillwork\\api\\notes';
const PACKAGE_WRITE = {
  do: 'write',
  path: `${API}/package.json`,
  content: '{ "name": "otto" }\n',
  say: 'Tidying package.json.',
} as const;

/** The notes sample, with the strong card's script swapped for `script`. */
function withStrongScript(id: string, script: readonly object[]): Mission {
  const [first] = notesMission.steps;
  if (first?.agent === undefined) throw new Error('the notes sample has a directed step');
  const plans = first.agent.plans.map((plan) =>
    plan.id === 'full-path' ? { ...plan, script } : plan,
  );
  const steps = [{ ...first, agent: { ...first.agent, plans } }];
  return MissionSchema.parse({ ...notesMission, id, steps });
}

describe('judgment drills with a scene', () => {
  beforeEach(() => {
    directedCatalog(directedMission);
    startMission(directedMission.id);
    endBriefing();
    directTheSampleStep();
  });

  const queued = () => progress.get().save?.reviewQueue.map((item) => item.drillId) ?? [];

  it('grades each answer by running the drill, and only misses join the review queue', () => {
    // Predict has no history, so its clock starts at once.
    startNextDrill(T0);
    expect(mission().scene).toBeNull();
    submitJudgment('sample-predict-typo', { kind: 'pick', optionId: 'error' }, T0 + 5_000);
    expect(mission().lastDrill).toEqual({
      drillId: 'sample-predict-typo',
      passed: true,
      seconds: 5,
      overtime: false,
      keyId: 'error',
    });

    startNextDrill(T0 + 10_000);
    framePlay(16, INSTANT_PACE, T0 + 10_000);
    submitJudgment('sample-diagnose-home', { kind: 'pick', optionId: 'deleted' }, T0 + 12_000);
    // The reveal names the right answer, worked out from the scene's end state.
    expect(mission().lastDrill).toMatchObject({ passed: false, keyId: 'home' });

    startNextDrill(T0 + 20_000);
    framePlay(16, INSTANT_PACE, T0 + 20_000);
    submitJudgment('sample-fix-cd', { kind: 'pick', optionId: 'step-by-step' }, T0 + 22_000);
    expect(mission().lastDrill).toMatchObject({ passed: true, keyId: 'step-by-step' });

    startNextDrill(T0 + 30_000);
    submitJudgment('sample-approve-stray', { kind: 'approve', allow: false }, T0 + 32_000);
    expect(mission().lastDrill).toMatchObject({ passed: false, keyId: 'allow' });

    startNextDrill(T0 + 40_000);
    submitJudgment('sample-approve-notes', { kind: 'approve', allow: false }, T0 + 42_000);
    expect(mission().lastDrill).toMatchObject({ passed: true, keyId: 'deny' });

    expect(mission().run.phase).toBe('question');
    expect(queued().sort()).toEqual(['sample-approve-stray', 'sample-diagnose-home']);
  });

  it('ignores a late, doubled or misshapen answer instead of grading or throwing it', () => {
    startNextDrill(T0);
    submitJudgment('sample-predict-typo', { kind: 'pick', optionId: 'error' }, T0 + 1_000);
    startNextDrill(T0 + 10_000);
    framePlay(16, INSTANT_PACE, T0 + 10_000);
    submitJudgment('sample-diagnose-home', { kind: 'pick', optionId: 'home' }, T0 + 12_000);
    startNextDrill(T0 + 20_000);
    framePlay(16, INSTANT_PACE, T0 + 20_000);
    submitJudgment('sample-fix-cd', { kind: 'pick', optionId: 'step-by-step' }, T0 + 22_000);
    startNextDrill(T0 + 30_000);
    submitJudgment('sample-approve-stray', { kind: 'approve', allow: false }, T0 + 32_000);
    startNextDrill(T0 + 40_000);

    // A double click on drill 4 lands after drill 5 started: it names drill 4, so it's dropped.
    submitJudgment('sample-approve-stray', { kind: 'approve', allow: false }, T0 + 40_050);
    // Answers that don't fit drill 5 (a pick for an approve drill) are dropped too.
    expect(() => {
      submitJudgment('sample-approve-notes', { kind: 'pick', optionId: 'error' }, T0 + 40_100);
    }).not.toThrow();
    expect(mission().run.drillResults).toHaveLength(4);
    expect(mission().run.activeDrill).not.toBeNull();

    // Kyle's real answer to drill 5 is graded from when its clock started.
    submitJudgment('sample-approve-notes', { kind: 'approve', allow: false }, T0 + 45_000);
    expect(mission().lastDrill).toMatchObject({
      drillId: 'sample-approve-notes',
      passed: true,
      seconds: 5,
    });
  });

  it("plays Otto's history into the terminal first, and the clock starts after it", () => {
    startNextDrill(T0);
    submitJudgment('sample-predict-typo', { kind: 'pick', optionId: 'error' }, T0 + 1_000);

    startNextDrill(T0 + 10_000);
    expect(mission().scene).toEqual({ index: 0 });
    expect(mission().run.activeDrill).toBeNull();
    // Nothing is on the clock yet, so no tick can time the drill out while Otto plays.
    missionTick(T0 + 500_000);
    expect(mission().run.drillResults).toHaveLength(1);
    // An answer during the scene, or a second start, does nothing.
    submitJudgment('sample-diagnose-home', { kind: 'pick', optionId: 'home' }, T0 + 10_000);
    startNextDrill(T0 + 10_000);
    expect(mission().scene).toEqual({ index: 0 });

    // At 3× Otto's pace the line is typed, run and shown before the question appears.
    const typed = terminalText(() => {
      framePlay(16, NORMAL_PACE, T0 + 10_016);
    });
    expect(mission().scene).toEqual({ index: 1 });
    expect(mission().run.activeDrill).toBeNull();
    // The line runs only once its typing has shown, so its output plays on the next frame.
    const shown = terminalText(() => {
      framePlay(10_000, NORMAL_PACE, T0 + 10_032);
      framePlay(10_000, NORMAL_PACE, T0 + 20_016);
    });
    expect(typed + shown).toContain('Get-ChildItem package.json');
    expect(mission().scene).toBeNull();
    expect(mission().run.activeDrill?.startedAtMs).toBe(T0 + 20_016);

    // The drill gets its full limit from the moment the question showed.
    missionTick(T0 + 20_016 + 39_000);
    expect(mission().run.activeDrill).not.toBeNull();
    submitJudgment(
      'sample-diagnose-home',
      { kind: 'pick', optionId: 'home' },
      T0 + 20_016 + 39_000,
    );
    expect(mission().lastDrill).toMatchObject({ passed: true, seconds: 39 });
  });

  it('plays the scene at a review too, and grades the answer there', () => {
    startNextDrill(T0);
    submitJudgment('sample-predict-typo', { kind: 'pick', optionId: 'error' }, T0 + 1_000);
    startNextDrill(T0 + 10_000);
    framePlay(16, INSTANT_PACE, T0 + 10_000);
    missionTick(T0 + 60_000);
    expect(queued()).toEqual(['sample-diagnose-home']);

    startReview(NOW);
    startNextSeriesDrill(T0 + 100_000);
    expect(series().scene).toEqual({ index: 0 });
    expect(series().active).toBeNull();
    seriesTick(T0 + 900_000);
    expect(series().results).toEqual([]);
    framePlay(16, INSTANT_PACE, T0 + 101_000);
    expect(series().scene).toBeNull();
    expect(series().active).toEqual({ index: 0, startedAtMs: T0 + 101_000 });

    // An answer for another drill, or an option this drill doesn't have, does nothing.
    submitSeriesJudgment('sample-predict-typo', { kind: 'pick', optionId: 'error' }, T0 + 102_000);
    submitSeriesJudgment('sample-diagnose-home', { kind: 'pick', optionId: 'nope' }, T0 + 103_000);
    expect(series().results).toEqual([]);
    submitSeriesJudgment('sample-diagnose-home', { kind: 'pick', optionId: 'home' }, T0 + 104_000);
    expect(series().results).toEqual([
      { drillId: 'sample-diagnose-home', passed: true, seconds: 3, overtime: false, keyId: 'home' },
    ]);
    // A review passed moves the item on rather than leaving it due today.
    const item = progress
      .get()
      .save?.reviewQueue.find((entry) => entry.drillId === 'sample-diagnose-home');
    expect(item).toBeDefined();
    expect((item?.dueOn ?? '') > '2026-09-27').toBe(true);
  });

  it('drops a scene when Kyle leaves partway through', () => {
    startNextDrill(T0);
    submitJudgment('sample-predict-typo', { kind: 'pick', optionId: 'error' }, T0 + 1_000);
    startNextDrill(T0 + 10_000);
    leavePlay();
    expect(() => {
      framePlay(16, INSTANT_PACE, T0 + 10_000);
    }).not.toThrow();
    expect(play.get().activity).toBeNull();
  });
});
