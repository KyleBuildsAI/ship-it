import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import { flushProgress, progress, startProgress, type ProgressStorage } from '../progress';
import { sandbox } from '../sandbox';
import { createDefaultSave } from '../save/schema';
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
import { play, type MissionActivity } from './playStore';

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

beforeEach(async () => {
  setCatalog({ act: sampleAct, missions: [sampleMission, secondMission, thirdMission] });
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
