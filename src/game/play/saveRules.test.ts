import { describe, expect, it } from 'vitest';
import {
  earlySampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import type { Act } from '../missions/schema';
import { XP_AWARDS } from '../progression/xp';
import { createDefaultSave, type SaveData } from '../save/schema';
import {
  completeBoss,
  completeMission,
  missionDone,
  questionXp,
  recordDrill,
  recordFieldMission,
  recordPlacement,
  recordReview,
  recordSteps,
  startMissionProgress,
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
      { drillPercent: 80, questionXp: 0 },
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

  it('pays mission and question XP on the first finish only, and keeps the best drill score', () => {
    const result = { drillPercent: 60, questionXp: 15 };
    const first = completeMission(fresh(), sampleAct, sampleMission, result, NOW);
    expect(first.profile.xp).toBe(sampleMission.xp + 15);
    const replay = completeMission(
      first,
      sampleAct,
      sampleMission,
      { drillPercent: 90, questionXp: 15 },
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
});

describe('act milestones', () => {
  it('tests out once: half the mission XP, missions marked, act complete', () => {
    const passed = { percent: 90, testedOut: true };
    const save = recordPlacement(fresh(), sampleAct, missions, passed, NOW);
    const missionXp = missions.reduce((total, entry) => total + entry.xp, 0);
    expect(save.profile.xp).toBe(Math.round(missionXp / 2));
    expect(missionDone(save, sampleMission.id)).toBe(true);
    expect(save.acts[String(sampleAct.act)]?.completedAt).toBe(NOW.toISOString());
    const again = recordPlacement(save, sampleAct, missions, passed, LATER);
    expect(again.profile.xp).toBe(save.profile.xp);
    expect(again.acts[String(sampleAct.act)]?.placement.attempts).toBe(2);
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
      placement: { attempts: 1, bestPercent: 50, testedOut: false },
      completedAt: null,
    });
  });

  it('completes the act after every mission, the boss, and the field mission', () => {
    let save = fresh();
    for (const entry of missions) {
      save = completeMission(save, sampleAct, entry, { drillPercent: 100, questionXp: 0 }, NOW);
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
      save = completeMission(save, target, entry, { drillPercent: 100, questionXp: 0 }, NOW);
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
