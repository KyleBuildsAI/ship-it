import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { drive, type DriverAction } from '../../engine/shell/driver';
import { CHOICES } from '../../engine/shell/machine/confirm';
import { Shell } from '../../engine/shell/shell';
import {
  feedAction,
  feedCancel,
  startFeed,
  feedTyping,
  type Fed,
  type FeedBeat,
  type FeedState,
  type Typist,
} from '../../game/agent/feed';
import { advance, NORMAL_PACE, START, type Reveal } from '../../game/agent/pace';
import { FeedPrinter, noticeText, OTTO_MARKER, READ_ONLY_HINT, tabLabel } from './feedText';

const HOME = 'PS C:\\Users\\kyle> ';
const APP = 'PS C:\\Users\\kyle\\quillwork\\app> ';

/**
 * The rows a terminal shows after `text`, colors dropped. It understands only what the
 * printer writes: carriage return, line feed, and "clear to the end of the line".
 */
function screenOf(text: string): string[] {
  const rows = [''];
  let row = 0;
  let col = 0;
  // Terminal codes start with the escape character, so matching them is the point here.
  // eslint-disable-next-line no-control-regex
  for (const part of text.replace(/\x1b\[[0-9;]*m/g, '').split(/(\x1b\[K|\r|\n)/)) {
    const current = rows[row] ?? '';
    if (part === '\r') col = 0;
    else if (part === '\n') {
      row += 1;
      rows[row] ??= '';
    } else if (part === '\x1b[K') rows[row] = current.slice(0, col);
    else {
      rows[row] = current.slice(0, col).padEnd(col) + part + current.slice(col + part.length);
      col += part.length;
    }
  }
  return rows;
}

/** What `beats` reveal when played in 50 ms frames, as the game plays them, up to `ms`. */
function reveals(beats: readonly FeedBeat[], ms = Infinity): Reveal[] {
  const shown: Reveal[] = [];
  let head = START;
  for (let spent = 0; spent < ms; spent += 50) {
    const frame = advance(beats, NORMAL_PACE, head, 50);
    shown.push(...frame.reveals);
    head = frame.head;
    if (frame.done) break;
  }
  return shown;
}

/** A laptop at home, with a folder that makes Remove-Item ask, and Otto on the terminal. */
function laptop() {
  const ws = windows().write('Users/kyle/old/notes.txt', 'week 1\n').build(testDeps());
  const shell = new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
  const printer = new FeedPrinter();
  let text = printer.takeOver(shell.prompt());
  let state: FeedState = startFeed(1, shell.prompt());
  /** Plays what `next` adds to the feed, for `ms` or to the end. */
  const feed = (next: (now: FeedState) => Fed, ms?: number) => {
    const fed = next(state);
    state = fed.state;
    text += printer.print(reveals(fed.beats, ms));
  };
  const act = (action: DriverAction, by: Typist = 'otto') => {
    feed((now) => feedAction(now, drive(shell, action), by));
  };
  const write = (more: string) => {
    text += more;
  };
  return { shell, printer, feed, act, write, text: () => text, screen: () => screenOf(text) };
}

describe('FeedPrinter', () => {
  it("types Otto's line after the waiting prompt, his marker in front, then its output", () => {
    const { act, screen, text } = laptop();
    act({ do: 'run', line: 'mkdir notes' });
    expect(screen()[0]).toBe(`otto › ${HOME}mkdir notes`);
    expect(screen().join('\n')).toContain('Directory: C:\\Users\\kyle');
    expect(screen().at(-1)).toBe('');
    // His marker arrives with his first key: the line is drawn again, marker first.
    expect(text()).toContain(`\r\x1b[K${OTTO_MARKER}${HOME}m`);
  });

  it('shows a line half typed while the pace is still typing it', () => {
    const { feed, screen } = laptop();
    // 400 ms to think, then 25 ms a key: 4 keys by 500 ms.
    feed((now) => feedTyping(now, { tab: 1, prompt: HOME, echo: 'mkdir notes' }), 500);
    expect(screen()).toEqual([`otto › ${HOME}mkdi`]);
  });

  it("types Kyle's look with no marker", () => {
    const { act, screen } = laptop();
    act({ do: 'run', line: 'Get-Location' }, 'kyle');
    expect(screen()[0]).toBe(`${HOME}Get-Location`);
    expect(screen().join('\n')).toContain('C:\\Users\\kyle');
  });

  it("starts each prompt on a fresh line, but never repeats the one that's waiting", () => {
    const { printer, write, act, screen } = laptop();
    // A feed that doesn't know the prompt is showing prints it once more: skipped.
    write(printer.print([{ kind: 'beat', beat: { kind: 'prompt', tab: 1, text: HOME } }]));
    act({ do: 'run', line: 'cd quillwork\\app' });
    act({ do: 'run', line: 'Get-ChildItem' });
    expect(screen().slice(0, 2)).toEqual([
      `otto › ${HOME}cd quillwork\\app`,
      `otto › ${APP}Get-ChildItem`,
    ]);
  });

  it('prints a divider on a tab switch, leaving the prompt it left behind', () => {
    const { act, screen } = laptop();
    act({ do: 'newTerminal' });
    expect(screen()).toEqual([HOME, `── ${tabLabel(2)} ──`, HOME]);
  });

  it('marks a denied line and ends it unrun', () => {
    const { feed, shell, screen } = laptop();
    feed((now) => feedTyping(now, { tab: 1, prompt: shell.prompt(), echo: 'Remove-Item old' }));
    feed(feedCancel);
    expect(screen()).toEqual([`otto › ${HOME}Remove-Item old  (denied)`, '']);
  });

  it("types Otto's answer after PowerShell's choice line, with his marker", () => {
    const { act, screen } = laptop();
    act({ do: 'run', line: 'Remove-Item old' });
    act({ do: 'answer', choice: 'A' });
    expect(screen()).toContain(`otto › ${CHOICES}A`);
  });

  it('colors output by its tone', () => {
    const { act, text } = laptop();
    act({ do: 'run', line: 'cd nope' });
    expect(text()).toContain('\x1b[31m');
  });

  it("draws a whole typed line, and nothing for the world's or the result's beats", () => {
    const printer = new FeedPrinter();
    const beats: FeedBeat[] = [
      { kind: 'type', tab: 1, text: 'dir', by: 'otto' },
      { kind: 'world', events: [] },
      { kind: 'result', tab: 1, exitCode: 0, asking: false },
    ];
    const text = printer.print(beats.map((beat) => ({ kind: 'beat', beat })));
    expect(screenOf(text)).toEqual(['otto › dir']);
  });
});

describe('game messages while Otto has the terminal', () => {
  it('print above the open line, which comes back as it was', () => {
    const { feed, printer, write, screen } = laptop();
    feed((now) => feedTyping(now, { tab: 1, prompt: HOME, echo: 'Remove-Item old' }));
    write(printer.notice('Heads up.', APP));
    expect(screen()).toEqual(['Heads up.', `otto › ${HOME}Remove-Item old`]);
  });

  it("leave a prompt with nothing typed showing the shell's prompt now", () => {
    const { printer, write, screen } = laptop();
    write(printer.notice('Placement test 2 of 12.', APP));
    expect(screen()).toEqual(['Placement test 2 of 12.', APP]);
  });

  it('print exactly as they do for the player', () => {
    expect(noticeText('Ready.')).toBe('\r\x1b[K\x1b[36mReady.\x1b[0m\r\n');
  });

  it('include a hint for the first key the player presses, once per takeover', () => {
    const printer = new FeedPrinter();
    printer.takeOver(HOME);
    expect(screenOf(printer.refuseKeys(HOME))).toEqual([READ_ONLY_HINT, HOME]);
    expect(printer.refuseKeys(HOME)).toBe('');
    printer.handBack();
    printer.takeOver(HOME);
    expect(printer.refuseKeys(HOME)).toContain(READ_ONLY_HINT);
  });
});

describe('handing the line back to the player', () => {
  it("leaves a waiting prompt for the line editor to draw over, and Otto's typing above it", () => {
    const { printer, feed } = laptop();
    expect(printer.ottoHasTheLine).toBe(true);
    const waiting = new FeedPrinter();
    waiting.takeOver(HOME);
    expect(waiting.handBack()).toBe('');
    feed((now) => feedTyping(now, { tab: 1, prompt: HOME, echo: 'dir' }));
    expect(printer.handBack()).toBe('\r\n');
    expect(printer.ottoHasTheLine).toBe(false);
  });
});
