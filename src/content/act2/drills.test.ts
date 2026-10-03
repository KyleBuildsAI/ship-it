import { describe, expect, it } from 'vitest';
import { gitQueries } from '../../engine/git/queries';
import { evaluate } from '../../game/missions/predicates';
import { isJudgmentDrill, type Drill, type SandboxDrill } from '../../game/missions/schema';
import { act2Missions } from './index';
import { enter, sandboxShell } from './play.test-helpers';

/**
 * Every No-AI Drill in Act 2, graded by state. The untouched setup must fail (or the
 * drill would pass for doing nothing), and a reference answer typed into the Shell must
 * pass. Some drills have a second answer, to prove any valid path to the state counts.
 */
const ANSWERS: Record<string, string[][]> = {
  // 2.1 Three Rooms
  'rooms-init': [['git init']],
  'rooms-stage-one': [['git add src/app.ts'], ['git add src']],
  'rooms-stage-folder': [['git add src'], ['git add src/header.ts src/footer.ts']],
  'rooms-first-commit': [
    ['git add index.html style.css', 'git commit -m "feat: add landing page"'],
    ['git add .', 'git commit -m "feat: add landing page"'],
  ],
  'rooms-commit-staged-only': [['git diff --staged', 'git commit -m "docs: add run command"']],
  'rooms-clean-tree': [
    ['git add .', 'git commit -m "feat: add footer and new title"'],
    ['git add -A', 'git commit -m "feat: add footer and new title"'],
  ],
  // 2.2 Reading History
  'history-old-port': [
    ['git log --oneline -- config.json', 'git restore --source=HEAD~2 config.json'],
    ['git show HEAD~2:config.json > config.json'],
  ],
  'history-deleted-doc': [
    ['git log --oneline -- docs/setup.md', 'git restore --source=HEAD~1 docs/setup.md'],
    ['git show HEAD~1:docs/setup.md > docs/setup.md'],
  ],
  'history-staged-surprise': [
    ['git diff --staged', 'git restore --staged src/api.ts'],
    ['git reset src/api.ts'],
  ],
  'history-debug-print': [
    ['git diff', 'git add src/cart.ts', 'git commit -m "feat: add free delivery threshold"'],
  ],
  'history-save-log': [['git log --oneline > history.txt'], ['git log > history.txt']],
  'history-staged-vs-unstaged': [
    ['git diff', 'git diff --staged', 'git commit -m "fix: normalize search queries"'],
  ],
  // 2.3 Good Commits
  'commits-type-fix': [['git commit -m "fix: round cart totals to the cent"']],
  'commits-scope': [['git commit -m "docs(readme): fix install command"']],
  'commits-split-two': [
    [
      'git add README.md',
      'git commit -m "docs: fix install typo"',
      'git add src/api.ts',
      'git commit -m "fix: raise api timeout"',
    ],
    [
      'git add src/api.ts',
      'git commit -m "fix: raise api timeout"',
      'git commit -am "docs: fix install typo"',
    ],
  ],
  'commits-leave-debug': [['git add src/search.ts', 'git commit -m "feat: split search terms"']],
  'commits-am-tracked': [['git commit -am "chore: bump version to 1.1.0"']],
  'commits-am-trap': [
    ['git add src/app.ts src/theme.ts', 'git commit -m "feat: add dark mode"'],
    ['git add src/theme.ts', 'git commit -am "feat: add dark mode"'],
  ],
  // 2.4 The Ignore List
  'ignore-dist-folder': [['echo "dist/" > .gitignore'], ['echo "/dist" > .gitignore']],
  'ignore-logs-anywhere': [['echo "*.log" > .gitignore']],
  'ignore-untrack-env': [
    ['git rm --cached .env', 'git commit -m "chore: stop tracking .env"'],
    [
      'echo ".env" > .gitignore',
      'git rm --cached .env',
      'git add .gitignore',
      'git commit -m "chore: stop tracking .env"',
    ],
  ],
  'ignore-env-rule': [
    ['echo ".env" >> .gitignore', 'git add .gitignore', 'git commit -m "chore: ignore .env"'],
  ],
  'ignore-tracked-dist': [
    [
      'echo "dist/" > .gitignore',
      'git rm -r --cached dist',
      'git add .gitignore',
      'git commit -m "chore: stop tracking build output"',
    ],
  ],
  'ignore-negate': [
    ['echo ".env*" > .gitignore', 'echo "!.env.example" >> .gitignore'],
    ['echo ".env" > .gitignore', 'echo ".env.local" >> .gitignore'],
  ],
  // 2.5 Undo Everything
  'undo-discard-edit': [['git restore src/app.js']],
  'undo-restore-deleted': [['git restore README.md']],
  'undo-unstage': [['git restore --staged config.json'], ['git reset config.json']],
  'undo-revert-shared': [['git log --oneline', 'git revert HEAD~1']],
  'undo-soft-reset': [['git reset --soft HEAD~1']],
  'undo-mixed-reset': [['git reset HEAD~1'], ['git reset --mixed HEAD~1']],
  'undo-hard-reset': [['git reset --hard HEAD~1']],
  'undo-reflog-rescue': [['git reset --hard HEAD~2', 'git reflog', "git reset --hard 'HEAD@{1}'"]],
};

/** Answers that reach the wrong state, to prove the drill really checks what it says. */
const WRONG_ANSWERS: Record<string, string[]> = {
  'rooms-stage-one': ['git add .'],
  'rooms-commit-staged-only': ['git commit -am "docs: add run command"'],
  'history-staged-surprise': ['git restore --staged src/api.ts src/search.ts'],
  'commits-type-fix': ['git commit -m "feat: round cart totals"'],
  'commits-am-trap': ['git commit -am "feat: add dark mode"'],
  'ignore-logs-anywhere': ['echo "*log*" > .gitignore'],
  'ignore-untrack-env': ['git rm .env', 'git commit -m "chore: remove .env"'],
  'undo-revert-shared': ['git reset --hard HEAD~2'],
  'undo-soft-reset': ['git reset HEAD~1'],
};

/** Act 2 is typed, so its drills are graded by state; the mission schema refuses any other. */
function typed(drill: Drill): SandboxDrill {
  if (isJudgmentDrill(drill)) throw new Error(`Act 2's drill "${drill.id}" should be typed.`);
  return drill;
}

const drills = act2Missions.flatMap((mission) => mission.drills.map(typed));

describe('Act 2 No-AI Drills', () => {
  it('has reference answers for exactly the drills in Act 2', () => {
    expect(Object.keys(ANSWERS).sort()).toEqual(drills.map((drill) => drill.id).sort());
  });

  it.each(drills.map((drill) => [drill.id, drill] as const))(
    '%s: the untouched setup fails, every reference answer passes',
    (id, drill) => {
      const untouched = sandboxShell(drill.setup);
      expect(evaluate(drill.success, gitQueries(untouched.ws)), 'passes untouched').toBe(false);

      const answers = ANSWERS[id] ?? [];
      expect(answers.length).toBeGreaterThan(0);
      answers.forEach((commands, index) => {
        const shell = sandboxShell(drill.setup);
        commands.forEach((command) => {
          enter(shell, command);
        });
        expect(evaluate(drill.success, gitQueries(shell.ws)), `answer ${String(index + 1)}`).toBe(
          true,
        );
      });
    },
  );

  it.each(Object.entries(WRONG_ANSWERS))('%s: a plausible wrong answer fails', (id, commands) => {
    const drill = drills.find((candidate) => candidate.id === id);
    if (drill === undefined) throw new Error(`No drill "${id}".`);
    const shell = sandboxShell(drill.setup);
    commands.forEach((command) => {
      enter(shell, command);
    });
    expect(evaluate(drill.success, gitQueries(shell.ws))).toBe(false);
  });
});
