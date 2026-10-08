import { describe, expect, it } from 'vitest';
import { LessonSchema, type LessonCard } from '../../game/missions/lessonSchema';
import { validateAct } from '../../game/missions/validateAct';
import { completeLesson } from '../../game/play/saveRules';
import { createDefaultSave } from '../../game/save/schema';
import { act4, act4Lessons } from '.';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const { act, lessons } = act4;
const regular = lessons.filter((lesson) => lesson.kind === 'lesson');
const final = lessons.at(-1);

function cardsOfKind(cards: readonly LessonCard[], kind: LessonCard['kind']): LessonCard[] {
  return cards.filter((card) => card.kind === kind);
}

describe('Act 4: GitHub Team Flow', () => {
  it('parses every lesson input with the lesson schema', () => {
    for (const input of act4Lessons) {
      expect(LessonSchema.safeParse(input).error).toBeUndefined();
    }
  });

  it('is a complete lesson Act that validates', () => {
    expect(act.title).toBe('GitHub Team Flow');
    expect(act.earlyAccess).toBe(false);
    expect(validateAct(act, [], lessons)).toEqual([]);
  });

  it('has four lessons, then the timed final "Rejected Push" from DESIGN.md', () => {
    expect(lessons.map((lesson) => lesson.kind)).toEqual([
      'lesson',
      'lesson',
      'lesson',
      'lesson',
      'final',
    ]);
    expect(final?.title).toBe('Rejected Push');
    expect(act.finalLessonId).toBe(final?.id);
    expect(act.missionIds).toEqual(lessons.map((lesson) => lesson.id));
  });

  it('keeps each lesson to 7-9 cards and the final to 8-10', () => {
    for (const lesson of regular) {
      expect(lesson.cards.length).toBeGreaterThanOrEqual(7);
      expect(lesson.cards.length).toBeLessThanOrEqual(9);
    }
    expect(final?.cards.length).toBeGreaterThanOrEqual(8);
    expect(final?.cards.length).toBeLessThanOrEqual(10);
  });

  it('gives the final 4 to 6 minutes, and at least 40 seconds a card', () => {
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds).toBeGreaterThanOrEqual(240);
    expect(seconds).toBeLessThanOrEqual(360);
    expect(seconds / (final?.cards.length ?? 1)).toBeGreaterThanOrEqual(40);
  });

  it('asks what to tell Otto at least twice, and has an order card, in every lesson', () => {
    // Directing the agent is the point of the Act, so no lesson is all multiple choice.
    for (const lesson of lessons) {
      expect(cardsOfKind(lesson.cards, 'prompt').length).toBeGreaterThanOrEqual(2);
      expect(cardsOfKind(lesson.cards, 'order').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses ids that are unique across lessons, and cards unique within each', () => {
    const lessonIds = lessons.map((lesson) => lesson.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    for (const lesson of lessons) {
      const cardIds = lesson.cards.map((card) => card.id);
      expect(new Set(cardIds).size).toBe(cardIds.length);
    }
  });

  it('has a right answer and a wrong one on every pick card', () => {
    for (const card of lessons.flatMap((lesson) => lesson.cards)) {
      if (card.kind === 'order') {
        expect(card.steps.length).toBeGreaterThanOrEqual(3);
        continue;
      }
      expect(card.options.some((option) => option.correct)).toBe(true);
      expect(card.options.some((option) => !option.correct)).toBe(true);
    }
  });

  it('shows an artifact to read on at least a third of its cards', () => {
    // Real situations come with something to read: a diff, a log, an agent's message.
    const cards = lessons.flatMap((lesson) => lesson.cards);
    const withArtifact = cards.filter((card) => card.artifact !== undefined);
    expect(withArtifact.length / cards.length).toBeGreaterThanOrEqual(1 / 3);
  });

  it('pays XP once per lesson and completes the Act when every lesson is played', () => {
    const save = lessons.reduce(
      (next, lesson) => completeLesson(next, act, lesson, 100, NOW),
      createDefaultSave(NOW),
    );
    expect(save.acts['4']).toMatchObject({ completedAt: NOW.toISOString() });
    const xp = lessons.reduce((total, lesson) => total + lesson.xp, 0);
    expect(save.profile.xp).toBe(xp);
  });
});
