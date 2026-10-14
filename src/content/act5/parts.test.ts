import { describe, expect, it } from 'vitest';
import { placementLesson } from '../../game/missions/lessonPlacement';
import { isPickCard } from '../../game/missions/lessonSchema';
import {
  LESSON_PLACEMENT_SECONDS_PER_CARD,
  requireFieldMission,
  requireLessonPlacement,
} from '../../game/missions/schema';
import { validateAct } from '../../game/missions/validateAct';
import { verifyPaste } from '../../game/play/fieldCheck';
import { completeLesson, recordFieldMission, recordPlacement } from '../../game/play/saveRules';
import { completedActNumbers, placementTestOutXp } from '../../game/progression/xp';
import { createDefaultSave } from '../../game/save/schema';
import { act5 } from './index';

/*
 * Act 5's placement test and Field Mission, checked as content and played through the
 * same save rules the game uses. The pastes below are what real git prints in PowerShell.
 */

const NOW = new Date('2026-10-13T12:00:00.000Z');
const { act, lessons } = act5;
const placement = requireLessonPlacement(act);
const field = requireFieldMission(act);
const teaching = lessons.filter((lesson) => lesson.id !== act.finalLessonId);

function verification(id: string) {
  const found = field.verifications.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no check ${id}`);
  return found;
}

describe('Act 5 placement test', () => {
  it('is a finished Act with every part, and still ships clean', () => {
    expect(act.earlyAccess).toBe(false);
    expect(act.finalLessonId).toBe('red-ci');
    expect(validateAct(act, [], lessons)).toEqual([]);
  });

  it('borrows two or three cards from every lesson but the final', () => {
    for (const lesson of teaching) {
      const own = placement.cardIds.filter((id) => lesson.cards.some((card) => card.id === id));
      expect(own.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(own.length, lesson.id).toBeLessThanOrEqual(3);
    }
    const finalCards = lessons.find((lesson) => lesson.id === act.finalLessonId)?.cards ?? [];
    expect(placement.cardIds.filter((id) => finalCards.some((card) => card.id === id))).toEqual([]);
  });

  it('asks what to tell Otto, not only what a log says', () => {
    const cards = placementLesson(act, lessons).cards;
    expect(cards.map((card) => card.id)).toEqual(placement.cardIds);
    expect(cards.filter((card) => card.kind === 'prompt').length).toBeGreaterThanOrEqual(4);
    expect(cards.every(isPickCard)).toBe(true);
  });

  it('gives each card more than the fewest seconds, and less than the final does', () => {
    const perCard = placement.timeLimitSeconds / placement.cardIds.length;
    expect(perCard).toBeGreaterThanOrEqual(LESSON_PLACEMENT_SECONDS_PER_CARD);
    expect(perCard).toBeLessThan(40);
    expect(placement.passPercent).toBe(85);
  });

  it('tests out of every lesson at half XP, completes the Act, and leaves Red CI open', () => {
    const save = recordPlacement(
      createDefaultSave(NOW),
      act,
      lessons,
      { percent: 92, testedOut: true },
      NOW,
    );
    for (const lesson of teaching) {
      expect(save.missions[lesson.id]?.status, lesson.id).toBe('tested-out');
    }
    expect(save.missions[act.finalLessonId ?? '']?.status ?? 'not-started').not.toBe('tested-out');
    expect(save.acts['5']?.completedAt).toBe(NOW.toISOString());
    expect(completedActNumbers(save.acts)).toContain(5);
    const half = teaching.reduce((total, lesson) => total + placementTestOutXp([lesson.xp]), 0);
    expect(save.profile.xp).toBe(half);
  });
});

describe('Act 5 Field Mission: Green on Every Push', () => {
  it('happens on SandCastles and has the player brief an agent, not write YAML', () => {
    expect(field.repoName).toBe('SandCastles');
    const checklist = field.checklist.map((item) => item.text).join(' ');
    expect(checklist).toContain('.github/workflows/ci.yml');
    expect(checklist).toContain('Brief it');
    expect(checklist).toContain('Actions tab');
    expect(checklist).toContain('continue-on-error');
  });

  it('passes a tracked workflow file, with the prompt copied too', () => {
    const paste =
      'PS C:\\code\\SandCastles> git ls-files .github/workflows\n.github/workflows/ci.yml\n';
    expect(verifyPaste(verification('workflow-tracked'), paste).passed).toBe(true);
  });

  it('fails when no workflow is committed yet, since git ls-files prints nothing', () => {
    const verdict = verifyPaste(
      verification('workflow-tracked'),
      'PS C:\\code\\SandCastles> git ls-files .github/workflows\n',
    );
    expect(verdict.passed).toBe(false);
  });

  it("passes a pushed ci: commit on GitHub's main, and fails a vague message", () => {
    const pushed = verification('workflow-pushed');
    const good = '4f2a9c1 (origin/main, origin/HEAD) ci: run tests on every push\n';
    expect(verifyPaste(pushed, good).passed).toBe(true);
    expect(verifyPaste(pushed, '4f2a9c1 (origin/main) add workflow\n').passed).toBe(false);
  });

  it('fails when nothing was pushed, because the log prints no line at all', () => {
    const pushed = verification('workflow-pushed');
    const empty =
      'PS C:\\code\\SandCastles> git log --oneline -1 origin/main -- .github/workflows\n';
    expect(verifyPaste(pushed, empty).passed).toBe(false);
  });

  it('completes the Act once every lesson and both checks are done', () => {
    const played = lessons.reduce(
      (save, lesson) => completeLesson(save, act, lesson, 100, NOW),
      createDefaultSave(NOW),
    );
    // Every lesson alone isn't enough: the Field Mission is part of finishing this Act.
    expect(played.acts['5']?.completedAt ?? null).toBeNull();
    const done = recordFieldMission(
      played,
      act,
      field.verifications.map((check) => check.id),
      NOW,
    );
    expect(done.fieldMissions[field.id]?.verifiedAt).toBe(NOW.toISOString());
    expect(done.acts['5']?.completedAt).toBe(NOW.toISOString());
  });
});
