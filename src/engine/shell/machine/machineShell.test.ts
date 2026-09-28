import { describe, expect, it } from 'vitest';
import { windows, type FixtureBuilder } from '../../fixtures';
import { testDeps } from '../../git/testDeps';
import type { MachineEvent } from '../../machine/events';
import { Shell, type ShellResult } from '../shell';
import cdFile from './fixtures/error-cd-file.txt?raw';
import cdMissing from './fixtures/error-cd-missing.txt?raw';
import cdNoDrive from './fixtures/error-cd-no-drive.txt?raw';
import cdPositional from './fixtures/error-cd-positional.txt?raw';
import getLocation from './fixtures/get-location.txt?raw';
import notRecognized from './fixtures/error-not-recognized.txt?raw';

/** A laptop like the captures': a few folders and a file in the home folder. */
const LAPTOP = windows()
  .mkdir('Users/kyle/quillwork/api/docs')
  .mkdir('Users/kyle/quillwork/web')
  .mkdir('Program Files/nodejs')
  .write('Users/kyle/notes.txt', 'ship it\n');

function laptop(setup: FixtureBuilder = LAPTOP) {
  const ws = setup.build(testDeps());
  const shell = new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
  const machine = ws.machine;
  if (machine === null || shell.machineShell === null) throw new Error('Not a laptop');
  const moves: Extract<MachineEvent, { type: 'cwdChanged' }>[] = [];
  ws.events.on((event) => {
    if (event.type === 'cwdChanged') moves.push(event);
  });
  return { shell, machine, session: shell.machineShell.session, moves };
}

/** The output as the terminal prints it, to compare with a real capture. */
const printed = (result: ShellResult) => result.lines.map((line) => `${line.text}\n`).join('');

describe('the machine profile', () => {
  it('starts in the home folder with a PowerShell prompt', () => {
    const { shell } = laptop();
    expect(shell.prompt()).toBe('PS C:\\Users\\kyle> ');
    expect(shell.cwd).toBe('');
  });

  it('prints Get-Location exactly as PowerShell 7.6 does, under every alias', () => {
    const { shell } = laptop();
    for (const command of ['Get-Location', 'get-location', 'pwd', 'gl', 'GL']) {
      const result = shell.run(command);
      expect(printed(result)).toBe(getLocation);
      expect(result.exitCode).toBe(0);
    }
  });

  it("names an unknown command in PowerShell's two lines", () => {
    const result = laptop().shell.run('nope-not-a-command');
    expect(printed(result)).toBe(notRecognized);
    expect(result.exitCode).toBe(1);
  });

  it('keeps history in the Shell, as the terminal expects', () => {
    const { shell } = laptop();
    shell.run('cd quillwork');
    shell.run('  ');
    shell.run('pwd');
    expect(shell.history).toEqual(['cd quillwork', 'pwd']);
  });

  it('runs statements separated by ; in turn, even after one fails', () => {
    const { shell, session } = laptop();
    const result = shell.run('cd nope; cd quillwork; cd api');
    expect(printed(result)).toBe(cdMissing);
    expect(result.exitCode).toBe(0);
    expect(session.cwd).toBe('Users/kyle/quillwork/api');
  });

  it('refuses what the lexer refuses, and what it can not run yet', () => {
    const { shell } = laptop();
    expect(shell.run("cd 'quillwork").lines[0]?.text).toBe(
      "The string is missing the terminator: '.",
    );
    expect(shell.run('pwd | Out-Null').lines[0]?.text).toBe(
      "This sandbox doesn't run pipes (|) yet.",
    );
    expect(shell.run('$env:Path').lines[0]?.text).toContain("doesn't run expressions yet");
    expect(shell.run('cd a,,b').lines[0]?.text).toBe(
      "Missing expression after ',' in pipeline element.",
    );
  });
});

describe('Set-Location', () => {
  it('moves by relative, absolute and home paths, in any case', () => {
    const { shell, session, moves } = laptop();
    shell.run('cd QUILLWORK\\Api');
    expect(session.cwd).toBe('Users/kyle/quillwork/api');
    expect(shell.prompt()).toBe('PS C:\\Users\\kyle\\quillwork\\api> ');
    shell.run("Set-Location 'C:\\Program Files\\nodejs'");
    shell.run('sl ~\\quillwork\\web');
    shell.run('chdir ..');
    expect(moves.map((move) => [move.to, move.via])).toEqual([
      ['Users/kyle/quillwork/api', 'relative'],
      ['Program Files/nodejs', 'absolute'],
      ['Users/kyle/quillwork/web', 'home'],
      ['Users/kyle/quillwork', 'relative'],
    ]);
  });

  it('goes home with no path, or ~, or $HOME', () => {
    const { shell, session } = laptop();
    for (const command of ['cd', 'cd ~', 'cd $HOME', 'cd -Path:$env:USERPROFILE', 'cd $nothing']) {
      shell.run('cd C:\\');
      expect(session.cwd).toBe('');
      shell.run(command);
      expect(session.cwd).toBe('Users/kyle');
    }
  });

  it('reads $PWD as the folder this tab stands in', () => {
    const { shell, session } = laptop();
    shell.run('cd quillwork');
    shell.run('cd "$PWD\\api"');
    expect(session.cwd).toBe('Users/kyle/quillwork/api');
  });

  it('steps back with - and forward with +, silently when there is nowhere to go', () => {
    const { shell, session } = laptop();
    expect(shell.run('cd -')).toEqual({ lines: [], exitCode: 0 });
    shell.run('cd quillwork');
    shell.run('cd api');
    shell.run('cd -');
    expect(session.cwd).toBe('Users/kyle/quillwork');
    shell.run('cd -');
    expect(session.cwd).toBe('Users/kyle');
    shell.run('cd +');
    expect(session.cwd).toBe('Users/kyle/quillwork');
    shell.run('cd +');
    expect(shell.run('cd +')).toEqual({ lines: [], exitCode: 0 });
    expect(session.cwd).toBe('Users/kyle/quillwork/api');
  });

  it("refuses missing folders, files and other drives in PowerShell's words", () => {
    const { shell, session } = laptop();
    expect(printed(shell.run('Set-Location nope'))).toBe(cdMissing);
    expect(printed(shell.run('Set-Location notes.txt'))).toBe(cdFile);
    expect(printed(shell.run("Set-Location 'Q:\\games'"))).toBe(cdNoDrive);
    expect(shell.run('cd nope').exitCode).toBe(1);
    expect(session.cwd).toBe('Users/kyle');
  });

  it('points a path with a space at quotes', () => {
    const result = laptop().shell.run('Set-Location C:\\Program Files\\nodejs');
    expect(result.lines[0]?.text).toBe(cdPositional.trimEnd());
    expect(result.lines[1]).toEqual({
      text: "Paths with spaces need quotes: 'C:\\Program Files\\nodejs'",
      tone: 'hint',
    });
  });

  it('keeps the player on C: with a pointer for Env: and the registry', () => {
    const { shell } = laptop();
    expect(shell.run('cd Env:').lines.map((line) => line.text)).toEqual([
      'Set-Location: This sandbox keeps you on the C: drive.',
      'Env: holds your environment variables, not files. List them with: Get-ChildItem Env:',
    ]);
    expect(shell.run('cd HKCU:\\Environment').lines[1]?.text).toContain('rundll32');
    expect(shell.run('cd \\\\server\\share').lines.map((line) => line.text)).toEqual([
      "Set-Location: Cannot find path '\\\\server\\share' because it does not exist.",
      'This laptop has no network drives.',
    ]);
  });
});
