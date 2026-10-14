import { describe, expect, it } from 'vitest';
import { verifyPaste, type Verification } from '../../game/play/fieldCheck';
import { requireFieldMission, requireLessonPlacement } from '../../game/missions/schema';
import { act3 } from './index';

/*
 * Act 3's placement test and Field Mission. validateAct already checks the placement's
 * cards exist (act3.test.ts); these tests hold what the content promises on top: the
 * spread across lessons, and that each Field Mission check passes real git output for a
 * landed branch and fails the output of the common ways to get it wrong.
 */

const placement = requireLessonPlacement(act3.act);
const field = requireFieldMission(act3.act);

function verification(id: string): Verification {
  const found = field.verifications.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No check "${id}" in Act 3's Field Mission.`);
  return found;
}

/** Real `git status` output on main after a merge was pulled and nothing is left over. */
const CLEAN_MAIN = [
  'On branch main',
  "Your branch is up to date with 'origin/main'.",
  '',
  'nothing to commit, working tree clean',
].join('\n');

describe('Act 3 placement test', () => {
  it('borrows 2 or 3 cards from each lesson and none from the final', () => {
    const lessons = act3.lessons.filter((lesson) => lesson.kind === 'lesson');
    for (const lesson of lessons) {
      const lent = lesson.cards.filter((card) => placement.cardIds.includes(card.id)).length;
      expect(lent, lesson.id).toBeGreaterThanOrEqual(2);
      expect(lent, lesson.id).toBeLessThanOrEqual(3);
    }
    const final = act3.lessons.find((lesson) => lesson.kind === 'final');
    expect(final?.cards.some((card) => placement.cardIds.includes(card.id))).toBe(false);
  });

  it('asks what to tell Otto in every lesson it borrows from', () => {
    // Testing out should prove Kyle can direct an agent, not only read git output.
    for (const lesson of act3.lessons.filter((entry) => entry.kind === 'lesson')) {
      const borrowed = lesson.cards.filter((card) => placement.cardIds.includes(card.id));
      expect(
        borrowed.some((card) => card.kind === 'prompt'),
        lesson.id,
      ).toBe(true);
    }
  });

  it('gives each card at least 30 seconds and passes at 85%', () => {
    expect(placement.timeLimitSeconds / placement.cardIds.length).toBeGreaterThanOrEqual(30);
    expect(placement.passPercent).toBe(85);
  });
});

describe('Act 3 Field Mission: Land a Real Branch', () => {
  it('happens on SandCastles and tells Kyle what to ask his agent for', () => {
    expect(field.repoName).toBe('SandCastles');
    const checklist = field.checklist.map((item) => item.text).join(' ');
    expect(checklist).toContain('Tell your agent');
    expect(checklist).toContain('merge commit');
  });

  it('never asks for a GitHub token or key: every check is a paste', () => {
    const text = JSON.stringify(field).toLowerCase();
    expect(text).not.toContain('token');
    expect(text).not.toContain('api key');
    for (const entry of field.verifications) expect(entry.command).toMatch(/^git /);
  });

  it('passes a merge commit, whether merged locally or through a pull request', () => {
    const merged = verification('merge-landed');
    expect(verifyPaste(merged, "9f1c2ab Merge branch 'feat/readme-fix'").passed).toBe(true);
    expect(
      verifyPaste(
        merged,
        '4d7e1a0 (HEAD -> main, origin/main) Merge pull request #3 from kyle/feat/readme-fix',
      ).passed,
    ).toBe(true);
  });

  it('fails when no merge commit exists, because the branch never landed', () => {
    // `git log --merges` prints nothing when main has no merge commit.
    expect(verifyPaste(verification('merge-landed'), '').passed).toBe(false);
  });

  it("checks the branch's own commit is a Conventional Commit", () => {
    const commit = verification('branch-commit');
    expect(verifyPaste(commit, '3b8d9e1 docs: explain how to run SandCastles').passed).toBe(true);
    expect(verifyPaste(commit, '3b8d9e1 updated readme').passed).toBe(false);
  });

  it('passes a clean main and fails work left uncommitted', () => {
    const status = verification('main-clean');
    expect(verifyPaste(status, CLEAN_MAIN).passed).toBe(true);
    const dirty = [
      'On branch main',
      'Changes not staged for commit:',
      '  (use "git add <file>..." to update what will be committed)',
      '        modified:   README.md',
      '',
      'no changes added to commit (use "git add" and/or "git commit -a")',
    ].join('\n');
    expect(verifyPaste(status, dirty).passed).toBe(false);
  });
});
