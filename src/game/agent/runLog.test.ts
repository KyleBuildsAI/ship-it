import { describe, expect, it } from 'vitest';
import { CHOICES } from '../../engine/shell/machine/confirm';
import type { FeedBeat, Typist } from './feed';
import type { Reveal } from './pace';
import { EMPTY_RUN_LOG, logDenied, logReveals, UNLABELLED } from './runLog';

const PROMPT = 'PS C:\\Users\\kyle> ';

function beat(entry: FeedBeat): Reveal {
  return { kind: 'beat', beat: entry };
}

function keys(text: string, from = 0, by: Typist = 'otto'): Reveal {
  return { kind: 'keys', tab: 1, by, text, from };
}

function result(exitCode: number, asking = false, label?: string): Reveal {
  const done = { kind: 'result', tab: 1, exitCode, asking } as const;
  return beat(label === undefined ? done : { ...done, label });
}

const prompt = (text: string) => beat({ kind: 'prompt', tab: 1, text });
const enter = beat({ kind: 'enter', tab: 1 });

describe("Otto's run log", () => {
  it('adds a row only when a line has finished, with how it ended', () => {
    const typing = logReveals(EMPTY_RUN_LOG, [prompt(PROMPT), keys('cd ap')]);
    expect(typing.rows).toEqual([]);
    const done = logReveals(typing, [keys('i', 5), enter, result(1)]);
    expect(done.rows).toEqual([{ text: 'cd api', typed: true, answer: false, status: 'failed' }]);
    expect(done.typing).toBeNull();
  });

  it("marks a line that asked, and the answer typed at PowerShell's choice line", () => {
    const log = logReveals(EMPTY_RUN_LOG, [
      prompt(PROMPT),
      keys('Remove-Item api'),
      enter,
      prompt(CHOICES),
      result(0, true),
      keys('A'),
      enter,
      result(0),
    ]);
    expect(log.rows).toEqual([
      { text: 'Remove-Item api', typed: true, answer: false, status: 'asked' },
      { text: 'A', typed: true, answer: true, status: 'ok' },
    ]);
  });

  it('keeps a denied line, an untyped action, and none of Kyle’s look lines', () => {
    const log = logReveals(EMPTY_RUN_LOG, [
      keys('Remove-Item notes'),
      beat({ kind: 'cancel', tab: 1 }),
      beat({ kind: 'divider', tab: 2 }),
      result(0, false, 'Switched to terminal 2'),
      keys('Get-Location', 0, 'kyle'),
      enter,
      beat({ kind: 'output', tab: 1, lines: [] }),
      beat({ kind: 'world', events: [] }),
      result(0),
    ]);
    expect(log.rows).toEqual([
      { text: 'Remove-Item notes', typed: true, answer: false, status: 'denied' },
      { text: 'Switched to terminal 2', typed: false, answer: false, status: 'ok' },
    ]);
  });

  it('names each action that types nothing by its label, never as a file write', () => {
    const write = 'Wrote C:\\Users\\kyle\\notes.txt';
    const log = logReveals(EMPTY_RUN_LOG, [
      result(0, false, 'Opened a new terminal'),
      result(0, false, write),
      result(0),
    ]);
    expect(log.rows.map((row) => [row.text, row.typed])).toEqual([
      ['Opened a new terminal', false],
      [write, false],
      [UNLABELLED, false],
    ]);
  });

  it('adds a denied row for an untyped action the moment Kyle denies it', () => {
    const write = 'Wrote C:\\Users\\kyle\\notes.txt';
    expect(logDenied(EMPTY_RUN_LOG, write).rows).toEqual([
      { text: write, typed: false, answer: false, status: 'denied' },
    ]);
  });

  it('ignores the whole-beat form of a typed line', () => {
    const typed = beat({ kind: 'type', tab: 1, text: 'cd api', by: 'otto' });
    expect(logReveals(EMPTY_RUN_LOG, [typed])).toEqual(EMPTY_RUN_LOG);
  });
});
