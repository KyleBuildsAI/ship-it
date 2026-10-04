import { describe, expect, it } from 'vitest';
import { LessonSchema, isPickCard, type Lesson } from '../../game/missions/lessonSchema';
import { validateAct } from '../../game/missions/validateAct';
import { act5, act5Lessons } from './index';

const lessons = act5.lessons;
const teaching = lessons.filter((lesson) => lesson.kind === 'lesson');
const final = lessons.at(-1);

/** Every piece of text a player reads on a lesson, so story checks can search it. */
function allText(lesson: Lesson): string {
  const cards = lesson.cards.map((card) => [
    card.situation,
    card.question,
    card.artifact?.text ?? '',
    isPickCard(card) ? card.options.map((option) => option.text).join(' ') : '',
  ]);
  return [...lesson.briefing, ...cards.flat()].join(' ');
}

describe('Act 5: Quality Gates content', () => {
  it('parses every lesson with the lesson schema', () => {
    for (const input of act5Lessons) {
      const result = LessonSchema.safeParse(input);
      expect(result.error?.issues ?? [], input.id).toEqual([]);
    }
  });

  it('is a valid, finished Act whose final is its last lesson', () => {
    expect(act5.act.act).toBe(5);
    expect(act5.act.title).toBe('Quality Gates');
    expect(act5.act.earlyAccess).toBe(false);
    expect(validateAct(act5.act, [], lessons)).toEqual([]);
    expect(act5.act.missionIds).toEqual(lessons.map((lesson) => lesson.id));
    expect(act5.act.finalLessonId).toBe('red-ci');
  });

  it('has four lessons of 7 to 9 cards, then one timed final of 8 to 10', () => {
    expect(teaching).toHaveLength(4);
    for (const lesson of teaching) {
      expect(lesson.cards.length, lesson.id).toBeGreaterThanOrEqual(7);
      expect(lesson.cards.length, lesson.id).toBeLessThanOrEqual(9);
    }
    expect(final?.kind).toBe('final');
    expect(final?.title).toBe('Red CI');
    expect(final?.cards.length).toBeGreaterThanOrEqual(8);
    expect(final?.cards.length).toBeLessThanOrEqual(10);
  });

  it('gives the final 4 to 6 minutes, and at least 40 seconds a card', () => {
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds).toBeGreaterThanOrEqual(240);
    expect(seconds).toBeLessThanOrEqual(360);
    expect(seconds / (final?.cards.length ?? 1)).toBeGreaterThanOrEqual(40);
  });

  it('uses unique ids: lessons across the Act, cards and options within each', () => {
    const lessonIds = lessons.map((lesson) => lesson.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    for (const lesson of lessons) {
      const cardIds = lesson.cards.map((card) => card.id);
      expect(new Set(cardIds).size, lesson.id).toBe(cardIds.length);
    }
  });

  it('has a right answer, and a wrong one, on every pick card', () => {
    for (const lesson of lessons) {
      for (const card of lesson.cards.filter(isPickCard)) {
        const where = `${lesson.id}/${card.id}`;
        expect(
          card.options.some((option) => option.correct),
          where,
        ).toBe(true);
        expect(
          card.options.some((option) => !option.correct),
          where,
        ).toBe(true);
      }
    }
  });

  it('asks what to tell Otto at least twice, and has an order card, in every lesson', () => {
    // The Act is about directing an agent through the gates, not typing the fixes.
    for (const lesson of lessons) {
      const kinds = lesson.cards.map((card) => card.kind);
      expect(kinds.filter((kind) => kind === 'prompt').length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(kinds, lesson.id).toContain('order');
    }
  });

  it('shows real artifacts to read: diffs, logs, terminals, PRs and agent messages', () => {
    const kinds = new Set(
      lessons.flatMap((lesson) => lesson.cards.flatMap((card) => card.artifact?.kind ?? [])),
    );
    for (const kind of ['diff', 'log', 'terminal', 'pull-request', 'agent-message'] as const) {
      expect(kinds, kind).toContain(kind);
    }
  });

  it('happens at Quillwork, with the team and Otto', () => {
    const text = lessons.map(allText).join(' ');
    for (const name of ['Quillwork', 'Sage', 'Dex', 'Marco', 'Priya', 'Otto']) {
      expect(text, name).toContain(name);
    }
  });

  it('keeps the place of the right answer from giving it away', () => {
    // Options show in the order they're written, so the right one must move around.
    const places = lessons
      .flatMap((lesson) => lesson.cards.filter(isPickCard))
      .map((card) => card.options.findIndex((option) => option.correct));
    for (const lesson of lessons) {
      const own = lesson.cards
        .filter(isPickCard)
        .map((card) => card.options.findIndex((option) => option.correct));
      expect(new Set(own).size, lesson.id).toBeGreaterThanOrEqual(3);
    }
    for (const place of new Set(places)) {
      expect(places.filter((entry) => entry === place).length / places.length).toBeLessThan(0.4);
    }
  });
});
