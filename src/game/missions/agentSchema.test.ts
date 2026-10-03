import { describe, expect, it } from 'vitest';
import {
  AgentActionSchema,
  AgentTaskSchema,
  BaseActionSchema,
  ChangeStepsSchema,
  OutcomeSchema,
  PlanSchema,
} from './agentSchema';
import { sampleAgentTaskInput } from './sample.test-mission';

/** The messages zod reports, so a test can check the right rule fired. */
function problems(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

/** The messages with where they point, for rules whose path matters to an author. */
function issues(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return result.error?.issues.map(({ path, message }) => ({ path, message })) ?? [];
}

const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');
const times = <T>(count: number, item: T) => Array.from({ length: count }, () => item);
const windows = { op: 'windows', user: 'kyle', computer: 'QUILL-LT-7' };
const [guess, fullPath] = sampleAgentTaskInput.plans;
const [fix] = sampleAgentTaskInput.fixes;

/** The sample task, or its weak card, with some fields replaced: one broken rule per test. */
const task = (changes: object) =>
  AgentTaskSchema.safeParse({ ...sampleAgentTaskInput, ...changes });
const plan = (changes: object) => PlanSchema.safeParse({ ...guess, ...changes });

describe('ChangeStepsSchema', () => {
  it('lets laptop steps come first, but never builds a new laptop with windows()', () => {
    const steps = [{ op: 'restartTerminals' }, { op: 'cd', path: 'Users/kyle/quillwork/api' }];
    expect(ChangeStepsSchema.parse(steps)).toEqual(steps);
    expect(problems(ChangeStepsSchema.safeParse([{ op: 'session' }, windows]))).toEqual([
      'windows() starts a sandbox; it cannot change one.',
    ]);
  });
});

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
    expect(plan({ claim: words(13) }).success).toBe(false);
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

describe('PlanSchema', () => {
  it('covers 1 to 4 parts of a good request, from the list', () => {
    expect(plan({ covers: [] }).success).toBe(false);
    expect(plan({ covers: ['goal', 'place', 'limits', 'check'] }).success).toBe(true);
    expect(plan({ covers: ['goal', 'tone'] }).success).toBe(false);
  });

  it('needs 2 intents, 1 to 8 script actions, and a slip from the list', () => {
    expect(plan({ intents: ['cd api'] }).success).toBe(false);
    expect(plan({ intents: ['cd api', 'x'] }).success).toBe(false);
    const line = { do: 'run', line: 'Get-Location' };
    expect([0, 1, 8, 9].map((count) => plan({ script: times(count, line) }).success)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(plan({ slip: 'typo' }).success).toBe(false);
    expect(plan({ quality: 'great' }).success).toBe(false);
  });
});

describe('AgentTaskSchema', () => {
  it('accepts the sample task and fills in defaults', () => {
    const parsed = AgentTaskSchema.parse({ ...sampleAgentTaskInput, looks: undefined });
    expect(parsed).toMatchObject({ before: [], focus: [], looks: [] });
    expect(parsed.plans[0]?.script[0]).toMatchObject({ onDeny: [] });
  });

  it('offers 2 to 3 start cards and 1 to 3 fixes', () => {
    const extra = (id: string) => ({ ...guess, id });
    expect(task({ plans: [fullPath] }).success).toBe(false);
    expect(task({ plans: [guess, fullPath, extra('c')] }).success).toBe(true);
    expect(task({ plans: [guess, fullPath, extra('c'), extra('d')] }).success).toBe(false);
    expect(task({ fixes: [] }).success).toBe(false);
    expect(task({ fixes: [fix, extra('e'), extra('f'), extra('g')] }).success).toBe(false);
  });

  it('points the last hint at a strong start plan', () => {
    for (const hintPlan of ['guess', 'fix-full-path', 'no-such-plan']) {
      expect(problems(task({ hintPlan }))).toEqual(['hintPlan must name a strong start plan.']);
    }
  });

  it('rejects an id used twice, even once as a plan and once as a fix', () => {
    // Each issue points at the second id, so an author is sent to the right line.
    expect(issues(task({ fixes: [{ ...fix, id: 'guess' }] }))).toEqual([
      { path: ['fixes', 0, 'id'], message: 'Duplicate id "guess": a start plan uses it.' },
    ]);
    expect(issues(task({ fixes: [fix, fix] }))).toEqual([
      { path: ['fixes', 1, 'id'], message: 'Duplicate id "fix-full-path".' },
    ]);
    const [api] = sampleAgentTaskInput.check.options;
    const check = { ...sampleAgentTaskInput.check, options: [api, api] };
    expect(issues(task({ check }))).toEqual([
      { path: ['check', 'options', 1, 'id'], message: 'Duplicate id "api".' },
    ]);
    const [where] = sampleAgentTaskInput.looks;
    expect(issues(task({ looks: [where, where] }))).toEqual([
      { path: ['looks', 1, 'id'], message: 'Duplicate id "where".' },
    ]);
  });

  it('asks one check with 2 to 4 options, each graded by its own truth', () => {
    const [api, home] = sampleAgentTaskInput.check.options;
    const withOptions = (options: unknown[]) =>
      task({ check: { ...sampleAgentTaskInput.check, options } }).success;
    const more = (id: string) => ({ ...api, id });
    expect(withOptions([api])).toBe(false);
    expect(withOptions([api, home, more('c'), more('d')])).toBe(true);
    expect(withOptions([api, home, more('c'), more('d'), more('e')])).toBe(false);
    expect(withOptions([{ ...api, truth: undefined }, home])).toBe(false);
  });

  it('limits looks to 3, guards and focus folders to 4, and starts without windows()', () => {
    const look = (id: string) => ({ id, label: id, line: 'Get-Location' });
    expect(task({ looks: ['a', 'b', 'c', 'd'].map(look) }).success).toBe(false);
    const guard = { kind: 'driveFolder', path: 'Users/kyle/notes', exists: false };
    expect(task({ guards: times(5, guard) }).success).toBe(false);
    expect(task({ focus: ['a', 'b', 'c', 'd', 'e'] }).success).toBe(false);
    expect(task({ focus: ['C:\\Users\\kyle'] }).success).toBe(false);
    expect(task({ before: [{ op: 'restartTerminals' }] }).success).toBe(true);
    expect(task({ before: [windows] }).success).toBe(false);
  });
});
