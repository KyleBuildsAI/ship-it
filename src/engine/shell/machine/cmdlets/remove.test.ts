import { describe, expect, it } from 'vitest';
import { windows } from '../../../fixtures';
import { testDeps } from '../../../git/testDeps';
import type { EngineEvent } from '../../../workspace';
import { Shell, type ShellResult } from '../../shell';
import { CHOICES } from '../confirm';
import rmBare from '../fixtures/error-rm-bare.txt?raw';
import rmF from '../fixtures/error-rm-f.txt?raw';
import rmHidden from '../fixtures/error-rm-hidden.txt?raw';
import rmReadOnly from '../fixtures/error-rm-readonly.txt?raw';
import rmRf from '../fixtures/error-rm-rf.txt?raw';

function laptop() {
  const ws = windows()
    .mkdir('Users/kyle/empty')
    .mkdir('Users/kyle/.cache')
    .write('Users/kyle/notes.txt', 'ship it\n')
    .write('Users/kyle/a.log', 'a\n')
    .write('Users/kyle/b.log', 'b\n')
    .write('Users/kyle/tmp/one.txt', '1\n')
    .write('Users/kyle/tmp/deep/two.txt', '2\n')
    .write('Users/kyle/old/three.txt', '3\n')
    .build(testDeps());
  const machine = ws.machine;
  if (machine === null) throw new Error('Not a laptop');
  machine.drive.hide('Users/kyle/.cache');
  const events: EngineEvent[] = [];
  ws.events.on((event) => events.push(event));
  const shell = new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
  return { shell, machine, drive: machine.drive, events };
}

const texts = (result: ShellResult) => result.lines.map((line) => line.text);
const printed = (result: ShellResult) => result.lines.map((line) => `${line.text}\n`).join('');

const QUESTION = (folder: string) =>
  `The item at C:\\Users\\kyle\\${folder} has children and the Recurse parameter was not specified. If you continue, all children will be removed with the item. Are you sure you want to continue?`;

describe('Remove-Item', () => {
  it('deletes files and empty folders silently, under every alias', () => {
    const { shell, drive, events } = laptop();
    expect(shell.run('Remove-Item notes.txt')).toEqual({ lines: [], exitCode: 0 });
    shell.run('rm empty; del a.log; erase b.log');
    expect(drive.exists('Users/kyle/notes.txt')).toBe(false);
    expect(drive.exists('Users/kyle/empty')).toBe(false);
    expect(drive.exists('Users/kyle/a.log')).toBe(false);
    expect(events).toContainEqual({
      type: 'fileChanged',
      path: 'Users/kyle/notes.txt',
      change: 'deleted',
    });
  });

  it('deletes a full folder and everything in it with -Recurse', () => {
    const { shell, drive, events } = laptop();
    shell.run('rm tmp -Recurse');
    expect(drive.exists('Users/kyle/tmp')).toBe(false);
    expect(events).toContainEqual({
      type: 'fileChanged',
      path: 'Users/kyle/tmp/deep/two.txt',
      change: 'deleted',
    });
  });

  it('deletes every match of a wildcard, and nothing when none match', () => {
    const { shell, drive } = laptop();
    expect(shell.run('rm *.log')).toEqual({ lines: [], exitCode: 0 });
    expect(drive.exists('Users/kyle/a.log')).toBe(false);
    expect(drive.exists('Users/kyle/b.log')).toBe(false);
    expect(shell.run('rm *.nothing')).toEqual({ lines: [], exitCode: 0 });
    // A wildcard skips hidden items unless -Force.
    shell.run('rm .c*');
    expect(drive.exists('Users/kyle/.cache')).toBe(true);
    shell.run('rm .c* -Force');
    expect(drive.exists('Users/kyle/.cache')).toBe(false);
  });

  it("refuses in PowerShell's words", () => {
    const { shell, machine, drive } = laptop();
    const refusals = (command: string) => texts(shell.run(command));
    expect(refusals('rm nope')).toEqual([
      "Remove-Item: Cannot find path 'C:\\Users\\kyle\\nope' because it does not exist.",
    ]);
    expect(refusals('rm .cache')).toEqual([
      'Remove-Item: You do not have sufficient access rights to perform this operation or the item is hidden, system, or read only.',
    ]);
    expect(refusals('rm C:\\')).toEqual([
      "Remove-Item: Cannot remove the item at 'C:\\' because it is in use.",
    ]);
    expect(refusals('rm Q:\\x')).toEqual([
      "Remove-Item: Cannot find drive. A drive with the name 'Q' does not exist.",
    ]);
    // The folder this tab stands in is in use, and so is home.
    shell.run('cd old');
    expect(refusals('rm ~\\old -Recurse')).toEqual([
      "Remove-Item: Cannot remove the item at 'C:\\Users\\kyle\\old' because it is in use.",
    ]);
    expect(drive.exists('Users/kyle/old')).toBe(true);
    expect(refusals('rm \\Users -Recurse')).toEqual([
      "Remove-Item: Cannot remove the item at 'C:\\Users' because it is in use.",
    ]);
    // Another tab's folder isn't: Set-Location doesn't move the pwsh process (checked).
    machine.openSession();
    expect(shell.run('rm ~\\old -Recurse').exitCode).toBe(0);
    expect(shell.run('rm -rf notes.txt').lines[0]?.text).toBe(rmRf.trimEnd());
  });

  it('removes an environment variable from this tab only', () => {
    const { shell, machine } = laptop();
    shell.run('Remove-Item Env:TEMP');
    expect(machine.active().env.get('TEMP')).toBeNull();
    expect(machine.saved.user.get('TEMP')).not.toBeNull();
    expect(texts(shell.run('rm env:TEMP'))).toEqual([
      "Remove-Item: Cannot find path 'Env:\\TEMP' because it does not exist.",
    ]);
  });
});

describe('Remove-Item, as PowerShell 7.6 answers', () => {
  it('matches the captures: -f is ambiguous, a bare rm asks for a path, and marked items stay', () => {
    const { shell, drive } = laptop();
    expect(printed(shell.run('rm -f notes.txt'))).toBe(rmF);
    expect(printed(shell.run('rm -r -f tmp'))).toBe(rmF);
    expect(drive.exists('Users/kyle/tmp')).toBe(true);
    expect(printed(shell.run('Remove-Item'))).toBe(rmBare);
    expect(printed(shell.run('rm .cache'))).toBe(rmHidden);
    expect(printed(shell.run('rm Downloads'))).toBe(rmReadOnly);
    expect(drive.isDir('Users/kyle/Downloads')).toBe(true);
    shell.run('rm Downloads -Force');
    expect(drive.exists('Users/kyle/Downloads')).toBe(false);
  });

  it('empties a folder but keeps what is hidden, children first, as PowerShell does', () => {
    const { shell, drive } = laptop();
    drive.hide('Users/kyle/tmp/deep');
    expect(texts(shell.run('rm tmp -Recurse'))).toEqual([
      'Remove-Item: You do not have sufficient access rights to perform this operation or the item is hidden, system, or read only.',
      'Remove-Item: Directory C:\\Users\\kyle\\tmp cannot be removed because it is not empty.',
    ]);
    // The hidden folder was emptied, then kept; the visible file went.
    expect(drive.listDir('Users/kyle/tmp').map((entry) => entry.name)).toEqual(['deep']);
    expect(drive.listDir('Users/kyle/tmp/deep')).toEqual([]);
  });

  it('asks about a hidden folder with children first, then keeps the folder', () => {
    const { shell, drive } = laptop();
    drive.hide('Users/kyle/old');
    expect(texts(shell.run('rm old'))[0]).toBe('Confirm');
    expect(texts(shell.run('y'))).toEqual([
      'Remove-Item: You do not have sufficient access rights to perform this operation or the item is hidden, system, or read only.',
    ]);
    expect(drive.listDir('Users/kyle/old')).toEqual([]);
  });

  it('deals with paths in the order typed, even when one sits inside another', () => {
    const { shell, drive } = laptop();
    expect(texts(shell.run('rm nope, tmp'))).toEqual([
      "Remove-Item: Cannot find path 'C:\\Users\\kyle\\nope' because it does not exist.",
      'Confirm',
      QUESTION('tmp'),
    ]);
    shell.run('n');
    expect(texts(shell.run('rm tmp -Recurse; rm tmp\\one.txt'))).toEqual([
      "Remove-Item: Cannot find path 'C:\\Users\\kyle\\tmp\\one.txt' because it does not exist.",
    ]);
    expect(drive.exists('Users/kyle/tmp')).toBe(false);
  });

  it('takes -LiteralPath without wildcards, and refuses what the sandbox lacks', () => {
    const { shell, drive } = laptop();
    expect(texts(shell.run('rm -LiteralPath *.log'))).toEqual([
      "Remove-Item: Cannot find path 'C:\\Users\\kyle\\*.log' because it does not exist.",
    ]);
    shell.run('rm -LiteralPath a.log');
    expect(drive.exists('Users/kyle/a.log')).toBe(false);
    expect(texts(shell.run('rm * -Exclude notes.txt'))).toEqual([
      "This sandbox doesn't run Remove-Item -Exclude yet.",
    ]);
    expect(drive.exists('Users/kyle/notes.txt')).toBe(true);
  });
});

describe("Remove-Item's Confirm question", () => {
  it('asks before deleting a full folder, and Y (or Enter) deletes it', () => {
    for (const answer of ['y', '', 'Yes']) {
      const { shell, drive } = laptop();
      expect(texts(shell.run('rm tmp'))).toEqual(['Confirm', QUESTION('tmp')]);
      expect(shell.prompt()).toBe(CHOICES);
      expect(shell.run(answer)).toEqual({ lines: [], exitCode: 0 });
      expect(drive.exists('Users/kyle/tmp')).toBe(false);
      expect(shell.prompt()).toBe('PS C:\\Users\\kyle> ');
    }
  });

  it('keeps the folder on N, and asks about each folder in turn', () => {
    const { shell, drive } = laptop();
    shell.run('rm tmp, notes.txt, old');
    expect(shell.run('n').lines.map((line) => line.text)).toEqual(['Confirm', QUESTION('old')]);
    expect(drive.exists('Users/kyle/notes.txt')).toBe(false);
    shell.run('y');
    expect(drive.exists('Users/kyle/tmp')).toBe(true);
    expect(drive.exists('Users/kyle/old')).toBe(false);
  });

  it('answers the rest with A (yes to all) or L (no to all)', () => {
    const yes = laptop();
    yes.shell.run('rm tmp, old');
    expect(yes.shell.run('a')).toEqual({ lines: [], exitCode: 0 });
    expect(yes.drive.exists('Users/kyle/tmp') || yes.drive.exists('Users/kyle/old')).toBe(false);
    const no = laptop();
    no.shell.run('rm tmp, old');
    no.shell.run('L');
    expect(no.drive.exists('Users/kyle/tmp') && no.drive.exists('Users/kyle/old')).toBe(true);
  });

  it('explains ?, declines S, and asks again on anything else', () => {
    const { shell, drive } = laptop();
    shell.run('rm tmp');
    expect(texts(shell.run('?'))[0]).toBe('Y - Continue with only the next step of the operation.');
    expect(texts(shell.run('s'))).toEqual(["This sandbox can't pause a command. Answer Y or N."]);
    expect(shell.run('maybe')).toEqual({ lines: [], exitCode: 0 });
    expect(shell.prompt()).toBe(CHOICES);
    expect(drive.exists('Users/kyle/tmp')).toBe(true);
  });

  it('runs what came after ; once answered, and keeps answers out of history', () => {
    const { shell, drive } = laptop();
    shell.run('rm tmp; rm notes.txt');
    expect(drive.exists('Users/kyle/notes.txt')).toBe(true);
    shell.run('y');
    expect(drive.exists('Users/kyle/notes.txt')).toBe(false);
    expect(shell.history).toEqual(['rm tmp; rm notes.txt']);
  });
});
