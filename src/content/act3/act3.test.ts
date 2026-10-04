import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_MAX_LINES,
  LessonSchema,
  isPickCard,
  type Lesson,
} from '../../game/missions/lessonSchema';
import { validateAct } from '../../game/missions/validateAct';
import { act3, act3Lessons } from './index';

/*
 * Act 3's content checks. The schema already holds every word budget; these tests hold
 * the shape the Act promises: four lessons and a timed final, each lesson mixing card
 * kinds, and enough "what do you tell Otto?" cards that the Act is about directing an
 * agent, not typing git commands.
 */

const lessons = act3.lessons;
const regular = lessons.filter((lesson) => lesson.kind === 'lesson');
const final = lessons.at(-1);

function countKind(lesson: Lesson, kind: Lesson['cards'][number]['kind']): number {
  return lesson.cards.filter((card) => card.kind === kind).length;
}

describe('Act 3: Branching', () => {
  it('parses every lesson input without an error', () => {
    for (const input of act3Lessons) {
      expect(LessonSchema.safeParse(input).error).toBeUndefined();
    }
  });

  it('is a valid, finished Act with its final named', () => {
    expect(act3.act.title).toBe('Branching');
    expect(act3.act.earlyAccess).toBe(false);
    expect(act3.act.finalLessonId).toBe('conflict-storm');
    expect(validateAct(act3.act, [], lessons)).toEqual([]);
  });

  it('plays four lessons, then the Conflict Storm final', () => {
    expect(lessons.map((lesson) => lesson.kind)).toEqual([
      'lesson',
      'lesson',
      'lesson',
      'lesson',
      'final',
    ]);
    expect(final?.title).toBe('Conflict Storm');
    expect(act3.act.missionIds).toEqual(lessons.map((lesson) => lesson.id));
  });

  it('gives each lesson 7 to 9 cards and the final 8 to 10', () => {
    for (const lesson of regular) {
      expect(lesson.cards.length).toBeGreaterThanOrEqual(7);
      expect(lesson.cards.length).toBeLessThanOrEqual(9);
    }
    expect(final?.cards.length).toBeGreaterThanOrEqual(8);
    expect(final?.cards.length).toBeLessThanOrEqual(10);
  });

  it('times the final at four to six minutes, never under 40 seconds a card', () => {
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds).toBeGreaterThanOrEqual(240);
    expect(seconds).toBeLessThanOrEqual(360);
    expect(seconds / (final?.cards.length ?? 1)).toBeGreaterThanOrEqual(40);
  });

  it('asks what to tell Otto at least twice, and has an order card, in every lesson', () => {
    for (const lesson of lessons) {
      expect(countKind(lesson, 'prompt'), lesson.id).toBeGreaterThanOrEqual(2);
      expect(countKind(lesson, 'order'), lesson.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses ids that are unique across lessons, cards, options and steps', () => {
    const lessonIds = lessons.map((lesson) => lesson.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    for (const lesson of lessons) {
      const cardIds = lesson.cards.map((card) => card.id);
      expect(new Set(cardIds).size, lesson.id).toBe(cardIds.length);
      for (const card of lesson.cards) {
        const ids = isPickCard(card)
          ? card.options.map((option) => option.id)
          : card.steps.map((step) => step.id);
        expect(new Set(ids).size, `${lesson.id} > ${card.id}`).toBe(ids.length);
      }
    }
  });

  it('has exactly one right answer on every pick card', () => {
    // Every Act 3 card has one best move. Two right answers would blur the principle.
    for (const card of lessons.flatMap((lesson) => lesson.cards)) {
      if (!isPickCard(card)) continue;
      expect(
        card.options.filter((option) => option.correct),
        card.id,
      ).toHaveLength(1);
    }
  });

  it('keeps artifacts short and labelled', () => {
    for (const card of lessons.flatMap((lesson) => lesson.cards)) {
      if (card.artifact === undefined) continue;
      expect(card.artifact.label, card.id).toBeDefined();
      expect(card.artifact.text.split('\n').length).toBeLessThanOrEqual(ARTIFACT_MAX_LINES);
    }
  });

  it('happens at Quillwork, with Otto and the team', () => {
    const text = JSON.stringify(act3Lessons);
    for (const name of ['Quillwork', 'Otto', 'Sage', 'Priya', 'Marco', 'Dex']) {
      expect(text).toContain(name);
    }
  });
});
