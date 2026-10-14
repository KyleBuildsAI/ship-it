import { describe, expect, it } from 'vitest';
import { finishLessonBriefing, nextCard, pickOption, startLessonRun } from './lessonRunner';
import { isPickCard, type Lesson } from './lessonSchema';
import {
  cardsToPass,
  lessonPlacementResult,
  placementLesson,
  placementLessonId,
  shuffledBy,
} from './lessonPlacement';
import { sampleLessonAct } from './sample.test-lesson';
import { fullSampleLessonAct, fullSamplePlacement } from './sample.test-lessonAct';
import { sampleAct } from './sample.test-mission';
import {
  ContentError,
  isLessonPlacement,
  requireComplete,
  requireDrillPlacement,
  requireLessonPlacement,
  type Act,
} from './schema';
import { validateAct, validateCatalog } from './validateAct';

const full = fullSampleLessonAct();
const [firstLesson, secondLesson, finalLesson] = full.lessons;
const T0 = 1_000;

/** The full sample Act with a different placement test, unparsed, for one broken rule each. */
function withCards(cardIds: string[]): Act {
  return { ...full.act, placementTest: { ...fullSamplePlacement, cardIds, passPercent: 85 } };
}

const placementProblems = (act: Act) =>
  validateAct(act, [], full.lessons).filter((issue) => issue.where === 'placement test');

describe('a finished lesson Act with every part', () => {
  it('parses as finished, with its final as the boss, a card placement and a Field Mission', () => {
    expect(full.act).toMatchObject({
      act: 6,
      earlyAccess: false,
      finalLessonId: 'sample-full-final',
      fieldMission: { id: 'sample-full-field' },
    });
    expect(full.act.boss).toBeUndefined();
    expect(full.act.missionIds).toEqual(full.lessons.map((lesson) => lesson.id));
  });

  it('validates on its own and beside the other samples', () => {
    expect(validateAct(full.act, [], full.lessons)).toEqual([]);
    expect(validateCatalog([{ act: sampleAct, missions: [] }, sampleLessonAct(), full])).toEqual(
      [],
    );
  });
});

describe("a lesson placement's cards", () => {
  const first = firstLesson?.cards ?? [];
  const second = secondLesson?.cards ?? [];
  const ids = (cards: readonly { id: string }[]) => cards.map((card) => card.id);

  it('must each be a card of one of the Act’s lessons, listed once', () => {
    const missing = withCards([...fullSamplePlacement.cardIds, 'no-such-card']);
    expect(placementProblems(missing)).toEqual([
      {
        where: 'placement test',
        problem: 'No lesson in this Act (the final aside) has a card "no-such-card".',
      },
    ]);
    const twice = withCards([...fullSamplePlacement.cardIds, fullSamplePlacement.cardIds[0] ?? '']);
    expect(placementProblems(twice)).toEqual([
      {
        where: 'placement test',
        problem: `Card "${fullSamplePlacement.cardIds[0] ?? ''}" is listed more than once.`,
      },
    ]);
  });

  it('never come from the final, which is the boss', () => {
    const finalCard = finalLesson?.cards[0]?.id ?? '';
    expect(placementProblems(withCards([...fullSamplePlacement.cardIds, finalCard]))).toEqual([
      {
        where: 'placement test',
        problem: `No lesson in this Act (the final aside) has a card "${finalCard}".`,
      },
    ]);
  });

  it('borrow at least two from every lesson', () => {
    const lopsided = withCards([...ids(first), ...ids(second).slice(0, 1)]);
    expect(placementProblems(lopsided)).toEqual([
      {
        where: 'placement test',
        problem: 'Borrow at least 2 cards from lesson sample-full-brief; it lends 1.',
      },
    ]);
  });

  it('can’t share an id between two lessons, since the test names cards by id alone', () => {
    // The plain sample Act's two lessons are copies, so their card ids clash.
    const { act, lessons } = sampleLessonAct();
    const clashing: Act = {
      ...act,
      placementTest: {
        pitch: 'Know it?',
        cardIds: ['read-the-diff', 'brief-the-fix'],
        timeLimitSeconds: 60,
        passPercent: 85,
      },
    };
    const problems = validateAct(clashing, [], lessons).map((issue) => issue.problem);
    expect(problems).toContain(
      'Card "read-the-diff" is in more than one lesson; give each card its own id.',
    );
  });
});

describe('the placement run', () => {
  const lesson = placementLesson(full.act, full.lessons);

  it('is a timed lesson of the borrowed cards, in order, that pays no XP of its own', () => {
    expect(lesson).toMatchObject({
      id: placementLessonId(6),
      act: 6,
      kind: 'final',
      xp: 0,
      timeLimitSeconds: 240,
    });
    expect(lesson.cards.map((card) => card.id)).toEqual(fullSamplePlacement.cardIds);
    expect(lesson.briefing[0]).toBe(fullSamplePlacement.pitch);
    const need = cardsToPass(lesson.cards.length, 85);
    expect(lesson.briefing[1]).toContain(`Get ${String(need)} of ${String(lesson.cards.length)}`);
  });

  it('says how many cards a pass needs, rounding the percent up to whole cards', () => {
    expect(cardsToPass(12, 85)).toBe(11);
    expect(cardsToPass(20, 85)).toBe(17);
    expect(cardsToPass(6, 85)).toBe(6);
  });

  it('shows the options in an order set by the attempt, the same for the same attempt', () => {
    const optionIds = (target: Lesson) =>
      target.cards.map((card) => (isPickCard(card) ? card.options.map((option) => option.id) : []));
    const again = placementLesson(full.act, full.lessons, 0);
    expect(optionIds(again)).toEqual(optionIds(lesson));
    const next = placementLesson(full.act, full.lessons, 1);
    expect(optionIds(next)).not.toEqual(optionIds(lesson));
    // The cards themselves keep the Act's order, and an option keeps its text and answer.
    expect(next.cards.map((card) => card.id)).toEqual(fullSamplePlacement.cardIds);
  });

  it('shuffles by seed: every item kept, the same seed the same order', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const once = shuffledBy(items, 'seed:1');
    expect([...once].sort()).toEqual(items);
    expect(shuffledBy(items, 'seed:1')).toEqual(once);
    const seeds = ['seed:2', 'seed:3', 'seed:4', 'seed:5'];
    expect(seeds.some((seed) => shuffledBy(items, seed).join() !== once.join())).toBe(true);
    expect(shuffledBy([], 'x')).toEqual([]);
  });

  it('throws a ContentError for a card the lessons don’t have', () => {
    expect(() =>
      placementLesson(withCards(['nope', 'nada', 'zip', 'zilch']), full.lessons),
    ).toThrow(ContentError);
  });

  /** Plays the run, right first try except the cards at `misses`; stops after `answered`. */
  function playRun(target: Lesson, misses: readonly number[], answered = target.cards.length) {
    let run = finishLessonBriefing(startLessonRun(target, { locked: true }), T0);
    for (let index = 0; index < answered; index++) {
      const card = target.cards[index];
      if (card === undefined || !isPickCard(card)) throw new Error('expected pick cards');
      const wrong = card.options.find((option) => !option.correct);
      const right = card.options.find((option) => option.correct);
      // A locked run takes the first pick, so a miss is a wrong pick and nothing after it.
      const pick = misses.includes(index) ? wrong : right;
      if (pick) run = pickOption(run, target, pick.id);
      run = nextCard(run, target);
    }
    return run;
  }

  it('tests out at 85%, judged on the exact share', () => {
    // Use only pick cards, so the helper can answer every one.
    const picks: Lesson = { ...lesson, cards: lesson.cards.filter(isPickCard) };
    const count = picks.cards.length;
    expect(lessonPlacementResult(playRun(picks, []), picks, 85)).toEqual({
      percent: 100,
      testedOut: true,
    });
    const oneMiss = lessonPlacementResult(playRun(picks, [0]), picks, 85);
    expect(oneMiss.testedOut).toBe(100 * (count - 1) >= 85 * count);
  });

  it('counts cards never reached as missed', () => {
    const picks: Lesson = { ...lesson, cards: lesson.cards.filter(isPickCard) };
    const half = Math.floor(picks.cards.length / 2);
    const result = lessonPlacementResult(playRun(picks, [], half), picks, 85);
    expect(result).toEqual({
      percent: Math.round((100 * half) / picks.cards.length),
      testedOut: false,
    });
  });
});

describe('asking an Act for its placement test by kind', () => {
  it('hands each kind to the play that can run it, and refuses the other', () => {
    expect(isLessonPlacement(requireLessonPlacement(full.act))).toBe(true);
    expect(requireDrillPlacement(sampleAct)).toBe(sampleAct.placementTest);
    expect(() => requireDrillPlacement(full.act)).toThrow(
      "Act 6's placement test is cards, not drills.",
    );
    expect(() => requireLessonPlacement(sampleAct)).toThrow(
      "Act 2's placement test is drills, not cards.",
    );
    // requireComplete is for an Act with missions, whose placement is drills.
    expect(() => requireComplete(full.act)).toThrow(ContentError);
  });
});
