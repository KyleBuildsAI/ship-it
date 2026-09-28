import { describe, expect, it, vi } from 'vitest';
import { repo, windows } from '../fixtures';
import { testDeps } from '../git/testDeps';
import { CHOICES } from './machine/confirm';
import { CONFIRM_LETTERS, drive, DriverError, type DriverStep } from './driver';
import { Shell } from './shell';

const HOME_PROMPT = 'PS C:\\Users\\kyle> ';
const API = 'Users/kyle/quillwork/api';

/** A small laptop: the API project, and an old folder with a file in it. */
function laptop() {
  const ws = windows()
    .write(`${API}/package.json`, '{}\n')
    .write('Users/kyle/old/notes.txt', 'week 1\n')
    .build(testDeps());
  const machine = ws.machine;
  if (machine === null) throw new Error('Not a laptop');
  const shell = new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
  return { shell, machine, disk: machine.drive };
}

const texts = (step: DriverStep) => step.lines.map((output) => output.text);

describe('drive: run', () => {
  it('types a line after the prompt it was typed at, with its real output and events', () => {
    const { shell } = laptop();
    const step = drive(shell, { do: 'run', line: 'cd quillwork\\api' });
    expect(step).toEqual({
      tab: 1,
      prompt: HOME_PROMPT,
      echo: 'cd quillwork\\api',
      lines: [],
      exitCode: 0,
      asking: false,
      events: [{ type: 'cwdChanged', session: 1, from: 'Users/kyle', to: API, via: 'relative' }],
    });
    const next = drive(shell, { do: 'run', line: 'Get-Location' });
    expect(next.prompt).toBe('PS C:\\Users\\kyle\\quillwork\\api> ');
    expect(texts(next)).toContain('C:\\Users\\kyle\\quillwork\\api');
  });

  it("reports a failing line with PowerShell's error and a non-zero exit", () => {
    const { shell } = laptop();
    const step = drive(shell, { do: 'run', line: 'cd nope' });
    expect(step.exitCode).toBe(1);
    expect(step.lines[0]).toEqual({
      text: "Set-Location: Cannot find path 'C:\\Users\\kyle\\nope' because it does not exist.",
      tone: 'error',
    });
    expect(step.events).toEqual([]);
  });

  it('keeps the lines it ran in the history, as if typed, but not the answers', () => {
    const { shell } = laptop();
    drive(shell, { do: 'run', line: 'cd quillwork' });
    drive(shell, { do: 'run', line: 'rm ~\\old' });
    drive(shell, { do: 'answer', choice: 'Y' });
    expect(shell.history).toEqual(['cd quillwork', 'rm ~\\old']);
  });
});

describe('drive: answer', () => {
  it('shows the question as the output of the line that asked, and changes nothing yet', () => {
    const { shell, disk } = laptop();
    const step = drive(shell, { do: 'run', line: 'Remove-Item old' });
    expect(texts(step)[0]).toBe('Confirm');
    expect(step.asking).toBe(true);
    expect(step.events).toEqual([]);
    expect(disk.exists('Users/kyle/old/notes.txt')).toBe(true);
  });

  it("types the letter at PowerShell's choice line, and the answer's events are its own", () => {
    const { shell, disk } = laptop();
    drive(shell, { do: 'run', line: 'Remove-Item old' });
    const step = drive(shell, { do: 'answer', choice: 'A' });
    expect(step).toEqual({
      tab: 1,
      prompt: CHOICES,
      echo: 'A',
      lines: [],
      exitCode: 0,
      asking: false,
      events: [
        { type: 'fileChanged', path: 'Users/kyle/old/notes.txt', change: 'deleted' },
        { type: 'folderChanged', path: 'Users/kyle/old', change: 'deleted' },
      ],
    });
    expect(disk.exists('Users/kyle/old')).toBe(false);
  });

  it('answers with each letter as PowerShell reads it', () => {
    const removed = CONFIRM_LETTERS.map((choice) => {
      const { shell, disk } = laptop();
      drive(shell, { do: 'run', line: 'Remove-Item old' });
      drive(shell, { do: 'answer', choice });
      return !disk.exists('Users/kyle/old');
    });
    expect(removed).toEqual([true, true, false, false]);
  });

  it('answers only while a question is open, and runs a line only while none is', () => {
    const { shell, disk } = laptop();
    expect(() => drive(shell, { do: 'answer', choice: 'Y' })).toThrow(
      'Nothing is asking in tab 1, so there is nothing to answer.',
    );
    drive(shell, { do: 'run', line: 'Remove-Item old' });
    // Typed now, the line would be read as the answer, and PowerShell would ask again.
    expect(() => drive(shell, { do: 'run', line: 'mkdir notes' })).toThrow(
      'Tab 1 is asking a question: answer it before "mkdir notes".',
    );
    expect(shell.prompt()).toBe(CHOICES);
    expect(disk.exists('Users/kyle/notes')).toBe(false);
    expect(disk.exists('Users/kyle/old')).toBe(true);
  });
});

describe('drive: events', () => {
  it('records only what happened during the action', () => {
    const { shell } = laptop();
    const step = drive(shell, { do: 'run', line: 'mkdir notes' });
    shell.run('mkdir more');
    expect(step.events).toEqual([
      { type: 'folderChanged', path: 'Users/kyle/notes', change: 'created' },
    ]);
  });

  it('stops listening even when an action is refused', () => {
    const { shell } = laptop();
    const stop = vi.fn();
    vi.spyOn(shell.ws.events, 'on').mockReturnValue(stop);
    expect(() => drive(shell, { do: 'answer', choice: 'Y' })).toThrow(DriverError);
    expect(stop).toHaveBeenCalledOnce();
  });
});

describe("drive: Act 2's project sandbox", () => {
  function project() {
    const ws = repo().write('README.md', '# Demo\n').build(testDeps());
    return new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
  }

  it('runs lines in its one terminal, where nothing ever asks', () => {
    const shell = project();
    const step = drive(shell, { do: 'run', line: 'mkdir src' });
    expect(step).toMatchObject({ tab: 1, prompt: 'PS C:\\Users\\kyle\\quillwork\\app> ' });
    expect(step.asking).toBe(false);
    expect(shell.ws.fs.isDir('src')).toBe(true);
    expect(() => drive(shell, { do: 'answer', choice: 'Y' })).toThrow(DriverError);
  });
});
