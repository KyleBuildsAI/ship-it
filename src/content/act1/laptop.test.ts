import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { Shell, type ShellResult } from '../../engine/shell/shell';
import { createSandbox, DISPLAY_ROOT } from '../../game/missions/sandbox';
import { LAPTOP_SANDBOX } from './laptop';

const printed = (result: ShellResult) => result.lines.map((line) => line.text).join('\n');

/** The Act 1 laptop, as the Open button loads it into the terminal. */
function laptop(): Shell {
  return new Shell(createSandbox(LAPTOP_SANDBOX, testDeps()), DISPLAY_ROOT);
}

describe("Act 1's free-play laptop", () => {
  it('opens one PowerShell terminal at home', () => {
    const shell = laptop();
    expect(shell.ws.machine?.sessions()).toHaveLength(1);
    expect(printed(shell.run('Get-Location'))).toContain('C:\\Users\\kyle');
  });

  it('has the Quillwork API project to look around in', () => {
    const shell = laptop();
    expect(shell.run('cd quillwork\\api').exitCode).toBe(0);
    const listing = printed(shell.run('ls -Force'));
    for (const name of ['package.json', 'server.js', '.env.example', 'README.md']) {
      expect(listing).toContain(name);
    }
  });

  it('makes, checks and removes a folder, as the opening notice suggests', () => {
    const shell = laptop();
    expect(shell.run('mkdir notes').exitCode).toBe(0);
    expect(shell.run('New-Item notes\\idea.txt').exitCode).toBe(0);
    expect(printed(shell.run('Test-Path notes'))).toBe('True');
    // A folder with something in it asks PowerShell's Confirm question first.
    expect(shell.run('Remove-Item notes').exitCode).toBe(0);
    shell.run('Y');
    expect(printed(shell.run('Test-Path notes'))).toBe('False');
  });
});
