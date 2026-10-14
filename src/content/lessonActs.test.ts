import { describe, expect, it } from 'vitest';
import { validateAct } from '../game/missions/validateAct';
import { completeLesson, recordFieldMission } from '../game/play/saveRules';
import { completedActNumbers, rankFor, XP_AWARDS } from '../game/progression/xp';
import { createDefaultSave, type SaveData } from '../game/save/schema';
import { act3 } from './act3';
import { act4 } from './act4';
import { act5 } from './act5';
import { act6 } from './act6';
import { act7 } from './act7';
import { act8 } from './act8';
import type { LessonActContent } from './lessonAct';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const LESSON_ACTS: readonly LessonActContent[] = [act3, act4, act5, act6, act7, act8];

/** Plays every lesson of an Act to the end, the way finishing each one in the menu would. */
function playLessons(save: SaveData, content: LessonActContent): SaveData {
  return content.lessons.reduce(
    (next, lesson) => completeLesson(next, content.act, lesson, 100, NOW),
    save,
  );
}

/**
 * Finishes an Act: every lesson, and its Field Mission's checks when it has one, since an
 * Act with a Field Mission isn't complete until the real work is verified too.
 */
function finishAct(save: SaveData, content: LessonActContent): SaveData {
  const played = playLessons(save, content);
  const { fieldMission } = content.act;
  if (fieldMission === undefined) return played;
  const ids = fieldMission.verifications.map((check) => check.id);
  return recordFieldMission(played, content.act, ids, NOW);
}

describe.each(LESSON_ACTS.map((content) => [content.act.act, content] as const))(
  'Act %i, taught by lessons',
  (number, content) => {
    const { act, lessons } = content;
    const final = lessons.at(-1);

    it('is a finished Act: no early access, and ready to ship', () => {
      expect(act.earlyAccess).toBe(false);
      expect(validateAct(act, [], lessons)).toEqual([]);
    });

    it('has its lessons, then one timed final that stands in for its boss', () => {
      // DESIGN.md section 5: a lesson Act has 3 to 6 lessons, and only the last is a final.
      const kinds = lessons.map((lesson) => lesson.kind);
      expect(kinds.length).toBeGreaterThanOrEqual(3);
      expect(kinds.length).toBeLessThanOrEqual(6);
      expect(kinds).toEqual([...kinds.slice(0, -1).map(() => 'lesson'), 'final']);
      expect(act.finalLessonId).toBe(final?.id);
      expect(act.boss).toBeUndefined();
      // The clock is a challenge, not a sprint: at least 40 seconds for every card.
      const seconds = final?.timeLimitSeconds ?? 0;
      expect(seconds / (final?.cards.length ?? 1)).toBeGreaterThanOrEqual(40);
    });

    it('asks what Kyle would tell his agent more than once', () => {
      // The point of these Acts is directing AI and judging systems, not typing syntax.
      const prompts = lessons
        .flatMap((lesson) => lesson.cards)
        .filter((card) => card.kind === 'prompt');
      expect(prompts.length).toBeGreaterThanOrEqual(2);
    });

    it('moves the right answer around, so its place gives nothing away', () => {
      // Options show in the order content lists them. If the right one were usually
      // first, Kyle could learn the position instead of the idea.
      const places = lessons
        .flatMap((lesson) => lesson.cards)
        .flatMap((card) => (card.kind === 'order' ? [] : [card]))
        .map((card) => card.options.findIndex((option) => option.correct));
      for (const place of new Set(places)) {
        const share = places.filter((entry) => entry === place).length / places.length;
        expect(share).toBeLessThanOrEqual(0.5);
      }
      expect(new Set(places).size).toBeGreaterThanOrEqual(3);
    });

    it('is complete, final and all, once every lesson and its Field Mission are done', () => {
      const save = finishAct(createDefaultSave(NOW), content);
      expect(save.acts[String(number)]).toMatchObject({
        bossCompletedAt: NOW.toISOString(),
        completedAt: NOW.toISOString(),
      });
      const lessonXp = lessons.reduce((total, lesson) => total + lesson.xp, 0);
      const fieldXp = act.fieldMission === undefined ? 0 : XP_AWARDS.fieldMission;
      expect(save.profile.xp).toBe(lessonXp + fieldXp);
    });

    it('waits for the real work when it has a Field Mission', () => {
      const save = playLessons(createDefaultSave(NOW), content);
      const completedAt = save.acts[String(number)]?.completedAt ?? null;
      if (act.fieldMission === undefined) expect(completedAt).toBe(NOW.toISOString());
      else expect(completedAt).toBeNull();
    });
  },
);

describe('the lesson Acts together', () => {
  it('promote through the ranks as they are completed', () => {
    const save = LESSON_ACTS.reduce(finishAct, createDefaultSave(NOW));
    expect(completedActNumbers(save.acts)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(rankFor(completedActNumbers(save.acts))).toBe('Staff');
  });
});
