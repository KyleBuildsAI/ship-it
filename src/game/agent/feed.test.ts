import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { drive, type DriverAction } from '../../engine/shell/driver';
import { CHOICES } from '../../engine/shell/machine/confirm';
import { Shell } from '../../engine/shell/shell';
import {
  feedAction,
  feedCancel,
  feedOutcome,
  feedPrompt,
  feedTyping,
  startFeed,
  type FeedBeat,
  type FeedState,
} from './feed';

const HOME = 'PS C:\\Users\\kyle> ';

/** A laptop at home in tab 1, with an old folder that makes Remove-Item ask. */
function laptop() {
  const ws = windows().write('Users/kyle/old/notes.txt', 'week 1\n').build(testDeps());
  const shell = new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
  let state: FeedState = startFeed(1);
  /** Runs one action for real and returns just the beats it adds to the feed. */
  const act = (action: DriverAction) => {
    const fed = feedAction(state, drive(shell, action));
    state = fed.state;
    return fed.beats;
  };
  return { shell, act, state: () => state };
}

const kinds = (beats: readonly FeedBeat[]) => beats.map((beat) => beat.kind);

describe('feedAction', () => {
  it('types a line after its prompt, then shows Enter, output, events, and the result', () => {
    const { act } = laptop();
    const beats = act({ do: 'run', line: 'mkdir notes' });
    expect(kinds(beats)).toEqual(['prompt', 'type', 'enter', 'output', 'world', 'result']);
    expect(beats.slice(0, 3)).toEqual([
      { kind: 'prompt', tab: 1, text: HOME },
      { kind: 'type', tab: 1, text: 'mkdir notes', by: 'otto' },
      { kind: 'enter', tab: 1 },
    ]);
    expect(beats[4]).toEqual({
      kind: 'world',
      events: [{ type: 'folderChanged', path: 'Users/kyle/notes', change: 'created' }],
    });
    expect(beats[5]).toEqual({ kind: 'result', tab: 1, exitCode: 0, asking: false });
  });

  it("shows a failed line's error and exit code, with nothing for the world", () => {
    const { act } = laptop();
    const beats = act({ do: 'run', line: 'cd nope' });
    expect(kinds(beats)).toEqual(['prompt', 'type', 'enter', 'output', 'result']);
    expect(beats.at(-1)).toEqual({ kind: 'result', tab: 1, exitCode: 1, asking: false });
  });

  it("opens a tab under a divider, then types after that tab's prompt without repeating it", () => {
    const { act, state } = laptop();
    expect(kinds(act({ do: 'newTerminal' }))).toEqual(['divider', 'prompt', 'world', 'result']);
    expect(state()).toEqual({ tab: 2, prompt: HOME, typed: null });
    const beats = act({ do: 'run', line: 'cd quillwork' });
    expect(kinds(beats)).toEqual(['type', 'enter', 'world', 'result']);
    expect(beats[0]).toMatchObject({ tab: 2 });
  });

  it('switching back prints a divider and the prompt of the tab it lands on', () => {
    const { act } = laptop();
    act({ do: 'run', line: 'cd old' });
    act({ do: 'newTerminal' });
    const beats = act({ do: 'useTerminal', tab: 1 });
    expect(beats.slice(0, 2)).toEqual([
      { kind: 'divider', tab: 1 },
      { kind: 'prompt', tab: 1, text: 'PS C:\\Users\\kyle\\old> ' },
    ]);
  });

  it("leaves PowerShell's choice line open, so Otto's answer is typed right after it", () => {
    const { act, state } = laptop();
    const asked = act({ do: 'run', line: 'Remove-Item old' });
    expect(kinds(asked)).toEqual(['prompt', 'type', 'enter', 'output', 'prompt', 'result']);
    expect(asked[4]).toEqual({ kind: 'prompt', tab: 1, text: CHOICES });
    expect(asked.at(-1)).toMatchObject({ asking: true });
    expect(state().prompt).toBe(CHOICES);
    const answered = act({ do: 'answer', choice: 'A' });
    expect(kinds(answered)).toEqual(['type', 'enter', 'world', 'result']);
    expect(answered[0]).toMatchObject({ text: 'A' });
  });

  it("types nothing for Otto's file tool: only the world hears the write", () => {
    const { act } = laptop();
    const beats = act({ do: 'write', path: 'Users/kyle/todo.md', content: '- ship it\n' });
    expect(kinds(beats)).toEqual(['world', 'result']);
  });

  it("marks a look's line as Kyle's", () => {
    const { shell } = laptop();
    const fed = feedAction(startFeed(1), drive(shell, { do: 'run', line: 'Get-Location' }), 'kyle');
    expect(fed.beats[1]).toEqual({ kind: 'type', tab: 1, text: 'Get-Location', by: 'kyle' });
  });
});

describe('a line that waits before it runs', () => {
  it('can be typed before the action runs, then run with its outcome', () => {
    const { shell } = laptop();
    const typing = { tab: 1, prompt: shell.prompt(), echo: 'mkdir notes' };
    const typed = feedTyping(startFeed(1), typing);
    expect(kinds(typed.beats)).toEqual(['prompt', 'type']);
    expect(typed.state.typed).toBe('mkdir notes');
    const ran = feedOutcome(typed.state, drive(shell, { do: 'run', line: 'mkdir notes' }));
    expect(kinds(ran.beats)).toEqual(['enter', 'output', 'world', 'result']);
    expect(ran.state).toEqual({ tab: 1, prompt: null, typed: null });
  });

  it('is cancelled when Kyle denies it, and a second cancel adds nothing', () => {
    const typed = feedTyping(startFeed(1), { tab: 1, prompt: HOME, echo: 'Remove-Item notes' });
    const denied = feedCancel(typed.state);
    expect(denied.beats).toEqual([{ kind: 'cancel', tab: 1 }]);
    expect(feedCancel(denied.state).beats).toEqual([]);
    // The denied line's prompt has ended, so the next line gets a fresh one.
    expect(kinds(feedPrompt(denied.state, 1, HOME).beats)).toEqual(['prompt']);
  });
});

describe('feedPrompt', () => {
  it('leaves a prompt waiting between commands, and only once', () => {
    const waiting = feedPrompt(startFeed(1), 1, HOME);
    expect(waiting.beats).toEqual([{ kind: 'prompt', tab: 1, text: HOME }]);
    expect(feedPrompt(waiting.state, 1, HOME).beats).toEqual([]);
    expect(feedPrompt(startFeed(1, HOME), 1, HOME).beats).toEqual([]);
  });
});
