import { describe, expect, it } from 'vitest';
import {
  isPickCard,
  LESSON_WORDS,
  LessonSchema,
  type LessonCard,
} from '../../game/missions/lessonSchema';
import { countWords } from '../../game/missions/schemaParts';
import { validateCatalog } from '../../game/missions/validateAct';
import { completeLesson } from '../../game/play/saveRules';
import { createDefaultSave } from '../../game/save/schema';
import { ACTS } from '../index';
import { act1, act1LessonInputs, act1Lessons } from './index';

const NOW = new Date('2026-10-13T12:00:00.000Z');
const cards = act1Lessons.flatMap((lesson) => lesson.cards);
const final = act1Lessons.at(-1);

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

/** All of a lesson's artifacts, joined, for checks on what Kyle gets to read. */
function artifactsOf(id: string): string {
  const lesson = act1Lessons.find((entry) => entry.id === id);
  return (lesson?.cards ?? [])
    .flatMap((card) => (card.artifact ? [card.artifact.text] : []))
    .join('\n');
}

describe("Act 1's lessons", () => {
  it('parses every lesson with the lesson schema', () => {
    for (const input of act1LessonInputs) {
      const result = LessonSchema.safeParse(input);
      expect(result.success, `${input.id}: ${result.error?.message ?? ''}`).toBe(true);
    }
  });

  it('plays 1.5 and 1.6, then the timed final, after the directed missions', () => {
    expect(act1Lessons.map((lesson) => [lesson.id, lesson.kind])).toEqual([
      ['dependencies-are-declared', 'lesson'],
      ['running-isnt-working', 'lesson'],
      ['works-on-my-machine', 'final'],
    ]);
    expect(act1.missionIds.slice(-3)).toEqual(act1Lessons.map((lesson) => lesson.id));
    expect(final?.title).toBe('Works on My Machine');
    expect(act1Lessons.every((lesson) => lesson.act === 1)).toBe(true);
  });

  it('keeps every lesson to 7 to 9 cards', () => {
    for (const lesson of act1Lessons) {
      expect(lesson.cards.length, lesson.id).toBeGreaterThanOrEqual(7);
      expect(lesson.cards.length, lesson.id).toBeLessThanOrEqual(9);
    }
  });

  it('gives the final four to six minutes, with at least 40 seconds a card', () => {
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds).toBeGreaterThanOrEqual(240);
    expect(seconds).toBeLessThanOrEqual(360);
    expect(seconds / (final?.cards.length ?? 1)).toBeGreaterThanOrEqual(40);
  });

  it('mixes card kinds: at least two prompt cards and one order card in every lesson', () => {
    // Act 1 is about directing Otto, so every lesson asks what Kyle would tell him.
    for (const lesson of act1Lessons) {
      const kinds = lesson.cards.map((card) => card.kind);
      expect(kinds.filter((kind) => kind === 'prompt').length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(kinds, lesson.id).toContain('order');
      expect(kinds, lesson.id).toContain('choose');
    }
  });

  it('uses ids no other part of the catalog uses, and card ids unique within each lesson', () => {
    expect(validateCatalog(ACTS)).toEqual([]);
    for (const lesson of act1Lessons) {
      const ids = lesson.cards.map((card) => card.id);
      expect(new Set(ids).size, lesson.id).toBe(ids.length);
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
      if (!isPickCard(card)) continue;
      const limit = card.kind === 'prompt' ? LESSON_WORDS.promptOption : LESSON_WORDS.option;
      for (const option of card.options) {
        expect(countWords(option.text), `${card.id} > ${option.id}`).toBeLessThanOrEqual(limit);
        expect(countWords(option.feedback), `${card.id} > ${option.id}`).toBeLessThanOrEqual(
          LESSON_WORDS.feedback,
        );
      }
    }
  });

  it('sets every lesson at Quillwork with Otto, on a real laptop', () => {
    for (const lesson of act1Lessons) {
      const text = [...lesson.briefing, ...lesson.cards.flatMap(cardTexts)].join(' ');
      expect(text, lesson.id).toMatch(/Quillwork/);
      expect(text, lesson.id).toMatch(/Otto/);
      expect(text, lesson.id).toMatch(/C:\\Users\\(kyle|priya)/);
    }
  });

  it('shows the real thing to read: package.json, npm, port owners and curl', () => {
    const kinds = new Set(cards.flatMap((card) => (card.artifact ? [card.artifact.kind] : [])));
    for (const kind of ['terminal', 'file', 'agent-message', 'response', 'error'] as const) {
      expect(kinds).toContain(kind);
    }
    const deps = artifactsOf('dependencies-are-declared');
    expect(deps).toContain('"dependencies"');
    expect(deps).toContain('npm error code ENOENT');
    expect(deps).toContain('npm install dotnev');
    const running = artifactsOf('running-isnt-working');
    expect(running).toContain('EADDRINUSE');
    expect(running).toContain('Get-NetTCPConnection -LocalPort 3000');
    expect(running).toContain('curl.exe -i http://localhost:3000/health');
  });

  it('never reveals the answer by its place in the list', () => {
    const places = cards.flatMap((card) =>
      isPickCard(card) ? [card.options.findIndex((option) => option.correct)] : [],
    );
    for (const place of new Set(places)) {
      const share = places.filter((entry) => entry === place).length / places.length;
      expect(share).toBeLessThanOrEqual(0.4);
    }
    expect(new Set(places).size).toBeGreaterThanOrEqual(3);
  });

  it('records the final as the boss, but leaves Act 1 open while it is in early access', () => {
    const save = act1Lessons.reduce(
      (next, lesson) => completeLesson(next, act1, lesson, 100, NOW),
      createDefaultSave(NOW),
    );
    expect(save.acts['1']).toMatchObject({
      bossCompletedAt: NOW.toISOString(),
      completedAt: null,
    });
    expect(save.profile.xp).toBe(act1Lessons.reduce((total, lesson) => total + lesson.xp, 0));
  });
});
