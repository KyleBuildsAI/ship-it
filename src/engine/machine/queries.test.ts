import { describe, expect, it } from 'vitest';
import { windows } from '../fixtures';
import { testDeps } from '../git/testDeps';
import { machineQueries } from './queries';
import { recordMachineEvents } from './testDeps';

function laptop() {
  const ws = windows()
    .mkdir('Users/kyle/Notes')
    .write('Users/kyle/Notes/today.txt', 'ship it\n')
    .env('user', 'QUILLWORK_ENV', 'dev')
    .session()
    .env('session', 'PORT', '4000')
    .cd('Users/kyle/Notes')
    .build(testDeps());
  const machine = ws.machine;
  if (machine === null) throw new Error('Not a laptop');
  return { machine, q: machineQueries(machine) };
}

describe('machineQueries', () => {
  it('shows paths as Windows prints them', () => {
    expect(laptop().q.display('Users/kyle')).toBe('C:\\Users\\kyle');
  });

  it("reads the active tab's folder", () => {
    const { machine, q } = laptop();
    expect(q.cwd()).toBe('Users/kyle/Notes');
    machine.openSession();
    expect(q.cwd()).toBe('Users/kyle');
  });

  it('finds files and folders in any case', () => {
    const { q } = laptop();
    expect(q.item('users/kyle/notes')).toEqual({ kind: 'folder', content: null });
    expect(q.item('Users/kyle/NOTES/Today.txt')).toEqual({ kind: 'file', content: 'ship it\n' });
    expect(q.item('Users/kyle/nope')).toBeNull();
  });

  it('reads a variable in each scope, and as a new terminal would see it', () => {
    const { q } = laptop();
    expect(q.env('port', 'session')).toBe('4000');
    expect(q.env('PORT', 'newTerminal')).toBeNull();
    // The tab opened after the User variable was saved, so it copied it.
    expect(q.env('QUILLWORK_ENV', 'session')).toBe('dev');
    expect(q.env('QUILLWORK_ENV', 'user')).toBe('dev');
    expect(q.env('QUILLWORK_ENV', 'machine')).toBeNull();
    expect(q.env('OS', 'machine')).toBe('Windows_NT');
    expect(q.env('QUILLWORK_ENV', 'newTerminal')).toBe('dev');
  });

  it('lists a folder as Get-ChildItem does: folders first, then files, by name in any case', () => {
    const { machine, q } = laptop();
    machine.drive.makeDir('Users/kyle/Notes/zeta');
    machine.drive.makeDir('Users/kyle/Notes/Archive');
    machine.drive.writeFile('Users/kyle/Notes/Plan.md', '');
    expect(q.list('users/KYLE/notes')).toEqual([
      { name: 'Archive', kind: 'folder' },
      { name: 'zeta', kind: 'folder' },
      { name: 'Plan.md', kind: 'file' },
      { name: 'today.txt', kind: 'file' },
    ]);
    expect(q.list('').map((listed) => listed.name)).toEqual(['Program Files', 'Users', 'Windows']);
  });

  it('orders names by English rules, as PowerShell 7.6 does, not by character code', () => {
    const { machine, q } = laptop();
    // Word's lock file and other names that start with punctuation. A character compare
    // would put '~' and '_' after the letters; real dir puts them first, like this.
    machine.drive.writeFile('Users/kyle/Notes/~$plan.docx', '');
    machine.drive.writeFile('Users/kyle/Notes/Plan.md', '');
    machine.drive.writeFile('Users/kyle/Notes/_notes', '');
    machine.drive.writeFile('Users/kyle/Notes/[x]', '');
    machine.drive.writeFile('Users/kyle/Notes/api', '');
    machine.drive.writeFile('Users/kyle/Notes/Zeta', '');
    machine.drive.makeDir('Users/kyle/Notes/zdir');
    machine.drive.makeDir('Users/kyle/Notes/_adir');
    // The order real pwsh 7.6.6 printed for `(Get-ChildItem -Force).Name` on these names.
    expect(q.list('Users/kyle/Notes').map((listed) => listed.name)).toEqual([
      '_adir',
      'zdir',
      '_notes',
      '[x]',
      '~$plan.docx',
      'api',
      'Plan.md',
      'today.txt',
      'Zeta',
    ]);
  });

  it('puts an unaccented name before its accented twin, as PowerShell does', () => {
    const { machine, q } = laptop();
    // English rules ignoring case call these two equal; real dir still prints resume first.
    machine.drive.writeFile('Users/kyle/Notes/résumé', '');
    machine.drive.writeFile('Users/kyle/Notes/resume', '');
    expect(q.list('Users/kyle/Notes').map((listed) => listed.name)).toEqual([
      'resume',
      'résumé',
      'today.txt',
    ]);
  });

  it('lists everything that is really there, even what a plain dir leaves out', () => {
    const { q } = laptop();
    // A stock laptop hides AppData, so a plain dir skips it. Grading still sees it.
    expect(q.list('Users/kyle').map((listed) => listed.name)).toEqual([
      'AppData',
      'Desktop',
      'Documents',
      'Downloads',
      'Notes',
      'quillwork',
    ]);
  });

  it('has nothing to list at a file or a missing path, and item tells those apart', () => {
    const { machine, q } = laptop();
    machine.drive.makeDir('Users/kyle/empty');
    expect(q.list('Users/kyle/Notes/today.txt')).toEqual([]);
    expect(q.list('Users/kyle/nope')).toEqual([]);
    expect(q.list('Users/kyle/empty')).toEqual([]);
    expect(q.item('Users/kyle/empty')).toEqual({ kind: 'folder', content: null });
  });

  it('reports every tab, where it stands, and which one is active', () => {
    const { machine, q } = laptop();
    expect(q.tabs()).toEqual([{ tab: 1, cwd: 'Users/kyle/Notes', active: true }]);
    machine.openSession();
    expect(q.tabs()).toEqual([
      { tab: 1, cwd: 'Users/kyle/Notes', active: false },
      { tab: 2, cwd: 'Users/kyle', active: true },
    ]);
    machine.activate(1);
    expect(q.tabs().map((open) => open.active)).toEqual([true, false]);
  });

  it('keeps tab numbers when a tab closes, and reports none once all are closed', () => {
    const { machine, q } = laptop();
    machine.openSession();
    machine.closeSession(1);
    // Tab 2 stays "PS 2": numbers name tabs, they aren't positions.
    expect(q.tabs()).toEqual([{ tab: 2, cwd: 'Users/kyle', active: true }]);
    machine.closeSession(2);
    expect(q.tabs()).toEqual([]);
  });

  it('only looks: asking changes nothing and announces nothing', () => {
    const { machine, q } = laptop();
    const events = recordMachineEvents(machine);
    q.item('Users/kyle/Notes');
    q.env('Path', 'newTerminal');
    q.cwd();
    q.list('Users/kyle');
    q.list('Users/kyle/nope');
    q.tabs();
    expect(events).toEqual([]);
    expect(machine.sessions()).toHaveLength(1);
    expect(machine.drive.exists('Users/kyle/nope')).toBe(false);
  });
});
