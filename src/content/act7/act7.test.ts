import { describe, expect, it } from 'vitest';
import {
  isPickCard,
  LessonSchema,
  type Lesson,
  type LessonCard,
} from '../../game/missions/lessonSchema';
import { validateAct } from '../../game/missions/validateAct';
import { act7, act7Lessons } from '.';

const { act, lessons } = act7;
const regular = lessons.filter((lesson) => lesson.kind === 'lesson');
const final = lessons.at(-1);

function countKind(lesson: Lesson, kind: LessonCard['kind']): number {
  return lesson.cards.filter((card) => card.kind === kind).length;
}

describe('Act 7: AI-Native Engineering', () => {
  it('parses every lesson, with any problem named by its field', () => {
    // act7 already parsed them; safeParse here turns a failure into a readable list.
    for (const input of act7Lessons) {
      const result = LessonSchema.safeParse(input);
      const problems = result.success
        ? []
        : result.error.issues.map((issue) => `${input.id}: ${issue.path.join('.')}`);
      expect(problems).toEqual([]);
    }
  });

  it('is ready to ship: the Act and its lessons agree', () => {
    expect(act.act).toBe(7);
    expect(act.title).toBe('AI-Native Engineering');
    expect(validateAct(act, [], lessons)).toEqual([]);
  });

  it('has four lessons, then the timed final named for the boss', () => {
    expect(lessons.map((lesson) => lesson.kind)).toEqual([
      'lesson',
      'lesson',
      'lesson',
      'lesson',
      'final',
    ]);
    expect(final?.title).toBe('The Agent Went Rogue');
    expect(act.finalLessonId).toBe(final?.id);
  });

  it('keeps each lesson to its card budget', () => {
    for (const lesson of regular) {
      expect(lesson.cards.length).toBeGreaterThanOrEqual(7);
      expect(lesson.cards.length).toBeLessThanOrEqual(9);
    }
    expect(final?.cards.length).toBeGreaterThanOrEqual(8);
    expect(final?.cards.length).toBeLessThanOrEqual(10);
  });

  it('gives the final a fair clock: four to six minutes, at least 40 seconds a card', () => {
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds).toBeGreaterThanOrEqual(240);
    expect(seconds).toBeLessThanOrEqual(360);
    expect(seconds / (final?.cards.length ?? 1)).toBeGreaterThanOrEqual(40);
  });

  it('pays more for the final than for any lesson', () => {
    const most = Math.max(...regular.map((lesson) => lesson.xp));
    expect(final?.xp).toBeGreaterThan(most);
  });

  it('uses ids no other lesson or card shares', () => {
    const lessonIds = lessons.map((lesson) => lesson.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    for (const lesson of lessons) {
      const cardIds = lesson.cards.map((card) => card.id);
      expect(new Set(cardIds).size, lesson.id).toBe(cardIds.length);
    }
  });

  it('has a right answer, and a plausible wrong one, on every pick card', () => {
    for (const lesson of lessons) {
      for (const card of lesson.cards.filter(isPickCard)) {
        const where = `${lesson.id} > ${card.id}`;
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

  it('asks what Kyle would tell Otto at least twice a lesson, and has an order card in each', () => {
    // The Act is about directing an agent, so every lesson makes Kyle choose a prompt.
    for (const lesson of lessons) {
      expect(countKind(lesson, 'prompt'), lesson.id).toBeGreaterThanOrEqual(2);
      expect(countKind(lesson, 'order'), lesson.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('makes the longest option wrong on at least one card a lesson', () => {
    // If the right answer were always the longest, Kyle could pick by length without reading.
    for (const lesson of lessons) {
      const longestIsWrong = lesson.cards.filter(isPickCard).some((card) => {
        const longest = card.options.reduce((best, option) =>
          option.text.length > best.text.length ? option : best,
        );
        return !longest.correct;
      });
      expect(longestIsWrong, lesson.id).toBe(true);
    }
  });

  it('shows real artifacts to read, not just questions', () => {
    const kinds = new Set(
      lessons.flatMap((lesson) => lesson.cards.flatMap((card) => card.artifact?.kind ?? [])),
    );
    for (const kind of ['diff', 'log', 'terminal', 'pull-request', 'agent-message'] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
  });

  it('starts with the lesson the Act 7 island points to', () => {
    // src/game/world/zones.ts tells the player to start with 7.1 Brief the Agent.
    expect(lessons[0]?.title).toBe('Brief the Agent');
  });
});
