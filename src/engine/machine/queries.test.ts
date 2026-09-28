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

  it('only looks: asking changes nothing and announces nothing', () => {
    const { machine, q } = laptop();
    const events = recordMachineEvents(machine);
    q.item('Users/kyle/Notes');
    q.env('Path', 'newTerminal');
    q.cwd();
    expect(events).toEqual([]);
    expect(machine.sessions()).toHaveLength(1);
  });
});
