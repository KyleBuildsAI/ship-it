import { describe, expect, it } from 'vitest';
import { LessonSchema, isPickCard } from '../../game/missions/lessonSchema';
import { validateAct } from '../../game/missions/validateAct';
import { act6, act6Lessons } from './index';

/*
 * Act 6's own content checks, on top of the shared ones every lesson Act gets in
 * lessonActs.test.ts: the shape this Act promises (four lessons and a timed final), and
 * the habits that keep it about directing Otto and judging systems rather than syntax.
 */

const { act, lessons } = act6;
const regular = lessons.filter((lesson) => lesson.kind === 'lesson');
const final = lessons.at(-1);

describe('Act 6: How Systems Work', () => {
  it('parses every lesson input with the lesson schema', () => {
    for (const input of act6Lessons) {
      const result = LessonSchema.safeParse(input);
      // On failure, the issues name the card and field that broke a budget.
      expect(result.success ? [] : result.error.issues).toEqual([]);
    }
  });

  it('passes validateAct, with every lesson in missionIds in play order', () => {
    expect(validateAct(act, [], lessons)).toEqual([]);
    expect(act.missionIds).toEqual(lessons.map((lesson) => lesson.id));
    expect(act.missionIds).toEqual([
      'requests-and-responses',
      'apis-and-auth',
      'data-speed-and-scale',
      'logs-and-stack-traces',
      'the-3am-page',
    ]);
  });

  it('has four lessons of 7 to 9 cards, then the final', () => {
    expect(lessons.map((lesson) => lesson.kind)).toEqual([
      'lesson',
      'lesson',
      'lesson',
      'lesson',
      'final',
    ]);
    for (const lesson of regular) {
      expect(lesson.cards.length, lesson.id).toBeGreaterThanOrEqual(7);
      expect(lesson.cards.length, lesson.id).toBeLessThanOrEqual(9);
    }
  });

  it('ends on The 3am Page: 8 to 10 cards on one 4 to 6 minute clock', () => {
    expect(final?.title).toBe('The 3am Page');
    expect(act.finalLessonId).toBe(final?.id);
    const cards = final?.cards.length ?? 0;
    expect(cards).toBeGreaterThanOrEqual(8);
    expect(cards).toBeLessThanOrEqual(10);
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds).toBeGreaterThanOrEqual(240);
    expect(seconds).toBeLessThanOrEqual(360);
  });

  it('keeps lesson ids unique, and card, option and step ids unique where they live', () => {
    const ids = lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lesson of lessons) {
      const cardIds = lesson.cards.map((card) => card.id);
      expect(new Set(cardIds).size, lesson.id).toBe(cardIds.length);
      for (const card of lesson.cards) {
        const inner = isPickCard(card)
          ? card.options.map((option) => option.id)
          : card.steps.map((step) => step.id);
        expect(new Set(inner).size, `${lesson.id}/${card.id}`).toBe(inner.length);
      }
    }
  });

  it('gives every pick card a right answer and a wrong one', () => {
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
    // The Act is about briefing and judging an agent, so each lesson practises both.
    for (const lesson of lessons) {
      const kinds = lesson.cards.map((card) => card.kind);
      expect(kinds.filter((kind) => kind === 'prompt').length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(kinds, lesson.id).toContain('order');
    }
  });

  it('covers the topics DESIGN.md section 11 lists for this Act', () => {
    // A loose check that each topic shows up somewhere a player will read it.
    const text = JSON.stringify(act6Lessons).toLowerCase();
    for (const topic of [
      'status code',
      'json',
      'rest',
      'oauth',
      'api key',
      'session',
      'select',
      'index',
      'cache',
      'queue',
      'container',
      'log',
      'stack trace',
    ]) {
      expect(text, topic).toContain(topic);
    }
  });
});
