import { describe, expect, it } from 'vitest';
import { AgentActionSchema, BaseActionSchema, OutcomeSchema } from './agentSchema';

/** The messages zod reports, so a test can check the right rule fired. */
function problems(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');
const times = <T>(count: number, item: T) => Array.from({ length: count }, () => item);

describe('OutcomeSchema', () => {
  it('needs a result, printed text, or a state', () => {
    expect(problems(OutcomeSchema.safeParse({}))).toEqual([
      'Say what the outcome is: a result, printed text, or a state.',
    ]);
    const state = { kind: 'driveFolder', path: 'Users/kyle/notes' };
    for (const outcome of [{ result: 'error' }, { printed: 'Cannot find path' }, { state }]) {
      expect(OutcomeSchema.parse(outcome)).toEqual(outcome);
    }
  });
});

describe('actions', () => {
  it('run lines, write files, and open or switch terminals', () => {
    const actions = [
      { do: 'run', line: 'Remove-Item notes', answer: 'A', say: 'Tidying up.' },
      { do: 'run', line: 'cd nowhere', fails: true },
      { do: 'write', path: 'Users/kyle/quillwork/api/.env', content: 'PORT=4000\n' },
      { do: 'newTerminal', say: 'Opening a second terminal.' },
      { do: 'useTerminal', tab: 2 },
    ];
    for (const action of actions) expect(BaseActionSchema.parse(action)).toEqual(action);
  });

  it('refuse a blank or overlong line, a bad answer, and a tab that cannot exist', () => {
    const bad = [
      { do: 'run', line: '   ' },
      { do: 'run', line: 'x'.repeat(201) },
      { do: 'run', line: 'Remove-Item notes', answer: 'S' },
      { do: 'run', line: 'cd api', fails: false },
      { do: 'useTerminal', tab: 0 },
      { do: 'useTerminal', tab: 7 },
      { do: 'type', line: 'cd api' },
    ];
    for (const action of bad) expect(BaseActionSchema.safeParse(action).success).toBe(false);
  });

  it("keep each of Otto's lines to 12 words", () => {
    const run = (say: string) => BaseActionSchema.safeParse({ do: 'run', line: 'cd api', say });
    expect(run(words(12)).success).toBe(true);
    expect(problems(run(words(13)))).toEqual(['Otto speaks in 12 words or fewer.']);
    const denyLine = { do: 'run', line: 'cd api', denyLine: words(13) };
    expect(AgentActionSchema.safeParse(denyLine).success).toBe(false);
  });

  it('in a script can predict, force a pause, and branch on a deny', () => {
    const outcome = { result: 'ok' };
    const run = {
      do: 'run',
      line: 'mkdir notes',
      ask: true,
      predict: {
        question: 'Where will notes land?',
        options: [
          { id: 'home', text: 'At home', outcome },
          { id: 'fails', text: 'Nowhere', outcome: { result: 'error' } },
        ],
      },
      onDeny: [{ do: 'run', line: 'mkdir C:\\Users\\kyle\\quillwork\\api\\notes' }],
      denyLine: 'Good stop. Using the full path.',
    };
    expect(AgentActionSchema.parse(run)).toEqual(run);
    const write = { do: 'write', path: 'Users/kyle/a.txt', content: '' };
    expect(AgentActionSchema.parse(write)).toEqual({ ...write, onDeny: [] });
    // Predicts take 2 to 4 options, each with its own id, and a deny branch up to 4 actions.
    const predict = (ids: string[]) =>
      AgentActionSchema.safeParse({
        ...run,
        predict: { ...run.predict, options: ids.map((id) => ({ id, text: id, outcome })) },
      });
    const counts = [['a'], ['a', 'b'], ['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd', 'e']];
    expect(counts.map((ids) => predict(ids).success)).toEqual([false, true, true, false]);
    expect(problems(predict(['a', 'a']))).toEqual(['Duplicate id "a".']);
    const deny = (count: number) =>
      AgentActionSchema.safeParse({ ...run, onDeny: times(count, write) }).success;
    expect([4, 5].map(deny)).toEqual([true, false]);
  });

  it('after a deny never predict or branch again, and terminals never branch', () => {
    const run = { do: 'run', line: 'cd api', onDeny: [] };
    expect(BaseActionSchema.safeParse(run).success).toBe(false);
    expect(AgentActionSchema.safeParse({ ...run, onDeny: [run] }).success).toBe(false);
    expect(AgentActionSchema.safeParse({ do: 'newTerminal', onDeny: [] }).success).toBe(false);
  });
});
