import { describe, expect, it } from 'vitest';
import { CHOICES } from '../../engine/shell/machine/confirm';
import type { FeedBeat, Typist } from './feed';
import type { Reveal } from './pace';
import { EMPTY_RUN_LOG, logReveals } from './runLog';

const PROMPT = 'PS C:\\Users\\kyle> ';

function beat(entry: FeedBeat): Reveal {
  return { kind: 'beat', beat: entry };
}

function keys(text: string, from = 0, by: Typist = 'otto'): Reveal {
  return { kind: 'keys', tab: 1, by, text, from };
}

function result(exitCode: number, asking = false): Reveal {
  return beat({ kind: 'result', tab: 1, exitCode, asking });
}

const prompt = (text: string) => beat({ kind: 'prompt', tab: 1, text });
const enter = beat({ kind: 'enter', tab: 1 });

describe("Otto's run log", () => {
  it('adds a row only when a line has finished, with how it ended', () => {
    const typing = logReveals(EMPTY_RUN_LOG, [prompt(PROMPT), keys('cd ap')]);
    expect(typing.rows).toEqual([]);
    const done = logReveals(typing, [keys('i', 5), enter, result(1)]);
    expect(done.rows).toEqual([{ text: 'cd api', answer: false, status: 'failed' }]);
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
      { text: 'Remove-Item api', answer: false, status: 'asked' },
      { text: 'A', answer: true, status: 'ok' },
    ]);
  });

  it('keeps a denied line, a file write, and none of Kyle’s look lines', () => {
    const log = logReveals(EMPTY_RUN_LOG, [
      keys('Remove-Item notes'),
      beat({ kind: 'cancel', tab: 1 }),
      result(0),
      keys('Get-Location', 0, 'kyle'),
      enter,
      beat({ kind: 'output', tab: 1, lines: [] }),
      beat({ kind: 'world', events: [] }),
      beat({ kind: 'divider', tab: 2 }),
      result(0),
    ]);
    expect(log.rows).toEqual([
      { text: 'Remove-Item notes', answer: false, status: 'denied' },
      { text: null, answer: false, status: 'ok' },
    ]);
  });

  it('ignores the whole-beat form of a typed line', () => {
    const typed = beat({ kind: 'type', tab: 1, text: 'cd api', by: 'otto' });
    expect(logReveals(EMPTY_RUN_LOG, [typed])).toEqual(EMPTY_RUN_LOG);
  });
});
