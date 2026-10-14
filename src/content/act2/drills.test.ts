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
  'undo-revert-shared': ['git reset --hard HEAD~2'],
  'undo-soft-reset': ['git reset HEAD~1'],
};

/**
 * Act 2's typed drills. Directed missions have judgment drills instead, which
 * their own test files prove with describeJudgmentDrills.
 */
function typed(drill: Drill): drill is SandboxDrill {
  return !isJudgmentDrill(drill);
}

const drills = act2Missions.flatMap((mission) => mission.drills.filter(typed));

describe('Act 2 typed No-AI Drills', () => {
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
