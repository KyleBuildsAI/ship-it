import { describe, expect, it } from 'vitest';
import {
  earlySampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import {
  sampleFinal,
  sampleLesson,
  sampleLessonAct,
  sampleSecondLesson,
} from '../missions/sample.test-lesson';
import type { Act } from '../missions/schema';
import { placementTestOutXp, XP_AWARDS } from '../progression/xp';
import { createDefaultSave, type SaveData } from '../save/schema';
import {
  completeBoss,
  completeLesson,
  completeMission,
  countPlacementAttempt,
  missionDone,
  questionXp,
  recordDrill,
  recordFieldMission,
  recordGitHubCheck,
  recordPlacement,
  recordReview,
  recordSteps,
  startMissionProgress,
  tickFieldTask,
} from './saveRules';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const LATER = new Date('2026-09-28T12:00:00.000Z');
const missions = [sampleMission, secondMission, thirdMission];
const drill = sampleMission.drills[0];
if (drill === undefined) throw new Error('the sample mission needs a drill');

function fresh(): SaveData {
  return createDefaultSave(NOW);
}

describe('mission progress', () => {
  it('marks a mission in progress once, and never un-completes it', () => {
    const started = startMissionProgress(fresh(), sampleMission.id);
    expect(started.missions[sampleMission.id]?.status).toBe('in-progress');
    const done = completeMission(
      started,
      sampleAct,
      sampleMission,
      { drillPercent: 80, questionXp: 0, directingXp: 0 },
      NOW,
    );
    expect(startMissionProgress(done, sampleMission.id)).toBe(done);
  });

  it('pays each step’s XP once, even when the mission is replayed', () => {
    const [first, second] = sampleMission.steps;
    if (first === undefined || second === undefined) throw new Error('need two steps');
    const once = recordSteps(fresh(), sampleMission, [first.id, second.id], 2);
    expect(once.profile.xp).toBe(first.xp + second.xp);
    expect(once.missions[sampleMission.id]?.stepIndex).toBe(2);
    const again = recordSteps(once, sampleMission, [first.id, second.id], 2);
    expect(again).toBe(once);
  });

  it('pays mission, question and directing XP on the first finish only, and keeps the best drill score', () => {
    const result = { drillPercent: 60, questionXp: 15, directingXp: 4 };
    const first = completeMission(fresh(), sampleAct, sampleMission, result, NOW);
    expect(first.profile.xp).toBe(sampleMission.xp + 15 + 4);
    const replay = completeMission(
      first,
      sampleAct,
      sampleMission,
      { drillPercent: 90, questionXp: 15, directingXp: 6 },
      LATER,
    );
    expect(replay.profile.xp).toBe(first.profile.xp);
    expect(replay.missions[sampleMission.id]).toMatchObject({
      status: 'completed',
      bestDrillScore: 90,
      completedAt: NOW.toISOString(),
    });
  });

  it('scores question picks by quality', () => {
    expect(questionXp([{ quality: 'strong' }, { quality: 'okay' }, { quality: 'weak' }])).toBe(
      XP_AWARDS.questionStrong + XP_AWARDS.questionOkay,
    );
  });
});

describe('drills and reviews', () => {
  it('records a pass with XP and a practice day', () => {
    const save = recordDrill(fresh(), drill, { passed: true, seconds: 12 }, NOW);
    expect(save.profile.xp).toBe(XP_AWARDS.drillCorrect);
    expect(save.profile.practiceDays).toEqual(['2026-09-27']);
    expect(save.drillHistory).toHaveLength(1);
    expect(save.reviewQueue).toEqual([]);
  });

  it('sends a miss to the review queue, due today', () => {
    const save = recordDrill(fresh(), drill, { passed: false, seconds: 200 }, NOW);
    expect(save.profile.xp).toBe(0);
    expect(save.reviewQueue).toMatchObject([{ drillId: drill.id, dueOn: '2026-09-27' }]);
  });

  it('reschedules a reviewed item with SM-2 instead of re-queuing it for today', () => {
    const missed = recordDrill(fresh(), drill, { passed: false, seconds: 200 }, NOW);
    const reviewed = recordReview(missed, drill, { passed: true, seconds: 5 }, NOW);
    expect(reviewed.reviewQueue[0]).toMatchObject({ repetitions: 1, dueOn: '2026-09-28' });
    expect(reviewed.drillHistory).toHaveLength(2);
  });

  it('keeps a failed review due tomorrow', () => {
    const missed = recordDrill(fresh(), drill, { passed: false, seconds: 200 }, NOW);
    const reviewed = recordReview(missed, drill, { passed: false, seconds: 5 }, NOW);
    expect(reviewed.reviewQueue[0]).toMatchObject({ repetitions: 0, dueOn: '2026-09-28' });
  });

  it("pays a drill's XP on its first pass only, so a replay or retake practises for free", () => {
    const first = recordDrill(fresh(), drill, { passed: true, seconds: 12 }, NOW);
    expect(first.paidDrillIds).toEqual([drill.id]);
    const again = recordDrill(first, drill, { passed: true, seconds: 8 }, LATER);
    expect(again.profile.xp).toBe(XP_AWARDS.drillCorrect);
    expect(again.paidDrillIds).toEqual([drill.id]);
    // The attempt itself still counts for stats and practice days.
    expect(again.drillHistory).toHaveLength(2);
    expect(again.profile.practiceDays).toEqual(['2026-09-27', '2026-09-28']);
  });

  it('pays a missed drill once a review gets it right, and no review after that', () => {
    const missed = recordDrill(fresh(), drill, { passed: false, seconds: 200 }, NOW);
    expect(missed.paidDrillIds).toEqual([]);
    const learned = recordReview(missed, drill, { passed: true, seconds: 5 }, NOW);
    expect(learned.profile.xp).toBe(XP_AWARDS.drillCorrect);
    const reviewedAgain = recordReview(learned, drill, { passed: true, seconds: 5 }, LATER);
    expect(reviewedAgain.profile.xp).toBe(XP_AWARDS.drillCorrect);
  });

  it("counts a pass in an older save's history as paid, since that save paid every pass", () => {
    const older: SaveData = {
      ...fresh(),
      drillHistory: [{ drillId: drill.id, correct: true, seconds: 9, at: NOW.toISOString() }],
    };
    const replayed = recordDrill(older, drill, { passed: true, seconds: 7 }, LATER);
    expect(replayed.profile.xp).toBe(0);
  });
});

describe('act milestones', () => {
  it('tests out once: half the mission XP, missions marked, act complete', () => {
    const passed = { percent: 90, testedOut: true };
    const save = recordPlacement(fresh(), sampleAct, missions, passed, NOW);
    const halves = missions.map((entry) => placementTestOutXp([entry.xp]));
    expect(save.profile.xp).toBe(halves.reduce((total, xp) => total + xp, 0));
    expect(save.missions[sampleMission.id]?.xpEarned).toBe(halves[0]);
    expect(missionDone(save, sampleMission.id)).toBe(true);
    expect(save.acts[String(sampleAct.act)]?.completedAt).toBe(NOW.toISOString());
    const again = recordPlacement(save, sampleAct, missions, passed, LATER);
    expect(again.profile.xp).toBe(save.profile.xp);
  });

  it('counts attempts when a run begins, and records only the score when it ends', () => {
    const begun = countPlacementAttempt(countPlacementAttempt(fresh(), sampleAct.act), 2);
    expect(begun.acts['2']?.placement).toEqual({
      attempts: 2,
      bestPercent: null,
      testedOut: false,
    });
    const missed = { percent: 40, testedOut: false };
    const ended = recordPlacement(begun, sampleAct, missions, missed, NOW);
    expect(ended.acts['2']?.placement).toEqual({
      attempts: 2,
      bestPercent: 40,
      testedOut: false,
    });
  });

  it('pays test-out XP only for missions not already finished', () => {
    const done = completeMission(
      fresh(),
      sampleAct,
      sampleMission,
      { drillPercent: 100, questionXp: 0, directingXp: 0 },
      NOW,
    );
    const save = recordPlacement(done, sampleAct, missions, { percent: 90, testedOut: true }, NOW);
    const rest = [secondMission, thirdMission].map((entry) => placementTestOutXp([entry.xp]));
    expect(save.profile.xp - done.profile.xp).toBe(rest.reduce((total, xp) => total + xp, 0));
    expect(save.missions[sampleMission.id]?.status).toBe('completed');
  });

  it('pays only the other half when a tested-out mission is finished later, and once', () => {
    const testedOut = recordPlacement(
      fresh(),
      sampleAct,
      missions,
      { percent: 90, testedOut: true },
      NOW,
    );
    const result = { drillPercent: 100, questionXp: 0, directingXp: 0 };
    const played = completeMission(testedOut, sampleAct, sampleMission, result, LATER);
    expect(played.profile.xp - testedOut.profile.xp).toBe(
      sampleMission.xp - placementTestOutXp([sampleMission.xp]),
    );
    expect(played.missions[sampleMission.id]?.xpEarned).toBe(sampleMission.xp);
    const replayed = completeMission(played, sampleAct, sampleMission, result, LATER);
    expect(replayed.profile.xp).toBe(played.profile.xp);
  });

  it('records a failed placement without completing anything', () => {
    const save = recordPlacement(
      fresh(),
      sampleAct,
      missions,
      { percent: 50, testedOut: false },
      NOW,
    );
    expect(save.profile.xp).toBe(0);
    expect(save.acts[String(sampleAct.act)]).toMatchObject({
      placement: { attempts: 0, bestPercent: 50, testedOut: false },
      completedAt: null,
    });
  });

  it('completes the act after every mission, the boss, and the field mission', () => {
    let save = fresh();
    for (const entry of missions) {
      save = completeMission(
        save,
        sampleAct,
        entry,
        { drillPercent: 100, questionXp: 0, directingXp: 0 },
        NOW,
      );
    }
    save = completeBoss(save, sampleAct, NOW);
    expect(save.acts[String(sampleAct.act)]?.completedAt).toBeNull();
    const ids = sampleAct.fieldMission.verifications.map((check) => check.id);
    save = recordFieldMission(save, sampleAct, ids, NOW);
    expect(save.acts[String(sampleAct.act)]).toMatchObject({
      bossCompletedAt: NOW.toISOString(),
      fieldMissionCompletedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
    });
  });

  it('pays the boss and field mission XP once', () => {
    const boss = completeBoss(fresh(), sampleAct, NOW);
    expect(boss.profile.xp).toBe(XP_AWARDS.boss);
    expect(completeBoss(boss, sampleAct, LATER)).toBe(boss);
    const ids = sampleAct.fieldMission.verifications.map((check) => check.id);
    const field = recordFieldMission(boss, sampleAct, ids, NOW);
    expect(field.profile.xp).toBe(XP_AWARDS.boss + XP_AWARDS.fieldMission);
    expect(recordFieldMission(field, sampleAct, ids, LATER).profile.xp).toBe(field.profile.xp);
  });

  it('remembers field checks passed on different days', () => {
    const [first, ...rest] = sampleAct.fieldMission.verifications;
    if (first === undefined) throw new Error('need a verification');
    const partial = recordFieldMission(fresh(), sampleAct, [first.id], NOW);
    const entry = partial.fieldMissions[sampleAct.fieldMission.id];
    expect(entry?.checklist[first.id]).toBe(true);
    expect(entry?.verifiedAt).toBe(rest.length === 0 ? NOW.toISOString() : null);
  });

  it('remembers the GitHub check, which never completes the mission or the Act', () => {
    const id = sampleAct.fieldMission.id;
    const failed = recordGitHubCheck(fresh(), sampleAct, 'kyle/sandcastles', null);
    expect(failed.fieldMissions[id]).toEqual({
      checklist: {},
      verifiedAt: null,
      githubRepo: 'kyle/sandcastles',
    });
    const passed = recordGitHubCheck(failed, sampleAct, 'kyle/sandcastles', NOW);
    expect(passed.fieldMissions[id]?.githubVerifiedAt).toBe(NOW.toISOString());
    expect(passed.acts[String(sampleAct.act)]?.fieldMissionCompletedAt ?? null).toBeNull();
    // A later failed check keeps the pass; naming another repo clears it.
    const again = recordGitHubCheck(passed, sampleAct, 'kyle/sandcastles', null);
    expect(again.fieldMissions[id]?.githubVerifiedAt).toBe(NOW.toISOString());
    const other = recordGitHubCheck(passed, sampleAct, 'kyle/other', null);
    expect(other.fieldMissions[id]?.githubVerifiedAt).toBeUndefined();
    // Passing pastes later keeps the repo Kyle named.
    const ids = sampleAct.fieldMission.verifications.map((check) => check.id);
    expect(recordFieldMission(passed, sampleAct, ids, LATER).fieldMissions[id]?.githubRepo).toBe(
      'kyle/sandcastles',
    );
  });

  it('saves a ticked task, unticks it, and never completes the mission by ticks alone', () => {
    const field = sampleAct.fieldMission;
    const [task] = field.checklist;
    if (task === undefined) throw new Error('need a checklist task');
    let save = fresh();
    for (const item of field.checklist) save = tickFieldTask(save, sampleAct, item.id, true);
    expect(save.fieldMissions[field.id]?.checklist[task.id]).toBe(true);
    expect(save.fieldMissions[field.id]?.verifiedAt).toBeNull();
    expect(save.acts[String(sampleAct.act)]?.fieldMissionCompletedAt ?? null).toBeNull();
    save = tickFieldTask(save, sampleAct, task.id, false);
    expect(save.fieldMissions[field.id]?.checklist[task.id]).toBe(false);
  });

  it('ignores a tick for a task the Field Mission doesn’t have', () => {
    const save = fresh();
    expect(tickFieldTask(save, sampleAct, 'no-such-task', true)).toBe(save);
  });
});

describe('an early-access act', () => {
  const early = earlySampleAct();
  // Every part built but the placement test, which early access doesn't allow.
  const earlyAct: Act = {
    ...early.act,
    boss: sampleAct.boss,
    fieldMission: sampleAct.fieldMission,
  };

  /** Finishes the Act's mission, beats its boss, and verifies its Field Mission. */
  function finishEverything(target: Act): SaveData {
    let save = fresh();
    for (const entry of early.missions) {
      save = completeMission(
        save,
        target,
        entry,
        { drillPercent: 100, questionXp: 0, directingXp: 0 },
        NOW,
      );
    }
    save = completeBoss(save, target, NOW);
    const ids = sampleAct.fieldMission.verifications.map((check) => check.id);
    return recordFieldMission(save, target, ids, NOW);
  }

  it('never completes, even with every part it has done', () => {
    const save = finishEverything(earlyAct);
    expect(save.acts[String(earlyAct.act)]).toMatchObject({
      bossCompletedAt: NOW.toISOString(),
      fieldMissionCompletedAt: NOW.toISOString(),
      completedAt: null,
    });
    // The same progress completes the Act once it leaves early access.
    const finished = finishEverything({ ...earlyAct, earlyAccess: false });
    expect(finished.acts[String(earlyAct.act)]?.completedAt).toBe(NOW.toISOString());
  });
});

describe('an act made of lessons', () => {
  const { act: lessonAct } = sampleLessonAct();
  const progressOf = (save: SaveData) => save.acts[String(lessonAct.act)];

  it('completes when its final is done, with the final counted as the boss', () => {
    let save = fresh();
    save = completeLesson(save, lessonAct, sampleLesson, 100, NOW);
    save = completeLesson(save, lessonAct, sampleSecondLesson, 80, NOW);
    expect(progressOf(save)?.completedAt ?? null).toBeNull();
    save = completeLesson(save, lessonAct, sampleFinal, 50, LATER);
    expect(progressOf(save)).toMatchObject({
      bossCompletedAt: LATER.toISOString(),
      completedAt: LATER.toISOString(),
    });
    // The final pays its own XP; the boss award isn't paid on top.
    expect(save.profile.xp).toBe(sampleLesson.xp + sampleSecondLesson.xp + sampleFinal.xp);
  });

  it('is not complete from the final alone, and a replay changes nothing', () => {
    let save = completeLesson(fresh(), lessonAct, sampleFinal, 100, NOW);
    expect(progressOf(save)).toMatchObject({
      bossCompletedAt: NOW.toISOString(),
      completedAt: null,
    });
    save = completeLesson(save, lessonAct, sampleLesson, 100, NOW);
    save = completeLesson(save, lessonAct, sampleSecondLesson, 100, NOW);
    expect(progressOf(save)?.completedAt).toBe(NOW.toISOString());
    const replay = completeLesson(save, lessonAct, sampleFinal, 100, LATER);
    expect(progressOf(replay)).toEqual(progressOf(save));
    expect(replay.profile.xp).toBe(save.profile.xp);
  });

  it('waits for its Field Mission when it has one', () => {
    const withField: Act = { ...lessonAct, fieldMission: sampleAct.fieldMission };
    let save = fresh();
    for (const lesson of [sampleLesson, sampleSecondLesson, sampleFinal]) {
      save = completeLesson(save, withField, lesson, 100, NOW);
    }
    expect(progressOf(save)?.completedAt).toBeNull();
    const ids = sampleAct.fieldMission.verifications.map((check) => check.id);
    save = recordFieldMission(save, withField, ids, LATER);
    expect(progressOf(save)?.completedAt).toBe(LATER.toISOString());
  });
});
