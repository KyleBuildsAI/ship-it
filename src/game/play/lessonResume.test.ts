import { describe, expect, it } from 'vitest';
import {
  checkOrder,
  finishLessonBriefing,
  nextCard,
  pickOption,
  startLessonRun,
  type LessonRun,
} from '../missions/lessonRunner';
import { sampleFinal, sampleLesson } from '../missions/sample.test-lesson';
import { createMissionProgress, type MissionProgress } from '../save/schema';
import {
  lessonResumeFor,
  lessonResumeOf,
  lessonResumes,
  resumeCardNumber,
  resumedLessonRun,
} from './lessonResume';

/*
 * The sample lesson's cards, in order: read-the-diff (choose, right: ask-units),
 * brief-the-fix (prompt, right: specific), merge-steps (order), then three more choose
 * cards. Wrong options used here: approve (card 1) and vague (card 2).
 */

const T0 = 1_000;
const cards = () => finishLessonBriefing(startLessonRun(sampleLesson), T0);

/** The first two cards answered: the first right first time, the second after a miss. */
function twoAnswered(): LessonRun {
  let run = pickOption(cards(), sampleLesson, 'ask-units');
  run = nextCard(run, sampleLesson);
  run = pickOption(run, sampleLesson, 'vague');
  run = pickOption(run, sampleLesson, 'specific');
  return nextCard(run, sampleLesson);
}

function inProgress(lessonResume: MissionProgress['lessonResume']): MissionProgress {
  return { ...createMissionProgress(), status: 'in-progress', lessonResume };
}

describe('what the save keeps of a lesson run', () => {
  it('keeps each answered card and its first try, and no open card without a miss', () => {
    expect(lessonResumeOf(twoAnswered(), sampleLesson)).toEqual({
      answered: [
        { cardId: 'read-the-diff', firstTry: true },
        { cardId: 'brief-the-fix', firstTry: false },
      ],
      open: null,
    });
  });

  it("keeps the next card's wrong tries, so a miss can't become a first try", () => {
    const missed = pickOption(cards(), sampleLesson, 'approve');
    expect(lessonResumeOf(missed, sampleLesson)).toEqual({
      answered: [],
      open: { cardId: 'read-the-diff', picked: ['approve'], wrongOrders: 0 },
    });
    const orderCard = checkOrder(twoAnswered(), sampleLesson);
    expect(lessonResumeOf(orderCard, sampleLesson).open).toEqual({
      cardId: 'merge-steps',
      picked: [],
      wrongOrders: 1,
    });
  });
});

describe('whether Play picks a lesson up', () => {
  const kept = lessonResumeOf(twoAnswered(), sampleLesson);

  it('picks up an untimed lesson in progress, at its first unanswered card', () => {
    expect(lessonResumes(sampleLesson)).toBe(true);
    expect(lessonResumeFor(sampleLesson, inProgress(kept))).toEqual(kept);
    expect(resumeCardNumber(sampleLesson, kept)).toBe(3);
  });

  it('starts over at the briefing for a timed final, whose clock cannot wait', () => {
    expect(lessonResumes(sampleFinal)).toBe(false);
    expect(lessonResumeFor(sampleFinal, inProgress(kept))).toBeNull();
  });

  it('starts over when nothing is kept, nothing was answered, or the lesson is done', () => {
    expect(lessonResumeFor(sampleLesson, undefined)).toBeNull();
    expect(lessonResumeFor(sampleLesson, inProgress(undefined))).toBeNull();
    expect(lessonResumeFor(sampleLesson, inProgress({ answered: [], open: null }))).toBeNull();
    const done = { ...inProgress(kept), status: 'completed' as const };
    expect(lessonResumeFor(sampleLesson, done)).toBeNull();
  });

  it("starts over when the kept answers don't match the lesson's cards any more", () => {
    const renamed = { ...kept, answered: [{ cardId: 'gone', firstTry: true }] };
    expect(lessonResumeFor(sampleLesson, inProgress(renamed))).toBeNull();
    const tooMany = {
      answered: [...sampleLesson.cards, sampleLesson.cards[0]].map((card) => ({
        cardId: card?.id ?? '',
        firstTry: true,
      })),
      open: null,
    };
    expect(lessonResumeFor(sampleLesson, inProgress(tooMany))).toBeNull();
  });
});

describe('a picked-up run', () => {
  it('opens past the briefing on the first unanswered card, first tries kept', () => {
    const run = resumedLessonRun(sampleLesson, lessonResumeOf(twoAnswered(), sampleLesson), T0);
    expect(run).toMatchObject({
      phase: 'cards',
      outcome: 'running',
      cardIndex: 2,
      firstTry: [true, false],
      card: { solved: false, picked: [], wrongOrders: 0 },
    });
    expect(run.card.order).toHaveLength(4);
  });

  it("keeps the open card's miss, so the right answer now isn't a first try", () => {
    const missed = lessonResumeOf(pickOption(cards(), sampleLesson, 'approve'), sampleLesson);
    const run = resumedLessonRun(sampleLesson, missed, T0);
    expect(run.card.picked).toEqual(['approve']);
    expect(pickOption(run, sampleLesson, 'ask-units').firstTry).toEqual([false]);
    // An order card's wrong check is kept the same way.
    const orderMiss = lessonResumeOf(checkOrder(twoAnswered(), sampleLesson), sampleLesson);
    expect(resumedLessonRun(sampleLesson, orderMiss, T0).card.wrongOrders).toBe(1);
  });

  it('opens on the last card, solved, when only Finish was left', () => {
    const answered = sampleLesson.cards.map((card) => ({ cardId: card.id, firstTry: true }));
    const run = resumedLessonRun(sampleLesson, { answered, open: null }, T0);
    const last = sampleLesson.cards.length - 1;
    expect(run).toMatchObject({ cardIndex: last, card: { solved: true } });
    expect(resumeCardNumber(sampleLesson, { answered, open: null })).toBe(last + 1);
    expect(nextCard(run, sampleLesson)).toMatchObject({ phase: 'done', outcome: 'finished' });
  });
});
