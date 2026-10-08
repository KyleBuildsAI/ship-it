import { describe, expect, it } from 'vitest';
import { LessonSchema, type LessonInput } from './lessonSchema';
import { sampleFinal, sampleLesson, sampleLessonInput } from './sample.test-lesson';

/** The messages zod gives for `input`, or [] when it parses. */
function problems(input: unknown): string[] {
  const result = LessonSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

const { cards } = sampleLessonInput;

/** The sample's card at `index` as a choose or prompt card, so its options can be read. */
function pickInput(index: number) {
  const card = item(cards, index);
  if (card.kind === 'order') throw new Error(`Card ${String(index)} is an order card.`);
  return card;
}

function orderInput(index: number) {
  const card = item(cards, index);
  if (card.kind !== 'order') throw new Error(`Card ${String(index)} is not an order card.`);
  return card;
}

const firstCard = pickInput(0);
const promptCard = pickInput(1);
const orderCard = orderInput(2);
const rest = cards.slice(3);

/** The sample with its first card replaced by `changes` on top of it. */
function withFirstCard(changes: object): LessonInput {
  return {
    ...sampleLessonInput,
    cards: [{ ...firstCard, ...changes }, promptCard, orderCard, ...rest],
  };
}

/** The item at `index`, or a test failure when there isn't one. */
function item<T>(list: readonly T[], index: number): T {
  const found = list[index];
  if (found === undefined) throw new Error(`No item at ${String(index)}.`);
  return found;
}

const many = (count: number) => Array.from({ length: count }, () => 'word').join(' ');

describe('a lesson', () => {
  it('parses the sample, filling in the defaults', () => {
    expect(sampleLesson.kind).toBe('lesson');
    expect(sampleLesson.cards.map((card) => card.kind)).toEqual([
      'choose',
      'prompt',
      'order',
      'choose',
      'choose',
      'choose',
    ]);
    expect(sampleFinal.timeLimitSeconds).toBe(120);
  });

  it('has 6 to 10 cards and 2 or 3 briefing captions', () => {
    expect(
      problems({ ...sampleLessonInput, cards: sampleLessonInput.cards.slice(0, 5) }),
    ).not.toEqual([]);
    expect(problems({ ...sampleLessonInput, briefing: ['Only one.'] })).not.toEqual([]);
  });

  it('rejects two cards with the same id', () => {
    const twin = { ...promptCard, id: firstCard.id };
    expect(
      problems({ ...sampleLessonInput, cards: [firstCard, twin, orderCard, ...rest] }),
    ).toEqual([`Duplicate id "${firstCard.id}".`]);
  });

  it('gives only a final a clock, and every final one', () => {
    expect(problems({ ...sampleLessonInput, kind: 'final' })).toEqual([
      'A final lesson needs a timeLimitSeconds for its clock.',
    ]);
    expect(problems({ ...sampleLessonInput, timeLimitSeconds: 60 })).toEqual([
      'Only a final lesson has a clock. Set kind: "final" or remove the limit.',
    ]);
  });

  it('rejects a misspelled field instead of ignoring it', () => {
    expect(problems({ ...sampleLessonInput, breifing: [] })).not.toEqual([]);
  });
});

describe('a choose or prompt card', () => {
  it('needs at least one right option and at least one wrong one', () => {
    const allWrong = firstCard.options.map((option) => ({ ...option, correct: false }));
    expect(problems(withFirstCard({ options: allWrong }))).toEqual([
      'Mark at least one option correct.',
    ]);
    const allRight = firstCard.options.map((option) => ({ ...option, correct: true }));
    expect(problems(withFirstCard({ options: allRight }))).toEqual([
      'At least one option must be wrong, or the card teaches nothing.',
    ]);
  });

  it('allows more than one right option', () => {
    const twoRight = firstCard.options.map((option, index) => ({ ...option, correct: index > 0 }));
    expect(problems(withFirstCard({ options: twoRight }))).toEqual([]);
  });

  it('needs 3 to 5 options with unique ids', () => {
    expect(problems(withFirstCard({ options: firstCard.options.slice(0, 2) }))).not.toEqual([]);
    const a = item(firstCard.options, 0);
    const b = item(firstCard.options, 1);
    expect(problems(withFirstCard({ options: [a, b, { ...b }] }))).toEqual([
      `Duplicate id "${b.id}".`,
    ]);
  });

  it('keeps each piece of text within its word budget', () => {
    expect(problems(withFirstCard({ question: many(26) }))).toEqual([
      'Keep this to 25 words or fewer, so it reads at a glance.',
    ]);
    expect(problems(withFirstCard({ explanation: many(46) }))).toEqual([
      'Keep this to 45 words or fewer, so it reads at a glance.',
    ]);
    // A prompt option may be longer than a plain one: instructions need detail.
    const longOption = { ...firstCard.options[0], text: many(30) };
    expect(
      problems(withFirstCard({ options: [longOption, ...firstCard.options.slice(1)] })),
    ).toEqual(['Keep this to 25 words or fewer, so it reads at a glance.']);
    const prompt = {
      ...promptCard,
      options: [{ ...promptCard.options[0], text: many(30) }, ...promptCard.options.slice(1)],
    };
    expect(
      problems({ ...sampleLessonInput, cards: [firstCard, prompt, orderCard, ...rest] }),
    ).toEqual([]);
  });

  it('keeps the situation and question together within one screen', () => {
    expect(problems(withFirstCard({ situation: many(40), question: many(21) }))).toEqual([
      'The situation and question are 61 words together; the limit is 60.',
    ]);
  });

  it('keeps an artifact to 30 lines', () => {
    const artifact = { kind: 'log', text: Array.from({ length: 31 }, () => 'line').join('\n') };
    expect(problems(withFirstCard({ artifact }))).toEqual([
      'Keep an artifact to 30 lines; show only the part that matters.',
    ]);
    expect(problems(withFirstCard({ artifact: { kind: 'tweet', text: 'x' } }))).not.toEqual([]);
  });
});

describe('an order card', () => {
  /** The sample with its order card's steps replaced. */
  function withSteps(steps: readonly { id: string; text: string }[]): LessonInput {
    return {
      ...sampleLessonInput,
      cards: [firstCard, promptCard, { ...orderCard, steps: [...steps] }, ...rest],
    };
  }

  it('needs 3 to 6 steps, each unique in id and in text', () => {
    expect(problems(withSteps(orderCard.steps.slice(0, 2)))).not.toEqual([]);
    const a = item(orderCard.steps, 0);
    const b = item(orderCard.steps, 1);
    const c = item(orderCard.steps, 2);
    expect(problems(withSteps([a, b, { ...c, id: a.id }]))).toEqual([`Duplicate id "${a.id}".`]);
    expect(problems(withSteps([a, b, { ...c, text: a.text }]))).toEqual([
      'Two steps say the same thing.',
    ]);
  });
});
