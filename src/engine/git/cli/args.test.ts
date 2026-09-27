import { describe, expect, it } from 'vitest';
import { parseArgs, type FlagSpec } from './args';

const COMMIT_FLAGS: FlagSpec[] = [
  { names: ['a', 'all'] },
  { names: ['m', 'message'], takesValue: true },
  { names: ['n', 'max-count'], takesValue: true },
  { names: ['staged', 'cached'] },
];

describe('parseArgs', () => {
  it('splits combined short flags and reads the value that follows', () => {
    const args = parseArgs(['-am', 'fix: typo'], COMMIT_FLAGS);
    expect([...args.flags]).toEqual(['a', 'm']);
    expect(args.values.get('m')).toEqual(['fix: typo']);
  });

  it('reads attached, separate, and --long=value forms', () => {
    expect(parseArgs(['-mfix'], COMMIT_FLAGS).values.get('m')).toEqual(['fix']);
    expect(parseArgs(['--message', 'one'], COMMIT_FLAGS).values.get('m')).toEqual(['one']);
    expect(parseArgs(['--message=a=b'], COMMIT_FLAGS).values.get('m')).toEqual(['a=b']);
  });

  it('collects repeated values in order', () => {
    const args = parseArgs(['-m', 'subject', '-m', 'body'], COMMIT_FLAGS);
    expect(args.values.get('m')).toEqual(['subject', 'body']);
  });

  it('maps aliases to the canonical name', () => {
    expect(parseArgs(['--cached'], COMMIT_FLAGS).flags.has('staged')).toBe(true);
  });

  it('treats -3 as -n 3 when the command has -n', () => {
    expect(parseArgs(['-3'], COMMIT_FLAGS).values.get('n')).toEqual(['3']);
    expect(parseArgs(['-3'], [{ names: ['a'] }]).unknown).toEqual(['-3']);
  });

  it('keeps positional arguments and everything after --', () => {
    const args = parseArgs(['HEAD~1', '--', '-weird-file', 'b.ts'], COMMIT_FLAGS);
    expect(args.positional).toEqual(['HEAD~1']);
    expect(args.afterDoubleDash).toEqual(['-weird-file', 'b.ts']);
    expect(parseArgs(['a.ts'], COMMIT_FLAGS).afterDoubleDash).toBeNull();
  });

  it('reports unknown long and short flags', () => {
    expect(parseArgs(['--nope', '-x'], COMMIT_FLAGS).unknown).toEqual(['--nope', '-x']);
  });

  it('treats a lone dash as a positional argument', () => {
    expect(parseArgs(['-'], COMMIT_FLAGS).positional).toEqual(['-']);
  });

  it('gives an empty value when a value flag is last', () => {
    expect(parseArgs(['-m'], COMMIT_FLAGS).values.get('m')).toEqual(['']);
    expect(parseArgs(['--message'], COMMIT_FLAGS).values.get('m')).toEqual(['']);
  });
});
