import { describe, expect, it } from 'vitest';
import {
  isPickCard,
  LESSON_WORDS,
  LessonSchema,
  type LessonCard,
} from '../../game/missions/lessonSchema';
import { countWords } from '../../game/missions/schemaParts';
import { validateAct, validateCatalog } from '../../game/missions/validateAct';
import { ACTS } from '../index';
import { act8, act8Lessons } from './index';

const { act, lessons } = act8;
const cards = lessons.flatMap((lesson) => lesson.cards);
const final = lessons.at(-1);

/** Every piece of text a card puts on screen, for the checks that read all of it. */
function cardTexts(card: LessonCard): string[] {
  const parts = [card.situation, card.question, card.explanation];
  if (card.artifact) parts.push(card.artifact.text);
  if (isPickCard(card)) {
    parts.push(...card.options.flatMap((option) => [option.text, option.feedback]));
  } else {
    parts.push(...card.steps.map((step) => step.text));
  }
  return parts;
}

describe('Act 8: The Loop', () => {
  it('parses every lesson with the lesson schema', () => {
    for (const input of act8Lessons) {
      const result = LessonSchema.safeParse(input);
      expect(result.success, `${input.id}: ${result.error?.message ?? ''}`).toBe(true);
    }
  });

  it('is a valid lesson Act, on its own and in the whole catalog', () => {
    expect(act.act).toBe(8);
    expect(act.title).toBe('The Loop');
    expect(validateAct(act, [], lessons)).toEqual([]);
    expect(validateCatalog(ACTS)).toEqual([]);
  });

  it('has four lessons and then its timed final, the Mock Interview Loop', () => {
    expect(lessons.map((lesson) => lesson.kind)).toEqual([
      'lesson',
      'lesson',
      'lesson',
      'lesson',
      'final',
    ]);
    expect(act.missionIds).toEqual(lessons.map((lesson) => lesson.id));
    expect(act.finalLessonId).toBe('the-mock-loop');
    expect(final?.title).toBe('The Mock Interview Loop');
  });

  it('keeps every lesson to its size: 7 to 9 cards, and 8 to 10 for the final', () => {
    for (const lesson of lessons) {
      const [min, max] = lesson.kind === 'final' ? [8, 10] : [7, 9];
      expect(lesson.cards.length, lesson.id).toBeGreaterThanOrEqual(min);
      expect(lesson.cards.length, lesson.id).toBeLessThanOrEqual(max);
    }
  });

  it('gives the final four to six minutes, with at least 40 seconds a card', () => {
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds).toBeGreaterThanOrEqual(240);
    expect(seconds).toBeLessThanOrEqual(360);
    expect(seconds / (final?.cards.length ?? 1)).toBeGreaterThanOrEqual(40);
  });

  it('uses lesson ids no other Act uses, and card ids unique within each lesson', () => {
    const otherIds = ACTS.filter((entry) => entry.act.act !== 8).flatMap((entry) => [
      ...entry.act.missionIds,
    ]);
    for (const lesson of lessons) {
      expect(otherIds).not.toContain(lesson.id);
      const ids = lesson.cards.map((card) => card.id);
      expect(new Set(ids).size, lesson.id).toBe(ids.length);
    }
  });

  it('mixes card kinds: at least two prompt cards and one order card in every lesson', () => {
    // The Act is about directing agents and judging systems, so every lesson asks what
    // Kyle would tell Otto, and every lesson asks him to put a method in order.
    for (const lesson of lessons) {
      const kinds = lesson.cards.map((card) => card.kind);
      expect(kinds.filter((kind) => kind === 'prompt').length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(kinds, lesson.id).toContain('order');
      expect(kinds, lesson.id).toContain('choose');
    }
  });

  it('gives every pick card a right answer, a wrong one, and feedback for each', () => {
    for (const card of cards) {
      if (!isPickCard(card)) continue;
      expect(card.options.filter((option) => option.correct).length, card.id).toBeGreaterThan(0);
      expect(
        card.options.some((option) => !option.correct),
        card.id,
      ).toBe(true);
      expect(new Set(card.options.map((option) => option.id)).size).toBe(card.options.length);
    }
  });

  it('gives every order card distinct steps, so there is one right order', () => {
    for (const card of cards) {
      if (isPickCard(card)) continue;
      expect(new Set(card.steps.map((step) => step.text)).size, card.id).toBe(card.steps.length);
    }
  });

  it('keeps every card inside the word budgets of DESIGN.md section 10', () => {
    for (const card of cards) {
      expect(countWords(card.situation), card.id).toBeLessThanOrEqual(LESSON_WORDS.situation);
      expect(countWords(card.question), card.id).toBeLessThanOrEqual(LESSON_WORDS.question);
      expect(countWords(card.situation) + countWords(card.question), card.id).toBeLessThanOrEqual(
        LESSON_WORDS.cardScreen,
      );
      expect(countWords(card.explanation), card.id).toBeLessThanOrEqual(LESSON_WORDS.explanation);
    }
  });

  it('sets every card at Quillwork, with Sage, the team or Otto in it', () => {
    // Each lesson is a real situation from the startup, not an abstract quiz.
    const cast = /Quillwork|Sage|Marco|Priya|Dex|Otto|Brightline|SandCastles/;
    for (const lesson of lessons) {
      const text = [...lesson.briefing, ...lesson.cards.flatMap(cardTexts)].join(' ');
      expect(text, lesson.id).toMatch(/Quillwork/);
      expect(text, lesson.id).toMatch(/Otto/);
    }
    const cardsWithCast = cards.filter((card) => cast.test(cardTexts(card).join(' ')));
    expect(cardsWithCast.length / cards.length).toBeGreaterThanOrEqual(0.75);
  });

  it('shows real artifacts to read: code, logs, diffs and files', () => {
    const kinds = new Set(cards.flatMap((card) => (card.artifact ? [card.artifact.kind] : [])));
    for (const kind of ['code', 'log', 'diff', 'error', 'file'] as const) {
      expect(kinds).toContain(kind);
    }
  });

  it('never reveals the answer by its place in the list', () => {
    const places = cards.flatMap((card) =>
      isPickCard(card) ? [card.options.findIndex((option) => option.correct)] : [],
    );
    for (const place of new Set(places)) {
      const share = places.filter((entry) => entry === place).length / places.length;
      expect(share).toBeLessThanOrEqual(0.4);
    }
  });
});
