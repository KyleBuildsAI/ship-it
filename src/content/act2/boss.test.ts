import { describe, expect, it } from 'vitest';
import { gitQueries } from '../../engine/git/queries';
import type { Shell } from '../../engine/shell/shell';
import { evaluate } from '../../game/missions/predicates';
import { checkBoss, startBoss, tick, type BossRun } from '../../game/missions/runner';
import { applySteps } from '../../game/missions/sandbox';
import { HIDDEN_FILE } from './dirtyTree';
import { act2 } from './index';
import { enter, sandboxShell } from './play.test-helpers';

/**
 * "The Dirty Tree", played through the Shell with the boss clock. Times are milliseconds
 * after the boss starts at 0; the twist is due once 120 of the 180 seconds have passed.
 */

const boss = act2.boss;
const START = 0;
const seconds = (count: number) => START + count * 1000;

/** Ignore the junk, then commit the real work as several Conventional Commits. */
const COMMIT_THE_WORK = [
  'git status',
  'echo ".env" >> .gitignore',
  'echo "dist/" >> .gitignore',
  'echo "node_modules/" >> .gitignore',
  'echo "*.log" >> .gitignore',
  'git add .gitignore',
  'git commit -m "chore: ignore secrets, build output, and logs"',
  'git add src/components src/styles',
  'git commit -m "refactor: use design tokens in components"',
  'git add src tests',
  'git commit -m "feat: add search"',
  'git add README.md CHANGELOG.md docs',
  'git commit -m "docs: document search and deploys"',
  'git add package.json',
  'git commit -m "chore: bump version to 1.1.0"',
];

function startFight(): { shell: Shell; fight: BossRun } {
  return { shell: sandboxShell(boss.setup), fight: startBoss(act2, START) };
}

function enterAll(shell: Shell, commands: readonly string[]): void {
  commands.forEach((command) => {
    enter(shell, command);
  });
}

describe('The Dirty Tree boss', () => {
  it('starts with about 40 dirty files and the logger hidden by .gitignore', () => {
    const { shell } = startFight();
    const status = gitQueries(shell.ws).status();
    const dirty = status.unstaged.length + status.untracked.length;
    expect(dirty).toBeGreaterThanOrEqual(38);
    expect(dirty).toBeLessThanOrEqual(42);
    expect(status.untracked).toContain('.env');
    expect(status.ignored).toEqual([HIDDEN_FILE]);
  });

  it('is not won by the untouched setup', () => {
    const { shell, fight } = startFight();
    const q = gitQueries(shell.ws);
    expect(checkBoss(fight, act2, q, seconds(1))).toBe('running');
    expect(boss.objectives.filter((objective) => evaluate(objective, q))).not.toHaveLength(
      boss.objectives.length,
    );
  });

  it('is won by sensible commits once the twist reveals the never-tracked logger', () => {
    const { shell, fight } = startFight();
    const q = gitQueries(shell.ws);

    enterAll(shell, COMMIT_THE_WORK);
    // Everything visible is committed or ignored, but Dex's checkout still lacks the logger.
    expect(q.isClean()).toBe(true);
    expect(checkBoss(fight, act2, q, seconds(100))).toBe('running');

    expect(tick(fight, act2, seconds(110)).due).toEqual([]);
    const twisted = tick(fight, act2, seconds(121));
    expect(twisted.due.map((twist) => twist.atSecondsRemaining)).toEqual([60]);
    twisted.due.forEach((twist) => {
      applySteps(shell.ws, twist.apply);
    });

    // The sandbox has no `git status --ignored`, so the clue is git add refusing the file.
    const refused = shell.run('git add src/logger.ts');
    expect(refused.exitCode).not.toBe(0);
    expect(refused.lines.map((line) => line.text)).toContain(
      'The following paths are ignored by one of your .gitignore files:',
    );
    enterAll(shell, [
      'git add -f src/logger.ts',
      'git commit -m "fix: commit the logger the app imports"',
    ]);
    expect(checkBoss(twisted.boss, act2, q, seconds(150))).toBe('won');
  });

  it('can be won early by fixing the overly broad log* rule before the twist', () => {
    const { shell, fight } = startFight();
    enterAll(shell, [
      'cat .gitignore',
      // Replace log* (which also matches logger.ts) with a rule for log files only.
      'echo "*.log" > .gitignore',
      'echo ".env" >> .gitignore',
      'echo "dist/" >> .gitignore',
      'echo "node_modules/" >> .gitignore',
      'git add .gitignore',
      'git commit -m "chore: ignore only real log files and build output"',
      'git add src tests',
      'git commit -m "feat: add search and commit the logger"',
      'git add .',
      'git commit -m "docs: document search and bump version"',
    ]);
    expect(checkBoss(fight, act2, gitQueries(shell.ws), seconds(90))).toBe('won');
  });

  it('is lost on the spot when .env is committed', () => {
    const { shell, fight } = startFight();
    enterAll(shell, ['git add .', 'git commit -m "chore: commit everything"']);
    expect(checkBoss(fight, act2, gitQueries(shell.ws), seconds(20))).toBe('lost-rule');
  });

  it('is lost on the spot when build output is committed, even with .env ignored', () => {
    const { shell, fight } = startFight();
    enterAll(shell, [
      'echo ".env" >> .gitignore',
      'git add .',
      'git commit -m "chore: commit everything"',
    ]);
    expect(checkBoss(fight, act2, gitQueries(shell.ws), seconds(20))).toBe('lost-rule');
  });

  it('is not won by one giant commit', () => {
    const { shell, fight } = startFight();
    enterAll(shell, [
      'echo "*.log" > .gitignore',
      'echo ".env" >> .gitignore',
      'echo "dist/" >> .gitignore',
      'echo "node_modules/" >> .gitignore',
      'git add .',
      'git commit -m "feat: add everything"',
    ]);
    const q = gitQueries(shell.ws);
    expect(q.isClean()).toBe(true);
    expect(checkBoss(fight, act2, q, seconds(60))).toBe('running');
  });

  it('is lost when the clock runs out', () => {
    const { shell, fight } = startFight();
    expect(checkBoss(fight, act2, gitQueries(shell.ws), seconds(180))).toBe('lost-time');
  });
});
