import { describe, expect, it } from 'vitest';
import { LessonSchema, type LessonCard } from '../../game/missions/lessonSchema';
import { countWords } from '../../game/missions/schemaParts';
import { validateAct } from '../../game/missions/validateAct';
import { requireFieldMission } from '../../game/missions/schema';
import { completeLesson, recordFieldMission } from '../../game/play/saveRules';
import { createDefaultSave } from '../../game/save/schema';
import { beatsForAct } from '../../game/world/beats';
import { act4, act4Lessons } from '.';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const { act, lessons } = act4;
const regular = lessons.filter((lesson) => lesson.kind === 'lesson');
const final = lessons.at(-1);

type PickCard = Exclude<LessonCard, { kind: 'order' }>;

function isPickCard(card: LessonCard): card is PickCard {
  return card.kind !== 'order';
}

/** The right option's length in words, and the longest wrong option's. */
function lengths(card: PickCard): { right: number; longestWrong: number } {
  const right = countWords(card.options.find((option) => option.correct)?.text ?? '');
  const longestWrong = Math.max(
    ...card.options.filter((option) => !option.correct).map((option) => countWords(option.text)),
  );
  return { right, longestWrong };
}

function cardsOfKind(cards: readonly LessonCard[], kind: LessonCard['kind']): LessonCard[] {
  return cards.filter((card) => card.kind === kind);
}

describe('Act 4: GitHub Team Flow', () => {
  it('parses every lesson input with the lesson schema', () => {
    for (const input of act4Lessons) {
      expect(LessonSchema.safeParse(input).error).toBeUndefined();
    }
  });

  it('is a finished lesson Act with every part, and validates', () => {
    expect(act.title).toBe('GitHub Team Flow');
    expect(act.earlyAccess).toBe(false);
    expect(act.placementTest).toBeDefined();
    expect(act.fieldMission).toBeDefined();
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

  it('never lets the longest option give the answer away', () => {
    // Act 3's rule (DESIGN.md section 5): if the right option were usually the most
    // detailed, picking the longest would pass without judging anything. So every prompt
    // card has a detailed but flawed brief nearly as long as the right one, and the right
    // answer is the longest on at most half the pick cards.
    const pickCards = lessons.flatMap((lesson) => lesson.cards).filter(isPickCard);
    let rightIsLongest = 0;
    for (const card of pickCards) {
      const { right, longestWrong } = lengths(card);
      if (right > longestWrong) rightIsLongest++;
      if (card.kind === 'prompt')
        expect(longestWrong / right, card.id).toBeGreaterThanOrEqual(0.75);
    }
    expect(rightIsLongest / pickCards.length).toBeLessThanOrEqual(0.5);
  });

  it('shows an artifact to read on at least a third of its cards', () => {
    // Real situations come with something to read: a diff, a log, an agent's message.
    const cards = lessons.flatMap((lesson) => lesson.cards);
    const withArtifact = cards.filter((card) => card.artifact !== undefined);
    expect(withArtifact.length / cards.length).toBeGreaterThanOrEqual(1 / 3);
  });

  it('pays XP once per lesson, and completes the Act once the Field Mission is verified too', () => {
    const played = lessons.reduce(
      (next, lesson) => completeLesson(next, act, lesson, 100, NOW),
      createDefaultSave(NOW),
    );
    // The final is the boss, so it's beaten, but a finished Act needs its real-world work.
    expect(played.acts['4']).toMatchObject({
      bossCompletedAt: NOW.toISOString(),
      completedAt: null,
    });
    const xp = lessons.reduce((total, lesson) => total + lesson.xp, 0);
    expect(played.profile.xp).toBe(xp);
    const field = requireFieldMission(act);
    const verified = recordFieldMission(
      played,
      act,
      field.verifications.map((check) => check.id),
      NOW,
    );
    expect(verified.acts['4']).toMatchObject({ completedAt: NOW.toISOString() });
  });

  it('acts out most cards on the town island, naming only beats it knows', () => {
    const known = beatsForAct(4);
    const cards = lessons.flatMap((lesson) => lesson.cards);
    // Every briefing, the final's included, opens on a picture of what the lesson is about.
    for (const lesson of lessons) {
      expect(known, lesson.id).toContain(lesson.briefingBeat);
    }
    for (const card of cards) {
      if (card.beat !== undefined) expect(known, card.id).toContain(card.beat);
    }
    // Some cards stay bare on purpose: a picture that contradicts the card (checks passing
    // on a card about a failing check) would teach the wrong thing.
    const withBeat = cards.filter((card) => card.beat !== undefined).length;
    expect(withBeat / cards.length).toBeGreaterThanOrEqual(0.8);
    // Every beat the island has is used somewhere, or it's dead weight.
    const used = new Set(cards.map((card) => card.beat));
    for (const beat of known) expect(used).toContain(beat);
  });

  it('shows the two kinds of rejected push as two different pictures', () => {
    // 4.3 teaches that "fetch first" and "protected branch" are different refusals, so the
    // island must not act them out the same way.
    const beatOf = (id: string) =>
      lessons.flatMap((lesson) => lesson.cards).find((card) => card.id === id)?.beat;
    expect(beatOf('push-rejected')).toBe('push-behind');
    expect(beatOf('otto-push-rejected')).toBe('push-behind');
    expect(beatOf('protected-main')).toBe('main-protected');
    expect(beatOf('protected-reject')).toBe('main-protected');
  });
});
