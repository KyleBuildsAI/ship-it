import { describe, expect, it } from 'vitest';
import { evaluate, type Predicate } from '../../game/missions/predicates';
import { sandboxQueries } from '../../game/missions/sandbox';
import { validateAct } from '../../game/missions/validateAct';
import type { Shell } from '../../engine/shell/shell';
import { enter, sandboxShell } from '../act2/play.test-helpers';
import { act1, act1Missions } from './index';

const mission = act1Missions[0];
if (mission === undefined) throw new Error('Act 1 has no mission');

const passes = (shell: Shell, predicate: Predicate) =>
  evaluate(predicate, sandboxQueries(shell.ws));

function step(id: string): Predicate {
  const found = mission?.steps.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no step ${id}`);
  return found.success;
}

describe('Act 1', () => {
  it('parses, ships Mission 1.1 in early access, and passes validateAct', () => {
    expect(act1.earlyAccess).toBe(true);
    expect(act1.missionIds).toEqual(['where-things-live']);
    expect(act1.upcoming).toHaveLength(5);
    expect(validateAct(act1, act1Missions)).toEqual([]);
  });
});

describe('Mission 1.1, Where Things Live, played by typing', () => {
  it('starts with no step already done', () => {
    const shell = sandboxShell(mission.initialRepoState);
    for (const { id, success } of mission.steps) {
      expect(passes(shell, success), `${id} is already true`).toBe(false);
    }
  });

  it('is finished by the commands its hints give, in order', () => {
    const shell = sandboxShell(mission.initialRepoState);
    enter(shell, 'cd C:\\Users\\kyle\\quillwork\\api');
    expect(passes(shell, step('stand-in-the-api'))).toBe(true);
    enter(shell, 'mkdir notes');
    expect(passes(shell, step('notes-in-the-api'))).toBe(true);
    enter(shell, 'mkdir ..\\web\\notes');
    expect(passes(shell, step('web-notes'))).toBe(true);
    enter(shell, 'Remove-Item C:\\Users\\kyle\\logs');
    expect(passes(shell, step('tidy-home'))).toBe(true);
  });

  it('does not pass a bare cd from home, which fails', () => {
    const shell = sandboxShell(mission.initialRepoState);
    shell.run('cd api');
    expect(passes(shell, step('stand-in-the-api'))).toBe(false);
  });

  it('does not pass notes made from home, where a bare name lands', () => {
    const shell = sandboxShell(mission.initialRepoState);
    enter(shell, 'mkdir notes');
    enter(shell, 'mkdir C:\\Users\\kyle\\quillwork\\api\\notes');
    // The API has notes, but so does home: the stray folder fails the step.
    expect(passes(shell, step('notes-in-the-api'))).toBe(false);
  });

  it('does not pass web\\notes made inside the API', () => {
    const shell = sandboxShell(mission.initialRepoState);
    enter(shell, 'cd C:\\Users\\kyle\\quillwork\\api');
    enter(shell, 'mkdir web\\notes');
    expect(passes(shell, step('web-notes'))).toBe(false);
  });

  it('can be solved with full paths from anywhere', () => {
    const shell = sandboxShell(mission.initialRepoState);
    enter(shell, 'cd C:\\Users\\kyle\\quillwork\\api');
    enter(shell, 'mkdir C:\\Users\\kyle\\quillwork\\api\\notes');
    enter(shell, 'mkdir C:\\Users\\kyle\\quillwork\\web\\notes');
    enter(shell, 'Remove-Item C:\\Users\\kyle\\logs');
    for (const { id, success } of mission.steps) {
      expect(passes(shell, success), id).toBe(true);
    }
  });
});

describe("Mission 1.1's drills", () => {
  const solutions: Readonly<Record<string, readonly string[]>> = {
    'wtl-go-web': ['cd C:\\Users\\kyle\\quillwork\\web'],
    'wtl-logs-in-api': ['mkdir C:\\Users\\kyle\\quillwork\\api\\logs'],
    'wtl-up-two': ['cd ..\\..'],
    'wtl-todo-in-web': ['New-Item C:\\Users\\kyle\\quillwork\\web\\todo.md'],
    'wtl-remove-stray': ['Remove-Item C:\\Users\\kyle\\notes'],
  };

  it('has a solution for every drill', () => {
    expect(mission.drills.map((drill) => drill.id).sort()).toEqual(Object.keys(solutions).sort());
  });

  for (const [id, commands] of Object.entries(solutions)) {
    it(`${id}: starts unsolved, and its solution solves it`, () => {
      const drill = mission.drills.find((entry) => entry.id === id);
      if (drill === undefined || !('success' in drill)) throw new Error(`no typed drill ${id}`);
      const shell = sandboxShell(drill.setup);
      expect(passes(shell, drill.success)).toBe(false);
      for (const command of commands) enter(shell, command);
      expect(passes(shell, drill.success)).toBe(true);
    });
  }
});
