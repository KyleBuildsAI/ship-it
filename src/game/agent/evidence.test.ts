import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { drive, type DriverAction, type DriverStep } from '../../engine/shell/driver';
import { CHOICES } from '../../engine/shell/machine/confirm';
import { Shell } from '../../engine/shell/shell';
import { evidenceOf } from './evidence';

const HOME = 'PS C:\\Users\\kyle> ';

/** A laptop at home in tab 1, with a notes folder that makes Remove-Item ask. */
function laptop(): Shell {
  const ws = windows().write('Users/kyle/notes/a.md', 'a\n').build(testDeps());
  return new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
}

/** Drives `action` for real and returns what the panel shows for it. */
function shown(shell: Shell, action: DriverAction) {
  return evidenceOf(action, drive(shell, action), true);
}

/** A step for an action that typed and printed nothing, like a file write. */
const SILENT_STEP: DriverStep = {
  tab: 1,
  prompt: HOME,
  echo: null,
  lines: [],
  exitCode: 0,
  asking: false,
  events: [],
};

describe('evidenceOf', () => {
  it('shows a line after the prompt it was typed at, then what it printed', () => {
    const entry = shown(laptop(), { do: 'run', line: 'Get-Location' });
    expect(entry).toMatchObject({ tab: 1, prompt: HOME, typed: 'Get-Location', words: null });
    expect(entry.lines.map((line) => line.text)).toContain('C:\\Users\\kyle');
  });

  it("shows Otto's answer typed at PowerShell's question", () => {
    const shell = laptop();
    const asked = shown(shell, { do: 'run', line: 'Remove-Item notes' });
    expect(asked.lines.map((line) => line.text).join('\n')).toContain('Confirm');
    expect(shown(shell, { do: 'answer', choice: 'A' })).toMatchObject({
      prompt: CHOICES,
      typed: 'A',
    });
  });

  it('shows where a new or switched terminal stands, and names the tab', () => {
    const shell = laptop();
    shown(shell, { do: 'run', line: 'cd C:\\Users\\kyle\\notes' });
    expect(shown(shell, { do: 'newTerminal' })).toMatchObject({
      tab: 2,
      prompt: HOME,
      typed: null,
      words: 'Opened a new terminal: PS 2',
    });
    expect(shown(shell, { do: 'useTerminal', tab: 1 })).toMatchObject({
      tab: 1,
      prompt: 'PS C:\\Users\\kyle\\notes> ',
      words: 'Switched to PS 1',
    });
  });

  it('names a file write or edit, with no prompt, as a Windows path only on the laptop', () => {
    const write = { do: 'write', path: 'Users/kyle/a.txt', content: 'x' } as const;
    expect(evidenceOf(write, SILENT_STEP, true)).toMatchObject({
      prompt: null,
      typed: null,
      words: 'Wrote C:\\Users\\kyle\\a.txt',
    });
    const edit = { do: 'edit', path: '.gitignore', find: 'a', replace: 'b' } as const;
    expect(evidenceOf(edit, SILENT_STEP, false).words).toBe('Edited .gitignore');
  });
});
