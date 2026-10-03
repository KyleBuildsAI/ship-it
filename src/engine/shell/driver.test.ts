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

describe('drive: write', () => {
  it("writes a whole file with the agent's file tool, announcing new folders first", () => {
    const { shell, disk } = laptop();
    const step = drive(shell, { do: 'write', path: `${API}/notes/day1.md`, content: '# Day 1\n' });
    expect(step).toEqual({
      tab: 1,
      prompt: HOME_PROMPT,
      echo: null,
      lines: [],
      exitCode: 0,
      asking: false,
      events: [
        { type: 'folderChanged', path: `${API}/notes`, change: 'created' },
        { type: 'fileChanged', path: `${API}/notes/day1.md`, change: 'created' },
      ],
    });
    expect(disk.readFile(`${API}/notes/day1.md`)).toBe('# Day 1\n');
  });

  it('replaces a file, and announces nothing when the content is the same', () => {
    const { shell, disk } = laptop();
    const replaced = drive(shell, { do: 'write', path: `${API}/package.json`, content: '[]\n' });
    expect(replaced.events).toEqual([
      { type: 'fileChanged', path: `${API}/package.json`, change: 'modified' },
    ]);
    expect(disk.readFile(`${API}/package.json`)).toBe('[]\n');
    const same = drive(shell, { do: 'write', path: `${API}/package.json`, content: '[]\n' });
    expect(same.events).toEqual([]);
  });

  it("names every path in the drive's own spelling, whatever case the content typed", () => {
    const { shell, disk } = laptop();
    const made = drive(shell, {
      do: 'write',
      path: 'users/KYLE/Quillwork/API/notes/day1.md',
      content: '# Day 1\n',
    });
    expect(made.events).toEqual([
      { type: 'folderChanged', path: `${API}/notes`, change: 'created' },
      { type: 'fileChanged', path: `${API}/notes/day1.md`, change: 'created' },
    ]);
    const replaced = drive(shell, {
      do: 'write',
      path: 'USERS/kyle/quillwork/api/PACKAGE.JSON',
      content: '[]\n',
    });
    expect(replaced.events).toEqual([
      { type: 'fileChanged', path: `${API}/package.json`, change: 'modified' },
    ]);
    expect(disk.readFile(`${API}/package.json`)).toBe('[]\n');
  });

  it('fails without throwing when a folder or a file is in the way', () => {
    const { shell, disk } = laptop();
    const folder = drive(shell, { do: 'write', path: API, content: 'x' });
    expect(folder.exitCode).toBe(1);
    expect(texts(folder)).toEqual(["Can't write C:\\Users\\kyle\\quillwork\\api: it's a folder."]);
    const file = drive(shell, { do: 'write', path: `${API}/package.json/a.txt`, content: 'x' });
    expect(texts(file)).toEqual([
      "Can't write C:\\Users\\kyle\\quillwork\\api\\package.json\\a.txt: a file is in the way.",
    ]);
    expect(folder.events).toEqual([]);
    expect(file.events).toEqual([]);
    expect(disk.readFile(`${API}/package.json`)).toBe('{}\n');
  });

  it('lets an engine bug through, rather than passing it off as a failed write', () => {
    const { shell, machine } = laptop();
    vi.spyOn(machine, 'makeFolder').mockImplementation(() => {
      throw new Error('engine bug');
    });
    expect(() => drive(shell, { do: 'write', path: `${API}/a.txt`, content: 'x' })).toThrow(
      'engine bug',
    );
  });

  it('can write while a terminal is asking, and the question stays open', () => {
    const { shell } = laptop();
    drive(shell, { do: 'run', line: 'Remove-Item old' });
    const step = drive(shell, { do: 'write', path: 'Users/kyle/todo.txt', content: 'x' });
    expect(step.prompt).toBe(CHOICES);
    expect(step.asking).toBe(true);
  });
});

describe('drive: terminals', () => {
  it('opens a new tab at home, which becomes the active one', () => {
    const { shell, machine } = laptop();
    drive(shell, { do: 'run', line: 'cd quillwork' });
    const step = drive(shell, { do: 'newTerminal' });
    expect(step).toEqual({
      tab: 2,
      prompt: HOME_PROMPT,
      echo: null,
      lines: [],
      exitCode: 0,
      asking: false,
      events: [{ type: 'sessionOpened', session: 2 }],
    });
    expect(machine.active().id).toBe(2);
  });

  it("runs each line in its own tab's PowerShell", () => {
    const { shell, machine } = laptop();
    drive(shell, { do: 'newTerminal' });
    expect(drive(shell, { do: 'run', line: 'cd quillwork' }).tab).toBe(2);
    const back = drive(shell, { do: 'useTerminal', tab: 1 });
    expect(back).toMatchObject({ tab: 1, prompt: HOME_PROMPT, echo: null, exitCode: 0 });
    expect(back.events).toEqual([{ type: 'sessionActivated', session: 1 }]);
    expect(machine.session(1).cwd).toBe('Users/kyle');
    expect(machine.session(2).cwd).toBe('Users/kyle/quillwork');
  });

  it('switching to the tab already in use announces nothing', () => {
    const { shell } = laptop();
    expect(drive(shell, { do: 'useTerminal', tab: 1 }).events).toEqual([]);
  });

  it("keeps each tab's question in that tab", () => {
    const { shell, disk } = laptop();
    drive(shell, { do: 'run', line: 'Remove-Item old' });
    expect(drive(shell, { do: 'newTerminal' }).asking).toBe(false);
    expect(drive(shell, { do: 'run', line: 'mkdir notes' }).exitCode).toBe(0);
    const back = drive(shell, { do: 'useTerminal', tab: 1 });
    expect(back.prompt).toBe(CHOICES);
    expect(back.asking).toBe(true);
    drive(shell, { do: 'answer', choice: 'Y' });
    expect(disk.exists('Users/kyle/old')).toBe(false);
    expect(disk.exists('Users/kyle/notes')).toBe(true);
  });

  it('answers about a folder another tab removed with the not-found error, not a throw', () => {
    const { shell, disk } = laptop();
    drive(shell, { do: 'run', line: 'Remove-Item old' });
    drive(shell, { do: 'newTerminal' });
    expect(drive(shell, { do: 'run', line: 'Remove-Item old -Recurse' }).exitCode).toBe(0);
    drive(shell, { do: 'useTerminal', tab: 1 });
    const step = drive(shell, { do: 'answer', choice: 'Y' });
    expect(step).toMatchObject({ tab: 1, exitCode: 1, asking: false, events: [] });
    expect(texts(step)).toEqual([
      "Remove-Item: Cannot find path 'C:\\Users\\kyle\\old' because it does not exist.",
    ]);
    expect(disk.exists('Users/kyle/old')).toBe(false);
  });

  it('refuses a tab that is not open', () => {
    const { shell } = laptop();
    expect(() => drive(shell, { do: 'useTerminal', tab: 3 })).toThrow('No terminal tab 3 is open.');
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

  it('writes project files, and has no tabs to open or switch', () => {
    const shell = project();
    const written = drive(shell, { do: 'write', path: 'src/app.ts', content: 'x\n' });
    expect(written.events).toEqual([
      { type: 'fileChanged', path: 'src/app.ts', change: 'created' },
    ]);
    expect(shell.ws.fs.readFile('src/app.ts')).toBe('x\n');
    expect(texts(drive(shell, { do: 'write', path: 'src', content: '' }))).toEqual([
      "Can't write src: it's a folder.",
    ]);
    expect(() => drive(shell, { do: 'newTerminal' })).toThrow(
      '"newTerminal" needs a laptop sandbox; this one has one terminal.',
    );
    expect(() => drive(shell, { do: 'useTerminal', tab: 1 })).toThrow(DriverError);
  });
});
