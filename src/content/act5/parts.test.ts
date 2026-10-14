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
  const text = () => [...field.briefing, ...field.checklist.map((item) => item.text)].join(' ');

  it('builds on the coverage gate SandCastles already has, with a gate it lacks', () => {
    expect(field.repoName).toBe('SandCastles');
    expect(field.briefing.join(' ')).toContain('already has one gate: coverage.yml');
    expect(text()).toContain('.github/workflows/gitleaks.yml');
    expect(text()).toContain('Brief it');
  });

  it('rules out every way an agent could buy green by weakening a gate', () => {
    for (const rule of [
      'Don’t touch coverage.yml or scripts/coverage.sh',
      'permissions: contents: read',
      'Never use pull_request_target',
      'continue-on-error',
      '|| true',
    ]) {
      expect(text(), rule).toContain(rule);
    }
  });

  it('merges through a pull request from a branch, never straight to main', () => {
    expect(text()).toContain('On a branch named ci/secret-scan');
    expect(text()).toContain('open a pull request. Not straight to main');
    expect(text()).toContain('squash-merge');
  });

  it('lets the player have their agent run every command', () => {
    for (const check of field.verifications) {
      expect(check.instruction, check.id).toMatch(/your agent/);
    }
  });

  it('passes a tracked gitleaks.yml, with the prompt copied too', () => {
    const paste = [
      'PS C:\\code\\sandcastles> git ls-files .github/workflows',
      '.github/workflows/coverage.yml',
      '.github/workflows/gitleaks.yml',
    ].join('\n');
    expect(verifyPaste(verification('workflow-tracked'), paste).passed).toBe(true);
  });

  it('fails a list without gitleaks.yml, even though coverage.yml is tracked', () => {
    const tracked = verification('workflow-tracked');
    const before = verifyPaste(tracked, '.github/workflows/coverage.yml\n');
    expect(before.passed).toBe(false);
    expect(before.message).toContain('gitleaks.yml');
    expect(verifyPaste(tracked, 'README.md\n').passed).toBe(false);
    expect(
      verifyPaste(tracked, 'PS C:\\code\\sandcastles> git ls-files .github/workflows\n').passed,
    ).toBe(false);
  });

  it("passes a merged ci: commit on GitHub's main, and fails any other type", () => {
    const pushed = verification('workflow-pushed');
    const squashed = '4f2a9c1 (origin/main, origin/HEAD) ci: scan every push for secrets (#7)\n';
    expect(verifyPaste(pushed, squashed).passed).toBe(true);
    // The commit that last touched coverage.yml is Conventional, but it isn't this work.
    const older = '9b1d2e3 fix: calibrate the coverage gate with per-system floors\n';
    expect(verifyPaste(pushed, older).passed).toBe(false);
    expect(verifyPaste(pushed, '4f2a9c1 (origin/main) add workflow\n').passed).toBe(false);
  });

  it('fails when nothing was pushed, because the log prints no line at all', () => {
    const pushed = verification('workflow-pushed');
    const empty =
      'PS C:\\code\\sandcastles> git log --oneline -1 origin/main -- .github/workflows/gitleaks.yml\n';
    expect(verifyPaste(pushed, empty).passed).toBe(false);
  });

  it('proves the run went green with gh, and says what to do when it did not', () => {
    const run = verification('run-green');
    const green = '[{"conclusion":"success","headBranch":"main","status":"completed"}]';
    expect(verifyPaste(run, green)).toEqual({
      passed: true,
      message: 'Green on GitHub. The gate is live.',
    });
    const red = verifyPaste(run, '[{"conclusion":"failure","status":"completed"}]');
    expect(red.passed).toBe(false);
    expect(red.message).toContain('fix the cause');
    const running = verifyPaste(run, '[{"conclusion":"","status":"in_progress"}]');
    expect(running.message).toContain('still going');
    expect(verifyPaste(run, '[]').message).toContain('No run');
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
