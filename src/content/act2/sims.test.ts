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

/**
 * Act 2's typed missions. A directed one has no sim to type into: its own
 * test file plays every card through describeDirectedMission instead.
 */
const typedMissions = act2Missions.filter((mission) =>
  mission.steps.every((step) => step.agent === undefined),
);

function missionById(id: string): Mission {
  const mission = typedMissions.find((candidate) => candidate.id === id);
  if (mission === undefined) throw new Error(`Act 2 has no typed mission "${id}".`);
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
    for (const mission of typedMissions) {
      expect(Object.keys(SOLUTIONS[mission.id] ?? {}), mission.id).toEqual(
        mission.steps.map((step) => step.id),
      );
    }
  });

  it.each(typedMissions.map((mission) => mission.id))('%s is solvable by state', (id) => {
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
