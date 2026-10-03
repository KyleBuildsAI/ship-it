import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { answerKey, gradeJudgment, JudgmentError } from './judgment';
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
