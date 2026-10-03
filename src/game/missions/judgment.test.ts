import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { answerKey, gradeJudgment, JudgmentError, shuffleFor } from './judgment';
import { sampleJudgmentDrillsInput } from './sample.test-mission';
import { JudgmentDrillSchema, type JudgmentDrill, type JudgmentDrillInput } from './schema';

const HOME = 'Users/kyle';
const API = 'Users/kyle/quillwork/api';

/** The sample drill with this id, with any fields swapped for the case under test. */
function sample(id: string, changes: Partial<JudgmentDrillInput> = {}): JudgmentDrill {
  const input = sampleJudgmentDrillsInput.find((drill) => drill.id === id);
  if (input === undefined) throw new Error(`No sample drill "${id}".`);
  return JudgmentDrillSchema.parse({ ...input, ...changes });
}

const pick = (optionId: string) => ({ kind: 'pick', optionId }) as const;
const allow = { kind: 'approve', allow: true } as const;
const deny = { kind: 'approve', allow: false } as const;

/**
 * A laptop standing in the API, with notes that hold a file: `Remove-Item notes` without
 * -Recurse makes PowerShell ask its Confirm question there.
 */
const notesLaptop = windows({ mount: API })
  .session()
  .write(`${API}/package.json`, '{}\n')
  .write(`${API}/notes/onboarding.md`, '# Week 1\n')
  .cd(API)
  .toSpec();
const notesSurvive = { kind: 'driveFile', path: `${API}/notes/onboarding.md` } as const;

describe('gradeJudgment', () => {
  it('passes the right pick and names it as the key', () => {
    expect(gradeJudgment(sample('sample-predict-typo'), pick('error'), testDeps())).toEqual({
      passed: true,
      keyId: 'error',
    });
  });

  it('misses a wrong pick and names the right one', () => {
    expect(gradeJudgment(sample('sample-diagnose-home'), pick('typo'), testDeps())).toEqual({
      passed: false,
      keyId: 'home',
    });
  });

  it('in a fix drill, keys on the pick when it works, else the first fix that does', () => {
    const drill = sample('sample-fix-cd');
    expect(gradeJudgment(drill, pick('step-by-step'), testDeps())).toEqual({
      passed: true,
      keyId: 'step-by-step',
    });
    expect(gradeJudgment(drill, pick('again'), testDeps())).toEqual({
      passed: false,
      keyId: 'full-path',
    });
  });

  it('grades allow and deny by what a dry run of the action breaks', () => {
    expect(gradeJudgment(sample('sample-approve-stray'), allow, testDeps()).passed).toBe(true);
    expect(gradeJudgment(sample('sample-approve-stray'), deny, testDeps())).toEqual({
      passed: false,
      keyId: 'allow',
    });
    expect(gradeJudgment(sample('sample-approve-notes'), deny, testDeps())).toEqual({
      passed: true,
      keyId: 'deny',
    });
  });

  it('refuses an answer that does not fit the drill, since that is a bug in play', () => {
    const deps = testDeps();
    expect(() => gradeJudgment(sample('sample-approve-stray'), pick('allow'), deps)).toThrow(
      JudgmentError,
    );
    expect(() => gradeJudgment(sample('sample-predict-typo'), allow, deps)).toThrow(/a pick/);
    expect(() => gradeJudgment(sample('sample-predict-typo'), pick('nope'), deps)).toThrow(
      /no option "nope"/,
    );
  });
});

describe('answerKey', () => {
  it('refuses a predict where two options come true', () => {
    const drill = sample('sample-predict-typo', {
      options: [
        { id: 'error', text: 'An error', outcome: { result: 'error' } },
        {
          id: 'home',
          text: 'Otto stays home',
          outcome: { state: { kind: 'currentDirectory', path: HOME } },
        },
        {
          id: 'lands',
          text: 'Otto lands in the API',
          outcome: { state: { kind: 'currentDirectory', path: API } },
        },
      ],
    });
    expect(() => answerKey(drill, testDeps())).toThrow(/exactly one true option, and has 2/);
  });

  it('refuses a diagnose where nothing is true, and a fix drill where no fix works', () => {
    const diagnose = sample('sample-diagnose-home', {
      options: [
        { id: 'a', text: 'One' },
        { id: 'b', text: 'Two' },
        { id: 'c', text: 'Three' },
      ],
    });
    expect(() => answerKey(diagnose, testDeps())).toThrow(/has 0/);
    const fix = sample('sample-fix-cd', { goal: { kind: 'currentDirectory', path: `${API}/src` } });
    expect(() => answerKey(fix, testDeps())).toThrow(/no fix that works/);
  });

  it('fails a fix that reaches the goal but also makes a failIf true', () => {
    const drill = sample('sample-fix-cd', {
      failIf: [{ kind: 'driveFolder', path: `${HOME}/quillwork/api/stray` }],
      options: [
        {
          id: 'mess',
          text: 'Go there and leave a folder behind.',
          script: [
            { do: 'run', line: 'cd C:\\Users\\kyle\\quillwork\\api' },
            { do: 'run', line: 'mkdir stray' },
          ],
        },
        {
          id: 'clean',
          text: 'Go there.',
          script: [{ do: 'run', line: 'cd C:\\Users\\kyle\\quillwork\\api' }],
        },
        {
          id: 'again',
          text: 'Try cd api again.',
          script: [{ do: 'run', line: 'cd api', fails: true }],
        },
      ],
    });
    expect(answerKey(drill, testDeps())).toEqual(['clean']);
  });

  it('predicts a line by what it prints while PowerShell asks, before any answer', () => {
    const drill = JudgmentDrillSchema.parse({
      kind: 'predict',
      id: 'asks-first',
      prompt: 'What happens?',
      concept: 'deleting',
      setup: notesLaptop,
      action: { do: 'run', line: 'Remove-Item notes', answer: 'A' },
      options: [
        {
          id: 'asks',
          text: 'PowerShell asks first',
          outcome: { printed: 'Confirm', state: notesSurvive },
        },
        {
          id: 'gone',
          text: 'notes is deleted',
          outcome: { state: { ...notesSurvive, exists: false } },
        },
        { id: 'error', text: 'An error', outcome: { result: 'error' } },
      ],
      explain: 'notes holds a file, so without -Recurse PowerShell asks before deleting it.',
    });
    expect(answerKey(drill, testDeps())).toEqual(['asks']);
  });

  it("judges an approve by Otto's answer too, when the line asks", () => {
    const approve = (answer: 'A' | 'L') =>
      JudgmentDrillSchema.parse({
        kind: 'approve',
        id: `answers-${answer.toLowerCase()}`,
        prompt: 'Allow?',
        concept: 'approvals',
        setup: notesLaptop,
        action: { do: 'run', line: 'Remove-Item notes', answer },
        guards: [notesSurvive],
        explain: 'Yes to All deletes the notes; No to All leaves them.',
      });
    expect(answerKey(approve('A'), testDeps())).toEqual(['deny']);
    expect(answerKey(approve('L'), testDeps())).toEqual(['allow']);
  });

  /** The API with notes and docs each holding a file, so PowerShell asks about each. */
  const twoFoldersLaptop = windows({ mount: API })
    .session()
    .write(`${API}/package.json`, '{}\n')
    .write(`${API}/notes/onboarding.md`, '# Week 1\n')
    .write(`${API}/docs/guide.md`, '# Guide\n')
    .cd(API)
    .toSpec();
  const twoFolders = (action: object, guard: object) =>
    JudgmentDrillSchema.parse({
      kind: 'approve',
      id: 'two-folders',
      prompt: 'Allow?',
      concept: 'approvals',
      setup: twoFoldersLaptop,
      action,
      guards: [guard],
      explain: 'Each folder holds a file, so PowerShell asks about each one.',
    });
  const guideSurvives = { kind: 'driveFile', path: `${API}/docs/guide.md` };
  const packageSurvives = { kind: 'driveFile', path: `${API}/package.json` };

  it('judges every answer when PowerShell asks again, as Otto answers each time', () => {
    const line = { do: 'run', line: 'Remove-Item notes, docs', answer: 'Y' };
    // The first Yes only deletes notes. The second, about docs, deletes the guide.
    expect(answerKey(twoFolders(line, guideSurvives), testDeps())).toEqual(['deny']);
    expect(answerKey(twoFolders(line, packageSurvives), testDeps())).toEqual(['allow']);
  });

  it('weighs the line with every question refused, as a mission gate does', () => {
    // No to All spares notes, but package.json never needed a question, so it goes anyway.
    const line = { do: 'run', line: 'Remove-Item notes, package.json', answer: 'L' };
    expect(answerKey(twoFolders(line, packageSurvives), testDeps())).toEqual(['deny']);
  });

  it('refuses an approve whose line asks but has no answer ready, as the runner does', () => {
    const line = { do: 'run', line: 'Remove-Item notes' };
    expect(() => answerKey(twoFolders(line, packageSurvives), testDeps())).toThrow(
      /no answer for it/,
    );
  });

  it('turns a script that types over an open question into a JudgmentError', () => {
    const drill = sample('sample-fix-cd', {
      setup: twoFoldersLaptop,
      history: [],
      options: [
        {
          id: 'stuck',
          text: 'Delete both, then look around.',
          // The Yes deletes notes, then PowerShell asks about docs, so Get-Location can't run.
          script: [
            { do: 'run', line: 'Remove-Item notes, docs', answer: 'Y' },
            { do: 'run', line: 'Get-Location' },
          ],
        },
        { id: 'stay', text: 'Stay here.', script: [{ do: 'run', line: 'Get-Location' }] },
        { id: 'look', text: 'List the folder.', script: [{ do: 'run', line: 'Get-ChildItem' }] },
      ],
    });
    expect(() => answerKey(drill, testDeps())).toThrow(JudgmentError);
    expect(() => answerKey(drill, testDeps())).toThrow(/option "stuck": Tab 1 is asking/);
  });

  it('plays an answer in the history into the scene', () => {
    const drill = JudgmentDrillSchema.parse({
      kind: 'diagnose',
      id: 'after-yes',
      prompt: 'Where did the notes go?',
      concept: 'deleting',
      setup: notesLaptop,
      history: [{ do: 'run', line: 'Remove-Item notes', answer: 'A' }],
      options: [
        { id: 'deleted', text: 'Otto said Yes to All', truth: { ...notesSurvive, exists: false } },
        { id: 'kept', text: 'They are still there', truth: notesSurvive },
        { id: 'moved', text: 'They moved' },
      ],
      explain: 'Yes to All answered the Confirm question, so notes and its file are gone.',
    });
    expect(answerKey(drill, testDeps())).toEqual(['deleted']);
  });
});

describe('shuffleFor', () => {
  const items = ['a', 'b', 'c', 'd'] as const;

  it('gives the same order for the same drill and attempt', () => {
    expect(shuffleFor('drill', 2)(items)).toEqual(shuffleFor('drill', 2)(items));
  });

  it('keeps every item exactly once and leaves the list it was given alone', () => {
    const given = [...items];
    expect([...shuffleFor('drill', 0)(given)].sort()).toEqual([...items]);
    expect(given).toEqual([...items]);
  });

  it('moves the options around between attempts', () => {
    const orders = new Set(
      Array.from({ length: 8 }, (_, attempt) => shuffleFor('drill', attempt)(items).join('')),
    );
    expect(orders.size).toBeGreaterThan(3);
  });

  it('gives different drills different orders on the same attempt', () => {
    const orders = new Set(
      ['one', 'two', 'three', 'four', 'five'].map((id) => shuffleFor(id, 0)(items).join('')),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('handles an empty list', () => {
    expect(shuffleFor('drill', 0)([])).toEqual([]);
  });
});
