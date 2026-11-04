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
import {
  flushProgress,
  progress,
  saveProgressNow,
  startProgress,
  type ProgressStorage,
} from '../progress';
import { placementTestOutXp } from '../progression/xp';
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

  it('tests out at 85%: its lessons are tested out, the final and Field Mission stay', () => {
    startLessonPlacement(act.act);
    playThrough();
    expect(lesson().placement?.result).toEqual({ percent: 100, testedOut: true });
    expect(activeDrillSession()).toBeNull();
    const after = save();
    expect(after.missions[firstLesson.id]?.status).toBe('tested-out');
    expect(after.missions[secondLesson.id]?.status).toBe('tested-out');
    expect(after.missions[finalLesson.id]).toBeUndefined();
    // Cards can be guessed, so a test-out doesn't skip the work on a real repo.
    expect(after.acts['6']).toMatchObject({
      placement: { attempts: 1, bestPercent: 100, testedOut: true },
      completedAt: null,
    });
    expect(recommendedAct(after)).toBe(act.act);
    // Half the tested-out lessons' XP, and none for the final.
    expect(after.profile.xp).toBe((firstLesson.xp + secondLesson.xp) / 2);
    const verified = recordFieldMission(
      after,
      act,
      ['sample-full-clean', 'sample-full-history'],
      NOW,
    );
    expect(verified.acts['6']?.completedAt).toBe(NOW.toISOString());
  });

  it('completes at once on a test-out when the lesson Act has no Field Mission', () => {
    const noField: typeof act = { ...act };
    delete noField.fieldMission;
    const tested = recordPlacement(
      createDefaultSave(NOW),
      noField,
      full.lessons,
      { percent: 100, testedOut: true },
      NOW,
    );
    expect(tested.acts['6']?.completedAt).toBe(NOW.toISOString());
  });

  it('says in its briefing only what the save still has to do', () => {
    startLessonPlacement(act.act);
    expect(lesson().lesson.briefing[2]).toContain('Field Mission');
    leavePlay();
    const checks = ['sample-full-clean', 'sample-full-history'];
    saveProgressNow((current) => recordFieldMission(current, act, checks, NOW));
    startLessonPlacement(act.act);
    // Verified, so a pass leaves nothing the briefing needs to name.
    expect(lesson().lesson.briefing).toHaveLength(2);
    expect(lesson().lesson.briefing.join(' ')).not.toContain('Field Mission');
    leavePlay();
    for (const entry of full.lessons) {
      saveProgressNow((current) => completeLesson(current, act, entry, 100, NOW));
    }
    startLessonPlacement(act.act);
    expect(lesson().lesson.briefing[2]).toBe(
      'Act 6 is already complete, so a pass only raises your best score.',
    );
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

describe("a lesson placement test can't be passed by retrying", () => {
  /** Picks a wrong answer on the card on screen. */
  function pickWrong(): void {
    const { lesson: playing, run } = lesson();
    const card = currentCard(run, playing);
    if (card === undefined) throw new Error('no card');
    if (card.kind === 'order') checkLessonOrder(T0);
    else answerLesson(card.options.find((option) => !option.correct)?.id ?? '', T0);
  }

  /** Each card's option ids in the order shown; an order card's are its scrambled steps. */
  function optionOrder(): string[][] {
    return lesson().lesson.cards.map((card) =>
      card.kind === 'order' ? [] : card.options.map((option) => option.id),
    );
  }

  it('locks each card on its first answer and never says which answer was right', () => {
    startLessonPlacement(act.act);
    endLessonBriefing(T0);
    const { lesson: playing, run } = lesson();
    const card = currentCard(run, playing);
    if (card === undefined || card.kind === 'order') throw new Error('expected a pick card');
    pickWrong();
    expect(lesson().run.card).toMatchObject({ solved: true, picked: [expect.any(String)] });
    expect(lesson().run.firstTry).toEqual([false]);
    // The right answer can't be tried now: the card is over, and the run says nothing more.
    const right = card.options.find((option) => option.correct);
    answerLesson(right?.id ?? '', T0);
    expect(lesson().run.card.picked).toHaveLength(1);
    expect(lesson().run.firstTry).toEqual([false]);
  });

  it('scores a run that picked wrong every time at 0%, and a retry starts locked again', () => {
    startLessonPlacement(act.act);
    endLessonBriefing(T0);
    const count = lesson().lesson.cards.length;
    for (let index = 0; index < count; index++) {
      pickWrong();
      nextLessonCard(T0);
    }
    expect(lesson().placement?.result).toEqual({ percent: 0, testedOut: false });
    startLessonPlacement(act.act);
    expect(lesson().run.locked).toBe(true);
  });

  it('shows each attempt its options in a new order', () => {
    startLessonPlacement(act.act);
    const firstOrder = optionOrder();
    endLessonBriefing(T0);
    leavePlay();
    startLessonPlacement(act.act);
    const secondOrder = optionOrder();
    expect(secondOrder).not.toEqual(firstOrder);
    // Same options, only moved: nothing is added or lost.
    expect(secondOrder.map((ids) => [...ids].sort())).toEqual(
      firstOrder.map((ids) => [...ids].sort()),
    );
  });

  it('counts a run left after one card as an attempt, but not one left at the briefing', () => {
    startLessonPlacement(act.act);
    leavePlay();
    expect(save().acts['6']?.placement.attempts ?? 0).toBe(0);
    startLessonPlacement(act.act);
    endLessonBriefing(T0);
    answer();
    leavePlay();
    expect(save().acts['6']?.placement).toMatchObject({
      attempts: 1,
      bestPercent: null,
      testedOut: false,
    });
    expect(save().acts['6']?.completedAt ?? null).toBeNull();
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
    // Testing out pays half of every lesson it skips; the finished one already paid in full.
    expect(next.profile.xp).toBe(firstLesson.xp + placementTestOutXp([secondLesson.xp]));
  });

  it('pays only the other half for a tested-out lesson played later, then nothing', () => {
    const testedOut = recordPlacement(
      createDefaultSave(NOW),
      act,
      full.lessons,
      { percent: 90, testedOut: true },
      NOW,
    );
    const played = completeLesson(testedOut, act, firstLesson, 100, NOW);
    expect(played.profile.xp - testedOut.profile.xp).toBe(
      firstLesson.xp - placementTestOutXp([firstLesson.xp]),
    );
    expect(completeLesson(played, act, firstLesson, 100, NOW).profile.xp).toBe(played.profile.xp);
  });
});
