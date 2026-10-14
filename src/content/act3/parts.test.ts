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

/** Real `git log --oneline --graph -5` on main after a pull request merged with a merge commit. */
const MERGED_PR = [
  '*   4d7e1a0 Merge pull request #3 from kyle/feat/readme-fix',
  '|\\  ',
  '| * 9c2f6b1 docs: fix the readme',
  '|/  ',
  '* 1a2b3c4 chore: start',
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
    expect(checklist).toContain('Create a merge commit');
    expect(checklist).toContain('Allow merge commits');
  });

  it('lands through a pull request, never an agent merging main itself', () => {
    // The lessons mark an agent's own merge into main as wrong, so the mission can't ask for one.
    const text = JSON.stringify(field);
    expect(text).toContain('gh pr create');
    expect(text).not.toContain('--no-ff');
    expect(text).not.toMatch(/push main/i);
  });

  it('lets Kyle have his agent run each command, as long as it copies the raw output', () => {
    for (const entry of field.verifications) expect(entry.instruction).toContain('ask your agent');
  });

  it('never asks for a GitHub token or key: every check is a paste', () => {
    const text = JSON.stringify(field).toLowerCase();
    expect(text).not.toContain('token');
    expect(text).not.toContain('api key');
    for (const entry of field.verifications) expect(entry.command).toMatch(/^git /);
  });

  it('passes a pull request merged with a merge commit', () => {
    const verdict = verifyPaste(verification('merge-landed'), MERGED_PR);
    expect(verdict).toEqual({
      passed: true,
      message: 'Main has a merge commit from feat/readme-fix.',
    });
  });

  it('fails a squash, a plain commit, or one line without the graph', () => {
    const merged = verification('merge-landed');
    const squashed = ['* 4d7e1a0 docs: fix the readme (#3)', '* 1a2b3c4 chore: start'].join('\n');
    expect(verifyPaste(merged, squashed).passed).toBe(false);
    expect(verifyPaste(merged, '3b8d9e1 docs: explain how to run SandCastles').passed).toBe(false);
    expect(
      verifyPaste(merged, '4d7e1a0 Merge pull request #3 from kyle/feat/readme-fix').passed,
    ).toBe(false);
    expect(verifyPaste(merged, '').passed).toBe(false);
  });

  it("fails a merge whose branch commit isn't Conventional", () => {
    const sloppy = MERGED_PR.replace('docs: fix the readme', 'updated readme');
    expect(verifyPaste(verification('merge-landed'), sloppy).passed).toBe(false);
  });

  it('passes a clean main that matches GitHub', () => {
    expect(verifyPaste(verification('main-clean'), CLEAN_MAIN).passed).toBe(true);
  });

  it('fails work left uncommitted, a merge never pushed, or the wrong branch', () => {
    const status = verification('main-clean');
    const dirty = [
      'On branch main',
      "Your branch is up to date with 'origin/main'.",
      '',
      'Changes not staged for commit:',
      '  (use "git add <file>..." to update what will be committed)',
      '        modified:   README.md',
      '',
      'no changes added to commit (use "git add" and/or "git commit -a")',
    ].join('\n');
    expect(verifyPaste(status, dirty).passed).toBe(false);
    const unpushed = [
      'On branch main',
      "Your branch is ahead of 'origin/main' by 2 commits.",
      '  (use "git push" to publish your local commits)',
      '',
      'nothing to commit, working tree clean',
    ].join('\n');
    expect(verifyPaste(status, unpushed).message).toContain('Not on GitHub yet');
    const onBranch = CLEAN_MAIN.replace('On branch main', 'On branch feat/readme-fix').replace(
      'origin/main',
      'origin/feat/readme-fix',
    );
    expect(verifyPaste(status, onBranch).message).toContain('Switch to main');
  });
});
