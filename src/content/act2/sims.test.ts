import { describe, expect, it } from 'vitest';
import { gitQueries } from '../../engine/git/queries';
import type { Shell } from '../../engine/shell/shell';
import { evaluate } from '../../game/missions/predicates';
import { checkStep, finishBriefing, startRun, type MissionRun } from '../../game/missions/runner';
import type { Mission } from '../../game/missions/schema';
import { act2Missions } from './index';
import { enter, sandboxShell } from './play.test-helpers';

/**
 * Each mission's sim, played by typing real commands. The runner is checked after every
 * command, the way the game does, so these tests prove three things per step: it is not
 * already true when it appears, the reference commands complete it, and they complete
 * nothing beyond it.
 */

/** The reference solution: command lines for each step, keyed by mission id then step id. */
const SOLUTIONS: Record<string, Record<string, string[]>> = {
  'three-rooms': {
    init: ['git init'],
    'stage-project': ['git status', 'git add README.md src'],
    'first-commit': ['git commit -m "feat: add notes app"'],
    'edit-readme': ['echo "Run it with npm start." >> README.md', 'git status'],
    'commit-edit': ['git add README.md', 'git commit -m "docs: explain how to run the app"'],
  },
  'reading-history': {
    'restore-tax': [
      'git log --oneline',
      'git show HEAD~1',
      'git show HEAD~2:src/tax.ts',
      'git restore --source=HEAD~2 src/tax.ts',
    ],
    'clear-dock': ['git diff --staged', 'git restore --staged src/checkout.ts'],
    'commit-fix': [
      'git add src/tax.ts',
      'git diff --staged',
      'git commit -m "fix: restore 8% sales tax"',
    ],
    'commit-real-change': [
      'git diff',
      'git add src/cart.ts',
      'git commit -m "feat: add free delivery threshold"',
    ],
  },
  'good-commits': {
    'commit-fix': [
      'git status',
      'git add src/login.ts',
      'git commit -m "fix: trim spaces from login emails"',
    ],
    'commit-docs': ['git add README.md', 'git commit -m "docs: fix install command in readme"'],
    'commit-feature': ['git add src/theme.ts src/app.ts', 'git commit -m "feat: add dark mode"'],
    'commit-am': ['git commit -am "chore: bump version to 1.1.0"'],
  },
  'ignore-list': {
    'ignore-dist': ['git status', 'echo "dist/" >> .gitignore'],
    'ignore-logs': ['echo "*.log" >> .gitignore'],
    'untrack-env': ['git rm --cached .env'],
    'ignore-env': ['echo ".env" >> .gitignore'],
    'env-example': ['echo "API_KEY=" > .env.example', 'echo "DATABASE_URL=" >> .env.example'],
    'commit-cleanup': [
      'git add .gitignore .env.example',
      'git commit -m "chore: ignore secrets and build output"',
    ],
  },
  'undo-everything': {
    'discard-edit': ['git status', 'git restore style.css'],
    'unstage-notes': ['git restore --staged notes.txt'],
    'redo-wip': [
      'git log --oneline -2',
      'git reset --soft HEAD~1',
      'git commit -m "feat: add pricing calculator"',
    ],
    'revert-confetti': ['git log --oneline', 'git revert HEAD~2'],
    'hard-reset': ['git reset --hard HEAD~2'],
    'reflog-recover': ['git reflog', "git reset --hard 'HEAD@{1}'"],
  },
};

function missionById(id: string): Mission {
  const mission = act2Missions.find((candidate) => candidate.id === id);
  if (mission === undefined) throw new Error(`Act 2 has no mission "${id}".`);
  return mission;
}

/** A run that has just entered the sim, and the sandbox it plays in. */
function startSim(mission: Mission): { run: MissionRun; shell: Shell } {
  return {
    run: finishBriefing(startRun(mission)),
    shell: sandboxShell(mission.initialRepoState),
  };
}

/** Types each command and checks the current step afterwards, like the terminal does. */
function play(mission: Mission, start: MissionRun, shell: Shell, commands: readonly string[]) {
  const q = gitQueries(shell.ws);
  let run = start;
  for (const command of commands) {
    enter(shell, command);
    run = checkStep(run, mission, q);
  }
  return run;
}

describe('Act 2 sims, played step by step', () => {
  it('has a reference solution for exactly the steps each mission has', () => {
    for (const mission of act2Missions) {
      expect(Object.keys(SOLUTIONS[mission.id] ?? {}), mission.id).toEqual(
        mission.steps.map((step) => step.id),
      );
    }
  });

  it.each(act2Missions.map((mission) => mission.id))('%s is solvable by state', (id) => {
    const mission = missionById(id);
    const sim = startSim(mission);
    const { shell } = sim;
    let { run } = sim;
    const q = gitQueries(shell.ws);

    mission.steps.forEach((step, index) => {
      // Not already done: the step is on screen and its predicate is false.
      expect(run.stepIndex, `${step.id} should be current`).toBe(index);
      expect(evaluate(step.success, q), `${step.id} is already true`).toBe(false);

      run = play(mission, run, shell, SOLUTIONS[id]?.[step.id] ?? []);

      // Done, and done alone: the next step still needs its own commands.
      expect(run.steps[index]?.completed, `${step.id} should be complete`).toBe(true);
      expect(run.stepIndex, `${step.id} completed a later step too`).toBe(index + 1);
    });
    expect(run.phase).toBe('drills');
  });
});

describe('Act 2 sims accept other valid paths', () => {
  /** Plays a whole sim from one list of commands and returns where the run ended. */
  function playThrough(id: string, commands: readonly string[]) {
    const mission = missionById(id);
    const { run, shell } = startSim(mission);
    return { run: play(mission, run, shell, commands), shell };
  }

  it('three-rooms: stage everything, then take todo.txt back off the dock', () => {
    const { run } = playThrough('three-rooms', [
      'git init',
      'git add .',
      // Before the first commit there is no HEAD to restore from, so real git (and the
      // sandbox) unstage with rm --cached instead of restore --staged.
      'git rm --cached todo.txt',
      'git commit -m "feat: add notes app"',
      'echo "Run it with npm start." >> README.md',
      // -a is safe here: README.md is tracked and todo.txt is new, so it is skipped.
      'git commit -am "docs: explain how to run the app"',
    ]);
    expect(run.phase).toBe('drills');
  });

  it('three-rooms: staging too much does not pass until todo.txt is off the dock', () => {
    const mission = missionById('three-rooms');
    const { run, shell } = startSim(mission);
    const staged = play(mission, run, shell, ['git init', 'git add .']);
    expect(staged.stepIndex).toBe(1);
  });

  it('reading-history: redirect git show into the file, and unstage with reset', () => {
    const { run } = playThrough('reading-history', [
      'git show HEAD~2:src/tax.ts > src/tax.ts',
      'git reset src/checkout.ts',
      'git add src/tax.ts',
      'git commit -m "fix: restore 8% sales tax"',
      'git add src/cart.ts',
      'git commit -m "feat: add free delivery threshold"',
    ]);
    expect(run.phase).toBe('drills');
  });

  it('good-commits: committing the fix together with the docs change is not atomic', () => {
    const mission = missionById('good-commits');
    const { run, shell } = startSim(mission);
    const bundled = play(mission, run, shell, [
      'git add src/login.ts README.md',
      'git commit -m "fix: trim emails and fix readme"',
    ]);
    expect(bundled.stepIndex).toBe(0);
  });

  it('good-commits: commit -am grabs the version bump and skips the new theme file', () => {
    const mission = missionById('good-commits');
    const { run, shell } = startSim(mission);
    const afterDocs = play(mission, run, shell, [
      'git add src/login.ts',
      'git commit -m "fix: trim spaces from login emails"',
      'git add README.md',
      'git commit -m "docs: fix install command in readme"',
      'git commit -am "feat: add dark mode"',
    ]);
    expect(afterDocs.stepIndex).toBe(2);
  });

  it('ignore-list: write every rule first, including a ! exception for .env.example', () => {
    const { run } = playThrough('ignore-list', [
      'echo "dist/" > .gitignore',
      'echo "*.log" >> .gitignore',
      'echo ".env*" >> .gitignore',
      'echo "!.env.example" >> .gitignore',
      'git rm --cached .env',
      'echo "API_KEY=" > .env.example',
      'echo "DATABASE_URL=" >> .env.example',
      'git add .',
      'git commit -m "chore: ignore secrets and build output"',
    ]);
    expect(run.phase).toBe('drills');
  });

  it('ignore-list: deleting .env from disk does not count as untracking it', () => {
    const mission = missionById('ignore-list');
    const { run, shell } = startSim(mission);
    const deleted = play(mission, run, shell, [
      'echo "dist/" >> .gitignore',
      'echo "*.log" >> .gitignore',
      'git rm .env',
    ]);
    expect(deleted.stepIndex).toBe(2);
  });

  it('undo-everything: reset --mixed then re-add, and recover by the id from git reflog', () => {
    const mission = missionById('undo-everything');
    const { run, shell } = startSim(mission);
    let played = play(mission, run, shell, [
      'git restore style.css',
      'git restore --staged notes.txt',
      'git reset HEAD~1',
      'git add src/pricing.js',
      'git commit -m "feat: add pricing calculator"',
      'git revert HEAD~2',
      'git reset --hard HEAD~2',
    ]);
    expect(played.stepIndex).toBe(5);

    // Read the revert commit's id off the reflog, exactly as Kyle would on screen.
    const reflog = shell.run('git reflog').lines.map((line) => line.text);
    const revertLine = reflog.find((text) => text.includes('Revert "feat: add confetti'));
    const revertId = revertLine?.split(' ')[0] ?? '';
    expect(revertId).toMatch(/^[0-9a-f]{7}$/);
    played = play(mission, played, shell, [`git reset --hard ${revertId}`]);
    expect(played.phase).toBe('drills');
  });

  it('undo-everything: reset --hard to fix the confetti commit fails the revert step', () => {
    const mission = missionById('undo-everything');
    const { run, shell } = startSim(mission);
    const rewritten = play(mission, run, shell, [
      'git restore style.css',
      'git restore --staged notes.txt',
      'git reset --soft HEAD~1',
      'git commit -m "feat: add pricing calculator"',
      'git reset --hard HEAD~3',
    ]);
    expect(rewritten.stepIndex).toBe(3);
  });
});
