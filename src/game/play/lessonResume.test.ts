import { describe, expect, it } from 'vitest';
import { answerFlags, type ReviewFlag } from '../missions/codeReview';
import {
  checkOrder,
  checkReview,
  finishLessonBriefing,
  nextCard,
  pickOption,
  setFlagIssue,
  startLessonRun,
  toggleFlag,
  type LessonRun,
} from '../missions/lessonRunner';
import { sampleReviewLesson } from '../missions/sample.test-codeReview';
import { sampleFinal, sampleLesson, sampleLessonAct } from '../missions/sample.test-lesson';
import { sampleAct, sampleMission } from '../missions/sample.test-mission';
import { createMissionProgress, type MissionProgress } from '../save/schema';
import { summarizeAct } from './actSummary';
import {
  lessonResumeFor,
  lessonResumeOf,
  lessonResumes,
  partResumeFor,
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
    expect(resumeCardNumber(sampleLesson.cards.length, kept)).toBe(3);
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

  it("gives the Act menu the same answer from a row's summary, with no lesson content", () => {
    const [lessonRow, , finalRow] = summarizeAct(sampleLessonAct()).parts;
    if (lessonRow === undefined || finalRow === undefined) throw new Error('Rows are missing.');
    const renamed = { ...kept, answered: [{ cardId: 'gone', firstTry: true }] };
    const saves = [undefined, inProgress(kept), inProgress(renamed), inProgress(undefined)];
    // Asked of Play's own rule each time, so the two can't drift apart unnoticed.
    for (const saved of saves) {
      expect(partResumeFor(lessonRow, saved)).toEqual(lessonResumeFor(sampleLesson, saved));
      expect(partResumeFor(finalRow, saved)).toEqual(lessonResumeFor(sampleFinal, saved));
    }
    // One fixed answer too, so the loop isn't only ever comparing two nulls.
    expect(partResumeFor(lessonRow, inProgress(kept))).toEqual(kept);
  });

  it('never resumes a mission row, whatever lesson progress the save holds', () => {
    const [missionRow] = summarizeAct({ act: sampleAct, missions: [sampleMission] }).parts;
    if (missionRow === undefined) throw new Error('The mission row is missing.');
    // Nothing answered but an open card: the one shape that passes every other check.
    const openOnly = { answered: [], open: { cardId: 'any', picked: [], wrongOrders: 1 } };
    expect(partResumeFor(missionRow, inProgress(openOnly))).toBeNull();
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
    expect(resumeCardNumber(sampleLesson.cards.length, { answered, open: null })).toBe(last + 1);
    expect(nextCard(run, sampleLesson)).toMatchObject({ phase: 'done', outcome: 'finished' });
  });
});

describe('a code review card left partway', () => {
  const lesson = sampleReviewLesson;
  const [reviewCard] = lesson.cards.filter((card) => card.kind === 'code-review');
  if (reviewCard?.kind !== 'code-review') throw new Error('The sample has no review card.');

  /** Back on the review card, the five cards before it answered right first time. */
  const atReview = () => {
    const answered = lesson.cards.slice(0, 5).map((card) => ({ cardId: card.id, firstTry: true }));
    return resumedLessonRun(lesson, { answered, open: null }, T0);
  };

  /** Flags each row with its problem, as a player clicks them. */
  function flag(run: LessonRun, flags: readonly ReviewFlag[]): LessonRun {
    return flags.reduce((next, { row, issue }) => {
      const flagged = toggleFlag(next, lesson, row);
      return issue === null ? flagged : setFlagIssue(flagged, lesson, row, issue);
    }, run);
  }

  it("keeps a wrong check, so the review can't become a first try", () => {
    const missed = checkReview(flag(atReview(), [{ row: 3, issue: 'security' }]), lesson);
    const kept = lessonResumeOf(missed, lesson);
    expect(kept.open).toEqual({
      cardId: reviewCard.id,
      picked: [],
      wrongOrders: 0,
      wrongFlagChecks: 1,
    });
    const run = resumedLessonRun(lesson, kept, T0);
    expect(run.card.review).toEqual({ flags: [], check: null, wrongChecks: 1, passed: false });
    const passed = checkReview(flag(run, answerFlags(reviewCard)), lesson);
    expect(pickOption(passed, lesson, 'specific').firstTry.at(-1)).toBe(false);
  });

  it('picks a wrong comment back up on the comment step, its flags shown found', () => {
    const passed = checkReview(flag(atReview(), answerFlags(reviewCard)), lesson);
    const kept = lessonResumeOf(pickOption(passed, lesson, 'vague'), lesson);
    // Nothing new is written for a review with no wrong check.
    expect(kept.open).toEqual({ cardId: reviewCard.id, picked: ['vague'], wrongOrders: 0 });
    const run = resumedLessonRun(lesson, kept, T0);
    expect(run.card.picked).toEqual(['vague']);
    expect(run.card.review).toMatchObject({
      flags: answerFlags(reviewCard),
      check: { right: true },
      wrongChecks: 0,
      passed: true,
    });
    expect(pickOption(run, lesson, 'specific')).toMatchObject({
      card: { solved: true },
      firstTry: [true, true, true, true, true, false],
    });
  });

  it('opens on the review solved, its comment picked, when only Finish was left', () => {
    const answered = lesson.cards.map((card) => ({ cardId: card.id, firstTry: true }));
    const run = resumedLessonRun(lesson, { answered, open: null }, T0);
    expect(run.card).toMatchObject({
      solved: true,
      picked: ['specific'],
      review: { flags: answerFlags(reviewCard), passed: true },
    });
  });
});
