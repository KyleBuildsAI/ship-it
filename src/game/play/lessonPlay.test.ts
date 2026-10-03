import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hud, openTerminal } from '../hud';
import { currentCard } from '../missions/lessonRunner';
import {
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import { sampleFinal, sampleLesson, sampleLessonAct } from '../missions/sample.test-lesson';
import { flushProgress, progress, startProgress, type ProgressStorage } from '../progress';
import { createDefaultSave } from '../save/schema';
import { findLesson, setCatalog } from './catalog';
import {
  answerLesson,
  checkLessonOrder,
  endLessonBriefing,
  lessonTick,
  moveLessonStep,
  nextLessonCard,
  startLesson,
} from './lessonPlay';
import { startMission } from './missionPlay';
import { leavePlay, tickPlay } from './play';
import { play, type LessonActivity } from './playStore';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const T0 = NOW.getTime();

function lesson(): LessonActivity {
  const current = play.get().activity;
  if (current?.kind !== 'lesson') throw new Error('no lesson is being played');
  return current;
}

function saved(id: string) {
  const save = progress.get().save;
  if (save === null) throw new Error('no save');
  return { mission: save.missions[id], xp: save.profile.xp };
}

/** Answers the card on screen: right first try, or one wrong pick first when `miss`. */
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

/** Plays the whole lesson; `misses` names the card indexes to get wrong first. */
function playThrough(misses: readonly number[] = []): void {
  endLessonBriefing(T0);
  const count = lesson().lesson.cards.length;
  for (let index = 0; index < count; index++) answer(misses.includes(index));
}

beforeEach(async () => {
  setCatalog({
    acts: [
      { act: sampleAct, missions: [sampleMission, secondMission, thirdMission] },
      sampleLessonAct(),
    ],
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

describe('playing a lesson', () => {
  it('finds lessons in the catalog by id, and only lessons', () => {
    expect(findLesson(sampleLesson.id)).toBe(sampleLesson);
    expect(findLesson(sampleMission.id)).toBeUndefined();
    expect(() => {
      startLesson('no-such-lesson');
    }).toThrow('No lesson has the id "no-such-lesson".');
  });

  it('leaves whatever was being played, and marks the lesson in progress', () => {
    startMission(sampleMission.id);
    openTerminal();
    startLesson(sampleLesson.id);
    expect(lesson().run.phase).toBe('briefing');
    expect(play.get().checklist).toEqual([]);
    expect(hud.get().terminalOpen).toBe(false);
    expect(saved(sampleLesson.id).mission?.status).toBe('in-progress');
  });

  it('completes with every card right first try: three stars, XP once', () => {
    startLesson(sampleLesson.id);
    playThrough();
    expect(lesson().run.outcome).toBe('finished');
    expect(lesson().xpEarned).toBe(sampleLesson.xp);
    const after = saved(sampleLesson.id);
    expect(after.mission).toMatchObject({ status: 'completed', bestDrillScore: 100 });
    expect(after.xp).toBe(sampleLesson.xp);

    // A replay keeps the lesson completed and pays no XP again.
    startLesson(sampleLesson.id);
    expect(saved(sampleLesson.id).mission?.status).toBe('completed');
    playThrough([0, 1, 2]);
    expect(lesson().xpEarned).toBe(0);
    expect(saved(sampleLesson.id)).toMatchObject({
      xp: sampleLesson.xp,
      // The best first-try score is kept, not the worse replay.
      mission: { bestDrillScore: 100 },
    });
  });

  it('counts a wrong answer then a right one as a miss for the stars', () => {
    startLesson(sampleLesson.id);
    playThrough([0, 2]);
    expect(lesson().run.firstTry).toEqual([false, true, false, true, true, true]);
    expect(saved(sampleLesson.id).mission?.bestDrillScore).toBe(67);
  });

  it('ignores answers and ticks when no lesson is on', () => {
    answerLesson('ask-units', T0);
    nextLessonCard(T0);
    lessonTick(T0);
    expect(play.get().activity).toBeNull();
  });
});

describe('a final lesson', () => {
  it('times out on its shared clock without completing, and can be tried again', () => {
    startLesson(sampleFinal.id);
    endLessonBriefing(T0);
    answer();
    tickPlay(T0 + 60_000);
    expect(lesson().run.outcome).toBe('running');
    tickPlay(T0 + 120_000);
    expect(lesson().run).toMatchObject({ phase: 'done', outcome: 'timed-out' });
    expect(saved(sampleFinal.id)).toMatchObject({ mission: { status: 'in-progress' }, xp: 0 });

    startLesson(sampleFinal.id);
    playThrough();
    expect(saved(sampleFinal.id)).toMatchObject({
      mission: { status: 'completed' },
      xp: sampleFinal.xp,
    });
  });

  it('saves a final whose last card was answered before the clock hit zero', () => {
    startLesson(sampleFinal.id);
    endLessonBriefing(T0);
    const count = sampleFinal.cards.length;
    for (let index = 0; index < count - 1; index++) answer();
    // The last card is solved, but Finish waits while its explanation is read.
    const last = currentCard(lesson().run, lesson().lesson);
    if (last === undefined || last.kind === 'order') throw new Error('expected a pick card');
    const right = last.options.find((option) => option.correct);
    if (right === undefined) throw new Error('no right option');
    answerLesson(right.id, T0);
    tickPlay(T0 + 121_000);
    expect(lesson().run.outcome).toBe('running');
    nextLessonCard(T0 + 122_000);
    expect(lesson().run).toMatchObject({ phase: 'done', outcome: 'finished' });
    expect(saved(sampleFinal.id)).toMatchObject({
      mission: { status: 'completed', bestDrillScore: 100 },
      xp: sampleFinal.xp,
    });
  });
});
