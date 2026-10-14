import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activeDrillSession } from '../../mentor/drillGuard';
import { hud, openTerminal } from '../hud';
import { currentCard } from '../missions/lessonRunner';
import { placementLessonId } from '../missions/lessonPlacement';
import { fullSampleLessonAct } from '../missions/sample.test-lessonAct';
import {
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import { flushProgress, progress, startProgress, type ProgressStorage } from '../progress';
import { createDefaultSave, type SaveData } from '../save/schema';
import { hasWorkLeft, recommendedAct, setCatalog } from './catalog';
import { startFieldMission, submitFieldPaste } from './fieldPlay';
import {
  answerLesson,
  checkLessonOrder,
  endLessonBriefing,
  moveLessonStep,
  nextLessonCard,
  startLesson,
  startLessonPlacement,
} from './lessonPlay';
import { leavePlay, startActPlacement, tickPlay } from './play';
import { play, type LessonActivity } from './playStore';
import { completeLesson, recordFieldMission, recordPlacement } from './saveRules';

/*
 * A lesson Act with every part, played the way Kyle would: its placement test in the
 * lesson view, its lessons and final, and its Field Mission. The sample Act is test data
 * (sample.test-lessonAct.ts), never shipped.
 */

const NOW = new Date('2026-10-13T12:00:00.000Z');
const T0 = NOW.getTime();
const full = fullSampleLessonAct();
const { act } = full;
const [firstLesson, secondLesson, finalLesson] = full.lessons;
if (firstLesson === undefined || secondLesson === undefined || finalLesson === undefined) {
  throw new Error('the full sample Act has three lessons');
}

const CLEAN = 'On branch main\nnothing to commit, working tree clean\n';
const LOG = 'a1b2c3d feat: add tide chart\nb2c3d4e fix: round heights\nc3d4e5f docs: add setup\n';

function lesson(): LessonActivity {
  const current = play.get().activity;
  if (current?.kind !== 'lesson') throw new Error('no lesson is being played');
  return current;
}

function save(): SaveData {
  const current = progress.get().save;
  if (current === null) throw new Error('no save');
  return current;
}

/** Answers the card on screen: right first try, or one wrong try first when `miss`. */
function answer(miss = false): void {
  const { lesson: playing, run } = lesson();
  const card = currentCard(run, playing);
  if (card === undefined) throw new Error('no card');
  if (card.kind === 'order') {
    if (miss) checkLessonOrder(T0);
    card.steps.forEach((step, target) => {
      while (lesson().run.card.order.indexOf(step.id) > target) moveLessonStep(step.id, -1, T0);
    });
    checkLessonOrder(T0);
  } else {
    const wrong = card.options.find((option) => !option.correct);
    const right = card.options.find((option) => option.correct);
    if (miss && wrong !== undefined) answerLesson(wrong.id, T0);
    if (right !== undefined) answerLesson(right.id, T0);
  }
  nextLessonCard(T0);
}

function playThrough(misses: readonly number[] = []): void {
  endLessonBriefing(T0);
  const count = lesson().lesson.cards.length;
  for (let index = 0; index < count; index++) answer(misses.includes(index));
}

beforeEach(async () => {
  setCatalog({ acts: [full] });
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

describe("a lesson Act's placement test", () => {
  it('plays the borrowed cards as a lesson, with the terminal closed and Sage quiet', () => {
    openTerminal();
    startLessonPlacement(act.act);
    expect(lesson()).toMatchObject({
      lesson: { id: placementLessonId(act.act), kind: 'final' },
      run: { phase: 'briefing' },
      placement: { act: act.act, passPercent: 85, result: null },
    });
    expect(hud.get().terminalOpen).toBe(false);
    expect(activeDrillSession()).toBe(`placement:${placementLessonId(act.act)}`);
    // A placement run is never saved as a lesson of its own.
    expect(save().missions[placementLessonId(act.act)]).toBeUndefined();
  });

  it('tests out at 85%: its lessons are tested out, the final stays, the Act completes', () => {
    startLessonPlacement(act.act);
    playThrough();
    expect(lesson().placement?.result).toEqual({ percent: 100, testedOut: true });
    expect(activeDrillSession()).toBeNull();
    const after = save();
    expect(after.missions[firstLesson.id]?.status).toBe('tested-out');
    expect(after.missions[secondLesson.id]?.status).toBe('tested-out');
    expect(after.missions[finalLesson.id]).toBeUndefined();
    expect(after.acts['6']).toMatchObject({
      placement: { attempts: 1, bestPercent: 100, testedOut: true },
      completedAt: NOW.toISOString(),
    });
    // Half the tested-out lessons' XP, and none for the final.
    expect(after.profile.xp).toBe((firstLesson.xp + secondLesson.xp) / 2);
  });

  it('saves a miss as an attempt, and leaves the lessons to play', () => {
    startLessonPlacement(act.act);
    playThrough([0, 1]);
    expect(lesson().placement?.result).toEqual({ percent: 67, testedOut: false });
    expect(save().acts['6']).toMatchObject({
      placement: { attempts: 1, bestPercent: 67, testedOut: false },
      completedAt: null,
    });
    expect(save().missions[firstLesson.id]).toBeUndefined();
    expect(save().profile.xp).toBe(0);
  });

  it('saves a run whose clock ran out, counting the cards never reached as missed', () => {
    startLessonPlacement(act.act);
    endLessonBriefing(T0);
    answer();
    tickPlay(T0 + 240_000);
    expect(lesson().run.outcome).toBe('timed-out');
    expect(lesson().placement?.result).toEqual({ percent: 17, testedOut: false });
    expect(save().acts['6']?.placement.attempts).toBe(1);
  });
});

describe('taking an Act’s placement test from its menu', () => {
  it('plays cards for a lesson Act, and drills for an Act with missions', () => {
    const missions = [sampleMission, secondMission, thirdMission];
    setCatalog({ acts: [{ act: sampleAct, missions }, full] });
    startActPlacement(act.act);
    expect(lesson().placement?.act).toBe(act.act);
    startActPlacement(sampleAct.act);
    expect(play.get().activity).toMatchObject({ kind: 'placement', act: sampleAct.act });
  });
});

describe("a lesson Act's Field Mission", () => {
  it('opens from the Act like Act 2’s, with the terminal closed', () => {
    openTerminal();
    startFieldMission(act.act);
    expect(play.get().activity).toEqual({ kind: 'field', act: act.act });
    expect(hud.get().terminalOpen).toBe(false);
  });

  it('is verified by pastes alone, no token, and records each check as it passes', () => {
    startFieldMission(act.act);
    expect(submitFieldPaste('sample-full-clean', 'On branch main\nChanges not staged')).toEqual(
      expect.objectContaining({ passed: false }),
    );
    expect(submitFieldPaste('sample-full-clean', CLEAN, NOW).passed).toBe(true);
    expect(save().fieldMissions['sample-full-field']).toEqual({
      checklist: { 'sample-full-clean': true },
      verifiedAt: null,
    });
    expect(submitFieldPaste('sample-full-history', LOG, NOW).passed).toBe(true);
    expect(save().acts['6']?.fieldMissionCompletedAt).toBe(NOW.toISOString());
  });
});

describe('finishing a lesson Act with every part', () => {
  it('needs every lesson, the final and the Field Mission, in any order', () => {
    let next = createDefaultSave(NOW);
    for (const entry of full.lessons) next = completeLesson(next, act, entry, 100, NOW);
    // The final is beaten, so the boss is, but the Field Mission is still to do.
    expect(next.acts['6']).toMatchObject({ bossCompletedAt: NOW.toISOString(), completedAt: null });
    expect(hasWorkLeft(next, act)).toBe(true);
    next = recordFieldMission(next, act, ['sample-full-clean', 'sample-full-history'], NOW);
    expect(next.acts['6']?.completedAt).toBe(NOW.toISOString());
    expect(hasWorkLeft(next, act)).toBe(false);
  });

  it('plays its lessons and final end to end in the lesson view', () => {
    for (const entry of full.lessons) {
      startLesson(entry.id);
      playThrough();
    }
    // Nothing is recorded while no Field Mission is open.
    expect(submitFieldPaste('sample-full-clean', CLEAN, NOW).passed).toBe(false);
    startFieldMission(act.act);
    submitFieldPaste('sample-full-clean', CLEAN, NOW);
    submitFieldPaste('sample-full-history', LOG, NOW);
    expect(save().acts['6']?.completedAt).not.toBeNull();
    expect(recommendedAct(save())).toBe(6);
  });

  it('keeps a lesson completed when a later placement tests out', () => {
    let next = completeLesson(createDefaultSave(NOW), act, firstLesson, 100, NOW);
    next = recordPlacement(next, act, full.lessons, { percent: 90, testedOut: true }, NOW);
    expect(next.missions[firstLesson.id]?.status).toBe('completed');
    expect(next.missions[secondLesson.id]?.status).toBe('tested-out');
    // Testing out pays half of every skipped lesson's XP, as Act 2's does for missions.
    expect(next.profile.xp).toBe(firstLesson.xp + (firstLesson.xp + secondLesson.xp) / 2);
  });
});
